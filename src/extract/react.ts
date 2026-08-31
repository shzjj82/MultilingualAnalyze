import fs from 'node:fs'
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import type { SourceKind, TemplateStrategy } from '../types.js'
import {
  isExtractableSegment,
  normalizeText,
  templateToPlaceholderMessage,
} from '../utils/text.js'

const traverse = typeof _traverse === 'function' ? _traverse : (_traverse as { default: typeof _traverse }).default

export interface RawHit {
  value: string
  file: string
  framework: SourceKind
}

function pushHit(hits: RawHit[], file: string, framework: SourceKind, raw: string) {
  const value = normalizeText(raw)
  if (!value || !isExtractableSegment(value)) return
  hits.push({ value, file, framework })
}

function isSimpleTemplateExpr(expr: { type: string; computed?: boolean; property?: { type: string } }): boolean {
  if (expr.type === 'Identifier') return true
  return (
    expr.type === 'MemberExpression' &&
    !expr.computed &&
    expr.property?.type === 'Identifier'
  )
}

/** 按扩展名标注来源：.js→js，.ts→ts，.jsx/.tsx→react，其余按 react 处理 */
export function sourceKindFromFile(file: string): SourceKind {
  const lower = file.replace(/\\/g, '/').toLowerCase()
  if (lower.endsWith('.vue')) return 'vue'
  if (lower.endsWith('.tsx')) return 'tsx'
  if (lower.endsWith('.jsx')) return 'jsx'
  if (lower.endsWith('.ts') || lower.endsWith('.mts') || lower.endsWith('.cts')) return 'ts'
  if (lower.endsWith('.js') || lower.endsWith('.mjs') || lower.endsWith('.cjs')) return 'js'
  return 'js'
}

export function extractFromJsTsFile(
  file: string,
  code?: string,
  strategy: TemplateStrategy = 'split',
  kind: SourceKind = sourceKindFromFile(file),
): RawHit[] {
  const source = code ?? fs.readFileSync(file, 'utf8')
  const hits: RawHit[] = []

  let ast
  try {
    ast = parse(source, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'classProperties'],
    })
  } catch {
    return hits
  }

  traverse(ast, {
    JSXText(path) {
      pushHit(hits, file, kind, path.node.value)
    },
    StringLiteral(path) {
      if (
        path.parent.type === 'ImportDeclaration' ||
        path.parent.type === 'ExportNamedDeclaration' ||
        path.parent.type === 'JSXAttribute'
      ) {
        return
      }
      pushHit(hits, file, kind, path.node.value)
    },
    TemplateLiteral(path) {
      if (strategy === 'split') {
        for (const q of path.node.quasis) {
          pushHit(hits, file, kind, q.value.cooked ?? '')
        }
        return
      }

      if (!path.node.expressions.every((e) => isSimpleTemplateExpr(e))) return

      let rebuilt = ''
      for (let i = 0; i < path.node.quasis.length; i++) {
        rebuilt += path.node.quasis[i]!.value.cooked ?? ''
        const expr = path.node.expressions[i]
        if (!expr) continue
        if (expr.type === 'Identifier') {
          rebuilt += `\${${expr.name}}`
        } else if (
          expr.type === 'MemberExpression' &&
          expr.property.type === 'Identifier'
        ) {
          rebuilt += `\${${expr.property.name}}`
        }
      }
      const message = templateToPlaceholderMessage('`' + rebuilt + '`')
      if (message) pushHit(hits, file, kind, message)
    },
    JSXAttribute(path) {
      const v = path.node.value
      if (!v || v.type !== 'StringLiteral') return
      pushHit(hits, file, kind, v.value)
    },
  })

  return hits
}

import fs from 'node:fs'
import { parse as parseSfc } from '@vue/compiler-sfc'
import { extractFromJsTsFile, type RawHit } from './react.js'
import {
  isExtractableSegment,
  normalizeText,
  splitTemplateStatics,
  templateToPlaceholderMessage,
} from '../utils/text.js'
import type { TemplateStrategy } from '../types.js'

/**
 * Vue SFC：模板扫描 + script AST。
 */
export function extractFromVueFile(
  file: string,
  code?: string,
  strategy: TemplateStrategy = 'split',
): RawHit[] {
  const source = code ?? fs.readFileSync(file, 'utf8')
  const hits: RawHit[] = []

  let descriptor
  try {
    descriptor = parseSfc(source, { filename: file }).descriptor
  } catch {
    return hits
  }

  if (descriptor.template?.content) {
    hits.push(...extractFromVueTemplate(descriptor.template.content, file, strategy))
  }

  for (const script of [descriptor.script, descriptor.scriptSetup]) {
    if (!script?.content) continue
    const scriptHits = extractFromJsTsFile(file, script.content, strategy, 'vue')
    hits.push(...scriptHits)
  }

  return hits
}

function pushHit(hits: RawHit[], file: string, raw: string) {
  const value = normalizeText(raw)
  if (!value || !isExtractableSegment(value)) return
  hits.push({ value, file, framework: 'vue' })
}

function extractFromVueTemplate(
  template: string,
  file: string,
  strategy: TemplateStrategy,
): RawHit[] {
  const hits: RawHit[] = []

  const textRe = />([^<]*[\u4e00-\u9fff][^<]*)</g
  for (const m of template.matchAll(textRe)) {
    const value = normalizeText(m[1] ?? '')
    if (value && !value.includes('{{')) pushHit(hits, file, value)
  }

  const staticAttrRe = /\s(?!:|v-)[\w.-]+=["']([^"'`]*[\u4e00-\u9fff][^"'`]*)["']/g
  for (const m of template.matchAll(staticAttrRe)) {
    pushHit(hits, file, m[1] ?? '')
  }

  const interpRe = /\{\{\s*(['"])([^'"`]*[\u4e00-\u9fff][^'"`]*)\1\s*\}\}/g
  for (const m of template.matchAll(interpRe)) {
    pushHit(hits, file, m[2] ?? '')
  }

  const bindLiteralRe =
    /(?::|v-bind:)[\w.-]+=["'](?:'([^']*[\u4e00-\u9fff][^']*)'|"([^"]*[\u4e00-\u9fff][^"]*)")["']/g
  for (const m of template.matchAll(bindLiteralRe)) {
    pushHit(hits, file, m[1] ?? m[2] ?? '')
  }

  // :title="`提示: ${tip} tips`"
  const bindTemplateRe = /(?::|v-bind:)[\w.-]+=["'](`[^`]*`)["']/g
  for (const m of template.matchAll(bindTemplateRe)) {
    const raw = m[1] ?? ''
    if (strategy === 'placeholder') {
      const message = templateToPlaceholderMessage(raw)
      if (message) pushHit(hits, file, message)
    } else {
      for (const part of splitTemplateStatics(raw)) {
        pushHit(hits, file, part)
      }
    }
  }

  return hits
}

import fs from 'node:fs'
import path from 'node:path'
import fg from 'fast-glob'
import type { Catalog, CatalogEntry, Framework, MlaConfig, SourceKind } from '../types.js'
import {
  makeKey,
  extractPlaceholders,
  normalizeText,
  relativePath,
  moduleNamespace,
} from '../utils/text.js'
import { extractFromJsTsFile, sourceKindFromFile, type RawHit } from './react.js'
import { extractFromVueFile } from './vue.js'
import { runIfreeovoExtract } from './ifreeovo.js'

const REACT_GLOBS = ['**/*.{js,jsx,ts,tsx}']
const VUE_GLOBS = ['**/*.{vue}']
const AUTO_GLOBS = ['**/*.{js,jsx,ts,tsx,vue}']

export async function extractCatalog(cwd: string, config: MlaConfig): Promise<Catalog> {
  if (config.engine === 'ifreeovo') {
    const messages = await runIfreeovoExtract(cwd, config)
    return catalogFromMessages(messages, config.sourceLocale)
  }
  return extractBuiltin(cwd, config)
}

async function extractBuiltin(cwd: string, config: MlaConfig): Promise<Catalog> {
  const inputRoot = path.resolve(cwd, config.input)
  const patterns = globFor(config.framework)
  const files = await fg(patterns, {
    cwd: inputRoot,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/.git/**'],
  })

  const hits: RawHit[] = []
  for (const file of files) {
    const kind = sourceKindFromFile(file)
    const strategy = config.templateStrategy
    if (kind === 'vue') hits.push(...extractFromVueFile(file, undefined, strategy))
    else hits.push(...extractFromJsTsFile(file, undefined, strategy, kind))
  }

  return buildCatalog(hits, cwd, config.sourceLocale)
}

function globFor(framework: Framework): string[] {
  if (framework === 'react') return REACT_GLOBS
  if (framework === 'vue') return VUE_GLOBS
  return AUTO_GLOBS
}

/**
 * 按「模块命名空间 + 文案」建 key：Home.tsx 中的文案 → Home.xxxx
 * 同一文案出现在多个模块时各自保留（Home.xxxx / Hello.xxxx），不做合并删除。
 */
function buildCatalog(hits: RawHit[], cwd: string, sourceLocale: string): Catalog {
  type Meta = { files: Set<string>; frameworks: Set<SourceKind>; count: number }
  const byNsValue = new Map<string, { ns: string; value: string; meta: Meta }>()

  for (const hit of hits) {
    const value = normalizeText(hit.value)
    if (!value) continue
    const ns = moduleNamespace(hit.file)
    const rel = relativePath(cwd, hit.file)
    const id = `${ns}\0${value}`
    const cur = byNsValue.get(id) ?? {
      ns,
      value,
      meta: { files: new Set(), frameworks: new Set(), count: 0 },
    }
    cur.meta.files.add(rel)
    cur.meta.frameworks.add(hit.framework)
    cur.meta.count += 1
    byNsValue.set(id, cur)
  }

  /** 同一文案跨模块共用同一 leaf，便于 Common.xxxx 对齐 */
  const leafUsed = new Set<string>()
  const valueToLeaf = new Map<string, string>()
  const leafFor = (value: string) => {
    let leaf = valueToLeaf.get(value)
    if (!leaf) {
      leaf = makeKey(value, leafUsed)
      valueToLeaf.set(value, leaf)
    }
    return leaf
  }

  const usedKeys = new Set<string>()
  const entries: CatalogEntry[] = []
  const messages: Record<string, string> = {}

  for (const { ns, value, meta } of byNsValue.values()) {
    const leaf = leafFor(value)
    let key = `${ns}.${leaf}`
    let i = 1
    while (usedKeys.has(key)) {
      key = `${ns}.${leaf}_${i++}`
    }
    usedKeys.add(key)
    entries.push({
      key,
      value,
      count: meta.count,
      files: [...meta.files].sort(),
      frameworks: [...meta.frameworks],
      placeholders: extractPlaceholders(value),
    })
    messages[key] = value
  }

  entries.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))

  return {
    sourceLocale,
    generatedAt: new Date().toISOString(),
    entries,
    messages,
  }
}

function catalogFromMessages(messages: Record<string, string>, sourceLocale: string): Catalog {
  const entries: CatalogEntry[] = Object.entries(messages).map(([key, value]) => ({
    key,
    value,
    count: 1,
    files: [],
    frameworks: [],
    placeholders: extractPlaceholders(value),
  }))
  return {
    sourceLocale,
    generatedAt: new Date().toISOString(),
    entries,
    messages,
  }
}

export function writeCatalog(cwd: string, config: MlaConfig, catalog: Catalog): { localePath: string; catalogPath: string } {
  const localePath = path.resolve(cwd, config.localePath)
  fs.mkdirSync(path.dirname(localePath), { recursive: true })
  fs.writeFileSync(localePath, JSON.stringify(catalog.messages, null, 2) + '\n', 'utf8')

  const catalogPath = path.resolve(cwd, config.workDir, 'catalog.json')
  fs.mkdirSync(path.dirname(catalogPath), { recursive: true })
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8')

  return { localePath, catalogPath }
}

/** extract 启动时清空语言包目录，避免历史翻译残留 */
export function clearLocaleDir(cwd: string, config: MlaConfig): void {
  const dir = path.dirname(path.resolve(cwd, config.localePath))
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    return
  }
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    try {
      if (fs.statSync(full).isFile()) fs.unlinkSync(full)
    } catch {
      // ignore
    }
  }
}

/** 把 Common.xxxx 合并进语言包，保留原有 Home.xxxx 等模块 key */
export function mergeCommonIntoLocale(
  cwd: string,
  config: MlaConfig,
  catalog: Catalog,
  commonMessages: Record<string, string>,
): string {
  const next = attachCommonEntries(catalog, commonMessages)
  const localePath = path.resolve(cwd, config.localePath)
  fs.mkdirSync(path.dirname(localePath), { recursive: true })
  fs.writeFileSync(localePath, JSON.stringify(next.messages, null, 2) + '\n', 'utf8')

  const catalogPath = path.resolve(cwd, config.workDir, 'catalog.json')
  fs.writeFileSync(catalogPath, JSON.stringify(next, null, 2) + '\n', 'utf8')
  return localePath
}

/**
 * 将 Common.xxxx 并入 catalog（内存）：汇总同文案模块条目的次数 / 文件。
 * 会去掉旧 Common 再按 commonMessages 重建，避免残留。
 */
export function attachCommonEntries(
  catalog: Catalog,
  commonMessages: Record<string, string>,
): Catalog {
  const moduleEntries = catalog.entries.filter((e) => !e.key.startsWith('Common.'))
  const valueMeta = new Map<
    string,
    { count: number; files: Set<string>; frameworks: Set<SourceKind> }
  >()
  for (const e of moduleEntries) {
    const meta = valueMeta.get(e.value) ?? {
      count: 0,
      files: new Set<string>(),
      frameworks: new Set<SourceKind>(),
    }
    meta.count += e.count || 0
    for (const f of e.files ?? []) meta.files.add(f)
    for (const fw of e.frameworks ?? []) meta.frameworks.add(fw)
    valueMeta.set(e.value, meta)
  }

  const commonEntries = Object.entries(commonMessages).map(([key, value]) => {
    const meta = valueMeta.get(value)
    return {
      key,
      value,
      count: meta?.count ?? 0,
      files: meta ? [...meta.files].sort() : ([] as string[]),
      frameworks: meta ? ([...meta.frameworks] as SourceKind[]) : ([] as SourceKind[]),
      placeholders: extractPlaceholders(value),
    }
  })

  const moduleMessages = Object.fromEntries(
    Object.entries(catalog.messages).filter(([k]) => !k.startsWith('Common.')),
  )

  return {
    ...catalog,
    messages: { ...moduleMessages, ...commonMessages },
    entries: [...moduleEntries, ...commonEntries],
  }
}

export function loadCatalog(cwd: string, config: MlaConfig): Catalog | null {
  const catalogPath = path.resolve(cwd, config.workDir, 'catalog.json')
  if (fs.existsSync(catalogPath)) {
    return JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as Catalog
  }
  const localePath = path.resolve(cwd, config.localePath)
  if (fs.existsSync(localePath)) {
    const messages = JSON.parse(fs.readFileSync(localePath, 'utf8')) as Record<string, string>
    return catalogFromMessages(messages, config.sourceLocale)
  }
  return null
}

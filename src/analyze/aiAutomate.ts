import fs from 'node:fs'
import path from 'node:path'
import type { Catalog, CatalogEntry, MlaConfig, SourceKind } from '../types.js'
import { attachCommonEntries } from '../extract/index.js'
import { sourceKindFromFile } from '../extract/react.js'
import { keyNamespace, makeKey } from '../utils/text.js'
import { requireLlmClient, resolveLlmClient } from '../llm/provider.js'
import { analyzeByRules } from './rules.js'
import {
  heuristicAction,
  strongLocalSkip,
  suggestBatch,
  type BatchItem,
  type LlmDecision,
  type LlmOpts,
} from './aiAutomateLlm.js'
import { runBatchesInProcesses } from './aiAutomatePool.js'

const BATCH_SIZE = 20
const FALLBACK_CONCURRENCY = 8
const CONTEXT_RADIUS = 2
const MAX_FILES_PER_ENTRY = 1
const MAX_SNIPPET_CHARS = 480

export interface AiAutomateStats {
  total: number
  kept: number
  skipped: number
  commonKeyCount: number
  excludedCommon: number
}

export interface AiAutomateProgress {
  done: number
  total: number
  message?: string
}

export type AiAutomateProgressFn = (p: AiAutomateProgress) => void

export interface AiAutomateResult {
  catalog: Catalog
  stats: AiAutomateStats
  skipped: Array<{ key: string; value: string; reason: string }>
}

/** AI 自动优化：排除 Common → 多进程 LLM → 结束后自动提炼 Common */
export async function runAiAutomate(
  cwd: string,
  catalog: Catalog,
  config: MlaConfig,
  onProgress?: AiAutomateProgressFn,
): Promise<AiAutomateResult> {
  if (!resolveLlmClient(config)) {
    throw new Error('未配置 LLM，无法执行 AI 自动优化')
  }

  const excludedCommon = catalog.entries.filter((e) => keyNamespace(e.key) === 'Common').length
  const entries = catalog.entries.filter((e) => keyNamespace(e.key) !== 'Common')
  const client = requireLlmClient(config)
  console.log(
    `AI 自动优化… ${entries.length} 条（排除 Common ${excludedCommon}，provider=${client.provider}）`,
  )
  onProgress?.({
    done: 0,
    total: entries.length,
    message:
      excludedCommon > 0
        ? `已排除 Common ${excludedCommon} 条，准备分析 ${entries.length} 条…`
        : `准备分析 ${entries.length} 条文案…`,
  })

  const decisions = await decideWithLlm(cwd, entries, config, onProgress)
  const byKey = new Map(decisions.map((d) => [d.key, d]))

  const skipped: AiAutomateResult['skipped'] = []
  const keepEntries: CatalogEntry[] = []
  const usedLeaves = new Set<string>()
  const valueToLeaf = new Map<string, string>()

  for (const e of entries) {
    const d = byKey.get(e.key)
    const action = d?.action ?? heuristicAction(e.value)
    if (action === 'skip') {
      skipped.push({
        key: e.key,
        value: e.value,
        reason: d?.reason ?? '启发式判定为技术字符串',
      })
      continue
    }

    let leaf = valueToLeaf.get(e.value)
    if (!leaf) {
      leaf = uniqueLeaf(
        sanitizeEnglishLeaf(d?.englishLeaf) || fallbackEnglishLeaf(e.value),
        usedLeaves,
      )
      valueToLeaf.set(e.value, leaf)
    }

    const ns = keyNamespace(e.key)
    const nextKey = ns ? `${ns}.${leaf}` : leaf
    keepEntries.push({
      ...e,
      key: nextKey,
      frameworks: recalibrateFrameworks(e),
    })
  }

  const usedKeys = new Set<string>()
  const entriesOut: CatalogEntry[] = []
  const messages: Record<string, string> = {}
  for (const e of keepEntries) {
    let key = e.key
    let i = 1
    const ns = keyNamespace(key)
    const leaf = ns ? key.slice(ns.length + 1) : key
    while (usedKeys.has(key)) {
      key = ns ? `${ns}.${leaf}_${i++}` : `${leaf}_${i++}`
    }
    usedKeys.add(key)
    entriesOut.push({ ...e, key })
    messages[key] = e.value
  }

  entriesOut.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))

  const optimized: Catalog = {
    ...catalog,
    generatedAt: new Date().toISOString(),
    entries: entriesOut,
    messages,
  }

  onProgress?.({
    done: entries.length,
    total: entries.length,
    message: 'AI 完成，正在自动提炼 Common…',
  })
  const rules = analyzeByRules(optimized)
  const withCommon = attachCommonEntries(optimized, rules.commonMessages)
  console.log(
    `AI 自动优化完成：保留 ${entriesOut.length}，跳过 ${skipped.length}，Common ${rules.stats.commonKeyCount}`,
  )

  return {
    catalog: withCommon,
    stats: {
      total: entries.length,
      kept: entriesOut.length,
      skipped: skipped.length,
      commonKeyCount: rules.stats.commonKeyCount,
      excludedCommon,
    },
    skipped,
  }
}

async function decideWithLlm(
  cwd: string,
  entries: CatalogEntry[],
  config: MlaConfig,
  onProgress?: AiAutomateProgressFn,
): Promise<LlmDecision[]> {
  const client = requireLlmClient(config)
  const opts: LlmOpts = {
    apiKey: client.apiKey,
    baseUrl: client.baseUrl,
    model: client.model,
  }
  const fileCache = new Map<string, { text: string; lines: string[] }>()
  const total = entries.length

  const local: LlmDecision[] = []
  const needLlm: CatalogEntry[] = []
  for (const e of entries) {
    if (strongLocalSkip(e.value)) {
      local.push({
        key: e.key,
        action: 'skip',
        reason: '本地启发式：技术字符串',
      })
    } else {
      needLlm.push(e)
    }
  }

  if (local.length) {
    console.log(`  本地预过滤跳过 ${local.length} 条，剩余 ${needLlm.length} 条送 LLM`)
    onProgress?.({
      done: local.length,
      total,
      message: `本地过滤 ${local.length}/${total}，其余多进程送 AI…`,
    })
  }

  if (!needLlm.length) return local

  const payloads: BatchItem[] = needLlm.map((e) => ({
    key: e.key,
    value: e.value,
    contexts: buildContexts(cwd, e, fileCache),
  }))

  const batches: BatchItem[][] = []
  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    batches.push(payloads.slice(i, i + BATCH_SIZE))
  }

  let done = local.length
  const bump = (n: number) => {
    done += n
    const current = Math.min(done, total)
    onProgress?.({
      done: current,
      total,
      message: `多进程分析中 ${current}/${total}`,
    })
  }

  try {
    const remote = await runBatchesInProcesses(batches, opts, bump)
    return [...local, ...remote]
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`  多进程池不可用，回退同进程并发: ${msg}`)
    return [...local, ...(await runBatchesInProcess(batches, opts, bump))]
  }
}

async function runBatchesInProcess(
  batches: BatchItem[][],
  opts: LlmOpts,
  onBatchDone: (n: number) => void,
): Promise<LlmDecision[]> {
  const out: LlmDecision[] = []
  let cursor = 0

  async function worker() {
    while (cursor < batches.length) {
      const index = cursor++
      const slice = batches[index]!
      try {
        out.push(...(await suggestBatch(slice, opts)))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`  批次 ${index + 1}/${batches.length} 失败，改用启发式: ${msg}`)
        for (const item of slice) {
          out.push({
            key: item.key,
            action: heuristicAction(item.value),
            reason: '批次失败回退',
            englishLeaf: fallbackEnglishLeaf(item.value),
          })
        }
      }
      onBatchDone(slice.length)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(FALLBACK_CONCURRENCY, batches.length || 1) }, () => worker()),
  )
  return out
}

function recalibrateFrameworks(entry: CatalogEntry): SourceKind[] {
  const kinds = new Set<SourceKind>()
  for (const f of entry.files ?? []) {
    kinds.add(sourceKindFromFile(f))
  }
  return [...kinds]
}

function buildContexts(
  cwd: string,
  entry: CatalogEntry,
  fileCache: Map<string, { text: string; lines: string[] }>,
): Array<{ file: string; snippet: string }> {
  const contexts: Array<{ file: string; snippet: string }> = []
  for (const rel of (entry.files ?? []).slice(0, MAX_FILES_PER_ENTRY)) {
    const full = path.resolve(cwd, rel)
    let cached = fileCache.get(full)
    if (!cached) {
      if (!fs.existsSync(full)) continue
      try {
        const text = fs.readFileSync(full, 'utf8')
        cached = { text, lines: text.split(/\r?\n/) }
        fileCache.set(full, cached)
      } catch {
        continue
      }
    }
    const snippet = extractSnippet(cached.lines, entry.value)
    if (snippet) contexts.push({ file: rel, snippet })
  }
  return contexts
}

function extractSnippet(lines: string[], value: string): string {
  const needle = value.slice(0, 80)
  const hits: number[] = []
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.includes(needle)) hits.push(i)
  }
  if (!hits.length) {
    return lines.slice(0, Math.min(8, lines.length)).join('\n').slice(0, MAX_SNIPPET_CHARS)
  }
  const parts: string[] = []
  for (const lineNo of hits.slice(0, 2)) {
    const start = Math.max(0, lineNo - CONTEXT_RADIUS)
    const end = Math.min(lines.length, lineNo + CONTEXT_RADIUS + 1)
    const chunk = lines
      .slice(start, end)
      .map((l, idx) => `${start + idx + 1}| ${l}`)
      .join('\n')
    parts.push(chunk)
  }
  return parts.join('\n---\n').slice(0, MAX_SNIPPET_CHARS)
}

function sanitizeEnglishLeaf(raw: string | undefined): string {
  if (!raw) return ''
  let s = raw.trim()
  s = s
    .replace(/[-_\s]+([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]+/g, '')
  if (!s) return ''
  s = s.charAt(0).toLowerCase() + s.slice(1)
  if (!/^[a-zA-Z]/.test(s)) s = `k${s}`
  return s.slice(0, 48)
}

function fallbackEnglishLeaf(value: string): string {
  const latin = sanitizeEnglishLeaf(
    value
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((w) => /^[a-zA-Z]/.test(w))
      .join(' '),
  )
  if (latin) return latin
  return makeKey(value, new Set())
}

function uniqueLeaf(base: string, used: Set<string>): string {
  let leaf = base || 'text'
  let i = 1
  while (used.has(leaf)) leaf = `${base}_${i++}`
  used.add(leaf)
  return leaf
}

import type { Catalog, DuplicateGroup, RuleAnalysisResult } from '../types.js'
import { keyLeaf, keyNamespace, makeKey } from '../utils/text.js'

const COMMON_NS = 'Common'

/**
 * 规则检索提炼 Common：
 * - 模块 key：Home.xxxx
 * - 跨模块复用同一文案 → 额外生成 Common.xxxx
 * - Home.xxxx 与 Common.xxxx 同时保留，不删除模块 key
 */
export function analyzeByRules(catalog: Catalog): RuleAnalysisResult {
  const valueToEntries = new Map<string, typeof catalog.entries>()
  for (const e of catalog.entries) {
    if (keyNamespace(e.key) === COMMON_NS) continue
    const list = valueToEntries.get(e.value) ?? []
    list.push(e)
    valueToEntries.set(e.value, list)
  }

  const duplicates: DuplicateGroup[] = []
  let i = 0
  for (const [value, list] of valueToEntries) {
    const totalCount = list.reduce((n, e) => n + e.count, 0)
    const files = [...new Set(list.flatMap((e) => e.files))]
    const namespaces = [...new Set(list.map((e) => keyNamespace(e.key) || e.key))]
    const multiModule = namespaces.length > 1
    const multiFile = files.length > 1

    if (!multiModule && !multiFile) continue

    const leaf = resolveCommonLeaf(
      list.map((e) => e.key),
      value,
    )
    const commonKey = `${COMMON_NS}.${leaf}`

    duplicates.push({
      id: `dup_${i++}`,
      value,
      keys: list.map((e) => e.key),
      commonKey,
      totalCount,
      files,
      suggestion: 'merge-to-common',
      confidence: multiModule ? 0.95 : 0.85,
    })
  }

  duplicates.sort((a, b) => b.totalCount - a.totalCount || a.value.localeCompare(b.value))

  const commonMessages: Record<string, string> = {}
  for (const d of duplicates) {
    commonMessages[d.commonKey] = d.value
  }

  return {
    duplicates,
    similar: [],
    splitCandidates: [],
    commonMessages,
    stats: {
      totalKeys: catalog.entries.length,
      uniqueValues: valueToEntries.size,
      duplicateValueCount: duplicates.length,
      commonKeyCount: Object.keys(commonMessages).length,
    },
  }
}

function resolveCommonLeaf(keys: string[], value: string): string {
  const leaves = keys.map(keyLeaf).filter(Boolean)
  const counts = new Map<string, number>()
  for (const leaf of leaves) counts.set(leaf, (counts.get(leaf) ?? 0) + 1)
  let best = leaves[0]
  let bestCount = 0
  for (const [leaf, n] of counts) {
    if (n > bestCount) {
      best = leaf
      bestCount = n
    }
  }
  if (best) return best
  return makeKey(value, new Set())
}

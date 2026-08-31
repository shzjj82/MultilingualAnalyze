import type { CatalogEntry } from '@/types'

export interface TextCatalogItem {
  key: string
  value: string
  count: number
  frameworks: CatalogEntry['frameworks']
  /** 出现该 key 的全部源文件路径（一份 key 可对应多个文件） */
  files: string[]
}

/**
 * 生成可导出的文案清单：key / 文案 / 全部文件位置。
 * Common 等无 files / count=0 的条目，会按同文案模块 key 回填。
 */
export function buildTextCatalog(entries: CatalogEntry[]): TextCatalogItem[] {
  const valueFiles = new Map<string, Set<string>>()
  const valueCount = new Map<string, number>()
  for (const e of entries) {
    if (e.key.startsWith('Common.')) continue
    if (e.files?.length) {
      const set = valueFiles.get(e.value) ?? new Set<string>()
      for (const f of e.files) set.add(f)
      valueFiles.set(e.value, set)
    }
    valueCount.set(e.value, (valueCount.get(e.value) ?? 0) + (e.count || 0))
  }

  return entries.map((e) => {
    const files =
      e.files?.length > 0
        ? [...e.files].sort()
        : [...(valueFiles.get(e.value) ?? [])].sort()
    const count =
      e.count > 0 ? e.count : e.key.startsWith('Common.') ? (valueCount.get(e.value) ?? 0) : e.count
    return {
      key: e.key,
      value: e.value,
      count,
      frameworks: e.frameworks ?? [],
      files,
    }
  })
}

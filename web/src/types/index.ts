export interface CatalogEntry {
  key: string
  value: string
  count: number
  files: string[]
  frameworks: Array<'react' | 'vue' | 'js' | 'ts' | 'jsx' | 'tsx' | 'auto'>
  placeholders: string[]
}

export interface Catalog {
  sourceLocale: string
  generatedAt: string
  entries: CatalogEntry[]
  messages: Record<string, string>
}

export interface TranslateResult {
  from: string
  to: string
  messages: Record<string, string>
  failed: Array<{ key: string; error: string }>
  outPath?: string
}

export interface TranslateBatchResult {
  from: string
  results: TranslateResult[]
}

export type BusyAction = 'translate' | 'aiAutomate'

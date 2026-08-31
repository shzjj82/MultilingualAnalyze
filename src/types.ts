export type Framework = 'react' | 'vue' | 'auto'

/** 文案来源文件类型（按扩展名标注，展示用） */
export type SourceKind = 'vue' | 'react' | 'js' | 'ts' | 'jsx' | 'tsx'

export type ExtractEngine = 'builtin' | 'ifreeovo'

/** 模板字符串策略：拆分静态段，或保留为带占位符的整句 */
export type TemplateStrategy = 'split' | 'placeholder'

export interface MlaConfig {
  /** 扫描目录，相对 cwd */
  input: string
  /** 输出语言包路径 */
  localePath: string
  /** 工作目录缓存（分析结果、任务） */
  workDir: string
  /** 框架：react / vue / auto（按扩展名分流） */
  framework: Framework
  /** 抽取引擎：内置 AST 或第三方 ifreeovo */
  engine: ExtractEngine
  /**
   * ES6 模板字符串处理：
   * - split：按 ${} 拆开，只抽各静态段（默认，不依赖 i18n 占位符）
   * - placeholder：合成一句，${tip} → {tip}（需 i18n 支持占位符）
   */
  templateStrategy: TemplateStrategy
  /** 源语言 */
  sourceLocale: string
  /** 服务端口 */
  port: number
  /**
   * LLM（OpenAI Compatible）。
   * 推荐用 provider + providers 多厂商配置；仍兼容旧版扁平 apiKey/baseUrl/model。
   */
  llm?: {
    /** 当前启用的 provider：openai / deepseek / qwen / moonshot / zhipu / … */
    provider?: string
    /** 多 provider 配置表 */
    providers?: Record<
      string,
      {
        apiKey?: string
        baseUrl?: string
        model?: string
      }
    >
    /** @deprecated 扁平配置，等价于当前 provider 的字段 */
    apiKey?: string
    baseUrl?: string
    model?: string
  }
}

export interface CatalogEntry {
  key: string
  value: string
  /** 出现次数 */
  count: number
  /** 来源文件（相对路径） */
  files: string[]
  /** 推断来源类型：vue / react / js / ts … */
  frameworks: SourceKind[]
  /** 占位符，如 {name} */
  placeholders: string[]
}

export interface Catalog {
  sourceLocale: string
  generatedAt: string
  entries: CatalogEntry[]
  /** 扁平 JSON，便于直接给 i18n 使用 */
  messages: Record<string, string>
}

export interface DuplicateGroup {
  id: string
  value: string
  /** 原模块 key，如 Home.xxxx（全部保留） */
  keys: string[]
  /** 提炼出的 Common key，如 Common.xxxx */
  commonKey: string
  totalCount: number
  files: string[]
  suggestion: 'merge-to-common'
  confidence: number
}

export interface SimilarPair {
  id: string
  left: { key: string; value: string }
  right: { key: string; value: string }
  similarity: number
  suggestion: 'review-merge' | 'keep-separate'
}

export interface RuleAnalysisResult {
  duplicates: DuplicateGroup[]
  /** 保留字段兼容旧报告；当前不再计算相似对 */
  similar: SimilarPair[]
  splitCandidates: never[]
  /**
   * 提炼出的 Common.* 条目（如 Common.xxxx）。
   * 合并进语言包时与 Home.xxxx 等模块 key 并存，不覆盖删除。
   */
  commonMessages: Record<string, string>
  stats: {
    totalKeys: number
    uniqueValues: number
    duplicateValueCount: number
    commonKeyCount: number
  }
}

export interface TranslateRequest {
  from: string
  to: string
  keys?: string[]
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

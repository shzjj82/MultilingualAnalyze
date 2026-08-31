import type { MlaConfig } from '../types.js'

/** 内置 / 自定义 provider id */
export type LlmProviderId =
  | 'openai'
  | 'deepseek'
  | 'qwen'
  | 'moonshot'
  | 'zhipu'
  | 'siliconflow'
  | 'ollama'
  | 'openrouter'
  | 'custom'
  | (string & {})

export interface LlmProviderConfig {
  apiKey?: string
  /** OpenAI 兼容接口根路径，如 https://api.deepseek.com/v1 */
  baseUrl?: string
  model?: string
}

/** 解析后的可调用客户端（一律走 OpenAI Compatible Chat Completions） */
export interface ResolvedLlmClient {
  provider: string
  apiKey: string
  baseUrl: string
  model: string
}

interface ProviderPreset {
  baseUrl: string
  model: string
  /** 专用环境变量（优先级低于 MLA_LLM_API_KEY） */
  envKeys?: string[]
}

const PRESETS: Record<string, ProviderPreset> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    envKeys: ['OPENAI_API_KEY'],
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    envKeys: ['DEEPSEEK_API_KEY'],
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    envKeys: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY'],
  },
  moonshot: {
    baseUrl: 'https://api.moonshot.cn/v1',
    model: 'moonshot-v1-8k',
    envKeys: ['MOONSHOT_API_KEY', 'KIMI_API_KEY'],
  },
  zhipu: {
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    envKeys: ['ZHIPU_API_KEY', 'GLM_API_KEY'],
  },
  siliconflow: {
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
    envKeys: ['SILICONFLOW_API_KEY'],
  },
  ollama: {
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'llama3.1',
    envKeys: ['OLLAMA_API_KEY'],
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o-mini',
    envKeys: ['OPENROUTER_API_KEY'],
  },
  custom: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
}

export function listLlmProviders(): Array<{ id: string; baseUrl: string; model: string }> {
  return Object.entries(PRESETS).map(([id, p]) => ({
    id,
    baseUrl: p.baseUrl,
    model: p.model,
  }))
}

/** 从 baseUrl 推断 provider（兼容旧扁平配置） */
export function inferProviderFromBaseUrl(baseUrl?: string): string {
  if (!baseUrl) return 'openai'
  const u = baseUrl.toLowerCase()
  if (u.includes('deepseek')) return 'deepseek'
  if (u.includes('dashscope') || u.includes('aliyuncs')) return 'qwen'
  if (u.includes('moonshot')) return 'moonshot'
  if (u.includes('bigmodel') || u.includes('zhipu')) return 'zhipu'
  if (u.includes('siliconflow')) return 'siliconflow'
  if (u.includes('openrouter')) return 'openrouter'
  if (u.includes('11434') || u.includes('ollama')) return 'ollama'
  if (u.includes('openai.com')) return 'openai'
  return 'custom'
}

/**
 * 解析当前启用的 LLM 客户端。
 * 优先级：显式 provider + providers[id] > 扁平 llm 字段 > 预设 / 环境变量
 */
export function resolveLlmClient(config: MlaConfig): ResolvedLlmClient | null {
  const llm = config.llm
  if (!llm) return null

  const flatHasCreds = Boolean(llm.apiKey || llm.baseUrl || llm.model)
  const providerId =
    llm.provider ||
    process.env.MLA_LLM_PROVIDER ||
    (flatHasCreds ? inferProviderFromBaseUrl(llm.baseUrl) : 'openai')

  const preset = PRESETS[providerId] ?? PRESETS.custom!
  const fromTable = llm.providers?.[providerId] ?? {}

  // 扁平字段：无 providers 表时作为当前 provider 覆盖；有表时仅作全局兜底
  const useFlatAsOverride = !llm.providers || Object.keys(llm.providers).length === 0

  const baseUrl = (
    (useFlatAsOverride ? llm.baseUrl : undefined) ||
    fromTable.baseUrl ||
    llm.baseUrl ||
    preset.baseUrl
  ).replace(/\/$/, '')

  const model =
    (useFlatAsOverride ? llm.model : undefined) ||
    fromTable.model ||
    llm.model ||
    preset.model

  const apiKey =
    (useFlatAsOverride ? llm.apiKey : undefined) ||
    fromTable.apiKey ||
    llm.apiKey ||
    process.env.MLA_LLM_API_KEY ||
    firstEnv(preset.envKeys) ||
    process.env.OPENAI_API_KEY

  if (!apiKey) {
    if (providerId === 'ollama') {
      return { provider: providerId, apiKey: 'ollama', baseUrl, model }
    }
    return null
  }

  return {
    provider: providerId,
    apiKey,
    baseUrl,
    model,
  }
}

export function requireLlmClient(config: MlaConfig): ResolvedLlmClient {
  const client = resolveLlmClient(config)
  if (!client) {
    throw new Error(
      '未配置 LLM。请在 mla.config.json 设置 llm.provider + llm.providers，或扁平 llm.apiKey；也可用环境变量 MLA_LLM_API_KEY / MLA_LLM_PROVIDER',
    )
  }
  return client
}

function firstEnv(keys?: string[]): string | undefined {
  if (!keys) return undefined
  for (const k of keys) {
    const v = process.env[k]
    if (v) return v
  }
  return undefined
}

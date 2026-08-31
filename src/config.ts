import fs from 'node:fs'
import path from 'node:path'
import type { ExtractEngine, Framework, MlaConfig, TemplateStrategy } from './types.js'
import { inferProviderFromBaseUrl } from './llm/provider.js'

const DEFAULTS: MlaConfig = {
  input: 'src',
  localePath: './locales/zh_CN.json',
  workDir: '.mla',
  framework: 'auto',
  engine: 'builtin',
  templateStrategy: 'split',
  sourceLocale: 'zh_CN',
  port: 5179,
  llm: {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
}

export function resolveConfig(cwd: string, partial: Partial<MlaConfig> = {}): MlaConfig {
  const fileConfig = loadConfigFile(cwd)
  const cleanPartial = omitUndefined(partial)
  const cleanFile = omitUndefined(fileConfig)

  const fileLlm = (cleanFile.llm ?? {}) as NonNullable<MlaConfig['llm']>
  const partialLlm = (cleanPartial.llm ?? {}) as NonNullable<MlaConfig['llm']>
  const defaultLlm = DEFAULTS.llm ?? {}

  const providers = {
    ...(defaultLlm.providers ?? {}),
    ...(fileLlm.providers ?? {}),
    ...(partialLlm.providers ?? {}),
  }

  const provider =
    partialLlm.provider ||
    fileLlm.provider ||
    process.env.MLA_LLM_PROVIDER ||
    defaultLlm.provider ||
    (fileLlm.baseUrl || partialLlm.baseUrl
      ? inferProviderFromBaseUrl(partialLlm.baseUrl || fileLlm.baseUrl)
      : 'openai')

  const merged: MlaConfig = {
    ...DEFAULTS,
    ...cleanFile,
    ...cleanPartial,
    llm: {
      ...defaultLlm,
      ...fileLlm,
      ...partialLlm,
      provider,
      providers: Object.keys(providers).length ? providers : undefined,
      apiKey:
        partialLlm.apiKey ??
        fileLlm.apiKey ??
        process.env.MLA_LLM_API_KEY ??
        process.env.OPENAI_API_KEY,
    },
  }
  return merged
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      ;(out as Record<string, unknown>)[key] = value
    }
  }
  return out
}

function loadConfigFile(cwd: string): Partial<MlaConfig> {
  const candidates = ['mla.config.json', 'multilingual-analyze.config.json']
  for (const name of candidates) {
    const full = path.join(cwd, name)
    if (!fs.existsSync(full)) continue
    try {
      return JSON.parse(fs.readFileSync(full, 'utf8')) as Partial<MlaConfig>
    } catch {
      throw new Error(`无法解析配置文件: ${full}`)
    }
  }
  return {}
}

export function ensureWorkDir(cwd: string, workDir: string): string {
  const full = path.resolve(cwd, workDir)
  fs.mkdirSync(full, { recursive: true })
  return full
}

export function parseFramework(value?: string): Framework {
  if (value === 'react' || value === 'vue' || value === 'auto') return value
  return 'auto'
}

export function parseEngine(value?: string): ExtractEngine {
  if (value === 'ifreeovo' || value === 'builtin') return value
  return 'builtin'
}

export function parseTemplateStrategy(value?: string): TemplateStrategy {
  if (value === 'placeholder' || value === 'split') return value
  return 'split'
}

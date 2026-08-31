import fs from 'node:fs'
import path from 'node:path'
import type { Catalog, MlaConfig, TranslateRequest, TranslateResult } from '../types.js'
import { requireLlmClient } from '../llm/provider.js'
import { extractPlaceholders, toLocaleFileId } from '../utils/text.js'


export async function translateCatalog(
  catalog: Catalog,
  req: TranslateRequest,
  config: MlaConfig,
): Promise<TranslateResult> {
  const client = requireLlmClient(config)
  const { apiKey, baseUrl, model } = client

  const keys = req.keys?.length ? req.keys : Object.keys(catalog.messages)
  const batchSize = 40
  const messages: Record<string, string> = {}
  const failed: Array<{ key: string; error: string }> = []

  for (let i = 0; i < keys.length; i += batchSize) {
    const slice = keys.slice(i, i + batchSize)
    const input: Record<string, string> = {}
    for (const k of slice) {
      const v = catalog.messages[k]
      if (v != null) input[k] = v
    }
    try {
      const part = await translateBatch(input, req.from, req.to, { apiKey, baseUrl, model })
      for (const [k, v] of Object.entries(part)) {
        const src = input[k] ?? ''
        const srcPh = extractPlaceholders(src).sort().join(',')
        const dstPh = extractPlaceholders(v).sort().join(',')
        if (srcPh && srcPh !== dstPh) {
          failed.push({ key: k, error: `占位符不一致: ${srcPh} vs ${dstPh}` })
          continue
        }
        messages[k] = v
      }
    } catch (err) {
      for (const k of slice) {
        failed.push({ key: k, error: err instanceof Error ? err.message : String(err) })
      }
    }
  }

  return { from: req.from, to: req.to, messages, failed }
}

async function translateBatch(
  input: Record<string, string>,
  from: string,
  to: string,
  opts: { apiKey: string; baseUrl: string; model: string },
): Promise<Record<string, string>> {
  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `将 JSON 对象的 value 从 ${from} 翻译到 ${to}。保持 key 不变，保留 {var}、%s、{{var}} 等占位符。只返回 JSON 对象。`,
        },
        { role: 'user', content: JSON.stringify(input) },
      ],
    }),
  })
  if (!res.ok) throw new Error(`翻译失败 ${res.status}: ${await res.text()}`)
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  const raw = data.choices?.[0]?.message?.content ?? '{}'
  return JSON.parse(raw) as Record<string, string>
}

export function writeTranslatedLocale(
  cwd: string,
  to: string,
  messages: Record<string, string>,
  config: MlaConfig,
): string {
  const dir = path.dirname(path.resolve(cwd, config.localePath))
  const out = path.join(dir, `${toLocaleFileId(to)}.json`)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(out, JSON.stringify(messages, null, 2) + '\n', 'utf8')
  return out
}

export async function translateMany(
  cwd: string,
  catalog: Catalog,
  from: string,
  locales: string[],
  config: MlaConfig,
  keys?: string[],
): Promise<{ from: string; results: Array<TranslateResult & { outPath: string }> }> {
  const results: Array<TranslateResult & { outPath: string }> = []
  for (const to of locales) {
    const result = await translateCatalog(catalog, { from, to, keys }, config)
    const outPath = writeTranslatedLocale(cwd, to, result.messages, config)
    results.push({ ...result, outPath })
  }
  return { from, results }
}

export function listLocaleFiles(cwd: string, config: MlaConfig): Array<{ locale: string; path: string; bytes: number }> {
  const dir = path.dirname(path.resolve(cwd, config.localePath))
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith('.json') && name.toLowerCase() !== 'common.json')
    .map((name) => {
      const full = path.join(dir, name)
      const stat = fs.statSync(full)
      return {
        locale: name.replace(/\.json$/i, ''),
        path: full,
        bytes: stat.size,
      }
    })
    .sort((a, b) => a.locale.localeCompare(b.locale))
}

export function readLocaleFile(
  cwd: string,
  config: MlaConfig,
  locale: string,
): { locale: string; path: string; messages: Record<string, string> } | null {
  const dir = path.dirname(path.resolve(cwd, config.localePath))
  const id = toLocaleFileId(locale)
  const candidates = [`${id}.json`, `${locale}.json`]
  for (const name of candidates) {
    const full = path.join(dir, name)
    if (!fs.existsSync(full)) continue
    const messages = JSON.parse(fs.readFileSync(full, 'utf8')) as Record<string, string>
    return { locale: id, path: full, messages }
  }
  return null
}

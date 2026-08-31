import { hasCjk, normalizeText } from '../utils/text.js'

export const AI_AUTOMATE_SYSTEM = `你是前端 i18n 审查助手。根据「候选文案 + 源码上下文」判断该字符串是否需要做成多语言文案。

必须 skip（不需要 i18n）的典型情况：
- 技术枚举/配置值：trigger:'change'、type:'text'、size:'default'、position:'right'
- API path、URL、className、icon 名、tag 名（el-input）、字段名
- 纯代码标识符、事件名、布尔语义字符串（true/false 类）

必须 keep（需要 i18n）的典型情况：
- 用户可见文案：label、placeholder、title、按钮文字、提示、表格列名、校验信息等

对 keep 的条目同时给出英文 camelCase key leaf（不含模块前缀）。

输入 JSON：{"items":[{"key":"Home.xxx","value":"文案","contexts":[{"file":"a.vue","snippet":"..."}]}]}
只返回合法 JSON：
{"items":[{"key":"Home.xxx","action":"keep"|"skip","reason":"简短原因","englishLeaf":"optionalLeaf"}]}
条数与输入一致；key 必须原样回传。`

export const REQUEST_TIMEOUT_MS = 60_000

export type LlmDecision = {
  key: string
  action: 'keep' | 'skip'
  reason?: string
  englishLeaf?: string
}

export type BatchItem = {
  key: string
  value: string
  contexts: Array<{ file: string; snippet: string }>
}

export type LlmOpts = { apiKey: string; baseUrl: string; model: string }

/** 高置信技术字符串：本地直接 skip，不送 LLM */
export function strongLocalSkip(value: string): boolean {
  const v = normalizeText(value)
  if (!v) return true
  if (hasCjk(v)) return false
  if (/^[A-Z]{1,3}$/.test(v)) return false
  if (/^https?:\/\//i.test(v)) return true
  if (v.includes('/zh-CN/') || v.includes('/en-US/') || v.includes('/zh_CN/')) return true
  if (/^el-[a-z0-9-]+$/i.test(v) || /^i-[a-z0-9-]+$/i.test(v)) return true
  if (/^\.?\/[\w./@-]+$/.test(v)) return true
  if (/@[\w.-]+/.test(v) && !/\s/.test(v)) return true
  if (/^[A-Z][A-Z0-9_]{2,31}$/.test(v)) return true
  if (/^[a-z][a-z0-9_-]{0,24}$/.test(v) && v.length <= 20) return true
  if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(v) && v.length <= 28 && !/\s/.test(v)) return true
  return false
}

export function heuristicAction(value: string): 'keep' | 'skip' {
  if (strongLocalSkip(value)) return 'skip'
  const v = normalizeText(value)
  if (!v) return 'skip'
  return 'keep'
}

export async function suggestBatch(items: BatchItem[], opts: LlmOpts): Promise<LlmDecision[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: AI_AUTOMATE_SYSTEM },
          { role: 'user', content: JSON.stringify({ items }) },
        ],
      }),
    })
    if (!res.ok) throw new Error(`AI 自动优化失败 ${res.status}: ${await res.text()}`)
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = data.choices?.[0]?.message?.content ?? '{}'
    return parseDecisions(raw, items)
  } finally {
    clearTimeout(timer)
  }
}

function parseDecisions(raw: string, items: Array<{ key: string; value: string }>): LlmDecision[] {
  const parsed = safeParseJson(raw) as { items?: LlmDecision[] } | null
  const list = Array.isArray(parsed?.items) ? parsed!.items! : []
  const byKey = new Map(list.map((d) => [d.key, d]))
  return items.map((item, i) => {
    const d = byKey.get(item.key) ?? list[i]
    const action = d?.action === 'skip' || d?.action === 'keep' ? d.action : heuristicAction(item.value)
    return {
      key: item.key,
      action,
      reason: d?.reason,
      englishLeaf: d?.englishLeaf,
    }
  })
}

function safeParseJson(raw: string): unknown | null {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  }
  try {
    return JSON.parse(s)
  } catch {
    const repaired = repairTruncatedJson(s)
    if (!repaired) return null
    try {
      return JSON.parse(repaired)
    } catch {
      return null
    }
  }
}

function repairTruncatedJson(s: string): string | null {
  let t = s.replace(/,\s*"[^"]*$/, '').replace(/,\s*$/, '')
  const opens = (t.match(/\{/g) ?? []).length
  const closes = (t.match(/\}/g) ?? []).length
  const openArr = (t.match(/\[/g) ?? []).length
  const closeArr = (t.match(/\]/g) ?? []).length
  if (opens + openArr <= closes + closeArr) return null
  t += ']'.repeat(Math.max(0, openArr - closeArr))
  t += '}'.repeat(Math.max(0, opens - closes))
  return t
}

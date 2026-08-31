import type { Catalog, TranslateBatchResult } from '@/types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const data = (await res.json()) as T & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || res.statusText)
  }
  return data
}

export type AiAutomateDoneEvent = {
  type: 'done'
  catalog: Catalog
  stats: {
    total: number
    kept: number
    skipped: number
    commonKeyCount?: number
    excludedCommon?: number
  }
  skippedCount: number
  commonKeyCount?: number
  reportPath?: string
}

async function readNdjsonStream(
  res: Response,
  onEvent: (ev: Record<string, unknown>) => void,
): Promise<void> {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(data.error || res.statusText)
  }
  if (!res.body) throw new Error('浏览器不支持流式响应')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      onEvent(JSON.parse(trimmed) as Record<string, unknown>)
    }
  }

  const tail = buffer.trim()
  if (tail) onEvent(JSON.parse(tail) as Record<string, unknown>)
}

export const api = {
  health: () => request<{ ok: boolean; translateEnabled: boolean }>('/api/health'),
  catalog: () => request<Catalog>('/api/catalog'),
  /** 规则检索提炼 common（无 AI） */
  common: () => request<{ commonMessages: Record<string, string> }>('/api/analyze/rules'),
  translate: (to: string[], from?: string) =>
    request<TranslateBatchResult>('/api/translate', {
      method: 'POST',
      body: JSON.stringify({ to, from }),
    }),
  aiAutomate: async (
    onProgress?: (p: { done: number; total: number; message?: string }) => void,
  ): Promise<AiAutomateDoneEvent> => {
    const res = await fetch('/api/ai/automate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })

    let doneEvent: AiAutomateDoneEvent | null = null
    await readNdjsonStream(res, (ev) => {
      if (ev.type === 'progress') {
        onProgress?.({
          done: Number(ev.done) || 0,
          total: Number(ev.total) || 0,
          message: typeof ev.message === 'string' ? ev.message : undefined,
        })
        return
      }
      if (ev.type === 'error') {
        throw new Error(typeof ev.error === 'string' ? ev.error : 'AI 自动优化失败')
      }
      if (ev.type === 'done') {
        doneEvent = ev as unknown as AiAutomateDoneEvent
      }
    })

    if (!doneEvent) throw new Error('AI 自动优化未返回结果')
    return doneEvent
  },
}

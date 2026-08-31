/**
 * AI 自动优化子进程：接收批次，调用 LLM，回传结果。
 * 由父进程 child_process.fork 拉起。
 */
import {
  heuristicAction,
  suggestBatch,
  type BatchItem,
  type LlmDecision,
  type LlmOpts,
} from './analyze/aiAutomateLlm.js'

type InMsg =
  | { type: 'batch'; id: number; items: BatchItem[]; opts: LlmOpts }
  | { type: 'shutdown' }

type OutMsg =
  | { type: 'ready' }
  | { type: 'result'; id: number; decisions: LlmDecision[] }
  | { type: 'error'; id: number; error: string }

function send(msg: OutMsg) {
  if (typeof process.send === 'function') process.send(msg)
}

process.on('message', (raw: InMsg) => {
  void (async () => {
    if (!raw || typeof raw !== 'object') return
    if (raw.type === 'shutdown') {
      process.exit(0)
      return
    }
    if (raw.type !== 'batch') return
    try {
      const decisions = await suggestBatch(raw.items, raw.opts)
      send({ type: 'result', id: raw.id, decisions })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // 子进程内兜底，避免整批丢给父进程再重试
      const decisions: LlmDecision[] = raw.items.map((item) => ({
        key: item.key,
        action: heuristicAction(item.value),
        reason: `子进程失败回退: ${msg}`,
      }))
      send({ type: 'result', id: raw.id, decisions })
    }
  })()
})

send({ type: 'ready' })

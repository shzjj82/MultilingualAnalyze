import { fork, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import { availableParallelism } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BatchItem, LlmDecision, LlmOpts } from './aiAutomateLlm.js'

type WorkerMsg =
  | { type: 'ready' }
  | { type: 'result'; id: number; decisions: LlmDecision[] }
  | { type: 'error'; id: number; error: string }

function resolveWorkerScript(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const candidates = [
    path.join(here, 'ai-automate-worker.mjs'),
    path.join(here, 'ai-automate-worker.js'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error(`找不到 AI 自动优化 worker：已尝试\n${candidates.join('\n')}`)
}

/** 多进程批次池：子进程并行跑 LLM 批次 */
export async function runBatchesInProcesses(
  batches: BatchItem[][],
  opts: LlmOpts,
  onBatchDone?: (batchSize: number) => void,
): Promise<LlmDecision[]> {
  if (!batches.length) return []

  const script = resolveWorkerScript()
  const processCount = Math.max(
    1,
    Math.min(batches.length, Math.max(2, availableParallelism()), 8),
  )
  console.log(`  启动 ${processCount} 个子进程处理 ${batches.length} 个批次`)

  type Job = { id: number; items: BatchItem[] }
  const queue: Job[] = batches.map((items, id) => ({ id, items }))
  const results = new Map<number, LlmDecision[]>()
  let cursor = 0
  const children: ChildProcess[] = []

  try {
    await Promise.all(
      Array.from({ length: processCount }, async () => {
        const child = fork(script, [], {
          stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        })
        children.push(child)

        await new Promise<void>((resolve, reject) => {
          const onReady = (msg: WorkerMsg) => {
            if (msg?.type === 'ready') {
              child.off('message', onReady)
              resolve()
            }
          }
          child.on('message', onReady)
          child.once('error', reject)
          child.once('exit', (code) => {
            if (code && code !== 0) reject(new Error(`AI worker 异常退出 code=${code}`))
          })
        })

        const runNext = (): Promise<void> =>
          new Promise((resolve, reject) => {
            if (cursor >= queue.length) {
              resolve()
              return
            }
            const job = queue[cursor++]!
            const onMsg = (msg: WorkerMsg) => {
              if (!msg || msg.type !== 'result' || msg.id !== job.id) return
              child.off('message', onMsg)
              results.set(job.id, msg.decisions)
              onBatchDone?.(job.items.length)
              void runNext().then(resolve, reject)
            }
            child.on('message', onMsg)
            child.send({ type: 'batch', id: job.id, items: job.items, opts })
          })

        await runNext()
        if (typeof child.send === 'function') child.send({ type: 'shutdown' })
      }),
    )
  } finally {
    for (const child of children) {
      if (!child.killed && child.exitCode === null) {
        try {
          child.kill()
        } catch {
          // ignore
        }
      }
    }
  }

  const out: LlmDecision[] = []
  for (let i = 0; i < batches.length; i++) {
    const part = results.get(i)
    if (!part) throw new Error(`批次 ${i} 未返回结果`)
    out.push(...part)
  }
  return out
}

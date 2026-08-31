import { useEffect, useMemo, useState } from 'react'
import { api } from '@/api'
import { downloadJson } from '@/lib/download'
import { DEFAULT_TARGET_LOCALES } from '@/lib/locales'
import { buildTextCatalog } from '@/lib/textCatalog'
import type { BusyAction, Catalog } from '@/types'

export function useWorkbench() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toLocales, setToLocales] = useState<string[]>(DEFAULT_TARGET_LOCALES)
  const [translateEnabled, setTranslateEnabled] = useState(false)
  const [busy, setBusy] = useState<BusyAction | null>(null)
  const [loadingProgress, setLoadingProgress] = useState<{
    done: number
    total: number
    message?: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const health = await api.health().catch(() => ({ ok: false, translateEnabled: false }))
        if (cancelled) return
        setTranslateEnabled(Boolean(health.translateEnabled))

        const data = await api.catalog()
        if (cancelled) return
        setCatalog(data)

        // 后台合并 Common（不阻塞按钮）
        void api.common().catch(() => undefined)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const entries = useMemo(() => catalog?.entries ?? [], [catalog])

  return {
    catalog,
    loadError,
    toLocales,
    setToLocales,
    translateEnabled,
    busy,
    loadingProgress,
    entries,
    exportTextCatalog: () => {
      if (!catalog?.entries?.length) {
        setLoadError('尚无文案清单可导出')
        return
      }
      setLoadError(null)
      downloadJson('文案清单.json', buildTextCatalog(catalog.entries))
    },
    runAiAutomate: async () => {
      if (!translateEnabled) {
        setLoadError('未配置 LLM，无法执行 AI 自动优化')
        return
      }
      setBusy('aiAutomate')
      setLoadError(null)
      setLoadingProgress({ done: 0, total: 0, message: '准备开始…' })
      try {
        const data = await api.aiAutomate((p) => setLoadingProgress(p))
        setCatalog(data.catalog)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(null)
        setLoadingProgress(null)
      }
    },
    exportSelectedLocales: async () => {
      if (!toLocales.length) {
        setLoadError('请至少选择一个目标语言')
        return
      }
      setBusy('translate')
      setLoadError(null)
      try {
        const sourceId = (catalog?.sourceLocale || 'zh_CN').replace(/-/g, '_')
        const isSource = (locale: string) => locale.replace(/-/g, '_') === sourceId
        const sourceLocales = toLocales.filter(isSource)
        const translateLocales = toLocales.filter((l) => !isSource(l))

        let downloadIndex = 0
        const total = sourceLocales.length + translateLocales.length

        for (const locale of sourceLocales) {
          if (!catalog?.messages) throw new Error('尚无源语言包')
          downloadJson(`${locale.replace(/-/g, '_')}.json`, catalog.messages)
          downloadIndex++
          if (downloadIndex < total) await new Promise((res) => setTimeout(res, 200))
        }

        if (translateLocales.length) {
          const data = await api.translate(translateLocales)
          for (const r of data.results) {
            downloadJson(`${r.to.replace(/-/g, '_')}.json`, r.messages)
            downloadIndex++
            if (downloadIndex < total) await new Promise((res) => setTimeout(res, 200))
          }
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(null)
      }
    },
  }
}

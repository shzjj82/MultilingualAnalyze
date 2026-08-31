import { CatalogTable, GlobalLoading, Header, Toolbar } from '@/components'
import { useWorkbench } from '@/hooks/useWorkbench'

export default function App() {
  const {
    catalog,
    loadError,
    toLocales,
    setToLocales,
    busy,
    loadingProgress,
    entries,
    translateEnabled,
    exportSelectedLocales,
    exportTextCatalog,
    runAiAutomate,
  } = useWorkbench()

  const exporting = busy === 'translate'
  const aiBusy = busy === 'aiAutomate'
  const disabled = exporting || aiBusy
  const loading = exporting || aiBusy

  const percent =
    aiBusy && loadingProgress && loadingProgress.total > 0
      ? Math.round((loadingProgress.done / loadingProgress.total) * 100)
      : aiBusy
        ? 0
        : null

  const loadingMessage = aiBusy
    ? loadingProgress?.message || 'AI 正在结合源码上下文优化文案…'
    : '正在调用 LLM 翻译，请稍候…'

  const loadingDetail =
    aiBusy && loadingProgress && loadingProgress.total > 0
      ? `${loadingProgress.done} / ${loadingProgress.total}`
      : undefined

  return (
    <div className="bg-background min-h-screen w-full">
      <GlobalLoading
        open={loading}
        message={loadingMessage}
        percent={percent}
        detail={loadingDetail}
      />

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
        <Header error={loadError} />

        {translateEnabled ? (
          <Toolbar
            toLocales={toLocales}
            onToLocalesChange={setToLocales}
            busy={busy}
            translateEnabled
          />
        ) : null}

        <div className="min-w-0">
          <CatalogTable
            entries={entries}
            empty={!catalog && !loadError}
            selectedLocales={toLocales}
            disabled={disabled}
            exporting={exporting || aiBusy}
            translateEnabled={translateEnabled}
            onAiAutomate={runAiAutomate}
            onExportTextCatalog={exportTextCatalog}
            onExportAllLocales={exportSelectedLocales}
          />
        </div>
      </div>
    </div>
  )
}

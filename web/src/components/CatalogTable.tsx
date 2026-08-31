import { useMemo, type ReactNode } from 'react'
import { Download, FileText, Sparkles } from 'lucide-react'
import type { CatalogEntry } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { buildTextCatalog } from '@/lib/textCatalog'

interface CatalogTableProps {
  entries: CatalogEntry[]
  empty?: boolean
  selectedLocales?: string[]
  disabled?: boolean
  exporting?: boolean
  translateEnabled?: boolean
  onAiAutomate?: () => void | Promise<void>
  onExportTextCatalog?: () => void
  onExportAllLocales?: () => void | Promise<void>
}

export function CatalogTable({
  entries,
  empty,
  selectedLocales = [],
  disabled,
  exporting = false,
  translateEnabled = false,
  onAiAutomate,
  onExportTextCatalog,
  onExportAllLocales,
}: CatalogTableProps) {
  const packCount = selectedLocales.length
  const busy = disabled || exporting
  const rows = useMemo(() => buildTextCatalog(entries), [entries])

  return (
    <Card className="flex h-[min(68vh,680px)] min-w-0 flex-col gap-0 overflow-hidden py-0">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="text-base leading-none font-semibold">文案清单</h3>
          <Badge variant="processing">{entries.length} 条</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {translateEnabled ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !entries.length || !onAiAutomate}
              onClick={() => void onAiAutomate?.()}
            >
              <Sparkles data-icon="inline-start" />
              AI 自动优化
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !entries.length || !onExportTextCatalog}
            onClick={() => onExportTextCatalog?.()}
          >
            <FileText data-icon="inline-start" />
            导出文案清单
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            disabled={busy || packCount === 0 || !onExportAllLocales}
            onClick={() => void onExportAllLocales?.()}
          >
            <Download data-icon="inline-start" />
            导出全部语言{packCount > 0 ? ` (${packCount})` : ''}
          </Button>
        </div>
      </div>

      <CardContent className="min-h-0 flex-1 overflow-auto p-0">
        {empty ? (
          <EmptyHint>
            尚无数据。请先运行 <code className="text-primary">mla extract</code>
          </EmptyHint>
        ) : rows.length === 0 ? (
          <EmptyHint>没有匹配的文案</EmptyHint>
        ) : (
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[24%]" />
              <col className="w-[28%]" />
              <col className="w-[38%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr className="text-left">
                <th className="bg-card text-muted-foreground sticky top-0 z-20 px-3 py-2.5 font-medium shadow-[inset_0_-1px_0_0_var(--border)]">
                  键名
                </th>
                <th className="bg-card text-muted-foreground sticky top-0 z-20 px-3 py-2.5 font-medium shadow-[inset_0_-1px_0_0_var(--border)]">
                  文案
                </th>
                <th className="bg-card text-muted-foreground sticky top-0 z-20 px-3 py-2.5 font-medium shadow-[inset_0_-1px_0_0_var(--border)]">
                  文件位置
                </th>
                <th className="bg-card text-muted-foreground sticky top-0 z-20 px-3 py-2.5 font-medium shadow-[inset_0_-1px_0_0_var(--border)]">
                  次数
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const filesTitle = row.files.join('\n')
                return (
                  <tr key={row.key} className="hover:bg-muted/40 border-b last:border-b-0">
                    <td className="px-3 py-2.5 align-top">
                      <span className="block truncate font-medium" title={row.key}>
                        {row.key}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 align-top break-words whitespace-normal">
                      {row.value}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {row.files.length ? (
                        <div className="space-y-0.5" title={filesTitle}>
                          {row.files.map((f) => (
                            <div key={`${row.key}-${f}`} className="text-muted-foreground truncate text-xs">
                              {f}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <Badge variant="secondary">{row.count}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  )
}

function EmptyHint({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground flex h-full min-h-40 items-center justify-center px-4 text-sm">
      {children}
    </div>
  )
}

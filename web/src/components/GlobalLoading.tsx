import { Spinner } from '@/components/ui/spinner'

interface GlobalLoadingProps {
  open: boolean
  message?: string
  /** 0~100；有值时显示进度条 */
  percent?: number | null
  detail?: string
}

/** 全屏遮罩 loading */
export function GlobalLoading({
  open,
  message = '加载中…',
  percent = null,
  detail,
}: GlobalLoadingProps) {
  if (!open) return null

  const showBar = typeof percent === 'number' && Number.isFinite(percent)
  const clamped = showBar ? Math.max(0, Math.min(100, percent)) : 0

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/25 backdrop-blur-[2px]"
      role="alertdialog"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="bg-card flex w-[min(360px,calc(100vw-2rem))] flex-col items-center gap-3 rounded-xl border px-8 py-6 shadow-lg">
        <Spinner className="size-8 text-primary" />
        <p className="text-foreground text-center text-sm font-medium">{message}</p>
        {detail ? <p className="text-muted-foreground text-center text-xs">{detail}</p> : null}
        {showBar ? (
          <div className="w-full space-y-1.5">
            <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full transition-[width] duration-300 ease-out"
                style={{ width: `${clamped}%` }}
              />
            </div>
            <p className="text-muted-foreground text-center text-xs tabular-nums">{clamped}%</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}

import { TARGET_LOCALES } from '@/lib/locales'
import type { BusyAction } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface ToolbarProps {
  toLocales: string[]
  onToLocalesChange: (v: string[]) => void
  busy: BusyAction | null
  translateEnabled?: boolean
}

export function Toolbar({
  toLocales,
  onToLocalesChange,
  busy,
  translateEnabled = false,
}: ToolbarProps) {
  if (!translateEnabled) return null

  const disabled = Boolean(busy)

  const toggle = (value: string, next?: boolean | 'indeterminate') => {
    const shouldCheck = typeof next === 'boolean' ? next : !toLocales.includes(value)
    if (shouldCheck) {
      if (!toLocales.includes(value)) onToLocalesChange([...toLocales, value])
    } else {
      onToLocalesChange(toLocales.filter((v) => v !== value))
    }
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="gap-1 border-b px-4 py-3 [.border-b]:pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">目标语言</CardTitle>
          <Badge variant="processing">已选 {toLocales.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 py-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {TARGET_LOCALES.map((locale) => {
            const checked = toLocales.includes(locale.value)
            const id = `locale-${locale.value}`
            const [name, code] = splitLocaleLabel(locale.label, locale.value)
            return (
              <Label
                key={locale.value}
                htmlFor={id}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5 font-normal shadow-xs transition-colors',
                  checked
                    ? 'border-transparent bg-accent'
                    : 'border-border/80 hover:border-primary/40 hover:bg-accent/40',
                  disabled && 'pointer-events-none opacity-60',
                )}
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(state: boolean | 'indeterminate') =>
                    toggle(locale.value, state)
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{name}</span>
                  <span className="text-muted-foreground block truncate text-[11px] leading-4">
                    {code}
                  </span>
                </span>
              </Label>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function splitLocaleLabel(label: string, value: string): [string, string] {
  const m = label.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (m) return [m[1]!.trim(), m[2]!]
  return [label, value]
}

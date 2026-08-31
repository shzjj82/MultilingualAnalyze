import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface HeaderProps {
  error?: string | null
}

export function Header({ error }: HeaderProps) {
  return (
    <header className="space-y-3">
      <h1 className="text-2xl font-semibold tracking-tight">Multilingual Analyze</h1>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>无法加载文案清单</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </header>
  )
}

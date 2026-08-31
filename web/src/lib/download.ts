export function downloadJson(filename: string, data: unknown) {
  const text = typeof data === 'string' ? ensureJsonText(data) : JSON.stringify(data, null, 2) + '\n'
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ensureJsonText(raw: string): string {
  const trimmed = raw.trim()
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2) + '\n'
  } catch {
    return raw.endsWith('\n') ? raw : raw + '\n'
  }
}

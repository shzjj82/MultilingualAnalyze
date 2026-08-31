/** 是否包含中日韩等需要国际化的字符 */
export function hasCjk(text: string): boolean {
  return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(text)
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** 看起来像源码片段，不应直接作为文案 */
export function looksLikeSourceSnippet(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (t.includes('`')) return true
  if (/\$\{/.test(t)) return true
  if (/^(?:import|export|function|const|let|var|return)\b/.test(t)) return true
  return false
}

/**
 * 判断静态片段是否值得抽取（中文，或至少 2 个拉丁字母的词）
 */
export function isExtractableSegment(text: string): boolean {
  const t = normalizeText(text)
  if (!t || looksLikeSourceSnippet(t)) return false
  if (hasCjk(t)) return true
  return /[a-zA-Z]{2,}/.test(t)
}

/**
 * 默认：按 ${} 拆开，返回各静态段
 * `提示: ${tip} tips` → ['提示:', 'tips']
 */
export function splitTemplateStatics(raw: string): string[] {
  let s = raw.trim()
  if (!s) return []
  if (s.startsWith('`') && s.endsWith('`') && s.length >= 2) {
    s = s.slice(1, -1)
  }
  return s
    .split(/\$\{[^}]*\}/g)
    .map((part) => normalizeText(part))
    .filter((part) => isExtractableSegment(part))
}

/**
 * 占位符模式：合成一句，供支持 {var} 的 i18n 使用
 * `提示: ${tip} tips` → 提示: {tip} tips
 */
export function templateToPlaceholderMessage(raw: string): string | null {
  let s = raw.trim()
  if (!s) return null
  if (s.startsWith('`') && s.endsWith('`') && s.length >= 2) {
    s = s.slice(1, -1)
  }
  if (!hasCjk(s) && !/[a-zA-Z]{2,}/.test(s)) return null

  const converted = s.replace(
    /\$\{([a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)*)\}/g,
    (_, expr: string) => {
      const name = expr.includes('.') ? expr.split('.').pop()! : expr
      return `{${name}}`
    },
  )
  if (/\$\{/.test(converted) || looksLikeSourceSnippet(converted)) return null
  const value = normalizeText(converted)
  return value && isExtractableSegment(value) ? value : null
}

export function extractPlaceholders(text: string): string[] {
  const set = new Set<string>()
  for (const m of text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)) set.add(m[0])
  for (const m of text.matchAll(/%[sdif]/g)) set.add(m[0])
  for (const m of text.matchAll(/\{\{[^{}]+\}\}/g)) set.add(m[0])
  return [...set]
}

/** 简单稳定 leaf：优先短中文，避免过长 */
export function makeKey(value: string, used: Set<string>): string {
  const base =
    value
      .slice(0, 24)
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'text'
  let key = base
  let i = 1
  while (used.has(key)) {
    key = `${base}_${i++}`
  }
  used.add(key)
  return key
}

/** 从文件路径推断模块命名空间：Home.tsx → Home；pages/Foo/index.tsx → Foo */
export function moduleNamespace(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/')
  const segments = normalized.split('/')
  const file = segments[segments.length - 1] ?? 'App'
  const dot = file.lastIndexOf('.')
  const base = dot > 0 ? file.slice(0, dot) : file
  const raw =
    base.toLowerCase() === 'index' ? (segments[segments.length - 2] ?? 'App') : base
  return toPascalIdent(raw)
}

function toPascalIdent(name: string): string {
  const parts = name.split(/[-_\s.]+/).filter(Boolean)
  const out = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('')
  return out || 'App'
}

/** Home.xxxx → Home */
export function keyNamespace(key: string): string {
  const i = key.indexOf('.')
  return i > 0 ? key.slice(0, i) : ''
}

/** Home.xxxx → xxxx */
export function keyLeaf(key: string): string {
  const i = key.indexOf('.')
  return i > 0 ? key.slice(i + 1) : key
}

export function relativePath(cwd: string, file: string): string {
  return file.startsWith(cwd) ? file.slice(cwd.length).replace(/^[/\\]/, '') : file
}

/** 语言文件名：zh-CN → zh_CN（一语言一扁平 JSON 文件） */
export function toLocaleFileId(locale: string): string {
  return locale.trim().replace(/-/g, '_')
}

/** 工作台可选目标语言（文件名用下划线：en_US.json） */
export const TARGET_LOCALES = [
  { value: 'zh_CN', label: '简体中文 (zh_CN)' },
  { value: 'en_US', label: 'English (en_US)' },
  { value: 'en_GB', label: 'English (en_GB)' },
  { value: 'zh_TW', label: '繁體中文 (zh_TW)' },
  { value: 'zh_HK', label: '繁體中文 (zh_HK)' },
  { value: 'ja_JP', label: '日本語 (ja_JP)' },
  { value: 'ko_KR', label: '한국어 (ko_KR)' },
  { value: 'fr_FR', label: 'Français (fr_FR)' },
  { value: 'de_DE', label: 'Deutsch (de_DE)' },
  { value: 'es_ES', label: 'Español (es_ES)' },
  { value: 'pt_BR', label: 'Português (pt_BR)' },
  { value: 'ru_RU', label: 'Русский (ru_RU)' },
  { value: 'vi_VN', label: 'Tiếng Việt (vi_VN)' },
  { value: 'th_TH', label: 'ไทย (th_TH)' },
  { value: 'id_ID', label: 'Bahasa Indonesia (id_ID)' },
] as const

export const DEFAULT_TARGET_LOCALES: string[] = []

/** zh-CN → zh_CN */
export function toLocaleFileId(locale: string): string {
  return locale.trim().replace(/-/g, '_')
}

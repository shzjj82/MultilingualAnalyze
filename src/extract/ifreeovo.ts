import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MlaConfig } from '../types.js'

/**
 * 可选依赖：@ifreeovo/i18n-extract-cli
 * 同时支持 Vue2/3 与 React 的抽取+替换。无程序化 API，通过 CLI 调用。
 */
export async function runIfreeovoExtract(cwd: string, config: MlaConfig): Promise<Record<string, string>> {
  const localePath = path.resolve(cwd, config.localePath)
  fs.mkdirSync(path.dirname(localePath), { recursive: true })

  const bin = resolveIfreeovoBin(cwd)
  if (!bin) {
    throw new Error(
      '未找到 @ifreeovo/i18n-extract-cli。请执行: npm i -D @ifreeovo/i18n-extract-cli\n或改用 --engine builtin',
    )
  }

  const args = [
    '-i',
    config.input,
    '--localePath',
    localePath,
    '--skip-translate',
  ]

  // 默认输出到临时目录，避免直接覆盖用户源码；用户可在配置里改
  const outDir = path.resolve(cwd, config.workDir, 'ifreeovo-out')
  fs.mkdirSync(outDir, { recursive: true })
  args.push('-o', outDir)

  await execFile(bin, args, cwd)

  if (!fs.existsSync(localePath)) {
    return {}
  }
  return JSON.parse(fs.readFileSync(localePath, 'utf8')) as Record<string, string>
}

function resolveIfreeovoBin(cwd: string): string | null {
  const local = path.join(cwd, 'node_modules', '.bin', 'i18n-extract-cli')
  const localAlt = path.join(cwd, 'node_modules', '.bin', 'iect')
  // 包内 bin 名以实际安装为准，常见为 iect / i18n-extract
  const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const candidates = [
    local,
    localAlt,
    path.join(cwd, 'node_modules', '@ifreeovo', 'i18n-extract-cli', 'bin', 'index.js'),
    path.join(pkgRoot, 'node_modules', '.bin', 'i18n-extract-cli'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

function execFile(file: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ifreeovo 退出码 ${code}`))
    })
  })
}

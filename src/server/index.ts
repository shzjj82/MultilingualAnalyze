import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MlaConfig } from '../types.js'
import { loadCatalog, mergeCommonIntoLocale, writeCatalog } from '../extract/index.js'
import { runAiAutomate } from '../analyze/aiAutomate.js'
import { analyzeByRules } from '../analyze/rules.js'
import { listLlmProviders, resolveLlmClient } from '../llm/provider.js'
import { translateMany, listLocaleFiles, readLocaleFile } from '../translate/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export async function startServer(
  cwd: string,
  config: MlaConfig,
): Promise<{ url: string; server: http.Server }> {
  const uiDir = resolveUiDir()

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${config.port}`)
      if (url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url, cwd, config)
        return
      }
      serveStatic(res, uiDir, url.pathname)
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) })
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.listen(config.port, '127.0.0.1', () => resolve())
    server.on('error', reject)
  })

  return { url: `http://127.0.0.1:${config.port}`, server }
}

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  cwd: string,
  config: MlaConfig,
) {
  if (url.pathname === '/api/health') {
    const client = resolveLlmClient(config)
    json(res, 200, {
      ok: true,
      translateEnabled: Boolean(client),
      llm: client
        ? { provider: client.provider, model: client.model, baseUrl: client.baseUrl }
        : null,
      providers: listLlmProviders(),
    })
    return
  }

  const catalog = loadCatalog(cwd, config)
  if (!catalog) {
    json(res, 400, { error: '尚未生成 catalog，请先运行 extract' })
    return
  }

  if (url.pathname === '/api/catalog' && req.method === 'GET') {
    json(res, 200, catalog)
    return
  }

  if (url.pathname === '/api/analyze/rules' && req.method === 'GET') {
    const rules = analyzeByRules(catalog)
    const out = path.resolve(cwd, config.workDir, 'rule-analysis.json')
    fs.writeFileSync(out, JSON.stringify(rules, null, 2) + '\n', 'utf8')
    const localePath = mergeCommonIntoLocale(cwd, config, catalog, rules.commonMessages)
    json(res, 200, { ...rules, localePath })
    return
  }

  if (url.pathname === '/api/translate' && req.method === 'POST') {
    const body = await readJson<{ from?: string; to?: string | string[]; keys?: string[] }>(req)
    const targets = (Array.isArray(body.to) ? body.to : body.to ? [body.to] : [])
      .map((t) => t.trim())
      .filter(Boolean)
    if (!targets.length) {
      json(res, 400, { error: '缺少 to 语言，请至少选择一个目标语言' })
      return
    }
    const from = body.from ?? catalog.sourceLocale
    const batch = await translateMany(cwd, catalog, from, targets, config, body.keys)
    json(res, 200, batch)
    return
  }

  if (url.pathname === '/api/ai/automate' && req.method === 'POST') {
    if (!resolveLlmClient(config)) {
      json(res, 400, { error: '未配置 LLM，无法执行 AI 自动优化' })
      return
    }

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    })

    const send = (payload: unknown) => {
      res.write(`${JSON.stringify(payload)}\n`)
    }

    try {
      const result = await runAiAutomate(cwd, catalog, config, (p) => {
        send({ type: 'progress', done: p.done, total: p.total, message: p.message })
      })

      send({
        type: 'progress',
        done: result.stats.total,
        total: result.stats.total,
        message: `正在写回语言包（Common ${result.stats.commonKeyCount}）…`,
      })

      // catalog 已含 Common；一次写盘即可
      writeCatalog(cwd, config, result.catalog)
      const commonMessages = Object.fromEntries(
        Object.entries(result.catalog.messages).filter(([k]) => k.startsWith('Common.')),
      )
      mergeCommonIntoLocale(cwd, config, result.catalog, commonMessages)

      const reportPath = path.resolve(cwd, config.workDir, 'ai-automate.json')
      fs.writeFileSync(
        reportPath,
        JSON.stringify(
          { stats: result.stats, skipped: result.skipped, generatedAt: new Date().toISOString() },
          null,
          2,
        ) + '\n',
        'utf8',
      )

      send({
        type: 'done',
        catalog: loadCatalog(cwd, config) ?? result.catalog,
        stats: result.stats,
        skippedCount: result.skipped.length,
        commonKeyCount: result.stats.commonKeyCount,
        reportPath,
      })
    } catch (err) {
      send({ type: 'error', error: err instanceof Error ? err.message : String(err) })
    }
    res.end()
    return
  }

  if (url.pathname === '/api/exports' && req.method === 'GET') {
    json(res, 200, { files: listLocaleFiles(cwd, config) })
    return
  }

  if (url.pathname.startsWith('/api/download/') && req.method === 'GET') {
    const locale = decodeURIComponent(url.pathname.replace('/api/download/', ''))
    const file = readLocaleFile(cwd, config, locale)
    if (!file) {
      json(res, 404, { error: `未找到语言包: ${locale}.json` })
      return
    }
    const body = JSON.stringify(file.messages, null, 2) + '\n'
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${locale}.json"`,
    })
    res.end(body)
    return
  }

  json(res, 404, { error: 'not found' })
}

function serveStatic(res: http.ServerResponse, uiDir: string, pathname: string) {
  const safe = pathname === '/' ? '/index.html' : pathname
  const file = path.normalize(path.join(uiDir, safe))
  if (!file.startsWith(uiDir)) {
    res.writeHead(403).end('Forbidden')
    return
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const fallback = path.join(uiDir, 'index.html')
    if (fs.existsSync(fallback)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(fs.readFileSync(fallback))
      return
    }
    res.writeHead(404).end('UI not found. Ensure ui/ is published with the package.')
    return
  }
  const ext = path.extname(file).toLowerCase()
  const types: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.map': 'application/json; charset=utf-8',
  }
  res.writeHead(200, { 'Content-Type': types[ext] ?? 'application/octet-stream' })
  res.end(fs.readFileSync(file))
}

function resolveUiDir(): string {
  const candidates = [
    path.resolve(__dirname, '../ui'),
    path.resolve(__dirname, '../../ui'),
    path.resolve(process.cwd(), 'ui'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c
  }
  return candidates[0]!
}

function json(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

function readJson<T>(req: http.IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}'
        resolve(JSON.parse(raw) as T)
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

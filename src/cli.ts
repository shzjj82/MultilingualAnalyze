#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { Command } from 'commander'
import open from 'open'
import { ensureWorkDir, parseEngine, parseFramework, parseTemplateStrategy, resolveConfig } from './config.js'
import { extractCatalog, writeCatalog, loadCatalog, mergeCommonIntoLocale, clearLocaleDir } from './extract/index.js'
import { analyzeByRules } from './analyze/rules.js'
import { startServer } from './server/index.js'
import { translateCatalog, writeTranslatedLocale } from './translate/index.js'
import type { MlaConfig, RuleAnalysisResult } from './types.js'

function persistCommon(
  cwd: string,
  config: MlaConfig,
  catalog: NonNullable<ReturnType<typeof loadCatalog>>,
  rules: RuleAnalysisResult,
) {
  // Common.xxxx 合并进源语言扁平文件（如 zh_CN.json），不再单独写 common.json
  return mergeCommonIntoLocale(cwd, config, catalog, rules.commonMessages)
}

const program = new Command()

program
  .name('multilingual-analyze')
  .description('React/Vue 多语言抽取、common 分析与本地翻译工作台')
  .version('0.1.0')

program
  .command('extract')
  .description('扫描项目并生成语言包 JSON，默认启动工作台并打开浏览器')
  .option('-i, --input <dir>', '扫描目录')
  .option('-f, --framework <name>', 'react | vue | auto', 'auto')
  .option('-e, --engine <name>', 'builtin | ifreeovo', 'builtin')
  .option('--template-strategy <mode>', 'split | placeholder', 'split')
  .option('--locale-path <path>', '语言包输出路径')
  .option('-p, --port <number>', '工作台端口', '5179')
  .option('--no-open', '启动工作台但不自动打开浏览器')
  .option('--no-serve', '只抽取，不启动工作台')
  .action(async (opts) => {
    const cwd = process.cwd()
    const config = resolveConfig(cwd, {
      input: opts.input,
      framework: parseFramework(opts.framework),
      engine: parseEngine(opts.engine),
      templateStrategy: parseTemplateStrategy(opts.templateStrategy),
      localePath: opts.localePath,
      port: Number(opts.port) || 5179,
    })
    ensureWorkDir(cwd, config.workDir)
    clearLocaleDir(cwd, config)
    console.log(
      `抽取中… framework=${config.framework} engine=${config.engine} template=${config.templateStrategy} input=${config.input}`,
    )
    const catalog = await extractCatalog(cwd, config)
    const { localePath, catalogPath } = writeCatalog(cwd, config, catalog)
    console.log(`完成：${catalog.entries.length} 条文案`)
    console.log(`语言包: ${localePath}`)
    console.log(`明细:   ${catalogPath}`)

    const rules = analyzeByRules(catalog)
    const rulesPath = path.resolve(cwd, config.workDir, 'rule-analysis.json')
    fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2) + '\n', 'utf8')
    const mergedLocalePath = persistCommon(cwd, config, catalog, rules)
    console.log(
      `Common 提炼：${rules.stats.commonKeyCount} 条 → Common.xxxx 已并入 ${mergedLocalePath}`,
    )
    console.log(`明细: ${rulesPath}`)

    if (opts.serve === false) return

    const { url } = await startServer(cwd, config)
    console.log(`工作台已启动: ${url}`)
    if (opts.open !== false) await open(url)
  })

program
  .command('analyze')
  .description('规则检索提炼 Common.xxxx 并写入源语言包')
  .action(async () => {
    const cwd = process.cwd()
    const config = resolveConfig(cwd)
    ensureWorkDir(cwd, config.workDir)
    const catalog = loadCatalog(cwd, config)
    if (!catalog) {
      console.error('未找到 catalog，请先运行: mla extract')
      process.exit(1)
    }
    const rules = analyzeByRules(catalog)
    const rulesPath = path.resolve(cwd, config.workDir, 'rule-analysis.json')
    fs.writeFileSync(rulesPath, JSON.stringify(rules, null, 2) + '\n', 'utf8')
    const localePath = persistCommon(cwd, config, catalog, rules)
    console.log(
      `完成：common=${rules.stats.commonKeyCount} duplicates=${rules.stats.duplicateValueCount}`,
    )
    console.log(`语言包: ${localePath}`)
    console.log(`明细:   ${rulesPath}`)
  })

program
  .command('serve')
  .description('启动本地页面查看 JSON / 分析结果 / 翻译')
  .option('-p, --port <number>', '端口', '5179')
  .option('--no-open', '不自动打开浏览器')
  .action(async (opts) => {
    const cwd = process.cwd()
    const config = resolveConfig(cwd, { port: Number(opts.port) || 5179 })
    ensureWorkDir(cwd, config.workDir)
    if (!loadCatalog(cwd, config)) {
      console.warn('提示：尚未 extract，页面可打开但 catalog 为空。可先运行 mla extract')
    }
    const { url } = await startServer(cwd, config)
    console.log(`工作台已启动: ${url}`)
    if (opts.open !== false) await open(url)
  })

program
  .command('translate')
  .description('将源语言包翻译到目标语言')
  .requiredOption('--to <locale>', '目标语言，如 en-US')
  .option('--from <locale>', '源语言')
  .action(async (opts) => {
    const cwd = process.cwd()
    const config = resolveConfig(cwd)
    const catalog = loadCatalog(cwd, config)
    if (!catalog) {
      console.error('未找到 catalog，请先运行: mla extract')
      process.exit(1)
    }
    const result = await translateCatalog(
      catalog,
      { from: opts.from ?? catalog.sourceLocale, to: opts.to },
      config,
    )
    const out = writeTranslatedLocale(cwd, opts.to, result.messages, config)
    console.log(`翻译完成: ${Object.keys(result.messages).length} 条 → ${out}`)
    if (result.failed.length) {
      console.warn(`失败 ${result.failed.length} 条，详见控制台`)
      for (const f of result.failed.slice(0, 10)) console.warn(`  ${f.key}: ${f.error}`)
    }
  })

program
  .command('init')
  .description('生成 mla.config.json 示例')
  .action(() => {
    const cwd = process.cwd()
    const target = path.join(cwd, 'mla.config.json')
    if (fs.existsSync(target)) {
      console.error('mla.config.json 已存在')
      process.exit(1)
    }
    const sample = {
      input: 'src',
      localePath: './locales/zh_CN.json',
      workDir: '.mla',
      framework: 'auto',
      engine: 'builtin',
      templateStrategy: 'split',
      sourceLocale: 'zh_CN',
      port: 5179,
      llm: {
        provider: 'openai',
        providers: {
          openai: {
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
          },
          deepseek: {
            baseUrl: 'https://api.deepseek.com/v1',
            model: 'deepseek-chat',
          },
        },
      },
    }
    fs.writeFileSync(target, JSON.stringify(sample, null, 2) + '\n', 'utf8')
    console.log(`已生成 ${target}`)
  })

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

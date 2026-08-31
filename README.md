# multilingual-analyze

面向 **React / Vue** 的多语言分析工作台（CLI：`mla`）。

用 AST 抽取硬编码文案 → 规则提炼 `Common.xxxx` →（可选）多厂商 LLM 自动优化 / 翻译 → 本地工作台确认并导出语言包。

```bash
npx mla extract -i src
```

## 功能概览

| 能力 | 说明 |
|------|------|
| AST 抽取 | 内置支持 `.vue` / `.js` / `.ts` / `.jsx` / `.tsx` |
| Common 提炼 | 跨模块/跨文件复用文案 → `Common.xxxx`，与模块 key 并存 |
| AI 自动优化 | 结合源码上下文过滤误抽，并生成英文 leaf；**排除 Common**，结束后自动再提炼 Common |
| 多语言导出 | 工作台勾选目标语言，LLM 翻译后下载扁平 JSON |
| 多 LLM Provider | OpenAI Compatible：DeepSeek / 通义 / Moonshot / 智谱 / Ollama 等 |

## 要求

- Node.js **≥ 18**
- （可选）LLM API Key，用于 AI 自动优化与翻译

## 安装

### 作为项目依赖（推荐）

```bash
# npm
npm i -D multilingual-analyze

# pnpm
pnpm add -D multilingual-analyze

# yarn
yarn add -D multilingual-analyze
```

### 全局安装

```bash
npm i -g multilingual-analyze
# 或
pnpm add -g multilingual-analyze
```

安装后可用命令：`mla` 或 `multilingual-analyze`。

### 不安装，直接试用

```bash
npx multilingual-analyze init
npx mla extract -i src

# pnpm
pnpm dlx multilingual-analyze init
pnpm dlx mla extract -i src
```

### 可选：ifreeovo 抽取引擎

若希望使用 `@ifreeovo/i18n-extract-cli` 自动替换源码中的 i18n 调用（`engine: ifreeovo`），需额外安装：

```bash
npm i -D @ifreeovo/i18n-extract-cli
# 或 pnpm / yarn 等价命令
```

该包为 `optionalDependencies`，仅在使用 `ifreeovo` 引擎时需要。

## 上手操作

从零到导出多语言包的完整流程如下。

### 整体流程（示意）

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ 安装 mla    │────▶│ mla init + 配置   │────▶│ mla extract     │
└─────────────┘     │ mla.config.json  │     │ (AST + Common)  │
                    └──────────────────┘     └────────┬────────┘
                                                        │
                    ┌──────────────────┐                ▼
                    │ 接入 vue-i18n /   │     ┌─────────────────┐
                    │ react-i18next    │◀────│ 工作台：优化、   │
                    └──────────────────┘     │ 翻译、导出 JSON │
                                             └────────┬────────┘
                                                      │
                                             ┌────────▼────────┐
                                             │ mla translate   │
                                             │ (可选 CLI 翻译)  │
                                             └─────────────────┘
```

---

### 步骤 1：安装并初始化

1. 在业务项目根目录安装 `multilingual-analyze`（见上文 **安装**）。
2. 生成配置文件：

```bash
npx mla init
```

等价于复制仓库内的 `mla.config.example.json` 为 `mla.config.json`（若已存在则不会覆盖）。

**初始化后建议的目录结构：**

```
your-app/
├── src/                    # 待扫描源码（可在配置中改 input）
├── mla.config.json         # 本地配置（含 Key 时不要提交）
├── mla.config.example.json # 可选：团队共享的无密钥模板
├── locales/                # 源语言包（extract 后生成，如 zh_CN.json）
│   └── zh_CN.json
└── .mla/                   # 工作台缓存与明细（建议 gitignore）
    ├── catalog.json
    ├── rule-analysis.json
    └── ai-automate.json
```

**`.gitignore` 建议（与官方模板一致）：**

```gitignore
.mla/
locales/
mla.config.json
.env
.env.*
```

若需提交**无密钥**的配置模板，可保留 `mla.config.example.json` 并只把真实 Key 写在本地 `mla.config.json`。

---

### 步骤 2：编辑 `mla.config.json`

| 字段 | 类型 | 说明 |
|------|------|------|
| `input` | string | 扫描根目录，相对项目根，默认 `src` |
| `localePath` | string | 源语言扁平 JSON 路径，默认 `./locales/zh_CN.json` |
| `workDir` | string | 明细与缓存目录，默认 `.mla` |
| `framework` | string | `auto` \| `react` \| `vue` |
| `engine` | string | `builtin`（默认不改源码）\| `ifreeovo` |
| `templateStrategy` | string | `split` \| `placeholder`，影响模板字符串 key 策略 |
| `sourceLocale` | string | 源 locale 标识，如 `zh_CN` |
| `port` | number | 工作台端口，默认 `5179` |
| `llm.provider` | string | 当前使用的厂商预设名 |
| `llm.providers` | object | 各厂商 `apiKey` / `baseUrl` / `model` |

**最小可用配置（仅规则抽取 + 工作台，不用 LLM）：**

```json
{
  "input": "src",
  "localePath": "./locales/zh_CN.json",
  "workDir": ".mla",
  "framework": "auto",
  "engine": "builtin",
  "templateStrategy": "split",
  "sourceLocale": "zh_CN",
  "port": 5179
}
```

需要 **AI 自动优化** 或 **翻译** 时，再补充 `llm` 块（详见下文 [配置](#配置)）。

也可通过环境变量覆盖 Key：`MLA_LLM_API_KEY`、`MLA_LLM_PROVIDER`、`DEEPSEEK_API_KEY` 等。

---

### 步骤 3：抽取文案（`mla extract`）

**完整流程（抽取 + 启动工作台 + 打开浏览器）：**

```bash
npx mla extract -i src --framework auto
```

**仅抽取、不启动 UI（适合 CI 或先检查 JSON）：**

```bash
npx mla extract -i src --no-serve
```

**抽取后单独启动工作台（不自动打开浏览器）：**

```bash
npx mla serve -p 5179
# 或 extract 时加 --no-open
npx mla extract -i src --no-open
```

`extract` 会依次：扫描 AST → 写入 `locales/` 与 `.mla/catalog.json` → 规则提炼 `Common.*` 并合并进源语言包 →（未加 `--no-serve` 时）启动本地 API 并托管工作台静态页。

---

### 步骤 4：在工作台中操作

浏览器打开工作台（默认 `http://localhost:5179`）后，典型操作：

1. **文案目录（Catalog）** — 查看每条 key、原文、出现文件与次数，确认抽取是否合理。
2. **目标语言** — 勾选需要导出的 locale（如 `en_US`、`ja_JP`）。
3. **AI 自动优化** — 需配置 LLM：过滤误抽的技术字符串、优化英文 leaf key、完成后再次提炼 Common（Common 条目在优化阶段会被排除，避免误改）。
4. **导出** — 导出文案清单或下载全部已翻译语言的扁平 JSON，放入项目的 `locales/` 或 i18n 加载路径。

中间产物说明见 [产出物](#产出物)。

---

### 步骤 5：接入框架与 CLI 翻译

**Vue（vue-i18n）示例思路：**

- 将导出的扁平 JSON 按 locale 放入 `locales/en_US.json` 等。
- 在 `createI18n` 中 `messages` 加载对应文件；业务中使用 `$t('Module.key')` / `t('Common.xxxx')`。
- 后续迭代：改源码硬编码 → 再跑 `mla extract`，合并 diff 到语言包。

**React（react-i18next）示例思路：**

- 使用 `i18next` + `initReactI18next`，通过 `resources` 或动态 `import()` 加载 JSON。
- key 与 Vue 相同，保持模块前缀 + `Common.*` 命名。

**命令行批量翻译（不打开 UI）：**

```bash
export MLA_LLM_API_KEY=sk-...
# 或
export MLA_LLM_PROVIDER=deepseek && export DEEPSEEK_API_KEY=sk-...

npx mla translate --to en_US
npx mla translate --to ja_JP
```

需已有 `.mla/catalog.json` 与源语言包；翻译结果写入 `locales/` 下对应文件（路径由配置决定）。

---

### 推荐的 `package.json` scripts

```json
{
  "scripts": {
    "i18n:init": "mla init",
    "i18n:extract": "mla extract -i src --framework auto",
    "i18n:extract:ci": "mla extract -i src --no-serve --no-open",
    "i18n:serve": "mla serve",
    "i18n:analyze": "mla analyze",
    "i18n:translate:en": "mla translate --to en_US"
  }
}
```

---

### pnpm Monorepo 用法

在 monorepo 中可以在 **子包目录** 或 **仓库根目录** 使用 mla，取决于源码与配置所在位置。

**方式 A：在子包内安装与执行（常见）**

```bash
cd packages/web-app
pnpm add -D multilingual-analyze
pnpm exec mla init
pnpm exec mla extract -i src
```

`mla.config.json` 放在该子包根目录；`input`、`localePath` 均相对该目录。

**方式 B：在 monorepo 根目录统一安装**

```bash
# 根 package.json
pnpm add -Dw multilingual-analyze
```

在根目录放置 `mla.config.json`，将 `input` 指向子包源码，例如：

```json
{
  "input": "packages/web-app/src",
  "localePath": "./packages/web-app/locales/zh_CN.json"
}
```

在根目录执行 `pnpm exec mla extract`。注意 `.mla/` 与 `locales/` 默认相对 cwd，建议与各子包的 gitignore 策略一致。

**方式 C：不安装，根目录试用**

```bash
pnpm dlx multilingual-analyze extract -i packages/web-app/src
```

---

### 常见问题

| 现象 | 可能原因 | 处理建议 |
|------|----------|----------|
| `mla: command not found` | 未安装或未通过 npx/pnpm exec 调用 | 使用 `npx mla` 或 `pnpm exec mla`；全局安装后确认 PATH |
| 端口被占用 | 5179 已有进程 | `mla serve -p 5180` 或在配置中改 `port` |
| AI 优化/翻译失败 | 未配置 Key 或 provider 错误 | 检查 `mla.config.json` 的 `llm` 或环境变量 |
| `engine: ifreeovo` 报错 | 未安装 optional 包 | `npm i -D @ifreeovo/i18n-extract-cli` |
| 语言包为空或很少 | `framework` / `input` 不匹配 | 确认 Vue 用 `.vue`、React 用 jsx/tsx；`-f auto` 或显式指定 |
| 提交了 API Key | `mla.config.json` 未 ignore | 加入 `.gitignore`，轮换 Key；用 example 模板进库 |
| monorepo 路径不对 | cwd 与 config 不一致 | 在含 `mla.config.json` 的目录执行，或修正 `input` / `localePath` |
| 重复跑 extract 覆盖 | 每次 extract 会清理 locale 目录策略 | 先备份已翻译 JSON；用版本管理合并语言包 |

## CLI 命令

| 命令 | 说明 |
|------|------|
| `mla init` | 生成 `mla.config.json` |
| `mla extract` | 扫描并生成语言包；默认规则提炼 Common 并启动工作台 |
| `mla analyze` | 仅规则提炼 `Common.xxxx` 并写入源语言包 |
| `mla serve` | 启动本地工作台 |
| `mla translate --to <locale>` | CLI 翻译到目标语言 |

### extract 常用参数

```bash
npx mla extract \
  -i src \
  -f auto \              # react | vue | auto
  -e builtin \           # builtin | ifreeovo
  --template-strategy split \  # split | placeholder
  --locale-path ./locales/zh_CN.json \
  -p 5179 \
  --no-open \            # 启动工作台但不打开浏览器
  --no-serve             # 只抽取
```

## 配置

复制示例并改名：

```bash
cp mla.config.example.json mla.config.json
```

> `mla.config.json` 可能含 API Key，已默认 gitignore，请勿提交。

### 基础字段

```json
{
  "input": "src",
  "localePath": "./locales/zh_CN.json",
  "workDir": ".mla",
  "framework": "auto",
  "engine": "builtin",
  "templateStrategy": "split",
  "sourceLocale": "zh_CN",
  "port": 5179
}
```

### 多 LLM Provider（推荐）

```json
{
  "llm": {
    "provider": "deepseek",
    "providers": {
      "openai": {
        "apiKey": "sk-xxx",
        "baseUrl": "https://api.openai.com/v1",
        "model": "gpt-4o-mini"
      },
      "deepseek": {
        "apiKey": "sk-xxx",
        "baseUrl": "https://api.deepseek.com/v1",
        "model": "deepseek-chat"
      },
      "qwen": {
        "apiKey": "sk-xxx",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "model": "qwen-plus"
      }
    }
  }
}
```

切换厂商只需改 `provider`。内置预设：

`openai` · `deepseek` · `qwen` · `moonshot` · `zhipu` · `siliconflow` · `ollama` · `openrouter` · `custom`

### 环境变量

| 变量 | 说明 |
|------|------|
| `MLA_LLM_PROVIDER` | 当前 provider |
| `MLA_LLM_API_KEY` | 通用 API Key |
| `OPENAI_API_KEY` / `DEEPSEEK_API_KEY` / `DASHSCOPE_API_KEY` / … | 各厂商专用 Key |

旧版扁平配置（`llm.apiKey` + `baseUrl` + `model`）仍然兼容。

## 框架与抽取引擎

| 配置 | 行为 |
|------|------|
| `framework: auto` | `.vue` → Vue；其余按扩展名标注 `js` / `ts` / `jsx` / `tsx` |
| `framework: react` | 只扫 JS/TS/JSX/TSX |
| `framework: vue` | 只扫 `.vue` |
| `engine: builtin` | 内置 AST，**默认不改源码** |
| `engine: ifreeovo` | 调用 `@ifreeovo/i18n-extract-cli`，适合自动替换 i18n 调用 |

## 产出物

| 路径 | 内容 |
|------|------|
| `locales/zh_CN.json` | 源语言扁平包（含模块 key + `Common.*`） |
| `.mla/catalog.json` | 抽取明细（key / 文案 / 文件 / 次数） |
| `.mla/rule-analysis.json` | Common 规则分析结果 |
| `.mla/ai-automate.json` | AI 自动优化报告（skip 列表等） |

## 链接

- GitHub：https://github.com/shzjj82/MultilingualAnalyze
- npm：https://www.npmjs.com/package/multilingual-analyze
- 参与开发：[CONTRIBUTING.md](./CONTRIBUTING.md)

## License

MIT

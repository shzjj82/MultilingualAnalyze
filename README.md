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

```bash
# 项目内使用
npm i -D multilingual-analyze

# 或全局
npm i -g multilingual-analyze
```

安装后可用命令：`mla` 或 `multilingual-analyze`。

可选抽取引擎（自动替换 `$t` / `t()` 时）：

```bash
npm i -D @ifreeovo/i18n-extract-cli
```

## 快速开始

```bash
# 1. 生成配置（可选，也可手动复制 mla.config.example.json）
npx mla init

# 2. 编辑 mla.config.json：填写 input、llm.provider / apiKey 等

# 3. 抽取文案并打开工作台（默认端口 5179）
npx mla extract -i src --framework auto

# 只要抽取、不启动页面
npx mla extract -i src --no-serve

# 4. 之后单独打开工作台
npx mla serve

# 5. CLI 翻译（需配置 LLM）
export MLA_LLM_API_KEY=sk-...
# 或 export MLA_LLM_PROVIDER=deepseek && export DEEPSEEK_API_KEY=sk-...
npx mla translate --to en_US
```

工作台中可：

1. 勾选**目标语言**
2. 运行 **AI 自动优化**（过滤技术字符串、英文化键名、再提炼 Common）
3. **导出文案清单** / **导出全部语言**

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

## 本地开发本仓库

```bash
git clone <repo>
cd multilingual-analyze
npm install              # 自动执行 husky prepare，启用 pre-commit 检测
npm run build          # CLI (pkgroll) + UI (Vite)
npm run typecheck

# 提交前会自动跑 typecheck（husky + lint-staged）；全量校验可用：
npm run validate

# 开发
npm run dev            # 监听 CLI
npm run dev:ui         # 前端，/api 代理到 5179
npx mla serve -p 5179  # 起本地 API + 托管 ui/
```

## 发布到 npm

包发布内容：`dist/`（CLI + 库）与 `ui/`（工作台静态资源）。

### 手动发布

```bash
npm run build
npm publish --access public
```

### GitHub Actions 自动发布

本仓库已配置：

| Workflow | 触发 | 作用 |
|----------|------|------|
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | `push` / `pull_request` → `main` | install → typecheck → build |
| [`.github/workflows/publish.yml`](.github/workflows/publish.yml) | 发布 GitHub Release，或推送 `v*` tag | build → `npm publish` |

**一次性配置：**

1. 将本仓库推送到 GitHub，并在 `package.json` 中按需补全 `repository` / `homepage` 字段  
2. 在 [npmjs.com](https://www.npmjs.com/) 创建 **Automation** 类型 Access Token  
3. 仓库 Settings → Secrets and variables → Actions → 新建  
   - Name: `NPM_TOKEN`  
   - Value: 上一步的 token  
4. 发版任选其一：

```bash
# 方式 A：打 tag（推荐与 package.json version 一致）
npm version patch   # 或 minor / major
git push && git push --tags

# 方式 B：在 GitHub 创建 Release（tag 如 v0.1.1）
```

> 发布前请确认 `package.json` 的 `version` 已递增，且未被 npm 占用。

## 目录结构

```
src/                 # Node CLI / API / 抽取 / 分析 / 翻译
web/                 # Vite + React + Tailwind 工作台源码
ui/                  # 前端构建产物（随 npm 包发布）
dist/                # CLI / 库构建产物
mla.config.example.json
.github/workflows/   # CI + npm publish
```

## License

MIT

# 参与开发

面向 **multilingual-analyze 仓库维护者**。使用 CLI 的说明见 [README.md](./README.md)。

## 本地开发

```bash
git clone https://github.com/shzjj82/MultilingualAnalyze.git
cd multilingual-analyze
npm install              # 自动执行 husky prepare，启用 pre-commit 检测
npm run build            # CLI (pkgroll) + UI (Vite)
npm run typecheck

# 提交前会自动跑 typecheck（husky + lint-staged）；全量校验可用：
npm run validate

# 开发
npm run dev              # 监听 CLI
npm run dev:ui           # 前端，/api 代理到 5179
npx mla serve -p 5179    # 起本地 API + 托管 ui/
```

## Git 提交规范

采用 [Conventional Commits](https://www.conventionalcommits.org/)，由 **Husky + commitlint** 在 `commit-msg` 阶段校验。

```
<type>(<scope>): <subject>
```

| type | 说明 |
|------|------|
| `feat` | 新功能 |
| `fix` | 修复 bug |
| `docs` | 文档 |
| `style` | 代码格式（不影响逻辑） |
| `refactor` | 重构 |
| `perf` | 性能优化 |
| `test` | 测试 |
| `build` | 构建 / 依赖 |
| `ci` | CI 配置 |
| `chore` | 杂项维护 |
| `revert` | 回滚 |

示例：

```bash
git commit -m "feat(ui): 增加 AI 自动优化进度条"
git commit -m "fix(extract): 修正 js 文件 SourceKind 标注"
git commit -m "docs: 补充多 LLM provider 配置说明"
```

- `scope` 可选，建议：`cli` / `extract` / `ui` / `server` / `llm` / `ci`
- `subject` 使用中文或英文均可，结尾不加句号，总长 ≤ 100 字符

## 发布到 npm

包发布内容：`dist/`（CLI + 库）与 `ui/`（工作台静态资源）。

### 手动发布

```bash
npm run build
npm publish --access public
```

发布账号若启用了 **npm 双因素认证（2FA）**，本地 `npm publish` 时需按提示完成 OTP，或使用：

```bash
npm publish --access public --otp=123456
```

### GitHub Actions 自动发布

| Workflow | 触发 | 作用 |
|----------|------|------|
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | `push` / `pull_request` → `main` | install → typecheck → build |
| [`.github/workflows/publish.yml`](.github/workflows/publish.yml) | 发布 GitHub Release，或推送 `v*` tag | build → `npm publish` |

**一次性配置：**

1. 在 [npmjs.com](https://www.npmjs.com/) 创建 **Automation** 类型 Access Token  
2. 仓库 Settings → Secrets and variables → Actions → 新建 `NPM_TOKEN`  
3. 发版任选其一：

```bash
# 方式 A：打 tag（推荐与 package.json version 一致）
npm version patch   # 或 minor / major
git push && git push --tags

# 方式 B：在 GitHub 创建 Release（tag 如 v0.1.2）
```

> 发布前请确认 `package.json` 的 **version 已递增**，且该版本号未被 npm 占用。

## 仓库目录结构

```
src/                 # Node CLI / API / 抽取 / 分析 / 翻译
web/                 # Vite + React + Tailwind 工作台源码
ui/                  # 前端构建产物（随 npm 包发布）
dist/                # CLI / 库构建产物
mla.config.example.json
.github/workflows/   # CI + npm publish
```

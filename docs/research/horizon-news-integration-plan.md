# Horizon 最新上游替换 X News Toolbox 雷达：轮子核验与集成方案

> 调研日期：2026-08-10（Asia/Shanghai）
> 范围：只调研与定方案，不修改产品代码。
> 一手资料：GitHub 仓库、源码、许可证与项目官方文档。

## 1. 先说结论

可以用 Horizon，但不应把 Horizon 整个产品或它的静态页面塞进 X News Toolbox。最省代码、兼容性也最好的做法是：

- **继续让现有 Next.js 16 工作台负责 UI、任务状态、`node:sqlite`、Minds 和 X 官方 API。**
- **把最新上游 [Thysrael/Horizon](https://github.com/Thysrael/Horizon) 当作 Python 雷达 worker**，通过它已有的 MCP 结构化工具完成抓取、去重、AI 评分、筛选、补充背景和摘要。
- **首个受控版本固定到提交 [`80bde6db03008678111fb627b471792c7ac05a94`](https://github.com/Thysrael/Horizon/commit/80bde6db03008678111fb627b471792c7ac05a94)**（2026-08-10 审计时的 `main` HEAD），不要在生产启动时自动拉取浮动 `main`。
- **Horizon 的 Twitter/Apify 来源默认关闭**。现有项目已经使用 Apache-2.0 的 `twitter-api-v2` 和 X 官方 API，继续复用更稳定，也避免同一个账号来源被两条链路重复抓取。
- **雷达结果仍写入现有 `RadarSignal` / `RadarRun` 与 SQLite**。Horizon 的 Markdown 仅作为可选导出，不作为程序之间的主数据协议。

这能直接复用 Horizon 最值钱的部分，同时避免重做现有的专业化 Web 工作台。

## 2. 用户指定仓库与最新上游的关系

### 2.1 用户给出的仓库

用户指定的 [loulianzhang/horizon-news](https://github.com/loulianzhang/horizon-news) 页面显示：151 次提交、5 stars、2 forks、MIT、无 release，主语言为 Python。其 README 中的安装命令却仍然克隆 `Thysrael/Horizon.git`，演示站和配置文档也都指向 `thysrael.github.io`。该仓库截至 `main` 提交 `1f0a1141cca3ff858da253753289583bf5b628c8`（2026-06-02），可视为一个较旧副本，而不是最新实现基准。

### 2.2 采用的最新上游

[Thysrael/Horizon](https://github.com/Thysrael/Horizon) 是 README、演示站和官方配置文档共同指向的上游。审计时仓库有 254 次提交、约 8.7k stars、约 1.3k forks；[提交历史](https://github.com/Thysrael/Horizon/commits/main/)显示 2026-08-10 仍在更新。上游比 6 月旧副本增加或完善了 processing profiles、OpenBB、OSS Insight、GDELT、Google News、Ollama、MCP run 状态与 CLI 参数等能力。

上游 README 仍把“发布 GitHub Releases”和“发布到 PyPI”列为计划项，[`pyproject.toml`](https://github.com/Thysrael/Horizon/blob/main/pyproject.toml)版本仍为 `0.1.0`。因此“用最新版本”应该解释为“选定并锁住已审计的最新提交”，而不是每次启动跟随 `main`。

### 2.3 固定与升级策略

1. 在集成清单中记录仓库 URL、完整 commit SHA、MIT 许可证副本和 `uv.lock` 校验值。
2. 便携包构建时从固定 SHA 构建 wheel/虚拟环境；运行时禁止 `git pull`。
3. 每 4–8 周或出现关键修复时人工发起升级候选：对比 `pyproject.toml`、`data/config.example.json`、MCP 工具输入/输出和 source model。
4. 对候选 SHA 跑配置校验、契约测试、无密钥真实源 smoke test、一个真实 AI provider 的付费 smoke test、Windows 便携启动测试。
5. 测试通过后只更新一个受控版本清单；失败就保留旧 SHA。这样升级可回滚，也不会因上游当天改字段让工作台突然失效。

## 3. Horizon 本体核验

### 3.1 功能与流水线

[上游 README](https://github.com/Thysrael/Horizon)定义的主流程是：配置来源 → 并发抓取 → URL/主题去重 → AI 分析与阈值过滤 → Web 背景和社区评论补充 → 中英文结构化摘要 → 本地文件、Pages、邮件、Webhook 或 MCP 输出。它是“新闻筛选流水线”，不是实时浏览器，也不是一个带动态后台的完整 Web 产品。

### 3.2 架构与技术栈

| 项目 | 核验结果 |
|---|---|
| 语言/运行时 | Python `>=3.11`，Hatchling 构建；MIT。见 [`pyproject.toml`](https://github.com/Thysrael/Horizon/blob/main/pyproject.toml)。 |
| 核心依赖 | `httpx`、`feedparser`、Anthropic/OpenAI/Google SDK、Pydantic、Tenacity、`ddgs`、BeautifulSoup、MCP、OpenCC、Trafilatura 等。 |
| 可选依赖 | `dev`（pytest）、`openbb`（OpenBB + Benzinga）、`twitter`（Playwright/stealth）。实际官方 Twitter 配置当前要求 Apify token，不能仅凭可选依赖推断正式抓取链路。 |
| 代码分层 | `scrapers/` 来源抓取、`extractors/` 正文提取、`ai/` 模型与评分、`processing/` 去重/过滤、`services/` 投递、`storage/` 文件状态、`mcp/` 结构化工具、`orchestrator.py` 编排。见 [`src/`](https://github.com/Thysrael/Horizon/tree/main/src)。 |
| CLI 入口 | `horizon`、`horizon-mcp`、`horizon-wizard`、`horizon-webhook`，均在 [`pyproject.toml`](https://github.com/Thysrael/Horizon/blob/main/pyproject.toml)声明。 |
| Web 入口 | 没有第一方动态 Web API 或运营后台；`docs/` 是生成日报的静态 GitHub Pages/Jekyll 内容。 |
| 容器 | [`docker-compose.yml`](https://github.com/Thysrael/Horizon/blob/main/docker-compose.yml)是一次性 worker，挂载 `./data` 和只读 `.env`；Compose 自身不是调度器。 |

### 3.3 真实信息源

以[官方配置指南](https://thysrael.github.io/Horizon/configuration)和[`data/config.example.json`](https://github.com/Thysrael/Horizon/blob/main/data/config.example.json)为准：

| 来源 | 获取内容 | 密钥 | 集成判断 |
|---|---|---|---|
| Hacker News | Top stories 与可选评论 | 无 | 首批真实数据验收源，稳定且无成本。 |
| RSS / Atom | 任意 Feed；可用 Trafilatura 提正文 | 通常无；私有 Feed 可通过 `${VAR}` 放 token | 与现有 RSS 能力重叠，首版可让 Horizon负责深度抓取/处理，Node 保留来源配置与安全入口。 |
| Reddit | subreddit、用户帖子、评论；`old.reddit.com` 优先并以 JSON/RSS 回退 | 无 | 属公开页面抓取，可能受站点策略/限流变化影响。 |
| Telegram | `t.me/s/<channel>` 公共预览 | 无 | 仅公共频道；依赖页面结构。 |
| GitHub | 用户事件、仓库 releases | `GITHUB_TOKEN` 可选但推荐 | 无 token 速率低；token 只给最小只读权限。 |
| Twitter / X | 指定用户帖子与可选回复 | `APIFY_TOKEN` 条件必需 | Horizon 当前使用 Apify actor。与现有 X 官方 API 重叠，推荐禁用。 |
| OpenBB | 股票/宏观新闻 watchlist，provider 可选 | 取决于 OpenBB provider | 需要安装 `openbb` extra，Windows 便携包明显变大；首版关闭。 |
| OSS Insight | GitHub star 增长榜 | 无 | 公共 API，适合补开源趋势；官方文档注明 `past_7_days` 上游当前有问题。 |
| GDELT | 关键词、国家、语言等新闻查询 | 无 | 适合宽泛新闻召回；需要用来源质量与时间窗口控制噪声。 |
| Google News | query + locale 的新闻结果 | 无 | Feed 型聚合结果；须保留原始文章链接和来源名。 |

### 3.4 AI provider

[官方配置指南的 provider 表](https://thysrael.github.io/Horizon/configuration#ai-providers)覆盖：Anthropic、OpenAI、Azure OpenAI、Gemini、MiniMax、阿里云 DashScope、Doubao、DeepSeek、Ollama，以及通过 `base_url` 接入 OpenAI-compatible / 代理端点。Ollama 默认本机 `http://localhost:11434/v1`，可做到不使用云 API key，但模型质量、下载体积和本机资源由用户自行承担。

常用 AI 配置字段为：`provider`、`model`、`api_key_env`、可选 `base_url`、Azure 的 `azure_endpoint_env` / `api_version`、`temperature`、`max_tokens`、`throttle_sec`、`analysis_concurrency`、`enrichment_concurrency`。处理逻辑还支持 `profiles_dir`、默认 profile、每 profile 阈值与 topic dedup。

### 3.5 存储、输出与入口

- [`src/storage/manager.py`](https://github.com/Thysrael/Horizon/blob/main/src/storage/manager.py)使用文件而非数据库：活动配置为 `<data-dir>/config.json`，摘要为 `<data-dir>/summaries/`，订阅者为 `<data-dir>/subscribers.json`。
- 生成的 Markdown 可复制到 `docs/` 供 GitHub Pages 发布；邮件使用 SMTP/可选 IMAP；Webhook 支持通用模板和多种聊天平台。
- [`src/mcp/server.py`](https://github.com/Thysrael/Horizon/blob/main/src/mcp/server.py)提供 `hz_validate_config`、fetch、score、filter、enrich、summary、`hz_run_pipeline` 和 run 状态类工具；`hz_run_pipeline`明确执行 `fetch -> score -> filter -> enrich -> summarize` 并返回结构化字典。
- [`src/main.py`](https://github.com/Thysrael/Horizon/blob/main/src/main.py)的批处理 CLI 接受时间窗、data dir、config 和 log level。它没有 HTTP/Web UI。

因此，集成时优先消费 MCP 的结构化数据；解析 Markdown 只适合导出，不适合作为稳定 API。

### 3.6 定时任务

Horizon 程序本身没有常驻 scheduler。README 提供 [GitHub Actions 日报工作流](https://github.com/Thysrael/Horizon/blob/main/.github/workflows/daily-summary.yml)，也可由 cron、Windows Task Scheduler 或外层服务触发。对 X News Toolbox，应该继续使用现有 `DailyFollowUpJob`/调度状态，让 Next 工作台成为“何时运行、是否成功”的唯一事实来源，Horizon 只执行一次任务。

## 4. 环境变量与 API key 全表

### 4.1 上游固定示例变量

来自[最新 `.env.example`](https://github.com/Thysrael/Horizon/blob/main/.env.example)：

| 变量 | 何时必需 | UI/API 分类 |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI provider=Anthropic | 条件必填，秘密 |
| `OPENAI_API_KEY` | provider=OpenAI 或对应兼容端点时选用 | 条件必填，秘密 |
| `AZURE_OPENAI_API_KEY` | provider=Azure | 条件必填，秘密 |
| `AZURE_OPENAI_ENDPOINT` | provider=Azure | 条件必填，非秘密但不公开回显全文更稳妥 |
| `GOOGLE_API_KEY` | provider=Gemini | 条件必填，秘密 |
| `MINIMAX_API_KEY` | provider=MiniMax | 条件必填，秘密 |
| `DASHSCOPE_API_KEY` | provider=Aliyun | 条件必填，秘密 |
| `DOUBAO_API_KEY` | provider=Doubao | 条件必填，秘密 |
| `DEEPSEEK_API_KEY` | provider=DeepSeek | 条件必填，秘密 |
| `GITHUB_TOKEN` | GitHub 来源启用时推荐 | 可选，秘密；不启用 GitHub 时隐藏 |
| `APIFY_TOKEN` | Horizon Twitter 来源启用 | 条件必填，秘密；推荐整项禁用 |
| `HORIZON_WEBHOOK_URL` | Horizon 自己投递 Webhook | 条件必填，秘密；若由 Next 投递则不需要 |

### 4.2 官方实现还识别的变量/变量类别

| 变量或规则 | 用途 |
|---|---|
| `HORIZON_OLLAMA_BASE_URL`、`OLLAMA_BASE_URL`、`OLLAMA_HOST` | Ollama 非默认地址，三者为识别的兼容配置。 |
| `EMAIL_PASSWORD` | 邮件启用时默认的 SMTP/IMAP 密码变量；也可由 `email.password_env`改成其他名字。 |
| `HORIZON_WEBHOOK_TOKEN` | 官方文档动态 Authorization header 示例；不是强制固定名称。 |
| `HORIZON_PATH` | MCP 无法自动找到 Horizon 工作目录时的可选覆盖；便携包应由启动器固定，不开放给普通用户。见 [`horizon_adapter.py`](https://github.com/Thysrael/Horizon/blob/main/src/mcp/horizon_adapter.py)。 |
| `HORIZON_MCP_SECRETS_PATH` | MCP 可选 secrets JSON 路径；便携集成优先直接给子进程注入最小环境，不让浏览器提交任意路径。 |
| `HORIZON_API_URL`、`HORIZON_OFFLINE` | setup wizard 的在线 preset 地址与离线开关；生产 adapter 不依赖 wizard 时可不设置。见 [`presets.py`](https://github.com/Thysrael/Horizon/blob/main/src/setup/presets.py)。 |
| `TZ` | 容器/进程时区，非应用密钥；Compose 示例使用 UTC，X News Toolbox 应把显示时区与抓取时间统一为明确的 IANA 时区。 |
| `RESEND_API_KEY` | 官方邮件配置把它作为 `email.password_env` 的一个示例；它属于自定义密码变量，而非核心固定变量。 |
| `ai.api_key_env` 指向的任意合法变量名 | 自定义/代理 provider 的 key；这才是运行时真正读取的名称。 |
| `webhook.url_env`、`email.password_env` 指向的任意合法变量名 | 自定义 Webhook URL 和邮件密码变量。 |
| 配置中任意 `${VAR_NAME}` | [官方配置指南](https://thysrael.github.io/Horizon/configuration#environment-variable-substitution)说明会递归替换字符串，可用于私有 Feed token、`base_url`、Webhook header 等。 |
| OpenBB provider 自己的 credential 变量 | 由 OpenBB SDK 管理，具体名称取决于用户选择的 provider，Horizon 不把它们写进活动 JSON。 |

所以不存在一个对所有部署都固定不变的“全部变量名”列表：固定变量如上；此外必须扫描生成后的 config 中 `api_key_env`、`password_env`、`url_env` 与 `${...}`，在启动前给出“缺失变量”列表。

### 4.3 与现有工作台密钥的边界

现有 X News Toolbox 还使用 `MINDS_BUILDER_API_KEY`、`MINDS_MIND_ID`、`X_BEARER_TOKEN` 等自身配置。它们不应复制到 Horizon `.env`：Minds 与 X 官方 API 仍由 Node 服务负责。Horizon worker 只获得本次运行所需的最小变量集合。

## 5. 类似开源轮子对比

| 项目 | 功能与架构 | 技术栈/许可/活跃度 | 集成成本 | 优点 | 缺点与不适用点 |
|---|---|---|---|---|---|
| [Thysrael/Horizon](https://github.com/Thysrael/Horizon) | 多源抓取、去重、profile 驱动 AI 评分/补充/摘要、MCP、邮件/Webhook/Pages | Python 3.11+；MIT；254 commits，2026-08-10 有提交 | **中**：增加 Python worker 与 MCP adapter | 和“先抓真实信息再筛选”的目标最贴合；MCP 已提供结构化流水线；来源最多 | 无动态 Web API/DB；无稳定 release；与现有 RSS/X 有重叠；双运行时 |
| [TrendRadar](https://github.com/sansan0/TrendRadar) | 多平台热榜 + RSS、关键词、AI 分析/翻译、通知、MCP、内置 Web 报告；SQLite/S3 | Python；GPL-3.0；仓库页 245 commits，2026 年持续大版本更新，[README](https://github.com/sansan0/TrendRadar/blob/master/README-EN.md) | **高**：功能与现有工作台大量重叠 | 中文舆情/热榜、SQLite、Windows 脚本、通知与 MCP 很成熟 | 配置面很大；GPL-3.0 对直接复用/分发的合规要求更高；偏“热榜舆情”而非深度多源阅读；接整套会形成第二个工作台 |
| [AI News Open](https://github.com/X-PG13/ainews-open) | RSS/Atom、正文提取、清洗/去重/编辑、中文摘要、发布；FastAPI + 零构建管理台 + CLI | Python、FastAPI、SQLite；MIT；仓库提供 changelog/CI/security | **中高**：HTTP 好接，但会重复 UI/API/存储 | 第一方 HTTP API 和运营后台最完整；规则降级适合生产 | 来源主要是 Feed，社区/代码/金融来源明显少于 Horizon；项目社区规模较小 |
| [TechStatic Insights](https://github.com/ruslanmv/news-and-trends) | RSS → CrewAI 多 Agent 研究/写作 → JSON 历史 → Eleventy 静态站；GitHub Actions 日更 | Python + CrewAI/LiteLLM + Eleventy；MIT；仓库页 356 commits、3 stars | **高** | 多 Agent 新闻写作、Ollama/云模型与静态发布的参考清晰 | 批处理/静态站导向，无运营 API；技术栈更重，来源少；引入 CrewAI 不符合当前最小实现 |
| [Miniflux](https://github.com/miniflux/v2) | 成熟 RSS/Atom/JSON Feed 阅读器，轮询、条件请求、内容清洗、REST API | Go + PostgreSQL；Apache-2.0；[2.3.3](https://github.com/miniflux/v2/releases/tag/2.3.3) 于 2026-07-24 发布 | **高**：需额外 Go 服务和 PostgreSQL | Feed 抓取可靠性、调度、缓存和安全性最好 | 没有 AI、社区/X/GitHub/GDELT 等雷达能力；对便携 Windows 过重 |

选择判断：若从零建设独立后端，AI News Open 的 HTTP 形态很好；若只做可靠 Feed，Miniflux 最强；但对已有 Next 工作台、需要多真实来源和 AI 筛选的项目，**Horizon MCP worker 的复用比最高**。

## 6. 替换现有雷达的三种架构

### 方案 A：Next 工作台 + 固定版本 Horizon MCP worker（推荐）

数据流：

`现有来源/UI → Next 任务 API → Horizon 配置投影 → stdio MCP worker → 结构化 items/analysis → RadarSignal 映射 → node:sqlite → 现有结果页`

- **兼容性**：高。现有 `SignalSource.collect()`、`RadarSignal`、`RadarRun` 是天然 adapter seam；Minds 排序/决策、X 官方 API、UI 和 SQLite 不变。
- **Windows/便携**：打包固定 Python 3.11 runtime、固定 Horizon wheel/源码、锁定依赖和相对 `data-dir`；不要求目标电脑预装 Python，也不在启动时联网安装。代价是便携目录会增大，但用户已明确不需要压缩。
- **真实数据**：Horizon 返回来源 URL/元数据后映射并写入 SQLite；Node X adapter 独立合并。每个来源失败作为 warning，不能用演示数据冒充成功。
- **密钥安全**：Next secrets store/system environment 是事实来源；启动子进程时只注入本次需要的变量。config 只存变量引用；API 只回 `configured: true/false`。
- **失败降级**：单源失败保留其他源；AI 失败保留已抓 raw items 并标“未分析”；worker 崩溃退避重启一次；Markdown/Webhook 投递失败不抹掉成功雷达；绝不静默回退 demo。
- **开发量**：中。要写 MCP process adapter、config projector、result mapper 和 contract tests，但不用重写抓取/AI 流水线。

### 方案 B：Horizon 外包一层 Python HTTP sidecar

在固定 Horizon 上包一层自有 FastAPI，提供 job、status、results、health，由 Next 通过 localhost HTTP 调用。

- **兼容性**：中高；HTTP 对 Web 部署直观，也容易做容器水平隔离。
- **Windows/便携**：需要管理第二端口、进程、鉴权与冲突；比 stdio MCP 多一个常驻服务。
- **真实数据/降级**：可做任务队列、断点、重试；但这是新增自有服务代码，维护面更大。
- **安全**：必须只监听 loopback、加进程间 token、限制 CORS/请求体、为 worker 单独做出站安全；不能因为只在本机就无鉴权。
- **开发量**：中高。Horizon 本身没有该 HTTP 服务，相当于再造一层 API。

适合未来拆成服务器部署，不适合当前“先复用轮子、做便携工作台”的首版。

### 方案 C：把 Horizon 逻辑移植成 TypeScript

只借鉴其 scrapers、profiles、prompts 和 pipeline，在现有 Next/Node 内重写。

- **兼容性/便携**：运行时最统一，能完全使用现有 `SafeFetch`、SQLite 和 X adapter。
- **开发量**：最高；需移植十类来源、profile 路由、AI provider、补充/摘要、重试和测试。
- **维护**：会快速偏离上游，后续不能低成本吸收修复；等于放弃“先找轮子”。

只在双运行时成为确定性硬障碍时选择，不建议现在做。

## 7. 推荐方案的职责边界

| 责任 | X News Toolbox / Node | Horizon worker |
|---|---|---|
| 页面、子页面、连接状态、表单 | 唯一负责 | 不负责 |
| 来源配置事实、启停、测试状态 | SQLite + API | 接收运行时投影 |
| X 账号扫描 | `twitter-api-v2` + X 官方 API | 禁用 Twitter source |
| RSS/HN/Reddit/Telegram/GitHub/OSS/GDELT/Google News/OpenBB | 选择、授权、展示健康 | 抓取和标准化候选内容 |
| AI 分析、profile、背景补充、摘要 | 选择参数、展示与二次 Minds 决策 | 执行流水线 |
| 雷达 run 状态与最终结果 | 唯一事实来源，写 `node:sqlite` | 临时阶段状态/中间结果 |
| 定时 | 现有 scheduler / Windows Task Scheduler | 每次只执行一个 job |
| 导出/通知 | 推荐仍由 Node 统一 | Horizon Markdown/Webhook 仅可选 |

必须明确：Next 的 `SafeFetch` 不会自动保护独立 Python worker。Horizon 可抓任意 RSS/文章 URL，因此 worker 仍需独立的 URL 安全策略和受控出站网络；来源保存时校验不等于连接时安全。首版至少限制用户配置为 HTTPS 公网地址、限制重定向与响应体、阻断私网/特殊地址，并让 worker 只接收已经批准的 source config。

## 8. UI 与 API 需要新增的配置

### 8.1 首次运行必填

| UI 字段 | API/存储语义 | 说明 |
|---|---|---|
| “启用 Horizon 雷达” | `horizon.enabled` | 关闭时保留旧 adapter，便于回滚。 |
| AI 服务商 | `ai.provider` | 下拉，包含云 provider 与 Ollama。 |
| 模型 | `ai.model` | 必填；Azure 填 deployment name。 |
| AI key | `secretRef/status` | 除 Ollama 外条件必填；提交后不回显明文。 |
| 信息来源 | 现有 `content_sources` + Horizon source subtype | 至少启用一个真实源。 |
| 时间范围 | `collection.time_window_hours` | 建议默认 24h；运行时也可覆盖。 |

### 8.2 按选择条件出现

- Azure：endpoint、API version。
- 自定义兼容服务/Ollama：base URL；远端 Ollama 要明确“不等于本机”。
- GitHub：token（可选但推荐）与 user/repo release 类型。
- Horizon Twitter：Apify token、users、reply 参数；但默认隐藏在“实验性/不推荐”，并提示现有官方 X 来源更合适。
- OpenBB：启用 extra、provider、symbols、provider credential status；未安装 extra 时禁止启用。
- RSS：`content_extractor`、profile/category，以及私有 URL secret ref；不能把 token 放在返回给浏览器的 locator 中。
- Email/Webhook：只有决定由 Horizon 投递时才显示；默认继续让工作台负责。

### 8.3 可选高级项

- 每 profile 阈值、topic dedup、profile 顺序和 category quotas。
- AI throttle、analysis/enrichment concurrency、temperature、max tokens。
- 是否 enrich、是否生成中文/英文、final max items。
- 每个来源 fetch limit、min score/comments 等。

### 8.4 不应直接暴露给普通用户

- 任意 Python 可执行路径、任意 config 文件路径、任意 shell 参数。
- 原始 `.env` 文本编辑器。
- 任意 Webhook header 模板或 `${VAR}` 注入能力。
- “自动跟随 main”开关。

这些由固定 manifest/config projector 管理，避免把工作台变成远程命令或秘密泄漏入口。

### 8.5 建议 API 契约（规格，不是本次代码）

- `GET/PUT /api/settings/horizon`：公共配置与各 secret 的 configured 状态；永不返回 secret。
- `POST /api/horizon/validate`：调用 `hz_validate_config`，返回缺失依赖/变量/不支持来源。
- `POST /api/radar`：沿用现有入口，新增 `engine: "horizon"`、source IDs、hours/profile 参数。
- `GET /api/radar/runs/:id`：阶段、来源成功/失败、warnings、计数、耗时；stderr 必须脱敏。
- `POST /api/radar/runs/:id/retry`：同一配置快照重试，不自动升级 Horizon。
- 来源测试 API 返回真实来源、最新 item 时间、HTTP/解析状态，不返回正文 token、headers 或内部路径。

## 9. 真实数据验证与验收

### 9.1 分层验证

1. **无付费 key smoke**：HN + 一个稳定 RSS + OSS Insight，确认至少三条真实链接且 `synthetic=false`。
2. **条件来源 smoke**：GitHub 分别在无 token/有 token 下验证；Telegram 公共频道；Reddit；GDELT；Google News。
3. **X smoke**：只跑现有 X 官方 adapter，验证账号 ID、时间线和 rate-limit 错误；确认 Horizon Twitter 未执行。
4. **AI smoke**：只选一个 provider、少量 items，验证评分/摘要 schema 与 token/cost 记录；另测错误 key 和 429。
5. **便携 smoke**：在未安装 Python/uv 的 Windows 电脑，从便携目录启动，验证 worker、SQLite、相对路径和中文用户名路径。

### 9.2 每条证据至少保存

`sourceType`、`sourceName`、外部 item ID、原始 URL、canonical URL、标题、publishedAt、fetchedAt、raw evidence hash、worker version SHA、AI provider/model、`synthetic=false`、处理阶段和错误状态。正文可按最小化原则截断/过期，不长期复制整篇内容。

### 9.3 通过标准

- 连续两次相同时间窗运行不会产生重复信号；同 URL 能稳定合并。
- 所有展示项可点击回真实一手来源；没有 `example.com` 或演示数据混入 live run。
- 单源失败得到 `partial` 和明确 warning；全部真实源失败就是 failed，不回退 demo。
- AI 失败时已抓数据仍可审计，但标记“未分析”，不伪造摘要。
- worker 版本、配置快照、来源与结果能关联；日志中没有 key、Authorization、私有 URL query。

## 10. 分阶段实施顺序（确认后才写代码）

1. 固定上游 SHA、许可证和依赖锁；定义 MCP adapter 契约及 Horizon→`RadarSignal` 映射。
2. 只接 HN/RSS/OSS Insight + 一个 AI provider，跑通 validate/fetch/score/filter/result 入库。
3. 接 GitHub、GDELT、Google News、Reddit、Telegram；实现单源 partial/warning 和真实运行凭证。
4. 保留现有 `twitter-api-v2` 合并 X 账号结果，验证去重与速率限制。
5. 增加设置 UI、secret status、连接状态和运行阶段；再做 Windows 固定 runtime 便携构建。
6. OpenBB、邮件/Webhook、Horizon Apify Twitter 都放在第二阶段以后，只有真实需求才启用。

最终推荐不变：**方案 A，固定 `Thysrael/Horizon@80bde6db03008678111fb627b471792c7ac05a94` 的 MCP worker；Next/SQLite 保持系统主控；X 继续官方 API。**

## 11. 主要一手来源索引

- [Thysrael/Horizon 仓库与 README](https://github.com/Thysrael/Horizon)
- [Horizon 2026-08-10 提交历史](https://github.com/Thysrael/Horizon/commits/main/)
- [Horizon pyproject / 依赖 / CLI](https://github.com/Thysrael/Horizon/blob/main/pyproject.toml)
- [Horizon 环境变量样例](https://github.com/Thysrael/Horizon/blob/main/.env.example)
- [Horizon 完整配置样例](https://github.com/Thysrael/Horizon/blob/main/data/config.example.json)
- [Horizon 官方配置指南](https://thysrael.github.io/Horizon/configuration)
- [Horizon MCP 源码](https://github.com/Thysrael/Horizon/blob/main/src/mcp/server.py)
- [Horizon 存储源码](https://github.com/Thysrael/Horizon/blob/main/src/storage/manager.py)
- [Horizon Docker Compose](https://github.com/Thysrael/Horizon/blob/main/docker-compose.yml)
- [旧副本 loulianzhang/horizon-news](https://github.com/loulianzhang/horizon-news)
- [TrendRadar](https://github.com/sansan0/TrendRadar)
- [AI News Open](https://github.com/X-PG13/ainews-open)
- [TechStatic Insights](https://github.com/ruslanmv/news-and-trends)
- [Miniflux](https://github.com/miniflux/v2)

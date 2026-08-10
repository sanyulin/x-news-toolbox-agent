# 跨平台创作者文案：开源轮子调研与实现方案

## 结论

本项目不应直接替换为一个完整的社媒发布系统。建议保留现有 Next.js/TypeScript、SQLite、Mind、Horizon 和人工审核流程，新增“平台版本层”：先生成一份带事实依据的核心文案，再按平台规则生成可编辑版本。第一阶段只做生成、校验、预览、复制/导出，不接自动发布。

## 开源项目比较

| 项目 | 主要能力 | 架构/技术栈 | 优点 | 局限与本项目取舍 |
|---|---|---|---|---|
| [Postiz](https://github.com/gitroomhq/postiz-app) | 多平台发帖、排程、团队协作、平台预览 | 全栈 TypeScript/Next.js 方向，数据库、队列和 OAuth 连接器 | 与“多平台版本+预览”最接近，连接器多 | 系统较重，发布与凭据管理复杂，AGPL-3.0；只借鉴平台适配和预览，不整体引入 |
| [Mixpost](https://github.com/inovector/mixpost) | 日历、排程、社媒账号和团队工作流 | Laravel/PHP + Web 前端，服务化部署 | 调度、队列、账号管理成熟 | 与当前 Node/Next 便携架构不一致，AI/事实依据层弱；不作为依赖 |
| [trypost](https://github.com/trypost-it/trypost) | 面向创作者的多平台编写、预览、逐平台调整 | Laravel/PHP + Vue | 产品流程简单，强调逐平台编辑 | 生态和连接器规模较小，仍偏发布工具；可借鉴编辑器交互 |
| [n8n](https://github.com/n8n-io/n8n) | 工作流、条件分支、重试、凭据和第三方连接 | Node.js/TypeScript 工作流引擎 | 适合编排“抓取→分析→生成→审核→发布” | 不是创作者文案编辑器，嵌入成本和许可边界都较高；只借鉴流程节点思想 |
| [Dify](https://github.com/langgenius/dify) | LLM 应用、提示词、工作流、日志和模型路由 | Python 服务 + React/TypeScript 前端 | 适合配置模型和生成流程 | 会引入第二套平台、存储和运维；Mind 已承担核心语义职责，不整体引入 |
| [LangGraph](https://github.com/langchain-ai/langgraph) | 有状态 Agent 图、节点、人工审批 | Python/TypeScript 图编排库 | 适合把平台适配拆成可测试节点 | 不提供社媒连接器、账号授权和编辑器；只在后续流程复杂时评估 |

## 本地已下载 Skill 的作用

- `cangjie-skill`：适合把创作者长期文章/素材蒸馏成“内容规则”和风格约束；不是平台 API 适配器。
- `ai-employee-dispatcher`：适合定义“平台适配编辑、事实核验、风格审校、合规检查”的角色和质量门；不是运行时发布依赖。
- `research`：用于本轮一手资料调研和留档。
- `impeccable`：后续用于多平台编辑器、预览和可访问性打磨；本轮不改 UI。
- `ponytail`：编码阶段坚持最小依赖和最小改动；本轮不编码。

## 建议架构

### 1. 领域模型

新增 `ContentVariant`（平台文案版本），保存：`proposalId`、`platform`、`language`、`text/title/hashtags`、`constraintsSnapshot`、`evidenceRefs`、`status`、时间和版本号。核心事实只来自 Radar/Horizon 结果和 Mind 提案；平台改写不能丢失证据引用，也不能新增未经核验的事实。

### 2. 平台注册表与适配器

以配置驱动的平台注册表保存字符、链接、话题、媒体和格式要求；每个平台实现 `validateDraft`、`renderPreview`、`buildExport`，把规则集中管理，避免在页面中散落 `if/else`。建议首批：X、LinkedIn、Threads、微信公众号（仅导出）。小红书、抖音、Bluesky、Mastodon 作为第二批；官方 OAuth/发布按平台逐个审计后再接入。

### 3. Mind 的职责

Mind 先把雷达事实整理成“核心内容包”，再根据平台目标（信息密度、语气、长度、是否需要标题/脚本）生成变体，并做一次自检。Horizon 负责来源聚合和评分，Mind 负责语义判断与创作者表达，不让平台适配器自行编造事实。

### 4. API/UI

建议接口：`POST /api/proposals/:id/variants` 批量生成；`GET /api/proposals/:id/variants` 查询；`POST /api/variants/:id/validate` 校验；`POST /api/variants/:id/revise` 修改；导出为 Markdown/纯文本。暂不新增发布接口。

在现有 `/drafts` 增加平台标签、批量生成、字符统计、警告、逐平台预览和复制/导出；保留 `/results` 的来源证据。后续可增加 `/settings/platforms` 管理 OAuth，但默认不配置。

### 5. 数据与测试

SQLite 增加 `content_variants`、`platform_profiles`、`platform_rule_snapshots`、`variant_reviews`。测试覆盖：字符/链接/话题校验、语言切换、证据引用保留、批量生成失败降级、规则快照版本化、敏感信息不泄露；用同一核心内容建立 X/LinkedIn/Threads/微信公众号 golden fixtures。

## 分阶段实施

1. **MVP**：平台注册表、ContentVariant、X/LinkedIn/Threads/微信公众号导出、预览和人工审核。
2. **增强**：Bluesky/Mastodon/小红书/抖音脚本与媒体需求，平台规则快照和更细的风格档案。
3. **发布**：仅使用官方 OAuth/API，逐个平台接入、限流和失败重试；每个平台单独验收，不做默认自动发布。

## 待你确认的三项决策

1. 首批平台是否采用 **X、LinkedIn、Threads、微信公众号**；如果你的重点是中文内容，可把微信公众号替换为小红书（先导出，不自动发布）。
2. 第一阶段是否坚持“生成+人工复制/导出”，暂不接官方发布 API（推荐）。
3. 第一阶段是否只处理文字和媒体说明，不生成图片/视频（推荐）。

本轮仅完成调研和方案，未修改产品代码。

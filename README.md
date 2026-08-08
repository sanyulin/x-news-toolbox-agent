# X News Toolbox

一套面向 X（Twitter）内容创作者的本地 AI 工作台：把分散的信息源汇总成可信选题，让 Mind 参与排序、判断和写作，再由创作者完成最终审核。

Creative Minds Jam #1 · **Audience Growth & Engagement** 赛道作品。

![X News Toolbox 信息扫描页](docs/qa/demo-radar-desktop.png)

## 它解决什么问题

创作者通常要在多个网站和账号之间反复切换，手工找热点、核对来源、整理选题，还很难让 AI 长期保持自己的表达风格。X News Toolbox 把这条流程集中到一个工作台：

- **信息太分散**：同时管理 RSS、Atom、JSON API、RSSHub 和 X 账号来源；
- **热点噪声太多**：对多来源内容去重、排序并保留出处和采集时间；
- **AI 文案不像本人**：扫描已授权 X 账号，提取抽象表达特征，建立可切换的风格档案；
- **内容依据不透明**：草稿关联证据版本，标记支持、冲突和待核实信息；
- **发布风险难控制**：建议必须经过批准、修改或拒绝，应用不会自动发帖；
- **工具配置门槛高**：提供可视化接口设置与连接状态，首次启动默认不带任何密钥；
- **换电脑部署麻烦**：可生成无需压缩的 Windows 便携目录，在另一台电脑上自行配置后运行。

## 核心工作台

| 页面 | 作用 |
| --- | --- |
| 信息扫描 | 选择多个来源运行 Agent，生成去重、排序后的内容信号 |
| 信息来源 | 新增、测试、启停 RSS / Atom / JSON / RSSHub / X 账号 |
| 风格档案 | 在明确授权后分析 X 账号公开内容，保存抽象语气特征 |
| 内容草稿 | 基于证据与当前风格生成中英文建议，交给人工审阅 |
| 结果记录 | 记录审核、实际发布链接、最终文案和反馈指标 |
| 接口设置 | 配置 Mind ID、Minds API Key、X API 凭证并查看连接状态 |

## Mind 在项目中的作用

Mind 不是一个只负责“改写句子”的聊天框。它作为长期内容决策层，结合创作者定位、历史审核与风格档案，对候选信号进行排序、解释选择理由，并基于同一份证据生成可追踪的草稿。应用层则负责来源接入、SQLite 持久化、权限边界、人工审核和审计记录。

## 技术栈

- Next.js 16、React 19、TypeScript
- Node.js 22 原生 SQLite
- Minds Client SDK
- `twitter-api-v2`（仅使用 X 官方 API）
- Zod、Vitest

## 本地运行

要求 Node.js 22+ 与 pnpm。

```powershell
Copy-Item .env.example .env.local
pnpm install
pnpm dev
```

打开 `http://localhost:3000`，进入“接口设置”填写自己的凭证。仓库不包含任何真实 API Key、运行数据库或个人配置。

也可以直接在页面配置；便携模式会把配置保存在便携目录自己的 `data` 文件夹，不读取宿主电脑的既有密钥。

## 生成 Windows 便携版

```powershell
pnpm portable
```

生成结果位于 `dist/x-news-toolbox-portable-*`。复制整个目录到另一台 Windows 电脑，运行其中的 `start.cmd`，再由使用者填写自己的接口与来源。构建脚本会阻止 `.env`、运行配置和 SQLite 数据库进入交付目录。

## 验证

```powershell
pnpm verify
```

该命令依次运行测试、TypeScript 检查和生产构建。

更多资料：

- [架构说明](docs/architecture.md)
- [三分钟演示脚本](docs/demo-script.md)
- [DoraHacks 提交材料](docs/submission-pack.md)
- [GitHub 轮子调研与选型](docs/research/github-wheel-comparison.md)

## 安全与隐私边界

- 不自动发布、回复、点赞或关注，最终操作始终由创作者完成；
- 不抓取 X 网页，X 能力只走官方 API，并受开发者账号权限与额度约束；
- 只有用户确认拥有分析授权后才建立风格档案；
- 风格档案只保存抽象特征、ID 与哈希，不长期保存原帖正文，也不推断敏感属性；
- API Key 只在服务端使用，`.env.local`、运行配置、数据库和构建产物均被 Git 忽略；
- SQLite 方案面向单机或便携场景；多用户云部署需要另行加入账号隔离与托管数据库。

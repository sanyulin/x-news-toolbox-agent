# Creative Minds Jam 提交包

官方详情：[Creative Minds Jam #1: Hong Kong](https://dorahacks.io/hackathon/creativeminds/detail)

## 项目定位

- **项目名：** X News Toolbox
- **参赛赛道：** Audience Growth & Engagement
- **一句话：** 一个替科技、AI、商业创作者持续筛选可信选题、生成有证据的双语建议，并从人工确认的发布结果中学习的持久 Mind 编辑台。
- **核心痛点：** 创作者不缺一次性文案生成，缺少可信选题、事实边界、稳定个人表达，以及可控的长期复盘。

## Minds 为什么不可替代

1. **选题：** 核心 Mind 结合创作者定位、受众和长期会话对真实候选信号重新排序，保留 Mind、会话和决策标识。
2. **表达：** 核心 Mind 只能基于指定证据版本给出 go/no-go 与中英独立建议；证据不足可以弃稿。
3. **记忆：** 发布后，核心 Mind 在同一稳定会话中提出学习记忆；创作者可以接受、改写或删除。
4. **自主跟进：** SQLite Job 跨进程保存计划，后台 worker 或托管 cron 到期后自主运行每日雷达，但永不自动发布。

应用负责采集、证据、版本、安全门和人工审核；没有 Mind 时，正式选题、表达、学习和真实自主跟进均不能伪造。

## 1 分 50 秒提交视频脚本

| 时间 | 画面 | 旁白 |
| --- | --- | --- |
| 0:00–0:12 | 首页与创作者基线 | “创作者不缺 AI 文案，缺的是每天该说什么、依据是什么，以及发完之后真正学到了什么。” |
| 0:12–0:28 | 核心 Mind 已连接；运行真实来源 | “X News Toolbox 让一个持久 Mind 记住我的定位和受众。应用采集来源，Mind 决定今天最值得表达的机会。” |
| 0:28–0:43 | 展开 Mind 排序理由、会话与决策 ID | “这不是固定排行榜。每次排序都留下 Mind 身份、稳定会话和决策标识，评委可以核验。” |
| 0:43–1:03 | 证据包、中英建议、go/no-go | “选中信号后，应用先锁定证据版本，再让同一个 Mind 给出中英两种独立表达。未知项保持未知，证据不足就不成稿。” |
| 1:03–1:18 | 人工审核与已批准未发布 | “创作者拥有最后决定权。批准只锁定版本，没有自动发布按钮；账号控制权始终在人手里。” |
| 1:18–1:34 | 发布关联、指标、学习记忆 | “实际发布文本和指标回流后，Mind 提议一条长期记忆。我可以接受、改写或删除，演示数据不会污染真实记忆。” |
| 1:34–1:45 | 每日自主跟进状态 | “后台 Job 会跨会话持续运行每日雷达。它主动准备机会，但不会擅自发帖。” |
| 1:45–1:50 | 四格验证证据与下载 JSON | “最后，一屏核验选题、表达、学习和自主跟进；演示记录绝不会冒充真实调用。” |

## DoraHacks 提交检查

截止时间：**2026 年 8 月 28 日 23:59 HKT**。

| 官方要求 | 当前证据 | 状态 |
| --- | --- | --- |
| Working product | 本地 Next.js 产品；`pnpm test && pnpm typecheck && pnpm build` | 已完成 |
| Minds 为核心能力 | 选题、表达、学习、真实调度均有硬性 Mind 门 | 代码完成；待真实凭证终验 |
| Persistence demonstration | 稳定 Minds 会话、SQLite 记忆、跨进程 Job 与最近运行记录 | 代码完成；待真实运行录像 |
| Creator-economy track fit | Audience Growth & Engagement；可信选题与长期增长学习 | 已明确 |
| 1.5–2 分钟 Demo video | 上方 1:50 分镜脚本 | 待真实调用后录制并上传 |
| Code repository | README、架构、测试与环境变量模板齐全 | 待创建公开 GitHub/GitLab/Bitbucket URL |
| Technical documentation | `README.md`、`docs/architecture.md`、本提交包 | 已完成 |
| Mind ID 与 Mind Email | 从 Hello Minds 设置页复制到 DoraHacks 申请 | 待用户填写；不要写入仓库 |

## 可行性与扩展路径

当前版本面向单创作者，使用 Node 原生 SQLite，适合本机比赛演示或带持久卷的长驻 Node 主机。真实采用后，先把 Store 实现迁移到托管 PostgreSQL，再增加账号隔离与平台指标同步；`CreatorDesk` 和 Minds/Signal Adapter 契约无需改变。无持久磁盘的 Serverless 平台不能直接沿用当前 SQLite 文件。

## 录制前唯一真实验收流程

1. 本机 `.env.local` 配置 `MINDS_BUILDER_API_KEY`、可选 `MINDS_MIND_ID`、至少一个 `CREATOR_MIND_RSS_FEEDS`；生产环境另配 `CREATOR_MIND_CRON_SECRET`。
2. 页面验证核心 Mind，运行真实来源与真实 Mind 排序。
3. 从该雷达生成正式中英建议，人工批准并手工发布。
4. 关联真实帖子和可获得指标，让核心 Mind 提议学习并由创作者确认。
5. 启用真实每日跟进，让 worker 或 `/api/follow-up` cron 完成一次到期运行。
6. 确认“验证证据”四项均为“已验证”，下载 JSON 后再录制 1:50 视频。

## 不提交到仓库

- `.env.local`、Builder API key、X Token、cron secret；
- Mind Email 等个人账号信息；
- `data/*.sqlite`、运行日志与未脱敏真实内容。

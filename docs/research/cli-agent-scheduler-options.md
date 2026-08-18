# X News Toolbox：CLI Agent 定时唤醒技术栈对比与执行方案

调研日期：2026-08-18
范围：只做技术调研和实施设计，不修改产品代码、不注册系统任务、不调用真实 Mind/Horizon。
目标：网站、浏览器和 Next.js 服务全部关闭后，仍能在每天上午 10:00 唤醒一次 CLI；Mind 继续是唯一语义决策主体。

## 1. 结论先行

首版推荐：**Windows Task Scheduler + 一次性 Node CLI + 现有 SQLite 运行账本**。

```text
Windows Task Scheduler（每天 10:00，只负责唤醒）
                    ↓
       x-news-agent run-due（运行后退出）
                    ↓
 SQLite 原子领取 / 幂等键 / checkpoint / 重试状态
                    ↓
 Mind 决定 scan 或 skip、选题、平台表达和学习
                    ↓
 Horizon / RSS / JSON / X 仅执行被批准的采集
                    ↓
 SQLite + outbox 保存待审核草稿，绝不自动发布
```

这个组合直接解决当前故障根因：现有 [`follow-up-worker.ts`](../../src/server/follow-up-worker.ts) 只有在 Next.js 进程启动后才会每 60 秒轮询；网页服务一停，轮询器也随之消失。Windows Task Scheduler 是操作系统服务，不依赖网页或 Node 常驻进程；它在 10:00 启动一次 CLI，CLI 做完即退出。

不建议首版引入 `node-cron`、Bree、BullMQ 或 Temporal：它们各有价值，但都不能比操作系统调度器更短地解决当前单机、单用户、每天一次的需求。Linux/VPS 版使用 **systemd timer + 同一个 Node CLI**；代码不需要换一套。

## 2. 当前项目基础与必须修复的边界

当前技术栈来自项目 [`package.json`](../../package.json)：Node.js 22+、Next.js 16、TypeScript 5.9、Node 原生 SQLite、`@animocabrands/minds-client-lib@0.1.3`，并通过 Python stdio MCP 调用固定版本 Horizon。现有领域核心已经具备：

- `CreatorDesk`：真实流水线和人工审核边界；
- `MindAuthority`：自动计划、雷达排序、单平台表达、学习和记忆提交；
- SQLite：每日任务、运行阶段、checkpoint、Proposal、Publication、Memory；
- Horizon：真实信息采集、评分、去重和补充背景；
- 稳定 `creator-main` 会话、`usedMemoryIds` 和记忆审计。

所以本轮不应重写 Agent，只需把“什么时候调用它”从 Next.js 进程移到系统调度器，并提供一个可独立执行的 CLI 入口。

实施前需要处理四个已知问题：

1. [`instrumentation.ts`](../../src/instrumentation.ts) 启动网页轮询器；CLI 上线后必须关闭这条生产调度路径，避免网页与 CLI 双重领取。
2. [`sqlite-health.ts`](../../src/adapters/sqlite-health.ts) 已用 `BEGIN IMMEDIATE` 领取任务，但 `running` 没有租约过期和 heartbeat；进程在领取后崩溃可能永久卡住。
3. [`creator-desk.ts`](../../src/core/creator-desk.ts) 的下一次运行时间依赖主机本地时区，且需要把 `skip + requestedDraftCount: 0` 明确定义为正常完成，而不是失败。
4. [`runtime-config.ts`](../../src/server/runtime-config.ts) 可把 API Key 写入本机 JSON。公开仓库和便携包必须继续排除真实配置；Windows 生产版应把密钥迁到与运行账号绑定的安全存储。

## 3. Minds 能做什么、不能直接做什么

Minds 官方 CLI 是 Builder API 的 JSON-first 终端接口，需要 Node 22+。官方文档明确支持列出 Mind、创建稳定 alias、发送消息、`--wait` 等待回复、读取历史、查看 cognition、启停 Mind、管理 skills/apps，并可在 CI 中使用 `MINDS_BUILDER_API_KEY`。[Minds CLI 官方文档](https://build.hellominds.ai/en/docs/get-started/cli)

官方 Client Library 则把同一套能力作为 TypeScript API 提供，包括 `ensureConversation`、`sendMessage`、`getHistory`、`getLatestHistoryFingerprint`、`waitForReply`、SSE 事件，以及账号和 cognition 操作。[Minds Client Library 官方文档](https://build.hellominds.ai/en/docs/get-started/client-library)

官方公开方法列表**没有“启动用户电脑上的任意进程/命令”接口**。这是由官方能力表得出的边界判断：Minds 云端可以推理、对话和调用其已装备能力，但不能越过网络直接启动一台关闭了网站服务的本地 Windows CLI。若未来给 Mind 装一个调用公网 Agent Endpoint 的 Skill，它可以间接触发云端 Agent Host；这仍需要一个持续在线、可认证的外部服务，不等于直接执行本地 CLI。

因此正确分工是：

- **系统调度器**：决定何时唤醒进程；
- **CLI Host**：加载配置、领取任务、重试和持久化；
- **Mind**：决定是否扫描、扫描重点、采用哪些证据、如何写和学到什么；
- **Horizon**：只采集和整理真实信息；
- **创作者**：最终审核、编辑和发布。

调度器不得根据关键词自行选题，也不得在 Mind 不可用时自动退回另一套 LLM 生成“真实”草稿。

## 4. 技术方案总表

| 方案 | 架构与功能 | 技术栈 / 许可证 | Windows 便携性 | 准时与离线补跑 | 密钥与数据 | 与当前项目贴合度 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Windows Task Scheduler + Node CLI** | OS 每日触发一个短命 CLI；CLI 调现有 `CreatorDesk` 并退出 | Windows 内置服务；无新增调度 npm 依赖 | **最高**，目标电脑自带；便携包只需 Node/Horizon 运行时和安装脚本 | 每日时间触发；`StartWhenAvailable` 可在错过后排队补跑，默认延迟约 10 分钟；可配置失败重启和 `IgnoreNew` | 本地 SQLite；密钥可用当前用户 DPAPI；无需上传云端 | **最高** | **Windows 首版推荐** |
| **systemd timer + Node CLI** | `.timer` 用 `OnCalendar` 唤醒 `.service`；同一个 CLI 运行后退出 | Linux 系统组件；无新增 npm 依赖 | Windows 不可用；VPS/Linux 很自然 | `Persistent=true` 可补跑停机期间错过的日历任务；`AccuracySec` 控制精度 | systemd credentials、权限受限 env file 或主机 secret manager；SQLite 可在持久磁盘 | **高**，只换外层触发器 | **Linux/VPS 推荐** |
| **cron + Node CLI** | cron daemon 每分钟匹配时间并执行 CLI | POSIX/cronie，具体许可证随实现 | Windows 原生不适用；WSL 需要额外常驻环境 | 简单稳定，但普通 cron 不记录停机时错过的运行；需 anacron/自有 due-check 补偿 | env 很精简，必须显式设置 PATH/工作目录；本机数据 | 中高 | Linux 兼容后备，优先 systemd timer |
| **node-cron + 常驻 Node** | Node 进程内 cron；支持时区、`noOverlap`、迟到容忍和事件 | TypeScript/JavaScript；ISC | 代码跨平台，但必须先把进程安装成服务/开机启动 | 进程活着时可准时；进程停机期间不能自行唤醒，迟到容忍只处理仍存活进程的漂移 | 与当前 Node/SQLite 好接；密钥仍在长驻进程 | 中 | **不能单独解决当前问题**，不采用 |
| **Bree + 常驻 Node** | cron/date/interval 调度，worker threads 隔离任务，支持重试、并发和 graceful shutdown | JavaScript，内置 TS 类型；MIT | 可跨平台，但仍需 Windows 服务或 Task Scheduler 保活 | 进程死后无法自行启动；官方建议用持久数据库自行做幂等 | 不强制 Redis/Mongo，可复用 SQLite | 中 | 多种后台任务或 CPU 隔离增多后再评估 |
| **GitHub Actions `schedule`** | GitHub 托管 runner 拉代码、装 Node/Python、执行 CLI | GitHub 托管服务 + YAML；不是本地运行时依赖 | 不依赖用户电脑，跨平台 | 支持 cron、IANA 时区和最短 5 分钟；官方警告高负载时会延迟，队列甚至可能被丢弃；公开仓库 60 天无活动会自动停用 schedule | GitHub Secrets；runner 临时，SQLite/Horizon 状态必须迁到外部持久存储或每次上传下载 artifact | 中低 | 可做云端演示/备用，不做本地首版主调度 |
| **Netlify Scheduled Function** | 已部署 Netlify 站点的 published deploy 按 UTC cron 运行函数；可再唤醒 Background Function/外部 Host | TypeScript/JavaScript Serverless；Netlify 托管能力 | 不依赖个人电脑，但不是本地便携运行 | 每天 10:00 北京时间可写成 `0 2 * * *`；Scheduled Function 最长 30 秒，Background Function 最长 15 分钟 | Netlify Functions 环境变量；运行时临时，必须外接持久数据库/对象存储 | **低（当前实现）** | 适合“云端唤醒桥”；当前 SQLite + 本地 Python Horizon 不能直接搬入 |
| **BullMQ Job Scheduler** | Redis 队列、worker、重试、并发、计划任务和崩溃恢复 | TypeScript/Node + Redis；BullMQ MIT，Pro 商业许可 | 需要额外 Redis 服务，不便携 | 适合多 worker；Job Scheduler 在上一次任务开始处理时生成下一次，worker 不足会降低频率 | Redis 管任务，SQLite 仍管业务，形成双账本 | 低（当前规模） | 多用户、多 worker 后再评估 |
| **Temporal Schedule + Worker** | Temporal Server/Cloud 持久化 Workflow；Schedule 有 overlap、catch-up、backfill、pause 和 retry | Temporal Server/TS SDK；MIT；另有付费 Cloud | 本机自托管很重；需要 Server、Worker、数据库/Cloud | **能力最强**，Catchup Window 和 Backfill 原生 | Cloud/自托管密钥管理；需把 checkpoint 映射成 Workflow/Activity | 中低（当前规模） | 跨机器、长流程、补偿事务出现后再引入 |

### 4.1 Windows Task Scheduler 的一手依据

微软官方 PowerShell 模块可创建每日 time trigger 并把 action 注册到本机任务计划；`Register-ScheduledTask` 支持可执行文件、批处理和已注册文件类型。[New-ScheduledTaskTrigger](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasktrigger?view=windowsserver2025-ps)、[Register-ScheduledTask](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/register-scheduledtask?view=windowsserver2025-ps)

官方 Task Scheduler schema 提供：

- `StartWhenAvailable`：错过计划时间后允许补跑；官方说明排队任务默认约延迟 10 分钟。[Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-startwhenavailable)
- `MultipleInstancesPolicy=IgnoreNew`：上一实例仍运行时不启动新实例；还支持 Queue、Parallel、StopExisting。[Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-multipleinstancespolicy-settingstype-element)
- `RestartOnFailure` / `RestartInterval`：任务失败后按配置重启，最短间隔 1 分钟。[Microsoft Learn](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-restartinterval)
- `RunOnlyIfNetworkAvailable` 和 `WakeToRun`：分别要求网络可用、允许唤醒电脑。[Task Scheduler settings schema](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-settingstype-complextype)

注意：“错过后补跑”不等于 10:00 准点；电脑关机或睡眠时只能在恢复可用后运行。如果用户要求无论电脑状态都在北京 10:00 运行，就必须部署到持续在线 VPS/云服务。

### 4.2 systemd timer 与 cron

systemd 的 `OnCalendar` 定义日历时间；`Persistent=true` 会把上次触发时间保存在磁盘，timer 重新激活时若发现错过事件会立即触发；`AccuracySec` 默认允许合并唤醒，要求更接近指定时间时可降低该值。[systemd.timer(5)](https://www.man7.org/linux/man-pages/man5/systemd.timer.5.html)

传统 cron 每分钟检查时间字段，任务只在字段匹配时执行；cron 的运行环境只保证有限的 `HOME`、`LOGNAME`、`PATH` 和 `SHELL`，所以必须使用绝对路径和明确工作目录。普通 cron 文档没有 systemd `Persistent=true` 等价语义，机器关机时的匹配点通常直接错过。[crontab(5)](https://man7.org/linux/man-pages/man5/crontab.5.html)、[POSIX crontab](https://man7.org/linux/man-pages/man1/crontab.1p.html)

### 4.3 node-cron 与 Bree

node-cron 官方选项包括 IANA `timezone`、`noOverlap`、`missedExecutionTolerance` 和事件观察；它仍是进程内 timer，文档说明迟到容忍针对 OS sleep、GC、throttling、clock skew 导致的 timer 漂移，不能在 Node 进程不存在时启动 Node。[node-cron Scheduling Options](https://www.nodecron.com/scheduling-options.html)

Bree 使用 Node worker threads 执行 cron/date/interval job，支持 retry、concurrency、取消和 graceful shutdown；官方同时建议任务查询持久数据库以避免重复，并不强制 Redis/Mongo。[Bree 官方仓库](https://github.com/breejs/bree)

两者适合“已经有可靠常驻服务”的服务器应用。当前为了让它们常驻，仍需 Windows Task Scheduler、Windows Service 或 systemd；既然每天只有一次任务，直接让系统启动短命 CLI 更简单、故障面更小。

### 4.4 GitHub Actions

GitHub 官方 `schedule` 只在默认分支运行，使用 POSIX cron，默认 UTC，现已支持 IANA `timezone`，最短间隔 5 分钟。官方同时明确：高负载时 schedule 会延迟，整点是高峰，负载足够高时排队任务可能被丢弃；公开仓库 60 天无活动会自动禁用定时 workflow。[GitHub Actions schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

GitHub Secrets 在提交前用 sealed box 加密，并只在 workflow 显式引用时注入；GitHub 也建议最小权限，但日志脱敏不是对所有变换后的密钥都能保证。[GitHub Actions Secrets](https://docs.github.com/en/actions/concepts/security/secrets)

它能解决“个人电脑关机”，却会引出当前项目没有的问题：GitHub-hosted runner 是临时环境，现有 SQLite、运行 checkpoint、本地 Horizon Python 环境和 outbox 没有天然的长期磁盘。若把它作为主方案，至少还要迁移数据库到托管 PostgreSQL/对象存储，并重建 Horizon 安装缓存和审计链，已经不是本轮的最小改造。

### 4.5 BullMQ 与 Temporal

BullMQ 是基于 Redis 的 Node 队列，提供重试、并发、崩溃恢复和计划任务；当前 Job Scheduler 从 v5.16 起替代旧 repeatable API。官方说明 scheduler 只有在上一个 job 开始处理时才产生下一个，因此队列繁忙或 worker 不足时，实际频率可能下降。[BullMQ 官方概览](https://docs.bullmq.io/)、[Job Schedulers](https://docs.bullmq.io/guide/job-schedulers)

Temporal 的 Schedule 原生支持重叠策略、Catchup Window、Backfill、Pause 和 pause-on-failure；Temporal TypeScript SDK 官方支持 Node 20/22/24，SDK 与 Temporal 开源服务均为 MIT。[Temporal Schedule](https://docs.temporal.io/schedule)、[Temporal TypeScript SDK](https://github.com/temporalio/sdk-typescript)、[Temporal 官方许可说明](https://temporal.io/about)

这些能力适合多租户、多 worker、跨天审批、复杂补偿和高可靠 SLA。当前只有一位创作者、一个 SQLite、每天一轮，增加 Redis 或 Temporal Server 会制造第二套任务状态、部署和备份体系，也可能在演示中遮蔽 Mind 的主体地位。

### 4.6 已部署 Netlify：可以定时唤醒，但不能原样承载当前 Agent

项目现有 [`netlify.toml`](../../netlify.toml) 使用 `@netlify/plugin-nextjs` 构建并发布 `.next`，因此增加一个独立 Scheduled Function 在部署形态上是可行的。Netlify 官方支持 TypeScript/JavaScript Scheduled Functions，按 UTC cron 执行，只在 published deploy 自动触发，不能通过普通 URL 直接调用；当前固定 30 秒执行上限。[Netlify Scheduled Functions](https://docs.netlify.com/build/functions/scheduled-functions/)、[Functions limits](https://docs.netlify.com/build/functions/configuration/)

北京时间 10:00 等于 UTC 02:00，所以表达式应为 `0 2 * * *`。但它不适合直接运行完整链路：

- 一次真实 Horizon 抓取、Mind 计划、排序和写作可能明显超过 30 秒；
- Netlify Function 运行于 ephemeral runtime，当前 `node:sqlite` 文件无法作为跨调用的可靠持久磁盘；
- 当前 Horizon 是本机 Python `.venv` + stdio MCP 子进程，Netlify Node Function 没有这套便携 Python 工作目录和长期本地数据；
- 函数重新部署后代码版本不可变，但业务 checkpoint 仍必须放到外部持久存储。[Netlify Functions overview](https://docs.netlify.com/build/functions/overview/)

若选择 Netlify，有两种边界清楚的形态：

1. **只做云端唤醒桥（可选）**：Scheduled Function 在 30 秒内向一个持续在线、带签名认证的 Agent Host 写入/发送 `run-due` 事件。目标 Host 仍需在线；它不能唤醒一台已关机且未暴露服务的个人电脑。
2. **完整云端重构（后续）**：Scheduled Function 只创建 run，Background Function 执行长任务。Netlify Background Functions 最长 15 分钟，异步返回 202，失败后官方会在 1 分钟和 2 分钟后各重试一次；结果必须写到外部存储。[Netlify Background Functions](https://docs.netlify.com/build/functions/background-functions/)

完整云端重构至少要把 SQLite 的 `RunStore`、`MemoryStore`、Proposal/Publication 存储迁到托管 PostgreSQL，并把 Horizon 改成可通过 HTTPS 调用的独立 worker，或重写为 Netlify 可执行的纯 HTTP 来源 adapter。密钥应在 Netlify UI/CLI/API 中设置为 Functions 范围环境变量，不得写入 `netlify.toml`；官方说明 `netlify.toml` 中声明的变量不会注入函数运行时。[Netlify Functions environment variables](https://docs.netlify.com/build/functions/environment-variables/)

结论：Netlify 可以解决“个人电脑关机仍能到点触发”，但当前版本需要数据库和 Horizon 两项重大迁移。比赛/本机首版继续选 Windows Task Scheduler；Netlify Scheduled Function 保留为云端第二阶段的唤醒器。

## 5. 推荐目标架构

### 5.1 唯一生产入口

新增一个一次性命令，语义建议为：

```text
x-news-agent run-due
```

它只做以下步骤：

1. 读取非敏感 schedule 配置和本机密钥；
2. 自检 Node、SQLite、Mind、Horizon 和至少一个真实来源；
3. 用 SQLite 事务领取 `nextRunAt <= now` 的任务；
4. 从现有 checkpoint 恢复并执行一轮；
5. 写入结果、下一运行时间和退出码；
6. 退出进程。

不要让 Windows action 调用 `pnpm dev` 或 HTTP URL。生产包应调用固定 Node 可执行文件和已构建 CLI 文件，并设置明确的绝对工作目录；这样浏览器、Next.js、端口 3000 都与定时运行无关。

### 5.2 调度事实与幂等

建议保留 SQLite 为业务事实来源：

- OS Task Scheduler 只负责“叫醒”；
- `daily_follow_up_job.nextRunAt` 记录计划时刻；
- 幂等键使用 `scheduleId + scheduledFor`；
- `BEGIN IMMEDIATE` 原子领取；
- 成功、Mind 合法 `skip`、失败分别落账；
- OS 因失败重启 CLI 时，同一个 `scheduledFor` 只能恢复或重试，不能生成第二份草稿。

在任务表增加：`scheduleId`、`timezone`、`scheduledFor`、`ownerId`、`leaseUntil`、`heartbeatAt`、`attempt`、`nextRetryAt`、`lastExitCode`。领取后每 20–30 秒续租；CLI 崩溃且租约过期后，新进程可回收并从 checkpoint 恢复。

`skip` 是 Mind 的正常自主决策：允许 `requestedDraftCount = 0`，记录 `outcome=skipped` 和理由，CLI 返回成功退出码。只有 schema 非法、未知记忆 ID、网络/服务错误才进入失败处理。

### 5.3 每天 10:00 的时间语义

首版明确为：**目标电脑当前时区的每天 10:00**。安装器应显示并记录 Windows 时区；用户当前环境是 `Asia/Shanghai`，Windows 通常显示为 `China Standard Time`。如果目标必须永远是“北京时间 10:00”，安装器发现主机不是中国标准时间时应停止并提示，而不是悄悄按当地 10:00 运行。

内部不能再只用 `Date.setHours()` 默认为所有机器都处于正确时区。schedule 配置至少保存：

```ts
{
  localTime: "10:00",
  timezone: "Asia/Shanghai",
  platform: "xiaohongshu",
  enabled: true
}
```

验收应覆盖跨午夜、手动修改系统时区、电脑在 10:00 关机后启动、同一日重复唤醒等情况。中国标准时间没有夏令时；未来支持其他地区时再加入经过验证的 IANA 时区计算库，避免首版自写复杂 DST 算法。

### 5.4 退出码契约

建议固定退出码，供 Task Scheduler 和日志判断：

| 退出码 | 含义 | 系统动作 |
| --- | --- | --- |
| `0` | 完成、Mind 合法 skip、或没有到期任务 | 不重试 |
| `2` | 配置/密钥缺失、schema 不兼容 | 终止并提示用户修复 |
| `10` | 网络、Mind/Horizon 超时等可重试错误 | Task Scheduler 10 分钟后重启，最多 3 次 |
| `20` | 数据损坏、未知记忆 ID、安全校验失败 | 停止自动运行，保留审计证据 |

应用内重试与系统重启不能同时无限循环。首版让 SQLite 记录 attempt，Task Scheduler 只提供有限次数的进程级重启。

### 5.5 密钥管理

当前本机 `runtime-config.json` 是明文 JSON。首版执行前应拆分：

- `config/agent.json`：10:00、时区、平台、来源 ID、阈值等非敏感配置，可进入便携模板；
- `data/agent-secrets.dat`：Minds、Horizon、X 和私有来源密钥，Windows 使用 CurrentUser DPAPI 加密；
- SQLite：只保存 `configured=true` 和凭证引用，不保存密钥正文；
- 日志：禁止输出 Authorization、API Key、完整请求正文和本机用户目录。

微软 DPAPI 通常只有同一台电脑、同一登录账号可解密，这很适合“计划任务用当前用户运行”；也意味着便携包搬到另一台电脑后必须重新配置密钥，不能复制加密文件冒充可用。[CryptProtectData 官方文档](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)

仓库中已安装的 `@animocabrands/minds-client-lib@0.1.3` 的本地 package manifest 标记为 `UNLICENSED`。它已经是当前项目依赖，本轮不扩大使用范围；在公开发行便携包前应单独向 Minds 核验再分发条款。该事项不影响“源代码仓库引用 npm 依赖”，但不能默认等同于 MIT 开源代码。

### 5.6 CLI 构建与分发技术栈对比

现有 [`tsconfig.json`](../../tsconfig.json) 是为 Next.js 准备的：`noEmit: true`、`moduleResolution: "bundler"`，并把 `@/*` 映射到 `./src/*`。CLI 不能直接假设 Next bundler 会替它解析这些 import。

| 方案 | Node 22 与 `@/` alias | Windows 便携包 | 体积与启动 | 维护成本 | 判断 |
| --- | --- | --- | --- | --- | --- |
| **tsx 直接运行源码** | tsx 增强 Node 执行 TS，官方支持 `tsconfig.json` paths；可直接复用 `@/` | 必须随包携带 TS 源码、tsx/esbuild 运行依赖和较完整 `node_modules`；Task action 还需稳定找到 tsx | 无预构建，首次/每次启动都转译；对每日一次通常可接受，但发布内容更大 | 开发体验最好；生产多一层运行时 loader，类型检查仍需另跑 `tsc --noEmit` | **只用于开发和 smoke test** |
| **独立 `tsc` 编译** | 当前 `paths` 只帮助类型解析，TypeScript 官方明确它不会改写 emit；产物仍含 `@/...`，Node 会运行失败。必须把 CLI 依赖图改成相对 import、Node `imports`，或再加 alias 重写步骤 | 产出多文件 JS；仍需复制 production `node_modules`、资源和 sourcemap | 没有 bundler，构建依赖最少；文件多但可调试性好 | 需要维护 `tsconfig.agent.json`、NodeNext/ESM 后缀规则和 alias 策略；容易与 Next 配置分叉 | 若全项目先完成 import 规范化可选；当前不是最短路径 |
| **tsup 单文件打包** | 基于 esbuild，通常能处理 tsconfig alias | 配置简短，可产出单/少量 JS | 快，产物小 | tsup 官方仓库已明确“不再积极维护”，建议迁移 tsdown；为一个 CLI 引入停更封装不划算 | **不采用** |
| **直接 esbuild 打包** | esbuild 官方支持读取 TS、`platform=node`、bundle、tsconfig paths/alias；可把 `@/` 编入产物 | 可生成一个第一方 CLI JS，Task Scheduler 只调用 Node + 该文件；外部资源/Horizon 仍按目录携带 | 构建快、入口集中；可按包选择 bundle/external | 新增一个活跃、MIT 的 dev dependency和一份很小 build script；仍必须独立运行 `tsc --noEmit` | **生产便携包推荐** |

一手依据：

- tsx 官方称其为 Node 的 TypeScript enhancement，支持 CJS/ESM、`tsconfig.json` paths 和 watch；它是 MIT。[tsx 官方文档](https://tsx.is/)、[tsx 官方仓库文档](https://github.com/privatenumber/tsx/blob/master/docs/index.md)
- Node 自带 TypeScript type stripping 不读取 `tsconfig.json`，因此不支持 `paths`；同时不做类型检查，不能替代本项目的构建流程。[Node.js TypeScript 文档](https://nodejs.org/api/typescript.html)
- TypeScript 官方明确：`paths` 不改变 `tsc` 输出的 import path，映射必须由 runtime 或 bundler 实现。[TypeScript Modules Reference](https://www.typescriptlang.org/docs/handbook/modules/reference#paths-does-not-affect-emit)
- esbuild 的 `platform=node` 会自动 externalize Node built-ins，bundle 时支持 TypeScript path remapping；也允许将指定 npm 包标为 external。[esbuild API](https://esbuild.github.io/api/)
- tsup 官方仓库现已显示“不再积极维护”，并建议考虑 tsdown。[tsup 官方仓库](https://github.com/egoist/tsup)

推荐的生产组合是：

```text
开发/测试：tsx src/agent/main.ts ...
类型检查：tsc --noEmit
发布构建：esbuild src/agent/main.ts --bundle --platform=node → dist/agent/cli.mjs
计划任务：固定 node.exe + dist/agent/cli.mjs run-due
```

这里的“单文件”只指第一方 Node CLI 入口。Horizon 的 Python runtime、配置模板、SQLite 数据目录和必须 external 的 npm 包仍是独立受控目录，不能为了表面上的一个文件把 Python 二进制或许可证不明的依赖硬塞进 bundle。尤其 `@animocabrands/minds-client-lib` 应先核验再分发条款，再决定 external 还是随包交付。

esbuild 只转译/打包，不做完整 TypeScript 类型检查，所以 `pnpm typecheck`、测试和生产 smoke 必须保留。为避免打包进 Next/React 页面代码，CLI 入口只能依赖 `core`、`adapters`、`server` 中的纯 Node 模块，不能 import `src/app`。

## 6. Windows 任务的目标配置（确认后才实施）

建议注册名：`X News Toolbox Agent - Daily 10AM`。

| 项目 | 建议值 | 原因 |
| --- | --- | --- |
| Trigger | Daily，10:00，本机中国标准时间 | 满足用户时间要求 |
| Action | 固定 Node 路径 + 构建后的 `x-news-agent` + `run-due` | 不依赖 PATH、pnpm、网站和端口 |
| Working directory | 项目/便携包绝对根目录 | SQLite、Horizon 和配置路径稳定 |
| StartWhenAvailable | true | 电脑关机/睡眠错过后补跑 |
| MultipleInstancesPolicy | IgnoreNew | 防止上一轮未完成时重叠 |
| RestartOnFailure | 10 分钟，最多 3 次 | 覆盖短暂网络/Mind/Horizon 故障 |
| RunOnlyIfNetworkAvailable | true | Mind 和真实来源都需要网络 |
| WakeToRun | 可选，默认 false | 笔记本不应未经用户选择自动唤醒 |
| StopIfGoingOnBatteries | false（由用户确认） | 避免切换电池时中止长任务 |
| Run account | 配置密钥的同一 Windows 用户 | CurrentUser DPAPI 才能解密 |
| Log | `logs/agent-YYYY-MM-DD.jsonl`，脱敏 | 无网页时仍可定位问题 |

安装和卸载属于系统状态变更，必须由用户明确执行。安装脚本应先预览任务 XML/参数，再注册；卸载只删除一个明确任务名，不删除数据库、日志或用户草稿。

## 7. 分阶段落地计划

### 阶段 A：抽出一次性 CLI（最小可用）

1. 抽出 `AgentRunner.runDue()`，复用 `createAppDesk()` 和现有 store/adapter。
2. 使用 Node 标准库 `util.parseArgs` 解析 `run-due`、`status`、`validate`、`run-now`，首版不引入 Commander/Yargs。
3. 开发运行使用 tsx；生产使用直接 esbuild 生成 `dist/agent/cli.mjs`，并保留独立 `tsc --noEmit` 类型检查。不采用已停更的 tsup。
4. 让 Next.js 停止自动调用 `startFollowUpWorker()`；页面如保留，只读同一 SQLite 状态。
5. 修复合法 `skip=0`、10:00 配置和稳定 `creator-main` 会话。

验收：关闭浏览器、Next.js 和端口 3000，手动运行 CLI 仍能完成一次真实 `scan` 或合法 `skip`，且写入 SQLite。

### 阶段 B：可靠运行与恢复

1. 增加 schedule/run 幂等键、租约、heartbeat、attempt 和 retry 分类。
2. collecting、ranking、drafting 各阶段崩溃后从 checkpoint 恢复；Mind 超时不重复抓取。
3. 增加退出码、JSONL 日志和 `status --json`。
4. 明确 synthetic/demo 数据永远不能进入真实自动任务。

验收：分别在采集、Mind 排序和写作阶段强制终止进程；下一次运行回收租约，只恢复缺失阶段，不生成重复草稿。

### 阶段 C：Windows 10:00 安装器

1. 提供 `install-schedule.ps1 --time 10:00 --timezone Asia/Shanghai --preview`。
2. 用户确认后注册唯一任务，启用 `StartWhenAvailable`、`IgnoreNew` 和有限失败重启。
3. `verify-schedule.ps1` 读取 Task Scheduler 状态、下一次运行、上次退出码，并对照 SQLite。
4. 提供只移除该明确任务名的卸载命令；不碰数据文件。

验收：网站关闭时由测试 trigger 启动 CLI；确认进程、Mind decision ID、checkpoint、最终 outcome 和下一次 10:00 全部一致。随后再观察一次真实自然到点运行。

### 阶段 D：密钥和便携包

1. 非敏感配置与 secrets 分离；Windows secrets 使用 CurrentUser DPAPI。
2. 新电脑首次运行必须重新输入密钥，不能把原机密钥打包。
3. 固定 Node 和 Horizon 版本，action 使用相对安装根解析后的绝对路径。
4. 便携包排除 `.env*`、runtime config、SQLite、日志、outbox 和任何真实 API 响应。

验收：在第二台 Windows 电脑解压后无需安装网页服务；完成一次本机配置后，任务计划可运行。复制第一台电脑的 DPAPI 文件不能解密，并给出明确提示。

### 阶段 E：Linux/云端扩展（有真实需求再做）

1. VPS 使用 systemd `.timer` + `.service`，仍调用同一 `run-due`。
2. 只有用户要求电脑关机时仍准点，才迁移到持续在线主机。
3. 只有出现多用户、多 worker 和大量并发任务，才评估 BullMQ + Redis。
4. 只有出现跨数日流程、复杂补偿、跨服务可靠状态机，才评估 Temporal。
5. GitHub Actions 只作为无本地持久状态的 smoke/备用触发；若要生产运行，先迁移 SQLite 和 outbox。
6. 已部署 Netlify 可增加 UTC 02:00 Scheduled Function 作为云端唤醒桥；在迁移 PostgreSQL 和把 Horizon 独立成 HTTPS worker 之前，不承载完整 Agent。

## 8. 测试矩阵

| 场景 | 预期结果 |
| --- | --- |
| 网站、浏览器、端口 3000 全关闭 | 10:00 仍启动 CLI |
| 10:00 电脑关机，10:35 开机 | `StartWhenAvailable` 补跑同一个 `scheduledFor`，不伪装成 10:35 新任务 |
| 10:00 已有上一实例运行 | `IgnoreNew` + SQLite 幂等阻止重叠 |
| CLI 在 collecting 后崩溃 | 租约过期后从 checkpoint 恢复，不重复采集 |
| Mind 返回 `skip, requestedDraftCount=0` | 记录正常 skipped，退出码 0，不生成草稿 |
| Mind 返回未知 `usedMemoryIds` | 安全失败，退出码 20，不采用结果 |
| Mind/Horizon 超时 | 退出码 10，10 分钟后有限重试 |
| 密钥缺失或 DPAPI 用户不匹配 | fail closed，退出码 2，不进入 demo |
| 同一天手动重复运行 `run-due` | 返回无到期任务或重复，不新增草稿 |
| 主机时区不是中国标准时间 | 安装/验证失败并明确提示，不静默漂移 |
| 真实运行完成 | SQLite 含 source URL、Mind decision ID、conversation alias、checkpoint、outcome 和下一次 10:00 |

## 9. 最终推荐

本轮确认后实施的顺序应是：

1. **先完成阶段 A + B**：让 CLI 真正独立、可恢复、可审计；
2. **再完成阶段 C**：注册 Windows 每天 10:00 的系统唤醒；
3. **最后完成阶段 D**：密钥安全与跨电脑便携；
4. systemd、GitHub Actions、BullMQ、Temporal 暂不进入比赛版依赖。

一句话判断：

> Windows Task Scheduler 解决“网站不持续运行就无人唤醒”，SQLite 解决“重复、崩溃和恢复”，Mind 解决“是否做、做什么、如何写和如何学习”。三者职责分开，既可靠，也最能证明 Mind 不可替代。

## 10. 一手来源

- [Minds CLI 官方文档](https://build.hellominds.ai/en/docs/get-started/cli)
- [Minds Client Library 官方文档](https://build.hellominds.ai/en/docs/get-started/client-library)
- [Microsoft：Register-ScheduledTask](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/register-scheduledtask?view=windowsserver2025-ps)
- [Microsoft：New-ScheduledTaskTrigger](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasktrigger?view=windowsserver2025-ps)
- [Microsoft：StartWhenAvailable](https://learn.microsoft.com/en-us/windows/win32/taskschd/tasksettings-startwhenavailable)
- [Microsoft：MultipleInstancesPolicy](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-multipleinstancespolicy-settingstype-element)
- [Microsoft：Task Scheduler settings schema](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskschedulerschema-settingstype-complextype)
- [Microsoft：DPAPI CryptProtectData](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata)
- [systemd.timer(5)](https://www.man7.org/linux/man-pages/man5/systemd.timer.5.html)
- [crontab(5)](https://man7.org/linux/man-pages/man5/crontab.5.html)
- [node-cron Scheduling Options](https://www.nodecron.com/scheduling-options.html)
- [Bree 官方仓库](https://github.com/breejs/bree)
- [GitHub Actions schedule 官方文档](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [GitHub Actions Secrets 官方文档](https://docs.github.com/en/actions/concepts/security/secrets)
- [Netlify Scheduled Functions 官方文档](https://docs.netlify.com/build/functions/scheduled-functions/)
- [Netlify Background Functions 官方文档](https://docs.netlify.com/build/functions/background-functions/)
- [Netlify Functions 配置与资源上限](https://docs.netlify.com/build/functions/configuration/)
- [Netlify Functions 环境变量](https://docs.netlify.com/build/functions/environment-variables/)
- [BullMQ 官方文档](https://docs.bullmq.io/)
- [BullMQ Job Schedulers](https://docs.bullmq.io/guide/job-schedulers)
- [Temporal Schedule 官方文档](https://docs.temporal.io/schedule)
- [Temporal TypeScript SDK 官方仓库](https://github.com/temporalio/sdk-typescript)
- [tsx 官方文档](https://tsx.is/)
- [TypeScript Modules Reference](https://www.typescriptlang.org/docs/handbook/modules/reference)
- [esbuild API](https://esbuild.github.io/api/)
- [tsup 官方仓库](https://github.com/egoist/tsup)

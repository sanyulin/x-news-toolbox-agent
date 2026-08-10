# X News Toolbox：真实信息源接入轮子与安全实现方案

> 调研日期：2026-08-09
> 范围：RSS / Atom / JSON Feed / 通用 JSON API、SSRF 与 DNS 重绑定防护、重定向、抓取可靠性
> 依据：仅采用项目 GitHub 仓库、源码、许可证及 Node.js / IANA 官方文档。本文只给方案，不修改产品代码。

## 结论先行

当前最合适的路线不是引入一套完整聚合器，而是保留现有 Next.js 16 + TypeScript + `node:sqlite` 工作台，复用三类成熟做法：

1. 用 **Miniflux 的安全边界**设计统一出站客户端：私网判断必须发生在实际建连时，DNS 解析结果必须固定给该次连接，且每个重定向目标都重新校验。Miniflux 2.2.18 明确修复了“预检查后再次解析”的 SSRF TOCTOU / DNS rebinding，并把防护覆盖到重定向目标。[Miniflux 2.2.18 发布说明](https://github.com/miniflux/v2/releases/tag/2.2.18)
2. 用 **Huginn / Miniflux 的任务模型**管理多个来源：逐来源隔离失败、保存游标与最近成功状态、去重、条件请求、限流和退避，而不是一次无界 `Promise.all`。
3. 用 **`@extractus/feed-extractor` 的纯解析入口**替换当前正则 XML 解析：只调用 `extractFromXml()` / `extractFromJson()` 解析已经由安全客户端取回的正文，不调用库自带的 `extract(url)`，避免出现第二套不受控网络栈。[feed-extractor README](https://github.com/extractus/feed-extractor)

`198.18.0.0/15` 不能当成“公网白名单”。IANA 将其登记为 Benchmarking，且 `Globally Reachable = False`。[IANA IPv4 Special-Purpose Address Registry](https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml) 在当前环境里它应被分类为“代理生成的传输别名”，而不是“已验证公网地址”。最稳妥的兼容策略是：

- 首选“独立可信解析器得到真实公网 IP + 建连时固定该 IP”；
- 如果必须走 fake-IP 代理，则必须显式进入 `trusted-proxy` 模式，并让可信出站代理在最终解析和拨号处执行相同的私网拦截与地址固定；
- 两条安全路径都不可用时失败关闭，给出可操作的网络配置提示，不能退化为关闭 SSRF 检查。

## 当前项目的关键差距

当前代码已经做了 HTTPS、localhost、常见 IPv4 私网和 DNS 结果检查，这是正确起点。但还存在四个结构性问题：

- 路由层先 `dns.lookup()`，随后适配器再用全局 `fetch()`；二者会发生两次解析。攻击者可在两次解析之间改变结果，这就是 DNS rebinding / TOCTOU。
- 只要发现任意代理环境变量，就允许 `198.18/15`，但这并不能证明实际 `fetch()` 一定使用该代理，也不能证明代理最终不会访问私网。
- 当前 `redirect: "error"` 能避免重定向绕过，却会拒绝大量合法的域名规范化、FeedBurner、CDN 或站点迁移跳转。
- RSS / Atom 仍用正则提取。命名空间、相对 URL、CDATA、编码、RDF、Atom link 属性和恶意 XML 都会造成漏读或错误解析；通用 JSON API 与 JSON Feed 也尚未被明确区分。

Node.js 官方直到 v24.0.0 才加入 `NODE_USE_ENV_PROXY=1`，`--use-env-proxy` 在 v24.5.0 加入；本项目只要求 Node `>=22`，因此“存在 `HTTP_PROXY` / `HTTPS_PROXY`”不等于内置 `fetch()` 会走代理。[Node.js CLI 文档](https://nodejs.org/api/cli.html#node_use_env_proxy1) 若要跨 Node 22/24 稳定工作，应把 `undici` 作为显式依赖，并为每次请求显式传入 Dispatcher，而不是依赖环境隐式行为。[Undici EnvHttpProxyAgent](https://github.com/nodejs/undici/blob/main/docs/docs/api/EnvHttpProxyAgent.md)

## 六个开源项目比较

| 项目 | 功能与架构 | 技术栈 / 许可证 / 活跃度 | 可复用部分 | 优点 | 缺点与当前项目兼容性 |
|---|---|---|---|---|---|
| [Miniflux](https://github.com/miniflux/v2) | 完整 Feed Reader；支持 Atom 0.3/1.0、RSS 1/2、JSON Feed 1/1.1；后台调度、条件请求、内容清洗、REST API。 | Go 单体静态二进制 + PostgreSQL；Apache-2.0；2.3.3 于 2026-07-24 发布。[2.3.3](https://github.com/miniflux/v2/releases/tag/2.3.3) | 出站 HTTP client、连接时私网拦截、重定向逐跳校验、ETag / Last-Modified / Cache-Control、调度与健康状态。相关实现见 [request_builder.go](https://github.com/miniflux/v2/blob/3b5a7ee47bb1605e49c59b49075b74fc6e501af3/internal/reader/fetcher/request_builder.go#L153-L257) 和 [client.go](https://github.com/miniflux/v2/blob/3b5a7ee47bb1605e49c59b49075b74fc6e501af3/internal/http/client/client.go#L20-L74)。 | 安全与可靠性证据最强；项目明确处理 TOCTOU、重定向目标、CGNAT 等边界；轮询语义成熟。 | Go + PostgreSQL，不能作为现有 Next/node:sqlite 的轻量依赖；适合借鉴设计和测试用例，不适合嵌入整套系统。 |
| [FreshRSS](https://github.com/FreshRSS/FreshRSS) | 多用户 RSS 聚合器；WebSub；XPath 网页抓取；JSON 文档；扩展系统。 | PHP 8.1+，cURL、DOM/XML、SQLite/Postgres/MySQL；AGPL-3.0；1.29.1 于 2026-05-20 发布。[Releases](https://github.com/FreshRSS/FreshRSS/releases) | 来源发现、WebSub、标签和来源管理 UX、SQLite 数据模型、网页无 Feed 时的 XPath 兜底思路。 | 产品功能完整，弱服务器也能运行，来源管理经验丰富。 | 技术栈不兼容；AGPL 不适合直接搬入当前产品。其 SSRF `CURLOPT_RESOLVE` 方案截至调研时仍是“mostly untested”的 Draft PR，且评审指出 IPv4、重定向 Cookie 等未决问题，不能作为已成熟安全轮子。[PR #8400](https://github.com/FreshRSS/FreshRSS/pull/8400) |
| [RSSHub](https://github.com/DIYgod/RSSHub) | 把大量网站和 API 转换为 RSS；路由、缓存、限流、代理、正文抓取、统一输出。 | TypeScript / Node，Hono、Undici、rss-parser、Redis 等；AGPL-3.0；主分支 2026-08-06 仍有多次提交。[Commits](https://github.com/DIYgod/RSSHub/commits/master/) [package.json](https://github.com/DIYgod/RSSHub/blob/master/package.json) | 来源适配器/路由的组织方法、缓存键、失败降级；可把独立 RSSHub 实例当作一个外部 RSS 来源。 | 覆盖网站多、社区活跃，能显著扩大“无原生 Feed”网站的可接入范围。 | 依赖树大、站点路由易随页面/API 变化；AGPL 使内嵌和复制有合规成本。最适合作为可选外部服务，不适合成为本项目核心依赖或 SSRF 安全边界。 |
| [Huginn](https://github.com/huginn/huginn) | Agent 以有向图消费和产生 Event；可监测 RSS、网页、API，并把事件传给下游动作。 | Ruby on Rails + MySQL/PostgreSQL；MIT；2026-08-08 仍有提交。[Commits](https://github.com/huginn/huginn/commits/master/) | `RSSAgent` 支持多个 URL、逐来源错误隔离、`remembered_id_count` 去重、`max_events_per_run`、工作状态；见 [rss_agent.rb](https://github.com/huginn/huginn/blob/master/app/models/agents/rss_agent.rb)。 | 最适合借鉴“多个输入 → 标准事件 → 下游 Agent”的领域模型，与 X News Toolbox 的工作台方向一致。 | Ruby/Rails 不可直接复用；网络层没有像 Miniflux 2.2.18 那样清晰的现代 SSRF 证据，不能照搬请求实现。 |
| [`@extractus/feed-extractor`](https://github.com/extractus/feed-extractor) | 把 RSS、Atom、RDF、JSON Feed 归一为 feed + entries；同时提供网络入口和纯正文解析入口。 | JavaScript ESM，Node >=20；MIT；当前仓库约 294 次提交，包元数据为 7.2.1。[package.json](https://raw.githubusercontent.com/extractus/feed-extractor/main/package.json) | 只复用 `extractFromXml` / `extractFromJson`；使用 `baseUrl`、条目扩展字段与描述长度限制。 | 与 Next 16 / TS / Node 22 直接兼容；能用很少代码替换脆弱正则解析。 | `extract(url)` 自己发网络请求且默认无超时，不应使用；它识别的是标准 JSON Feed，不会自动理解任意业务 JSON API，后者仍需显式字段映射。 |
| [`fast-xml-parser`](https://github.com/NaturalIntelligence/fast-xml-parser) | 通用 XML 验证、解析和构建；同时支持 ESM/CJS。 | JavaScript；MIT；5.10.1 于 2026-07-17 发布。[Releases](https://github.com/NaturalIntelligence/fast-xml-parser/releases) | XML 大小/实体/嵌套限制、危险属性处理；可作为低层解析器或 feed-extractor 的受控基础。 | 活跃、轻量、可精细控制；2026 年版本持续强化实体展开、最大嵌套和原型污染防护。[CHANGELOG](https://github.com/NaturalIntelligence/fast-xml-parser/blob/master/CHANGELOG.md) | 只把 XML 变成对象，不负责 RSS/Atom 各版本归一、相对链接、日期和 canonical ID；直接使用会留下较多自定义代码。首版优先 feed-extractor，除非需要极细的解析控制。 |

### 明确不选的“安全轮子”

不建议把 [`ssrf-req-filter`](https://github.com/y-mehta/ssrf-req-filter) 作为核心防线。它围绕传统 Node `http.Agent` / `https.Agent` 和 axios/node-fetch 设计，README 还要求同时配置两个 Agent 以防跨协议重定向绕过；这与 Next 16 的全局 Fetch / Undici Dispatcher 不是同一抽象。安全关键路径宁可做一个小而可审计的统一出站模块，也不要叠加一个无法覆盖实际连接的过滤层。

## 198.18/15 环境下的三套安全方案

### 方案 A：独立可信 DNS + 直连地址固定（安全性最高，首选）

流程：

1. 解析和规范化 URL，限制为 HTTPS，禁止用户信息、异常端口、localhost / `.local`、IP 字面量中的非公网段。
2. 不使用返回 fake-IP 的系统解析器；通过独立、显式配置的可信 DNS resolver 查询 A 和 AAAA。Node 的 `dns.Resolver` 可以为该实例单独设置 DNS 服务器，不影响系统全局解析。[Node.js DNS 文档](https://nodejs.org/api/dns.html#class-dnsresolver)
3. 检查全部候选地址；任何私网、链路本地、回环、CGNAT、文档网段、benchmark、组播、保留地址都不能进入可拨号集合。`198.18/15` 仍保持为 reserved/synthetic，不转成 public。可借鉴 [`ipaddr.js` 的 range 分类表](https://github.com/whitequark/ipaddr.js/blob/master/lib/ipaddr.js#L168-L206)，避免遗漏 IPv4-mapped IPv6 和非规范写法。
4. 把选定的已批准地址交给 Undici 的该次连接，而 TLS SNI、证书校验和 HTTP Host 仍使用原始域名。Undici Client 支持自定义 `connect.lookup`，也支持自定义 Connector。[Client options](https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md#L184-L194) [Connector](https://github.com/nodejs/undici/blob/main/docs/docs/api/Connector.md)
5. `redirect: "manual"`，每一跳从第 1 步重做；最多 3 跳，拒绝 HTTPS 降级 HTTP、循环跳转和跨源携带 Authorization/Cookie。

优点：检查的 IP 就是 socket 实际连接的 IP，真正消除二次 DNS；不需要信任本地 fake-IP 映射。缺点：如果网络强制所有流量走代理，直连可能失败；普通 UDP/TCP DNS 也可能被网络拦截，此时需使用有认证的 DoH/DoT resolver 或转方案 C。

### 方案 B：显式可信代理 + 代理端最终校验（最适合强制代理环境）

`198.18/15` 只表示本机代理的传输别名。应用不能据此证明目标是公网。因此必须满足：

- 运行配置明确选择 `trusted-proxy`，不能仅凭发现环境变量自动进入；
- 应用显式用 Undici `ProxyAgent` / `EnvHttpProxyAgent`，从而能证明请求确实经过该代理；[ProxyAgent](https://github.com/nodejs/undici/blob/main/docs/docs/api/ProxyAgent.md)
- 代理或独立 egress gateway 在最终 DNS 解析后执行私网/特殊地址拒绝，并把批准地址固定到实际连接；
- `NO_PROXY` 不得让用户来源绕过代理；代理端同样逐跳校验重定向，或由应用逐跳发起新 CONNECT；
- 代理地址、证书和凭据必须来自本地受信配置，不能由请求参数指定。

优点：兼容系统 DNS 全部返回 198.18/15、且网络不允许直连的环境。缺点：Undici 对 HTTPS 代理通常以原始主机名建立 CONNECT，应用侧看不到代理最终解析出的 IP；如果代理本身没有 SSRF ACL，这套方案并不安全。也就是说，安全边界被明确移到了代理，而不是由应用“猜测代理是安全的”。

### 方案 C：独立出站抓取网关（部署边界最清楚）

把 URL 解析、DNS、地址分类、connection pinning、重定向、响应大小和超时全部放进一个专用 fetch gateway。Next.js 只向固定 gateway 地址提交待取 URL，并接收受限正文和响应元数据。

优点：无论 Windows 本机 DNS 是否 fake-IP，安全职责只有一个位置；以后部署到其他电脑也容易保持一致。缺点：多一个进程或服务，要管理 token、更新、日志和隐私；如果使用远程网关，还会增加费用、延迟和数据外发。它适合团队/线上部署，不是首版便携版的第一选择。

### 推荐决策

采用“**A 为默认，B 为显式兼容模式，C 为后续部署选项**”的双通道 SafeFetch：

- 启动时做能力检测：系统 DNS 是否返回 synthetic 地址、独立 resolver 是否可用、显式代理能否连通；只报告能力，不根据单个环境变量放宽安全策略。
- 能直连时走 A；系统 DNS 返回 198.18 但独立可信解析可获得公网地址时，仍走 A。
- 直连被网络策略阻断时，只在用户明确配置了受信代理且代理具备最终目的地址 ACL 时走 B。
- 两者都不满足时返回“当前网络环境无法安全抓取”，并说明应配置可信 DNS/代理；绝不把 198.18 直接加入公网范围。

方案 B 有一个不可省略的验收条件：用一个可控测试域名依次返回公网、127.0.0.1、RFC1918、IPv4-mapped IPv6，并验证代理最终全部拦截非公网结果。没有这项证据，B 只能标记为“不受支持”。

## 推荐的来源接入架构

```text
来源配置（RSS / Atom / JSON Feed / 通用 JSON API）
        ↓
SourceScheduler（并发上限、退避、按来源隔离）
        ↓
SafeFetch（URL 规范化、DNS/代理模式、连接固定、逐跳重定向、超时/字节上限）
        ↓
ParserAdapter
  ├─ XML Feed → feed-extractor.extractFromXml
  ├─ JSON Feed → feed-extractor.extractFromJson
  └─ 通用 JSON API → 用户字段映射 + Zod 校验
        ↓
NormalizedSignal（统一标题、摘要、作者、URL、时间、来源、原始 ID）
        ↓
node:sqlite（条目去重、ETag、Last-Modified、健康状态、下次执行时间）
```

关键接口应保持小而明确：

- `SafeFetch.fetch(url, policy)`：唯一允许访问用户提供 URL 的位置；其他模块不得直接用全局 `fetch`。
- `SourceAdapter.fetch(source, checkpoint)`：每个来源只负责请求参数和格式解释。
- `ParseResult`：区分 `rss_atom`、`json_feed`、`mapped_json`，不再用“正文看起来以 `{`/`[` 开头”猜业务语义。
- `SourceHealth`：保存 `lastSuccessAt`、`lastErrorCode`、`consecutiveFailures`、`nextAttemptAt`、`etag`、`lastModified` 和最近一次重定向后的 canonical URL。

## 抓取可靠性基线

这些能力应在首个正式版本一次纳入，因为缺一项都会直接影响“真实可运行”：

- 重定向：`manual`，最多 3 跳；每跳完整 SSRF 校验和地址固定；跨 origin 删除 Authorization、Cookie 和自定义敏感头；拒绝 HTTPS → HTTP。
- 超时：连接、响应头、正文和总时限分开；用户取消时传播 AbortSignal。
- 响应大小：先检查 `Content-Length`，流式读取时再次累计，正文建议上限 2–5 MiB；解压后的大小也必须受限。
- 类型：允许标准 Feed/XML/JSON 类型，同时有限度 sniff；HTML 页面只进入明确的“Feed discovery”流程，不把登录页当 Feed。
- 条件请求：保存并发送 ETag / If-None-Match、Last-Modified / If-Modified-Since，正确处理 304。Miniflux 已把这些列为基础行为。[Miniflux README](https://github.com/miniflux/v2#technical-stuff)
- 重试：仅对幂等 GET 的连接失败、408、429、部分 5xx 做指数退避 + jitter；尊重 Retry-After；普通 4xx 不重试。
- 并发：全局与单域名分别限流；来源失败互不影响，避免当前无界 `Promise.all` 同时打满目标站点。
- 去重：优先标准 entry ID / GUID，其次 canonical URL，最后正文稳定哈希；SQLite 建唯一键，保留 Huginn 的有限 seen-ID 思路而不是无限增长。
- XML 安全：限制实体数、实体展开长度、嵌套深度、条目数和单条内容长度；不执行外部实体或脚本；渲染前继续做 HTML 清洗。
- 可观测性：UI 的连接状态按来源显示“正常 / 限流 / 解析失败 / DNS 被拦截 / 代理未受信 / 等待重试”，不要统一显示“来源不可用”。

## 分阶段实现建议（确认后再开工）

### 阶段 1：先修网络安全边界

- 建立单一 SafeFetch，并让来源测试与正式抓取走同一条路径。
- 实现方案 A；增加显式 `direct` / `trusted-proxy` / `gateway` 模式和启动能力检测。
- 手动重定向、连接地址固定、IPv4/IPv6 全范围分类、敏感头剥离、大小/超时限制。
- 用可控 DNS 与本地 HTTP/TLS 测试服务覆盖 DNS rebinding、重定向到内网、混合 A/AAAA、IPv4-mapped IPv6、198.18 synthetic alias。

### 阶段 2：替换 Feed 解析并增加真实 JSON

- 引入 `@extractus/feed-extractor`，仅使用纯解析 API。
- 标准 JSON Feed 走标准解析；通用 JSON API 必须选择数组路径，并分别配置 title/url/summary/publishedAt 映射，由 Zod 校验结果。
- 保存 ETag、Last-Modified、最终 canonical URL 与解析格式。

### 阶段 3：可靠调度与工作台状态

- SQLite 增加来源 checkpoint / health；加入并发上限、单域限流、退避和 304。
- 每个来源独立运行和重试，结果合并前做稳定去重。
- 状态栏暴露可诊断错误，但不泄露代理凭据、完整内网地址或响应正文。

## 最终选型清单

- **直接依赖**：`@extractus/feed-extractor`；显式版本的 `undici`。
- **按需依赖或标准库实现**：IP 规范化可采用小型、成熟的 `ipaddr.js`，或用 Node 标准库实现并用 IANA 全表测试；前者更不易漏掉 IPv4-mapped IPv6，后者依赖更少。
- **外部可选服务**：RSSHub，只作为一个受控 RSS 来源；不嵌入、不复制 AGPL 路由代码。
- **设计参考**：Miniflux 的安全出站与条件请求；Huginn 的多来源事件和 checkpoint；FreshRSS 的来源管理 UX。
- **不采用**：把 FreshRSS / Huginn / Miniflux 整体塞进便携版；把 RSSHub 作为核心依赖；用 `ssrf-req-filter` 替代 Undici 连接级安全；把 198.18/15 直接标记成公网；自动跟随重定向；在路由预检后再次由全局 fetch 自由解析。

## 仍需确认的两个环境事实

开工前只需确认：

1. 当前生成 198.18/15 的本地代理是否暴露标准 HTTP(S) CONNECT 端口，并能配置“最终目标为私网/特殊地址时拒绝”；
2. 便携版是否允许配置一个独立可信 DNS / DoH 地址。

若第 1 项不能证明安全、但第 2 项可用，则直接走方案 A；若两项都不可用，建议采用方案 C，而不是降低 SSRF 标准。

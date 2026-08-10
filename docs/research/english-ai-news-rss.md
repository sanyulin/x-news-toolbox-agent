# 英文 AI 新闻 RSS 推荐与实测

验证日期：2026-08-10（Asia/Shanghai）

## 结论

以下 6 个来源均为英文、免费、无需登录或 API Key 的官方 RSS 2.0 Feed。实测时均返回 HTTP `200`，能匿名下载并解析出近期条目，且 MIME 类型都在 X News Toolbox 当前 RSS 读取器接受范围内（`application/rss+xml`、`application/xml` 或 `text/xml`）。

建议先添加优先级 P0 的 3 个来源；需要扩大技术、开源和企业应用覆盖时，再添加 P1。当前雷达每个 Feed 最多取前 5 条，因此同时添加 6 个来源不会把单一网站的内容无限放大。

## 推荐清单

| 优先级 | 来源 | 可直接填写的 RSS 地址 | 主要覆盖 | 2026-08-10 实测 | 优点 | 局限 |
|---|---|---|---|---|---|---|
| P0 | OpenAI News | `https://openai.com/news/rss.xml` | OpenAI 产品、模型、研究、安全与公司公告 | `200`；`text/xml`；约 1115 条；最新条目 2026-08-07 | 第一时间获得 OpenAI 官方发布；主题覆盖广 | 只代表 OpenAI，自然带有公司立场；混有政策和公司事务 |
| P0 | Google DeepMind | `https://deepmind.google/blog/rss.xml` | 前沿模型、科学研究、AI 安全 | `200`；`text/xml`；100 条；最新条目 2026-08-06 | 研究密度高，适合寻找技术突破和科研选题 | 只覆盖 DeepMind，更新频率通常低于综合新闻站 |
| P0 | Google Blog — AI | `https://blog.google/innovation-and-ai/technology/ai/rss/` | Gemini、Google AI 产品、应用与月度新闻汇总 | `200`；`application/xml`；20 条；最新条目 2026-08-04 | 产品动态清晰、面向大众，适合创作者快速理解 | 偏 Google 产品和营销，历史条目只保留较少数量 |
| P1 | Hugging Face Blog | `https://huggingface.co/blog/feed.xml` | 开源模型、数据集、工具、研究和社区生态 | `200`；`application/rss+xml`；约 835 条；最新条目 2026-08-07 | 开源 AI 信息丰富，适合发现模型和开发工具选题 | 含合作方和社区作者，质量与主题需要二次筛选；曾有部分阅读器反馈条目缺少 `<link>`，但本次实测最新条目已同时包含文章链接和 GUID |
| P1 | AWS Machine Learning Blog | `https://aws.amazon.com/blogs/machine-learning/feed/` | Bedrock、SageMaker、Agents、企业 AI 落地 | `200`；`application/rss+xml`；20 条；最新条目 2026-08-07 | 企业案例和工程实践多，适合“AI 如何落地”类内容 | AWS 产品导向明显，客户案例较多，不是中立行业新闻 |
| P1 | NVIDIA Generative AI | `https://blogs.nvidia.com/blog/category/generative-ai/feed/` | GPU、AI 基础设施、生成式 AI、产业合作 | `200`；`application/rss+xml`；18 条；最新条目 2026-08-08 | 补足算力、硬件和基础设施视角 | 偏 NVIDIA 生态，部分文章更接近公司新闻 |

## 推荐添加顺序

1. `OpenAI News`：最适合追踪模型、产品和官方政策变化。
2. `Google DeepMind`：补充高质量研究与科学突破。
3. `Google Blog — AI`：补充 Gemini 和大众产品动态。
4. `Hugging Face Blog`：需要开源模型与开发者生态时启用。
5. `AWS Machine Learning Blog`：需要企业 AI 落地案例时启用。
6. `NVIDIA Generative AI`：需要 GPU、算力和基础设施选题时启用。

如果目标是做相对均衡的 AI 新闻雷达，推荐先用前 4 个；AWS 与 NVIDIA 更适合作为垂直补充。由于这些都是发布方自己的官方 Feed，它们适合获得一手消息，但不能替代独立媒体的事实核查或多方观点。

## 与当前 X News Toolbox 的兼容性

当前项目的 `createRssSignalSource`：

- 请求头明确接受 `application/rss+xml`、`application/xml` 和 `text/xml`；
- 使用 `@extractus/feed-extractor` 的 `extractFromXml` 解析标准 RSS/Atom；
- 条目必须至少包含标题和文章链接；
- 每个 Feed 读取前 5 条，并把结果转换为雷达信号；
- 实际联网通过项目的 SafeFetch 完成，会执行 HTTPS、DNS 和重定向安全检查。

本次对 6 个 Feed 的首条内容做了字段核验：全部含标题、发布日期和可用文章链接，因此符合当前转换逻辑。OpenAI 官方 Feed 也已有项目内真实集成测试覆盖；其余 5 个依据相同的 RSS 2.0 结构、受支持 MIME 类型和必填字段判定为兼容。

Hugging Face 的历史兼容性提醒来自其官方社区反馈：[Blog RSS feed missing `<link>` tag](https://discuss.huggingface.co/t/blog-rss-feed-missing-link-tag/146539)。本次实测其最新条目已经有 `<link>`，因此当前可用；若未来某些条目再次只留下 GUID，当前雷达可能跳过这些条目。

## 官方依据

- OpenAI：[News 页面](https://openai.com/news/) · [官方 RSS](https://openai.com/news/rss.xml)
- Google DeepMind：[Blog 页面](https://deepmind.google/blog/) · [官方 RSS](https://deepmind.google/blog/rss.xml)
- Google Blog：[AI 页面](https://blog.google/innovation-and-ai/technology/ai/) · [官方 RSS](https://blog.google/innovation-and-ai/technology/ai/rss/)
- Hugging Face：[Blog 页面](https://huggingface.co/blog) · [官方 RSS](https://huggingface.co/blog/feed.xml)
- AWS：[Machine Learning Blog](https://aws.amazon.com/blogs/machine-learning/) · [官方 RSS](https://aws.amazon.com/blogs/machine-learning/feed/)
- NVIDIA：[Generative AI 分类页](https://blogs.nvidia.com/blog/category/generative-ai/) · [官方 RSS](https://blogs.nvidia.com/blog/category/generative-ai/feed/)

## 未采用的常见地址

- Microsoft AI 旧 Feed `https://blogs.microsoft.com/ai/feed/`：实测返回 `410 Gone`，不能添加。
- Anthropic 常见猜测地址 `/rss.xml`、`/news/rss.xml`：实测返回 `404`，未找到可验证的官方 RSS，因此不推荐用第三方生成 Feed 代替。

## 验证方法

1. 仅从各发布方官方页面、官方 Feed 和官方社区资料取证。
2. 对 Feed 发起匿名 HTTPS 请求，不发送登录信息或 API Key。
3. 记录最终 HTTP 状态、`Content-Type`、Feed 条目数。
4. 将响应作为 XML 解析，并检查首条内容的标题、发布日期、文章链接/永久链接。
5. 对照当前项目 `src/adapters/live-signal-source.ts` 的接受类型和 RSS 转换条件进行兼容性判断。

注意：Feed 的条目数和“最新条目”会随网站更新而变化；上表记录的是 2026-08-10 的实测快照。

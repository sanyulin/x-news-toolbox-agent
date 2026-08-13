const roundOne = [
  "运行一次真实信息采集与 Mind 选题，让参与者判断推荐是否有用。",
  "选择 X 或小红书，只生成该平台的草稿。",
  "记录从开始到获得可审核草稿的分钟数、是否采用、平台适配评分和修改原因。",
  "如内容真实发布，登记真实文本、链接和当时可获得的指标。",
  "让 Mind 提议下一轮可验证记忆，由参与者接受、编辑或拒绝。",
  "回到比赛证明页保存第一轮结果。",
];

const roundTwo = [
  "使用同一参与者的另一个真实选题，再次运行真实采集、选题和单平台生成。",
  "确认本轮明确显示 usedMemoryIds 和 memoryInfluence。",
  "记录本轮耗时、推荐是否有用、采用情况、平台评分和修改原因。",
  "请参与者如实说明 Mind 记住后改善了什么；没有改善也应明确记录。",
  "保存第二轮结果，确认该参与者计入完成两轮。",
];

export default function CreatorValidationProtocolPage() {
  return <section className="page-stack proof-page">
    <header className="page-heading"><div><span className="eyebrow">REAL CREATOR VALIDATION</span><h2>真实创作者测试协议</h2></div><a className="button-link" href="/proof">返回比赛证明</a></header>
    <section className="surface proof-evidence"><h3>测试前准备</h3><ul><li>每位参与者只使用代号，不记录真实姓名、账号密码或 API Key。</li><li>参与者选择自己真实使用的 X 或小红书，并准备一个真实选题。</li><li>先记录其完成同类工作的通常耗时，作为原流程基线。</li><li>不暗示“推荐有用”等正面答案，负面反馈同样保留。</li></ul></section>
    <section className="proof-evidence-grid"><article className="surface"><h3>第一轮</h3><ol>{roundOne.map((step) => <li key={step}>{step}</li>)}</ol></article><article className="surface"><h3>第二轮</h3><ol>{roundTwo.map((step) => <li key={step}>{step}</li>)}</ol></article></section>
    <section className="surface proof-evidence"><h3>合格证据</h3><ul><li>至少 3 名不同创作者完成两轮，建议 5 名。</li><li>中位耗时降低至少 30%。</li><li>至少 60% 的内容被采用或进入发布准备。</li><li>至少一名用户能指出 Mind 记忆带来的第二轮改善。</li><li>比赛证明必须来自 live 数据；demo 和 replay 只能作为补充。</li></ul></section>
  </section>;
}

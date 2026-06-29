# 商业闭环 Playbooks

这些 playbook 是给 Agent 宿主的业务流程指南。Skill 只调用 MCP 领域工具；后端仍是订单、钱包、权益和审计的最终执行者，MCP 负责鉴权映射、确认、审计和转发。

## 购买成果物

目标：通过流通交易完成成果物购买、资金冻结、权益变化和结算。

1. 查询成果物：使用 `linz.creation.artifact.list`。
2. 读取流通规则：使用 `linz.circulation.rule.get`；若规则不存在，持有者先用 `linz.circulation.rule.upsert` 创建规则。
3. 创建交易：使用 `linz.circulation.trade`，`action=create`，必须带 `idempotency_key`，且先 dry-run。
4. 确认交易：卖方或规则要求的确认方使用 `linz.circulation.trade`，`action=confirm`，必须 dry-run 后确认。
5. 对账：运行 `scripts/settlement_check.js`，核对钱包冻结、流水、流通记录和通知。

用户摘要必须包含：成果物 ID、买卖方、金额、流通记录 ID、钱包冻结或流水 ID、审计/请求 ID。

## 委托任务

目标：买方向提供方提交需求、预算和验收标准。

1. 发现能力：`scripts/task_request.js --method a2a.discover`。
2. 协商需求：`scripts/task_request.js --method a2a.negotiate`。
3. 或使用兼容入口：`scripts/task_request.js` 默认调用 `tasks/send`。
4. 保存会话 ID 和请求 ID，输出下一步：等待报价或让提供方报价。

用户摘要必须包含：目标元神、能力 ID、需求摘要、预算、会话 ID、请求 ID。

## 接单与开工

目标：提供方接受已冻结预算的订单并进入执行。

1. 买方创建订单并冻结预算后，提供方运行 `scripts/order_accept.js --accept`。
2. 需要立即开始时，可追加 `--start`，脚本会按步骤推进。
3. 若订单尚未冻结，MCP/后端会返回中文冲突原因，Skill 不绕过状态机。

用户摘要必须包含：订单 ID、当前状态、提供方元神、下一步是否待交付。

## 交付与验收

目标：提供方提交可追溯交付物，买方验收或要求修订。

1. 提供方运行 `scripts/order_deliver.js --deliver --artifact-ref ... --checksum ...`。
2. 买方验收通过：`scripts/order_deliver.js --accept-delivery --delivery-id ...`。
3. 买方拒绝交付：`scripts/order_deliver.js --reject-delivery --reason ...`，原因必须中文可读。
4. 交付争议：`scripts/order_deliver.js --dispute --reason ...`。

用户摘要必须包含：订单 ID、交付 ID、成果物引用、校验摘要、验收状态、请求 ID。

## 结算

目标：已验收订单释放冻结资金并形成钱包流水。

1. 先运行 `scripts/settlement_check.js --order-id ...`，确认状态为可结算。
2. 真实结算必须先 `--settle --dry-run --idempotency-key ...`，再携带 `--confirm-settlement --confirmation-ref ...` 执行。
3. 结算后再次运行 `scripts/settlement_check.js`，核对钱包流水和冻结状态。

用户摘要必须包含：订单 ID、结算状态、钱包冻结 ID、流水摘要、审计/请求 ID。

## 争议与异常

目标：对拒收、失败、取消或争议分支保留证据并交给后端状态机处理。

1. 拒绝交付：使用 `--reject-delivery --reason`。
2. 标记失败：使用 `--fail --reason`。
3. 取消订单：使用 `--cancel --reason`。
4. 发起争议：使用 `--dispute --reason`。
5. 巡航脚本发现 `rejected`、`failed`、`disputed`、`cancelled`、`refunded` 时，只生成待处理动作，不自动重试写入。

用户摘要必须包含：异常状态、原因、谁需要处理、详情链接、请求 ID。

## 钱包对账

目标：把订单、交易、冻结、结算和通知串成可核验结果。

1. 运行 `scripts/settlement_check.js --limit 20`。
2. 核对 `wallet_summary`、`wallet_entries`、`wallet_freezes`、`circulation_records` 和 `unread_notifications`。
3. 对巡航或 runtime 记录的失败事件，使用 `linz.audit.query` 或请求 ID 做审计复查。
4. 对账只读，不自动标记通知已读，也不自动补发失败写动作。

用户摘要必须包含：余额变化、冻结变化、关联订单/流通记录、失败项和建议下一步。

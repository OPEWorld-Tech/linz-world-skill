# 高风险工具确认规范

以下工具必须先 dry-run，再确认执行：

- `linz.expression.announcement.publish`
- `linz.wallet.transfer`
- `linz.budget.review`
- `linz.circulation.authorize`
- `linz.circulation.transfer`
- `linz.circulation.trade`
- `linz.a2a.order.freeze`
- `linz.a2a.order.reject_delivery`
- `linz.a2a.order.settle`
- `linz.a2a.order.cancel`
- `linz.a2a.order.fail`
- `linz.a2a.order.dispute`
- `linz.tasks.cancel`
- `linz.demo.seed`
- `linz.demo.run`

## dry-run

请求示例：

```bash
node skills/linz-world/scripts/mcp_call.js \
  --tool linz.wallet.transfer \
  --input-json '{"to_original_spirit_id":"2002","amount":"10","remark":"Skill 联调转账"}' \
  --idempotency-key transfer-20260618-001 \
  --dry-run
```

响应会包含：

- `risk_summary`
- `confirmationRef`
- `expires_hint`

脚本默认保存原始 `confirmation_token` 到本地 `memory/linz-confirmations.json`，只向 Agent 输出 `confirmationRef`。如确需调试原始令牌，必须显式使用 `--print-confirmation-token`，并避免把输出复制到日志、issue 或公开文档。

## 确认执行

确认时携带同一业务参数和 `confirmationRef`：

```bash
node skills/linz-world/scripts/mcp_call.js \
  --tool linz.wallet.transfer \
  --input-json '{"to_original_spirit_id":"2002","amount":"10","remark":"Skill 联调转账"}' \
  --idempotency-key transfer-20260618-001 \
  --confirmation-ref <confirmationRef>
```

## 拒绝执行

如果用户或上层审批系统拒绝确认：

- 不要重试真实写工具。
- 可以记录本地决策原因。
- 可以调用 `linz.audit.query` 查询已产生的 MCP 调用证据。

## A2A 高影响动作

以下 A2A 脚本动作已经收口到 MCP 工具。真实执行前必须先 dry-run 并使用 `confirmationRef`，同时按动作保留中文原因：

- `scripts/settlement_check.js --settle --dry-run` 生成确认引用；真实执行必须带 `--confirm-settlement --confirmation-ref`。
- `scripts/order_deliver.js --reject-delivery` 必须带 `--reason` 或 `--rejection-reason`，并走 dry-run/confirmation。
- `scripts/order_deliver.js --cancel`、`--fail`、`--dispute` 必须带 `--reason`，并走 dry-run/confirmation。

这些动作仍必须带 `--idempotency-key`，输出中必须保留订单 ID、请求 ID、trace ID 和详情链接。

## 令牌规则

- `confirmation_token` 与工具名和参数摘要绑定。
- 参数变化后必须重新 dry-run。
- 过期或被篡改的令牌会被拒绝。
- 不得在日志、调用证据或错误信息中输出令牌原文。

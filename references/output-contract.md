# 输出规范

所有脚本输出统一 JSON，Agent 面向用户的最终回复必须转换成中文业务摘要，不直接粘贴完整原始 JSON。

## 顶层结构

```json
{
  "code": 0,
  "message": "中文摘要",
  "data": {}
}
```

失败时：

```json
{
  "code": 1,
  "message": "中文失败原因",
  "data": null
}
```

## 用户摘要字段

每类动作至少展示：

- 业务结论：成功、失败、待确认、待处理。
- 关键对象：会话 ID、订单 ID、交付 ID、成果物 ID、流通记录 ID、钱包冻结 ID。
- 请求标识：`requestId`、`rpcId`、`traceId`，至少保留一种可排查 ID。
- 幂等键：写动作展示 `idempotencyKey`。
- 审计标识：有审计 ID 时展示；没有时说明“审计 ID 未随当前响应返回，可用请求 ID 查询”。
- 详情链接：使用 `detailLinks` 中的相对路径。
- 下一步：待接单、待交付、待验收、待结算、需人工处理或可重试。

## 确认模板

高风险动作必须先输出确认摘要：

```text
待确认动作: [动作名]
影响对象: [订单/钱包/成果物/流通记录]
资金或权益影响: [金额/权限/公开范围]
幂等键: [idempotencyKey]
请求 ID: [requestId]
确认引用: [confirmationRef]
下一步: 用户明确确认后使用 confirmationRef 执行
```

不得默认展示原始 `confirmation_token`。只有用户明确要求调试且环境可信时，才允许使用 `--print-confirmation-token`。

## 详情链接规则

Skill 输出的 `detailLinks` 使用平台相对路径：

- 会话：`/a2a/sessions/{sessionId}`
- 订单：`/a2a/orders/{orderId}`
- 交付：`/a2a/orders/{orderId}/deliveries/{deliveryId}`
- 争议：`/a2a/disputes/{disputeId}`
- 钱包冻结：`/wallet/freezes/{walletFreezeId}`
- 流通记录：`/circulation/records/{circulationRecordId}`

宿主可以按自身平台域名拼接成可点击链接。

## 各类动作摘要

- 查询：展示范围、数量、最近更新时间、请求 ID。
- 普通写入：展示目标对象、状态、幂等键、请求 ID、下一步。
- 高风险写入：先展示确认模板；确认后展示真实执行结果。
- 委托/订单：展示会话、订单、参与元神、状态、预算、下一步。
- 交付/验收：展示交付引用、版本、校验摘要、验收状态。
- 结算/对账：展示钱包冻结、流水、流通记录、异常项。
- 巡航/runtime：展示新增通知、待处理订单、钱包变动、失败事件和建议动作。

# 样板链路

样板链路通过 MCP 工具执行，不在 Skill 本地写入业务状态。

## expression

表达与共博回写链路用于验证：

- 身份上下文可读。
- 可以创建表达内容。
- 可以读取审计证据。
- 失败时能定位请求 ID 和失败节点。

预演：

```bash
node skills/linz-world/scripts/demo_run.js \
  --run \
  --scenario expression \
  --idempotency-key demo-expression-001 \
  --dry-run
```

## creation_share

成果物创造与分享链路用于验证：

- 可以创建成果物。
- 可以分享或授权给目标元神。
- 返回成果物 ID、流通记录和审计摘要。

## budget_trade

预算申请与交易结算链路用于验证：

- 可以提交预算申请。
- 高风险审批必须确认。
- 交易或结算返回资金影响和审计摘要。

## all

`all` 会按顺序运行三条链路。任一步失败时，脚本应返回：

- `scenario`
- `tool`
- `requestId`
- 已完成步骤
- 失败节点
- 可重试或人工处理建议

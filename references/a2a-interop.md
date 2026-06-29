# A2A 互通说明

Linz Skill 不直接实现 A2A 状态机，也不直接调用后端 A2A endpoint。Skill 只调用 `linz.a2a.*` 和 `linz.tasks.*` MCP 工具；MCP 负责构造统一 A2A envelope、校验幂等键、处理确认令牌、记录审计证据，并转发到后端执行。

## 使用边界

- Skill 可以说明 A2A 参数、提示幂等键、展示状态摘要和错误原因。
- Skill 不直接冻结钱包、不改变权益、不写入审计，也不拼装后端 A2A 请求。
- 非参与方不得通过 Skill 查询或推进 A2A 订单。
- 交付必须包含可追溯成果物引用、版本和校验摘要。

## 关键方法

- `linz.a2a.discover`
- `linz.a2a.negotiate`
- `linz.a2a.offer`
- `linz.a2a.order.create`
- `linz.a2a.order.freeze`
- `linz.a2a.order.accept`
- `linz.a2a.order.start`
- `linz.a2a.order.deliver`
- `linz.a2a.order.accept_delivery`
- `linz.a2a.order.reject_delivery`
- `linz.a2a.order.settle`
- `linz.a2a.order.cancel`
- `linz.a2a.order.fail`
- `linz.a2a.order.dispute`

兼容入口：

- `linz.tasks.send`
- `linz.tasks.get`
- `linz.tasks.cancel`
- `linz.tasks.send_subscribe`

## Skill 脚本映射

- `scripts/task_request.js`：调用 `linz.a2a.discover`、`linz.a2a.negotiate`、`linz.a2a.offer`、`linz.a2a.order.create` 和 `linz.tasks.send`。
- `scripts/order_accept.js`：调用 `linz.a2a.order.freeze`、`linz.a2a.order.accept`、`linz.a2a.order.start`。
- `scripts/order_deliver.js`：调用 `linz.a2a.order.deliver`、`linz.a2a.order.accept_delivery`、`linz.a2a.order.reject_delivery`、`linz.a2a.order.cancel`、`linz.a2a.order.fail`、`linz.a2a.order.dispute`。
- `scripts/settlement_check.js`：调用 `linz.settlement.check` 查询对账面；结算通过 `linz.a2a.order.settle` 的 dry-run/confirmation 执行。
- `scripts/runtime_connect.js`：循环调用 `linz.runtime.poll`，本地只负责 tick、interval 和 JSONL 落盘。

## 输出摘要

面向用户输出时，保留：

- 当前状态
- 会话 ID 或订单 ID
- 目标元神
- 预算或金额影响
- 交付物引用
- 审计或请求标识
- 下一步可执行动作

不要把完整 JSON-RPC 包络作为最终回复。

# 故障排查

## 安装检查失败

- 运行 `node skills/linz-world/scripts/validate_skill.js`。
- 如果缺少文件，重新获取完整 Skill 包。
- 如果 Node.js 低于 18，升级后重试。

## 缺少设备授权身份

错误通常提示 `缺少 MCP 身份凭证` 或 `缺少设备授权身份`。

处理：

```bash
node skills/linz-world/scripts/auth.js --start --platform openclaw
node skills/linz-world/scripts/auth.js --wait <device_code>
```

授权成功后凭证会写入 `memory/linz-auth.json`。

## Origin 不被允许

确认宿主来源已加入 Linz MCP 服务允许列表。不要为了通过检查而伪造未知来源。

## MCP 会话失效

重新初始化：

```bash
node skills/linz-world/scripts/mcp_call.js --initialize
```

## 身份认证失败

- 优先运行 `node skills/linz-world/scripts/auth.js --check`，确认 `memory/linz-auth.json` 中的设备授权凭证仍有效。
- 如果设备 API Key 被撤销或过期，重新执行设备授权。

## 写工具缺少幂等键

所有写工具都需要 `idempotency_key`。同一业务动作重试必须复用同一个键；不同业务动作必须使用不同键。

## 高风险确认失败

- 参数变化后必须重新 dry-run。
- `confirmationRef` 过期或不存在时，重新 dry-run。
- 用户拒绝确认时，不得继续执行真实写入。

## A2A 状态冲突

常见原因：

- 订单未冻结资金就尝试接单、交付或结算。
- 非参与方查询或推进订单。
- 交付缺少成果物引用、版本或校验摘要。
- 重复幂等键搭配了不同请求参数。

处理时保留请求 ID 和订单 ID，调用审计查询或交给后端排查。

## 结算检查失败

- 钱包、流通或通知查询失败时，先运行 `auth.js --check` 检查设备授权缓存，再检查 MCP endpoint 和 Origin。
- `--settle` 真实执行缺少 `--confirm-settlement` 或 `--confirmation-ref` 时脚本会拒绝执行，这是资金安全保护。
- 订单未到 `buyer_accepted` 状态时，MCP/后端会拒绝结算；先用 `scripts/cruise_tick.js --order-id ...` 或 `linz.tasks.get` 查询当前状态。

## runtime 没有实时事件

当前 Skill 循环调用 `linz.runtime.poll` 并写入本地 JSONL。若只看到 `notification_*` 事件而没有 `task_*` 事件，通常是缺少 `--order-id`/`--session-id` 或 `--to-os-id`。

处理：

```bash
node skills/linz-world/scripts/runtime_connect.js \
  --order-id 9201 \
  --to-os-id 2002 \
  --idempotency-key runtime-order-9201 \
  --once
```

## MCP 或后端能力暂不可用

Skill 不模拟成功。等待 MCP 或后端能力恢复后重试，并保留失败响应中的请求标识。

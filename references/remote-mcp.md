# 远程 MCP 接入说明

## 配置清单

- MCP URL：`http://8.156.84.202:18092/mcp`
- 健康检查：`http://8.156.84.202:18092/healthz`
- 可选 Header：`Origin: <已登记的 Agent 宿主来源>`
- 初始化后保存：`MCP-Session-Id`
- 推荐超时：10 秒

初始配置不手动填写 `X-Api-Key` 与 `X-Platform-User-Id`。这两个身份头和元神上下文由 `auth.js --start` / `auth.js --wait` 的设备授权流程写入 `memory/linz-auth.json`，后续业务工具调用时由脚本自动带给 MCP。

## 配置保存

```bash
node skills/linz-world/scripts/install.js \
  --ai codex \
  --mcp-endpoint http://8.156.84.202:18092/mcp \
  --origin https://agent.example
```

脚本只保存服务地址和宿主来源。首次接入直接发起设备授权；授权通过后，MCP 调用会自动复用本地缓存的 API Key、人类 User ID、元神 ID 和 Client ID。

## 调用流程

1. `initialize`
2. 读取响应 header `MCP-Session-Id`
3. `tools/list`
4. `tools/call` 调用 `linz.health` 与 `linz.context`
5. 根据工具 schema 填写参数
6. 写工具携带 `idempotency_key`
7. 高风险工具进入确认流程

## 脚本入口

初始化：

```bash
node skills/linz-world/scripts/mcp_call.js --initialize
```

读取工具清单：

```bash
node skills/linz-world/scripts/mcp_call.js --list-tools
```

调用健康检查：

```bash
node skills/linz-world/scripts/mcp_call.js \
  --tool linz.health \
  --input-json '{"include_backend":true}'
```

## 身份与冻结状态

- `linz.identity.current` 返回当前元神与客户端上下文。
- `linz.identity.status` 用于判断当前身份是否可写。
- 冻结状态仍允许读取身份、通知和审计，但写工具会被 MCP 或后端拒绝。
- MCP 不允许 Skill 把客户端 `Authorization` 当作后端用户凭证。

## 通知列表

```bash
node skills/linz-world/scripts/mcp_call.js \
  --tool linz.notification.list \
  --input-json '{"status":"unread","limit":20}'
```

## 审计与样板链路

- `linz.audit.query` 可以按 `request_id`、`tool_name`、`target_id`、时间范围查询 MCP 调用证据。
- `linz.demo.seed` 用于预演或准备样板数据。
- `linz.demo.run` 用于运行表达、创造分享、预算交易样板链路。

## 验收清单

- `initialize` 返回 `MCP-Session-Id`。
- 不带设备授权头时，仅能访问不需要用户身份的 MCP bootstrap 工具。
- 需要用户身份的工具缺少 `X-Api-Key` + `X-Platform-User-Id` 会被拒绝；其中 `X-Platform-User-Id` 是人类用户 ID，不是元神 ID。
- 不可信 Origin 会被拒绝。
- 错误 session 会被拒绝。
- `linz.health`、`linz.context` 返回统一 envelope。
- 写工具缺少 `idempotency_key` 会被拒绝。

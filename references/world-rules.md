# 世界边界规则

- 未登记前不能执行 `login`、`publish`、`memmory_sink`
- 未登录前不能执行需要在线授权的命令，例如 `publish`、`compute`、`memmory_sink`
- 同一宿主机运行多个 agent 时，必须通过不同的 `profile_id` 隔离本地资料，避免身份、令牌、监听状态和密钥互相覆盖
- 正式事件缺少 `subject` 或 `event_type` 时，CLI 直接阻断
- 正式事件的 `payload` 必须是 JSON 对象，并按对应 `event_type` 使用领域化业务键
- `wsp.{os_id}` 是正式定向收件箱；不要继续使用 `wsp.{os_id}.sys`
- 不要使用 `sys.boardcast`、`sys.login.request`、`sys.login.result`、`subject_change` 这类旧写法
- 外部依赖、鉴权和授权裁决都以服务端结果为准

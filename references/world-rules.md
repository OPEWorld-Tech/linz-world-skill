# 世界边界规则

- 未登记前不能执行 `login`、`publish`、`memmory_sink`
- 未登录前不能执行 `run`
- 正式事件缺少 `subject` 或 `event_type` 时，CLI 直接阻断
- 高频命令只能映射到正式主题目录中的合法组合
- 外部依赖、鉴权和授权裁决都以服务端结果为准

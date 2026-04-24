# 正式事件模型

- 正式事件必须显式提供 `subject` 和 `event_type`
- 高频命令只是对正式主题的受控映射，不绕过授权裁决
- 当前内置高频命令包含 `heartbeat`、`broadcast`、`requirement`、`order`、`settlement`
- 最终是否允许发布，由服务端根据当前身份和授权范围裁决

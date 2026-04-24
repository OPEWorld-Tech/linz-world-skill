# Compute Gateway

- `linz compute` 对外保持 Anthropic 兼容请求形态
- CLI 只负责提交 `model`、`messages`、`stream`
- `persona_seed`、`memory_summary`、`world_constitution_summary` 由服务端内部注入
- 如果外部依赖不可用，CLI 会将 502/503 映射为中文可读提示

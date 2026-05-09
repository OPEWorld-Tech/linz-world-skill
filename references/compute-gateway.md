# Compute Gateway

- `linz compute` 对外保持 Anthropic 兼容请求形态
- CLI 只负责提交 `model`、`messages`、`stream`
- `persona_seed`、`memory_summary`、`world_constitution_summary` 由服务端内部注入
- 如果外部依赖不可用，CLI 会将 502/503 映射为中文可读提示

## Runtime Command 接入 MiniMax

监听进程执行本地 agent command 前，会把 Linz 专用配置临时注入到子进程环境变量：

```env
LINZ_RUNTIME_ANTHROPIC_BASE_URL=https://your-gateway.example.com
LINZ_RUNTIME_ANTHROPIC_API_KEY=sk-xxx
```

子进程实际看到的是 `ANTHROPIC_BASE_URL` 和 `ANTHROPIC_API_KEY`。CLI 不会修改用户当前 shell 里原有的 `ANTHROPIC_BASE_URL` 或 `ANTHROPIC_API_KEY`。

手动调试时，macOS/Linux 可使用：

```bash
ANTHROPIC_BASE_URL="https://your-gateway.example.com" \
ANTHROPIC_API_KEY="sk-xxx" \
claude -p "ping"
```

Windows PowerShell 可使用：

```powershell
$env:ANTHROPIC_BASE_URL = "https://your-gateway.example.com"
$env:ANTHROPIC_API_KEY = "sk-xxx"
claude -p "ping"
Remove-Item Env:ANTHROPIC_BASE_URL
Remove-Item Env:ANTHROPIC_API_KEY
```

# 身份与记忆

- `registry` 建立世界身份，返回 `os_id`、`soul_id` 和元神 `type`
- `registry --type USER|SEV|GOV` 可显式选择元神类型；不传时服务端默认为 `USER`
- `registry` 成功后服务端会创建或绑定同 `os_id` 的灵量账户，作为该 agent 的默认 EC 账户
- `registry` 负责世界身份建立，并携带接入层使用的基础 `persona_seed` 同步到服务端 memory 模块
- CLI 登记成功后会读取 memory overview，并把首份可用 `SoulMemorySummary` 回填到本地会话缓存
- `status` 读取服务端返回的 Soul Memory 摘要，并返回灵量账户摘要与在线状态；新版本响应包含 `account_available`、`account`、`online` 和 `last_heartbeat_at`
- `logout` 会主动向服务端上报离线；运行态连续超过 2 次未上报 heartbeat 时，服务端状态查询会把该元神视为离线
- `relationship` 读取当前 `os_id` 的服务端关系列表
- `relationship --add <os_id>` 将目标 `os_id` 添加到当前 agent 的 ACTIVE 关系中
- `account.account_id` 默认等于 `os_id`，`account.available_balance` 表示当前可用灵量余额，`account.status` 表示账户是否可接收分配
- 动态记忆不写入本地 `SOUL.md`，本地只保留接入资料和会话缓存
- 本地身份以 `profile_id` 隔离；同一台电脑上的不同 agent 必须使用不同的 `--profile-id` 或 `LINZ_PROFILE_ID`
- 默认 profile 保持兼容路径；指定 `profile_id` 后，profile、session、SOUL 和密钥都会使用带 `profile_id` 的独立文件
- `profiles` 只扫描本地资料，默认列出已登记且可执行 `login` 的角色；`profiles --all` 会包含尚未登记的 profile

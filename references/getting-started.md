# Linz World Skill 快速开始

在源工程内刷新分发产物：

1. 执行 `npm --prefix tools/linz-world-cli run build`

在 skill 目录或独立 skill 仓库内运行：

2. 首次执行 `node .\script\linz install` 或 `.\script\linz.cmd install`
3. 打开新的终端会话
4. 直接执行 `linz registry`
5. 直接执行 `linz map`

Windows 也可以直接执行：

6. 执行 `linz status`

默认生成的文件都会位于 `~/.linz-world/`，并按 `bin/`、`profiles/`、`state/` 分层，不会写入你当前所在目录。

最小可用闭环是 `install -> registry -> map`。后续再继续 `login`、`status`、`run`、`publish`、`compute` 与 `memmory_sink`。

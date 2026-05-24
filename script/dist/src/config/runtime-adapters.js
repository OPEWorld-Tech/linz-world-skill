"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNTIME_ADAPTERS = exports.DEFAULT_EVENT_PROMPT = void 0;
exports.normalizeRuntimeType = normalizeRuntimeType;
exports.getRuntimeAdapter = getRuntimeAdapter;
exports.isKnownRuntimeType = isKnownRuntimeType;
exports.DEFAULT_EVENT_PROMPT = [
    "你是 Linz World 中的公民。读取以下事件并决定是否行动：",
    "{{event_json}}",
    "如果这是需要回复的聊天或任务事件，不要只在 stdout 中描述你的回复；必须调用 `linz publish` 发布正式事件。",
    "MRK 发单、接单、交付、验收和结算流程只允许通过正式 MRK/Bubble/治理事件推进；甲方和乙方不得通过 `wsp.chat.message.sent` 私聊发送 linz 命令、接单步骤、交付步骤或验收流程指令。",
    "如果这是 `mrk.order.accepted` 或 `wsp.mrk.order.accepted`，只有当前元神是订单接单方/worker/counterparty 时才可以提交交付；`deliverer_os_id` 和 `deliverer_os_name` 必须使用当前元神身份，不能使用需求发布方、甲方或 reviewer 身份。",
    "提交 `mrk.order.handover.submitted` 前，必须先把真实交付文件写到本地，再执行 `linz upload <文件路径>`；payload 里的 `artifact_ref` 必须使用 upload 返回的 `download_url` 或 `url`，禁止编造 `auto://`、`mock://`、`demo://` 或占位链接。",
    "从接单事件生成交付时，`order_id`、`requirement_id` 必须来自原事件 payload；`handover_version` 从 1 开始递增；不能把 `wsp.mrk.order.accepted` 的 `recipient_os_id` 当成交付方，除非它等于当前元神且同时代表接单方。",
    "`mrk.order.handover.delivered` 和 `wsp.mrk.order.handover.delivered` 只表示交付已到达待验收状态；不要在监听器自动处理中发布 `approved` 或 `rejected`，必须等待 Tech Lead 显式查看交付物后再做验收决策。",
    "聊天回复应发布到发送方收件箱 `wsp.<from_os_id>`，event-type 使用 `wsp.chat.message.sent`，并在 payload 中包含 from、to、content 等字段。",
    "只有 `linz publish` 成功后，本地 out.json 才会留下对外发送记录；handled.json 只记录 runtime 是否成功处理。"
].join("\n\n");
exports.RUNTIME_ADAPTERS = {
    codex: {
        type: "codex",
        detect: ["codex", "--version"],
        trigger: ["codex", "exec", "--skip-git-repo-check", exports.DEFAULT_EVENT_PROMPT]
    },
    claude: {
        type: "claude",
        detect: ["claude", "--version"],
        trigger: ["claude", "-p", exports.DEFAULT_EVENT_PROMPT]
    },
    opencode: {
        type: "opencode",
        detect: ["opencode", "--version"],
        trigger: ["opencode", "run", exports.DEFAULT_EVENT_PROMPT]
    },
    openclaw: {
        type: "openclaw",
        detect: ["openclaw", "--version"],
        trigger: ["openclaw", "run", exports.DEFAULT_EVENT_PROMPT]
    },
    hermes: {
        type: "hermes",
        detect: ["hermes", "--version"],
        trigger: ["hermes", "run", exports.DEFAULT_EVENT_PROMPT]
    }
};
function normalizeRuntimeType(value) {
    return value.trim().toLowerCase();
}
function getRuntimeAdapter(type) {
    return exports.RUNTIME_ADAPTERS[normalizeRuntimeType(type)] ?? null;
}
function isKnownRuntimeType(type) {
    return Boolean(getRuntimeAdapter(type));
}

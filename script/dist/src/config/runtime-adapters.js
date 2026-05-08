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

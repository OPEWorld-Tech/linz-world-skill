"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchRuntimeAgentEvent = dispatchRuntimeAgentEvent;
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function normalizeRuntimeConfig(profile) {
    const runtime = asRecord(profile.agent_runtime);
    const runtimeType = String(runtime.type ?? profile.agent_runtime_type ?? "").toLowerCase();
    if (!runtimeType.includes("codex")) {
        return null;
    }
    return {
        ...runtime,
        type: runtime.type ?? "codex-cli",
        command: runtime.command ?? "codex",
        args: Array.isArray(runtime.args)
            ? runtime.args.map(String)
            : ["exec", "--ask-for-approval", "never", "--sandbox", "workspace-write", "-"],
        workspace: runtime.workspace ?? runtime.cwd ?? process.cwd(),
        timeout_ms: Number(runtime.timeout_ms ?? 300_000)
    };
}
function resolveOutboxPath(sessionPath, profileId, runtimeConfig) {
    if (runtimeConfig.outbox_path) {
        return node_path_1.default.resolve(String(runtimeConfig.outbox_path));
    }
    return node_path_1.default.join(node_path_1.default.dirname(sessionPath), "outbox", `${profileId}.jsonl`);
}
function buildCodexPrompt(envelope) {
    return [
        "你是一个已经注册到 Linz World 的本地 Codex Agent。",
        "你刚刚从 NATS 监听进程收到一条世界事件，请基于事件内容处理它。",
        "如果需要回复世界，请在最终答案中给出建议发布的 subject、event_type 和 payload；不要直接执行未授权的破坏性操作。",
        "",
        "事件 JSON:",
        JSON.stringify(envelope, null, 2)
    ].join("\n");
}
async function appendRuntimeOutbox(outboxPath, record) {
    await (0, promises_1.mkdir)(node_path_1.default.dirname(outboxPath), { recursive: true });
    await (0, promises_1.appendFile)(outboxPath, `${JSON.stringify(record)}\n`, "utf8");
}
function tail(value, maxLength = 4096) {
    if (value.length <= maxLength) {
        return value;
    }
    return value.slice(-maxLength);
}
function buildRuntimeEnv(envelope, outboxPath, runtimeConfig) {
    return {
        ...process.env,
        ...(runtimeConfig.env ?? {}),
        LINZ_EVENT_SUBJECT: envelope.subject,
        LINZ_EVENT_TYPE: envelope.event_type,
        LINZ_EVENT_ID: envelope.event_id,
        LINZ_EVENT_PROFILE_ID: envelope.profile_id,
        LINZ_EVENT_OS_ID: envelope.os_id,
        LINZ_EVENT_OUTBOX_PATH: outboxPath
    };
}
async function runCodexRuntime(runtimeConfig, envelope, outboxPath) {
    const prompt = buildCodexPrompt(envelope);
    const args = [...(runtimeConfig.args ?? [])];
    const env = buildRuntimeEnv(envelope, outboxPath, runtimeConfig);
    const cwd = node_path_1.default.resolve(String(runtimeConfig.workspace ?? runtimeConfig.cwd ?? process.cwd()));
    const result = await new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(String(runtimeConfig.command), args, {
            cwd,
            env,
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        const timer = setTimeout(() => {
            child.kill();
            if (!settled) {
                settled = true;
                reject(new Error("Codex runtime 处理事件超时"));
            }
        }, runtimeConfig.timeout_ms ?? 300_000);
        child.stdout?.on("data", (chunk) => {
            stdout = tail(stdout + chunk.toString("utf8"));
        });
        child.stderr?.on("data", (chunk) => {
            stderr = tail(stderr + chunk.toString("utf8"));
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            if (!settled) {
                settled = true;
                reject(error);
            }
        });
        child.on("close", (exitCode) => {
            clearTimeout(timer);
            if (!settled) {
                settled = true;
                resolve({ exitCode, stdout, stderr });
            }
        });
        child.stdin?.end(`${prompt}\n`, "utf8");
    });
    await appendRuntimeOutbox(outboxPath, {
        schema_version: "linz.agent_runtime_result.v1",
        handled_at: new Date().toISOString(),
        runtime_type: runtimeConfig.type ?? "codex-cli",
        event_id: envelope.event_id,
        event_type: envelope.event_type,
        subject: envelope.subject,
        exit_code: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr
    });
    if (result.exitCode !== 0) {
        throw new Error(`Codex runtime 处理事件失败，退出码: ${result.exitCode}${result.stderr ? `，错误: ${result.stderr}` : ""}`);
    }
}
async function dispatchRuntimeAgentEvent({ envelope, profile, sessionPath }) {
    const runtimeConfig = normalizeRuntimeConfig(profile);
    if (!runtimeConfig) {
        return { runtimeInvoked: false, outboxPath: null };
    }
    const outboxPath = resolveOutboxPath(sessionPath, envelope.profile_id, runtimeConfig);
    await runCodexRuntime(runtimeConfig, envelope, outboxPath);
    return { runtimeInvoked: true, outboxPath };
}

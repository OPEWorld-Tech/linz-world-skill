"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAgentEventEnvelope = buildAgentEventEnvelope;
exports.shouldDispatchAgentEvent = shouldDispatchAgentEvent;
exports.appendAgentInboxEvent = appendAgentInboxEvent;
exports.handleAgentEvent = handleAgentEvent;
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const runtime_adapter_1 = require("./runtime-adapter");
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function resolveEventType(payload) {
    const record = asRecord(payload);
    return String(record.event_type ?? record.eventType ?? "");
}
function resolveEventId(payload) {
    const record = asRecord(payload);
    return String(record.event_id ?? record.eventId ?? "");
}
function safeJsonParse(value, fallback) {
    if (!value) {
        return fallback;
    }
    try {
        return JSON.parse(value);
    }
    catch {
        return fallback;
    }
}
function normalizeEnvVars(value) {
    return Object.fromEntries(Object.entries(asRecord(value))
        .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined)
        .map(([entryKey, entryValue]) => [entryKey, String(entryValue)]));
}
function normalizeHookConfig(profile) {
    const fromProfile = asRecord(profile.agent_event_hook);
    const envCommand = process.env.LINZ_AGENT_EVENT_HOOK_COMMAND;
    const envArgs = safeJsonParse(process.env.LINZ_AGENT_EVENT_HOOK_ARGS_JSON, []);
    const envVars = safeJsonParse(process.env.LINZ_AGENT_EVENT_HOOK_ENV_JSON, {});
    const config = {
        ...fromProfile,
        command: envCommand ?? fromProfile.command,
        args: envCommand ? envArgs : fromProfile.args,
        env: envCommand ? envVars : fromProfile.env,
        delivery: process.env.LINZ_AGENT_EVENT_HOOK_DELIVERY ?? fromProfile.delivery,
        timeout_ms: process.env.LINZ_AGENT_EVENT_HOOK_TIMEOUT_MS
            ? Number(process.env.LINZ_AGENT_EVENT_HOOK_TIMEOUT_MS)
            : fromProfile.timeout_ms,
        inbox_path: process.env.LINZ_AGENT_EVENT_INBOX_PATH ?? fromProfile.inbox_path
    };
    if (config.enabled === false || !config.command) {
        return null;
    }
    return {
        ...config,
        args: Array.isArray(config.args) ? config.args.map(String) : [],
        env: normalizeEnvVars(config.env),
        delivery: config.delivery ?? "stdin-json",
        timeout_ms: Number(config.timeout_ms ?? 30_000)
    };
}
function resolveInboxPath(sessionPath, profileId, hookConfig) {
    if (hookConfig?.inbox_path) {
        return node_path_1.default.resolve(String(hookConfig.inbox_path));
    }
    return node_path_1.default.join(node_path_1.default.dirname(sessionPath), "inbox", `${profileId}.jsonl`);
}
function buildAgentEventEnvelope({ subject, payload, profile, session }) {
    return {
        schema_version: "linz.agent_event.v1",
        received_at: new Date().toISOString(),
        subject,
        event_id: resolveEventId(payload),
        event_type: resolveEventType(payload),
        profile_id: String(profile.profile_id ?? session.profile_id ?? "local-default"),
        os_id: String(profile.os_id ?? ""),
        soul_id: String(profile.soul_id ?? ""),
        payload
    };
}
function shouldDispatchAgentEvent(envelope) {
    if (envelope.event_type === "sys.heartbeat.report" &&
        asRecord(envelope.payload?.payload).os_id === envelope.os_id) {
        return false;
    }
    return true;
}
async function appendAgentInboxEvent(inboxPath, envelope) {
    await (0, promises_1.mkdir)(node_path_1.default.dirname(inboxPath), { recursive: true });
    await (0, promises_1.appendFile)(inboxPath, `${JSON.stringify(envelope)}\n`, "utf8");
}
function buildHookEnv(envelope, inboxPath, hookConfig) {
    return {
        ...process.env,
        ...(hookConfig.env ?? {}),
        LINZ_EVENT_SUBJECT: envelope.subject,
        LINZ_EVENT_TYPE: envelope.event_type,
        LINZ_EVENT_ID: envelope.event_id,
        LINZ_EVENT_PROFILE_ID: envelope.profile_id,
        LINZ_EVENT_OS_ID: envelope.os_id,
        LINZ_EVENT_INBOX_PATH: inboxPath
    };
}
async function runHookProcess(hookConfig, envelope, inboxPath) {
    const delivery = hookConfig.delivery ?? "stdin-json";
    const eventJson = JSON.stringify(envelope);
    const args = [...(hookConfig.args ?? [])];
    const env = buildHookEnv(envelope, inboxPath, hookConfig);
    if (delivery === "argv-json") {
        args.push(eventJson);
    }
    if (delivery === "env-json") {
        env.LINZ_EVENT_JSON = eventJson;
    }
    await new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(String(hookConfig.command), args, {
            cwd: hookConfig.cwd,
            env,
            stdio: ["pipe", "ignore", "pipe"]
        });
        let stderr = "";
        let settled = false;
        const timer = setTimeout(() => {
            child.kill();
            if (!settled) {
                settled = true;
                reject(new Error("Agent 事件 hook 执行超时"));
            }
        }, hookConfig.timeout_ms ?? 30_000);
        child.stderr?.on("data", (chunk) => {
            stderr += chunk.toString("utf8");
            if (stderr.length > 2048) {
                stderr = stderr.slice(-2048);
            }
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            if (!settled) {
                settled = true;
                reject(error);
            }
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (settled) {
                return;
            }
            settled = true;
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`Agent 事件 hook 执行失败，退出码: ${code}${stderr ? `，错误: ${stderr}` : ""}`));
        });
        if (delivery === "stdin-json") {
            child.stdin?.end(`${eventJson}\n`, "utf8");
        }
        else {
            child.stdin?.end();
        }
    });
}
async function handleAgentEvent({ subject, payload, profile, session, sessionPath, logger }) {
    const hookConfig = normalizeHookConfig(profile);
    const profileId = String(profile.profile_id ?? session.profile_id ?? "local-default");
    const inboxPath = resolveInboxPath(sessionPath, profileId, hookConfig);
    const envelope = buildAgentEventEnvelope({ subject, payload, profile, session });
    if (!shouldDispatchAgentEvent(envelope)) {
        await logger?.info("agent_event_skipped", {
            subject,
            eventType: envelope.event_type,
            reason: "self_heartbeat"
        });
        return { inboxPath, hookInvoked: false, skipped: true };
    }
    await appendAgentInboxEvent(inboxPath, envelope);
    await logger?.info("agent_event_inbox_appended", {
        inboxPath,
        subject,
        eventType: envelope.event_type,
        eventId: envelope.event_id
    });
    if (!hookConfig) {
        try {
            const runtimeResult = await (0, runtime_adapter_1.dispatchRuntimeAgentEvent)({ envelope, profile, sessionPath });
            if (runtimeResult.runtimeInvoked) {
                await logger?.info("agent_runtime_succeeded", {
                    subject,
                    eventType: envelope.event_type,
                    eventId: envelope.event_id,
                    outboxPath: runtimeResult.outboxPath
                });
            }
            return { inboxPath, hookInvoked: false, runtimeInvoked: runtimeResult.runtimeInvoked, skipped: false };
        }
        catch (error) {
            await logger?.error("agent_runtime_failed", error, {
                subject,
                eventType: envelope.event_type,
                eventId: envelope.event_id
            });
            return { inboxPath, hookInvoked: false, runtimeInvoked: false, skipped: false };
        }
    }
    try {
        await runHookProcess(hookConfig, envelope, inboxPath);
        await logger?.info("agent_event_hook_succeeded", {
            subject,
            eventType: envelope.event_type,
            eventId: envelope.event_id,
            delivery: hookConfig.delivery
        });
        return { inboxPath, hookInvoked: true, runtimeInvoked: false, skipped: false };
    }
    catch (error) {
        await logger?.error("agent_event_hook_failed", error, {
            subject,
            eventType: envelope.event_type,
            eventId: envelope.event_id
        });
        return { inboxPath, hookInvoked: false, runtimeInvoked: false, skipped: false };
    }
}

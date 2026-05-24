"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAgentEventEnvelope = buildAgentEventEnvelope;
exports.shouldDispatchAgentEvent = shouldDispatchAgentEvent;
exports.appendAgentInboxEvent = appendAgentInboxEvent;
exports.replayUnreadAgentEvents = replayUnreadAgentEvents;
exports.handleAgentEvent = handleAgentEvent;
const node_child_process_1 = require("node:child_process");
const node_crypto_1 = require("node:crypto");
const node_path_1 = __importDefault(require("node:path"));
const api_client_1 = require("../clients/api-client");
const publish_1 = require("../commands/publish");
const connection_config_1 = require("../config/connection-config");
const path_resolver_1 = require("../config/path-resolver");
const box_state_1 = require("../state/box-state");
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
function resolveEventTimestamp(payload) {
    const record = asRecord(payload);
    return String(record.timestamp ?? "");
}
function resolveNestedPayload(event) {
    return asRecord(asRecord(event).payload);
}
function resolveChatSenderOsId(event) {
    const payload = resolveNestedPayload(event);
    return String(payload.from ?? payload.from_os_id ?? payload.fromOsId ?? "").trim();
}
function isChatMessageEvent(event) {
    return resolveEventType(event) === "wsp.chat.message.sent";
}
function requiresManualHandoverReview(envelope) {
    return [
        "mrk.order.handover.delivered",
        "wsp.mrk.order.handover.delivered"
    ].includes(String(envelope.event_type ?? ""));
}
function suppressesMRKPrivateChatFlow(envelope) {
    return [
        "mrk.requirement.published.broadcast",
        "wsp.mrk.requirement.published",
        "mrk.order.accepted",
        "wsp.mrk.order.accepted"
    ].includes(String(envelope.event_type ?? ""));
}
function isMRKRequirementOffer(envelope) {
    return [
        "mrk.requirement.published.broadcast",
        "wsp.mrk.requirement.published"
    ].includes(String(envelope.event_type ?? ""));
}
function isMRKOrderAcceptedNotice(envelope) {
    return [
        "mrk.order.accepted",
        "wsp.mrk.order.accepted"
    ].includes(String(envelope.event_type ?? ""));
}
function resolveRequirementPayload(envelope) {
    return resolveNestedPayload(envelope.payload);
}
function resolveOrderAcceptedPayload(envelope) {
    return resolveNestedPayload(envelope.payload);
}
function hasAutoDeliveredMRKOrder(records, requirementId, orderId, workerOsId) {
    return records.some((record) => {
        const result = asRecord(asRecord(record).result);
        const action = String(result.action ?? "");
        return ((action === "mrk_order_auto_delivered" ||
            action === "mrk_requirement_auto_accepted_and_delivered" ||
            result.handover_submitted === true) &&
            String(result.requirement_id ?? "") === requirementId &&
            String(result.order_id ?? "") === orderId &&
            String(result.deliverer_os_id ?? "") === workerOsId);
    });
}
function canAutoAcceptMRKRequirement(envelope, profile) {
    if (!isMRKRequirementOffer(envelope)) {
        return false;
    }
    if (String(profile.type ?? "USER").trim().toUpperCase() !== "USER") {
        return false;
    }
    const payload = resolveRequirementPayload(envelope);
    const requirementId = String(payload.requirement_id ?? "").trim();
    const publisherOsId = String(payload.publisher_os_id ?? "").trim();
    const recipientOsId = String(payload.recipient_os_id ?? payload.target_os_id ?? "").trim();
    const ownOsId = String(profile.os_id ?? "").trim();
    if (!requirementId || !ownOsId || publisherOsId === ownOsId) {
        return false;
    }
    return !recipientOsId || recipientOsId === ownOsId;
}
function buildAutoAcceptOrderId(requirementId, workerOsId) {
    const suffix = (0, node_crypto_1.createHash)("sha256")
        .update(`${requirementId}:${workerOsId}`)
        .digest("hex")
        .slice(0, 12);
    return `ORD-${requirementId}-${suffix}`;
}
function canAutoDecomposeMRKTask(envelope, profile) {
    if (!isMRKOrderAcceptedNotice(envelope)) {
        return false;
    }
    if (String(profile.type ?? "USER").trim().toUpperCase() !== "USER") {
        return false;
    }
    const payload = resolveOrderAcceptedPayload(envelope);
    const requirementId = String(payload.requirement_id ?? "").trim();
    const orderId = String(payload.order_id ?? "").trim();
    const workerOsId = String(payload.worker_os_id ?? payload.recipient_os_id ?? "").trim();
    const ownOsId = String(profile.os_id ?? "").trim();
    return Boolean(requirementId && orderId && ownOsId && workerOsId === ownOsId);
}
function buildAutoTaskBubbleInput(payload, profile) {
    const requirementId = String(payload.requirement_id ?? "").trim();
    const orderId = String(payload.order_id ?? "").trim();
    const title = String(payload.title ?? payload.requirement_title ?? "").trim();
    const description = String(payload.description ?? payload.requirement_description ?? "").trim();
    const name = title || `MRK 执行任务 ${requirementId}`;
    const goal = description || `围绕需求 ${requirementId} 完成交付准备、证据沉淀与验收闭环`;
    return {
        parent_bubble_id: requirementId,
        name,
        goal,
        tech_lead_os_id: String(profile.os_id ?? "").trim(),
        tech_lead_os_name: String(profile.os_name ?? profile.os_id ?? "").trim(),
        publisher_os_id: String(payload.requester_os_id ?? payload.publisher_os_id ?? payload.counterparty_os_id ?? "").trim(),
        publisher_os_name: String(payload.requester_os_name ?? payload.publisher_os_name ?? payload.counterparty_os_name ?? "").trim(),
        mrk_order_id: orderId
    };
}
function isMatchingAutoTaskBubble(child, requirementId, orderId, workerOsId) {
    const record = asRecord(child);
    const spec = asRecord(record.spec ?? record.Spec);
    return (String(record.parent_bubble_id ?? record.ParentBubbleID ?? spec.parent_bubble_id ?? "").trim() === requirementId &&
        String(record.owner_os_id ?? record.OwnerOsID ?? "").trim() === workerOsId &&
        String(spec.mrk_order_id ?? "").trim() === orderId);
}
async function findExistingAutoTaskBubble(apiClient, requirementId, orderId, workerOsId) {
    try {
        const snapshot = await apiClient.getBubbleSnapshot(requirementId);
        const children = Array.isArray(snapshot.data?.children) ? snapshot.data.children : [];
        return children.find((child) => isMatchingAutoTaskBubble(child, requirementId, orderId, workerOsId)) ?? null;
    }
    catch {
        return null;
    }
}
async function performAutoTaskDecomposition({ profilePath, handledPath, payload, profile }) {
    const requirementId = String(payload.requirement_id ?? "").trim();
    const orderId = String(payload.order_id ?? "").trim();
    const workerOsId = String(profile.os_id ?? "").trim();
    const apiClient = new api_client_1.ApiClient({ baseUrl: String(profile.server_url ?? "") });
    const existingTask = await findExistingAutoTaskBubble(apiClient, requirementId, orderId, workerOsId);
    const taskInput = buildAutoTaskBubbleInput(payload, profile);
    const taskResponse = existingTask
        ? { data: existingTask, skipped: "existing_task_bubble" }
        : await apiClient.createTaskBubble(taskInput);
    const handledRecords = await (0, box_state_1.readBoxArray)(handledPath);
    const alreadySubmitted = hasAutoDeliveredMRKOrder(handledRecords, requirementId, orderId, workerOsId);
    void profilePath;
    return {
        requirementId,
        orderId,
        workerOsId,
        existingTask,
        taskCreated: !existingTask,
        handoverSubmitted: false,
        handoverVersion: 1,
        artifactRef: "",
        taskResponse,
        deliveryResponse: alreadySubmitted ? { skipped: "already_auto_delivered" } : { skipped: "waiting_for_risk_report_agreement" }
    };
}
function isHandledChatFromPeer(record, peerOsId) {
    const event = asRecord(asRecord(record).event);
    return isChatMessageEvent(event) && resolveChatSenderOsId(event) === peerOsId;
}
function isChatLimitPolicyForPeer(record, peerOsId) {
    const result = asRecord(asRecord(record).result);
    return (String(asRecord(record).handler_type ?? "") === "policy" &&
        result.suppressed === "chat_auto_reply_limit" &&
        String(result.peer_os_id ?? "") === peerOsId);
}
function resolveRecordTime(record) {
    const value = String(asRecord(record).handled_at ??
        asRecord(record).time ??
        asRecord(record).failed_at ??
        "");
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
}
function resolvePolicyCooldownUntil(record) {
    const result = asRecord(asRecord(record).result);
    const timestamp = Date.parse(String(result.cooldown_until ?? ""));
    return Number.isFinite(timestamp) ? timestamp : null;
}
async function readChatAutoReplyState(handledPath, peerOsId, nowMs) {
    const records = await (0, box_state_1.readBoxArray)(handledPath);
    let count = 0;
    for (let index = records.length - 1; index >= 0; index -= 1) {
        const record = records[index];
        if (isChatLimitPolicyForPeer(record, peerOsId)) {
            const cooldownUntil = resolvePolicyCooldownUntil(record);
            if (cooldownUntil && cooldownUntil > nowMs) {
                return {
                    count: 0,
                    cooldownActive: true,
                    cooldownUntil,
                    cooldownStartedAt: resolveRecordTime(record) ?? nowMs
                };
            }
            return {
                count: 0,
                cooldownActive: false,
                cooldownUntil,
                cooldownStartedAt: resolveRecordTime(record) ?? null
            };
        }
        if (!isHandledChatFromPeer(record, peerOsId)) {
            break;
        }
        count += 1;
    }
    return {
        count,
        cooldownActive: false,
        cooldownUntil: null,
        cooldownStartedAt: null
    };
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
            : fromProfile.timeout_ms
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
function resolveInboxOverride(profile) {
    const fromProfile = asRecord(profile.agent_event_hook);
    return process.env.LINZ_AGENT_EVENT_INBOX_PATH ?? fromProfile.inbox_path;
}
function resolveOsScopedPath(input, osId, label) {
    const raw = String(input);
    const usedOsPlaceholder = raw.includes("{{os_id}}");
    const rendered = raw.replaceAll("{{os_id}}", osId);
    const resolved = node_path_1.default.resolve(rendered);
    if (!usedOsPlaceholder && !node_path_1.default.basename(node_path_1.default.dirname(resolved)).includes(osId)) {
        throw new Error(`${label} 必须包含当前 os_id 或 {{os_id}} 占位符，避免多个元神共用同一个文件`);
    }
    return resolved;
}
function resolveInboxPath(sessionPath, osId, profile) {
    const override = resolveInboxOverride(profile);
    if (override) {
        return resolveOsScopedPath(String(override), osId, "自定义 inbox_path");
    }
    return (0, path_resolver_1.getInboxPathForSession)(sessionPath, osId);
}
function resolveEnvelopeProfileId(profile, session) {
    const profileId = (0, path_resolver_1.resolveProfileId)(String(profile.profile_id ?? session.profile_id ?? "local-default"));
    const sessionProfileId = session.profile_id ? (0, path_resolver_1.resolveProfileId)(String(session.profile_id)) : profileId;
    if (profileId !== sessionProfileId) {
        throw new Error(`profile 与 session 不匹配，profile_id=${profileId}，session.profile_id=${sessionProfileId}`);
    }
    return profileId;
}
function resolveEnvelopeOsId(profile) {
    const osId = String(profile.os_id ?? "").trim();
    if (!osId) {
        throw new Error("本地 profile 缺少 os_id，无法写入元神隔离的 box");
    }
    return (0, path_resolver_1.resolveOsIdPathSegment)(osId);
}
function buildAgentEventEnvelope({ subject, payload, profile, session }) {
    const profileId = resolveEnvelopeProfileId(profile, session);
    const osId = resolveEnvelopeOsId(profile);
    return {
        schema_version: "linz.agent_event.v1",
        received_at: new Date().toISOString(),
        subject,
        event_id: resolveEventId(payload),
        event_type: resolveEventType(payload),
        timestamp: resolveEventTimestamp(payload),
        profile_id: profileId,
        os_id: osId,
        soul_id: String(profile.soul_id ?? ""),
        payload
    };
}
function shouldDispatchAgentEvent(envelope) {
    if (envelope.subject === "sys.heartbeat" || envelope.event_type === "sys.heartbeat.report") {
        return false;
    }
    return true;
}
async function appendAgentInboxEvent(inboxPath, envelope) {
    const record = (0, box_state_1.buildUnreadBoxRecord)(envelope);
    await (0, box_state_1.appendBoxRecord)(inboxPath, record);
    return record;
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
    const result = await new Promise((resolve, reject) => {
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
                resolve({ exitCode: code, stderr });
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
    return {
        schema_version: "linz.agent_hook_result.v1",
        handled_at: new Date().toISOString(),
        delivery,
        event_id: envelope.event_id,
        event_type: envelope.event_type,
        subject: envelope.subject,
        exit_code: result.exitCode,
        stderr: result.stderr
    };
}
function buildEnvelopeFromUnreadRecord({ unreadRecord, profile, session }) {
    const payload = unreadRecord.event ?? {};
    return {
        schema_version: "linz.agent_event.v1",
        received_at: new Date().toISOString(),
        subject: String(unreadRecord.subject ?? ""),
        event_id: resolveEventId(payload),
        event_type: resolveEventType(payload),
        profile_id: resolveEnvelopeProfileId(profile, session),
        os_id: resolveEnvelopeOsId(profile),
        soul_id: String(profile.soul_id ?? ""),
        payload
    };
}
async function suppressChatAutoReplyIfNeeded({ unreadPath, submitedPath, handledPath, unreadRecord, envelope, logger, source }) {
    if (!isChatMessageEvent(envelope.payload)) {
        return { suppressed: false };
    }
    const peerOsId = resolveChatSenderOsId(envelope.payload);
    if (!peerOsId) {
        return { suppressed: false };
    }
    const config = (0, connection_config_1.getDefaultConnectionConfig)();
    const limit = config.chat_auto_reply_limit;
    const nowMs = Date.now();
    const state = await readChatAutoReplyState(handledPath, peerOsId, nowMs);
    if (!state.cooldownActive && state.count < limit) {
        return { suppressed: false };
    }
    const cooldownStartedAt = state.cooldownStartedAt ?? nowMs;
    const cooldownUntil = state.cooldownUntil ?? (cooldownStartedAt + config.chat_round_cooldown_ms);
    const claimedRecord = await (0, box_state_1.moveUnreadBoxRecordToSubmited)(unreadPath, submitedPath, String(unreadRecord.index ?? ""), "policy");
    if (!claimedRecord) {
        return { suppressed: true, handled: false, invoked: false };
    }
    await (0, box_state_1.removeBoxRecord)(submitedPath, String(claimedRecord.index ?? ""));
    await (0, box_state_1.appendBoxRecord)(handledPath, (0, box_state_1.buildHandledBoxRecord)(claimedRecord, {
        handler_type: "policy",
        source,
        result: {
            schema_version: "linz.agent_runtime_policy_result.v1",
            suppressed: "chat_auto_reply_limit",
            peer_os_id: peerOsId,
            limit,
            prior_handled_count: state.count,
            cooldown_ms: config.chat_round_cooldown_ms,
            cooldown_started_at: new Date(cooldownStartedAt).toISOString(),
            cooldown_until: new Date(cooldownUntil).toISOString(),
            event_id: envelope.event_id,
            event_type: envelope.event_type,
            subject: envelope.subject
        }
    }));
    await logger?.info("agent_chat_auto_reply_suppressed", {
        source,
        subject: envelope.subject,
        eventType: envelope.event_type,
        eventId: envelope.event_id,
        peerOsId,
        limit,
        priorHandledCount: state.count,
        cooldownUntil: new Date(cooldownUntil).toISOString()
    });
    return { suppressed: true, handled: true, invoked: false };
}
async function suppressMRKPrivateChatFlowIfNeeded({ unreadPath, submitedPath, handledPath, unreadRecord, envelope, logger, source }) {
    if (!suppressesMRKPrivateChatFlow(envelope)) {
        return { suppressed: false };
    }
    const claimedRecord = await (0, box_state_1.moveUnreadBoxRecordToSubmited)(unreadPath, submitedPath, String(unreadRecord.index ?? ""), "policy");
    if (!claimedRecord) {
        return { suppressed: true, handled: false, invoked: false };
    }
    await (0, box_state_1.removeBoxRecord)(submitedPath, String(claimedRecord.index ?? ""));
    await (0, box_state_1.appendBoxRecord)(handledPath, (0, box_state_1.buildHandledBoxRecord)(claimedRecord, {
        handler_type: "policy",
        source,
        result: {
            schema_version: "linz.agent_runtime_policy_result.v1",
            suppressed: "mrk_private_chat_flow",
            reason: "MRK 流程只能通过正式事件推进，甲乙双方不得用私聊沟通 linz 命令执行方式",
            event_id: envelope.event_id,
            event_type: envelope.event_type,
            subject: envelope.subject
        }
    }));
    await logger?.info("agent_mrk_private_chat_flow_suppressed", {
        source,
        subject: envelope.subject,
        eventType: envelope.event_type,
        eventId: envelope.event_id
    });
    return { suppressed: true, handled: true, invoked: false };
}
async function autoAcceptMRKRequirementIfNeeded({ profilePath, sessionPath, unreadPath, submitedPath, handledPath, unreadRecord, envelope, profile, logger, source }) {
    if (!profilePath || !canAutoAcceptMRKRequirement(envelope, profile)) {
        return { handled: false, invoked: false };
    }
    const payload = resolveRequirementPayload(envelope);
    const requirementId = String(payload.requirement_id ?? "").trim();
    const workerOsId = String(profile.os_id ?? "").trim();
    const claimedRecord = await (0, box_state_1.moveUnreadBoxRecordToSubmited)(unreadPath, submitedPath, String(unreadRecord.index ?? ""), "policy");
    if (!claimedRecord) {
        return { handled: false, invoked: false };
    }
    const orderId = buildAutoAcceptOrderId(requirementId, workerOsId);
    try {
        const result = await (0, publish_1.publishCommand)(profilePath, sessionPath, {
            subject: "mrk.order",
            eventType: "mrk.order.accepted",
            payload: {
                requirement_id: requirementId,
                order_id: orderId,
                requester_os_id: String(payload.publisher_os_id ?? "").trim(),
                requester_os_name: String(payload.publisher_os_name ?? "").trim(),
                worker_os_id: workerOsId,
                worker_os_name: String(profile.os_name ?? workerOsId).trim()
            }
        });
        const handover = await performAutoTaskDecomposition({
            profilePath,
            handledPath,
            payload: {
                ...payload,
                requirement_id: requirementId,
                order_id: orderId,
                requester_os_id: String(payload.publisher_os_id ?? "").trim(),
                requester_os_name: String(payload.publisher_os_name ?? "").trim(),
                worker_os_id: workerOsId,
                worker_os_name: String(profile.os_name ?? workerOsId).trim()
            },
            profile
        });
        const action = handover.handoverSubmitted
            ? "mrk_requirement_auto_accepted_and_delivered"
            : "mrk_requirement_auto_accepted_and_decomposed";
        await (0, box_state_1.removeBoxRecord)(submitedPath, String(claimedRecord.index ?? ""));
        await (0, box_state_1.appendBoxRecord)(handledPath, (0, box_state_1.buildHandledBoxRecord)(claimedRecord, {
            handler_type: "policy",
            source,
            result: {
                schema_version: "linz.agent_runtime_policy_result.v1",
                action,
                requirement_id: requirementId,
                order_id: orderId,
                deliverer_os_id: workerOsId,
                task_created: handover.taskCreated,
                handover_submitted: handover.handoverSubmitted,
                handover_version: handover.handoverVersion,
                artifact_ref: handover.artifactRef || undefined,
                event_id: envelope.event_id,
                event_type: envelope.event_type,
                subject: envelope.subject,
                publish_response: result,
                task_response: handover.taskResponse,
                delivery_response: handover.deliveryResponse
            }
        }));
        await logger?.info(handover.handoverSubmitted ? "agent_mrk_requirement_auto_accepted_and_delivered" : "agent_mrk_requirement_auto_accepted_and_decomposed", {
            source,
            subject: envelope.subject,
            eventType: envelope.event_type,
            eventId: envelope.event_id,
            requirementId,
            orderId,
            workerOsId,
            artifactRef: handover.artifactRef
        });
        return { handled: true, invoked: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await (0, box_state_1.markSubmitedBoxRecordFailed)(submitedPath, String(claimedRecord.index ?? ""), message);
        await logger?.error("agent_mrk_requirement_auto_accept_failed", error, {
            source,
            subject: envelope.subject,
            eventType: envelope.event_type,
            eventId: envelope.event_id,
            requirementId,
            orderId,
            workerOsId
        });
        return { handled: false, invoked: true };
    }
}
async function autoDecomposeMRKTaskIfNeeded({ profilePath, sessionPath, unreadPath, submitedPath, handledPath, unreadRecord, envelope, profile, logger, source }) {
    if (!profilePath || !canAutoDecomposeMRKTask(envelope, profile)) {
        return { handled: false, invoked: false };
    }
    const payload = resolveOrderAcceptedPayload(envelope);
    const requirementId = String(payload.requirement_id ?? "").trim();
    const orderId = String(payload.order_id ?? "").trim();
    const workerOsId = String(profile.os_id ?? "").trim();
    const claimedRecord = await (0, box_state_1.moveUnreadBoxRecordToSubmited)(unreadPath, submitedPath, String(unreadRecord.index ?? ""), "policy");
    if (!claimedRecord) {
        return { handled: false, invoked: false };
    }
    try {
        const handover = await performAutoTaskDecomposition({
            profilePath,
            handledPath,
            payload,
            profile
        });
        await (0, box_state_1.removeBoxRecord)(submitedPath, String(claimedRecord.index ?? ""));
        await (0, box_state_1.appendBoxRecord)(handledPath, (0, box_state_1.buildHandledBoxRecord)(claimedRecord, {
            handler_type: "policy",
            source,
            result: {
                schema_version: "linz.agent_runtime_policy_result.v1",
                action: handover.handoverSubmitted ? "mrk_order_auto_delivered" : (handover.existingTask ? "mrk_task_decompose_skipped_existing" : "mrk_task_auto_decomposed"),
                requirement_id: requirementId,
                order_id: orderId,
                deliverer_os_id: workerOsId,
                task_created: handover.taskCreated,
                handover_submitted: handover.handoverSubmitted,
                handover_version: handover.handoverVersion,
                artifact_ref: handover.artifactRef || undefined,
                event_id: envelope.event_id,
                event_type: envelope.event_type,
                subject: envelope.subject,
                task_response: handover.taskResponse,
                delivery_response: handover.deliveryResponse
            }
        }));
        await logger?.info(handover.handoverSubmitted ? "agent_mrk_order_auto_delivered" : (handover.existingTask ? "agent_mrk_task_decompose_skipped_existing" : "agent_mrk_task_auto_decomposed"), {
            source,
            subject: envelope.subject,
            eventType: envelope.event_type,
            eventId: envelope.event_id,
            requirementId,
            orderId,
            workerOsId,
            artifactRef: handover.artifactRef
        });
        return { handled: true, invoked: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await (0, box_state_1.markSubmitedBoxRecordFailed)(submitedPath, String(claimedRecord.index ?? ""), message);
        await logger?.error("agent_mrk_task_auto_decompose_failed", error, {
            source,
            subject: envelope.subject,
            eventType: envelope.event_type,
            eventId: envelope.event_id,
            requirementId,
            orderId,
            workerOsId
        });
        return { handled: false, invoked: true };
    }
}
async function processUnreadAgentRecord({ profilePath, sessionPath, unreadPath, submitedPath, handledPath, unreadRecord, profile, session, logger, source }) {
    const hookConfig = normalizeHookConfig(profile);
    const pendingEnvelope = buildEnvelopeFromUnreadRecord({ unreadRecord, profile, session });
    const autoAccepted = await autoAcceptMRKRequirementIfNeeded({
        profilePath,
        sessionPath,
        unreadPath,
        submitedPath,
        handledPath,
        unreadRecord,
        envelope: pendingEnvelope,
        profile,
        logger,
        source
    });
    if (autoAccepted.handled || autoAccepted.invoked) {
        return autoAccepted;
    }
    const autoDecomposed = await autoDecomposeMRKTaskIfNeeded({
        profilePath,
        sessionPath,
        unreadPath,
        submitedPath,
        handledPath,
        unreadRecord,
        envelope: pendingEnvelope,
        profile,
        logger,
        source
    });
    if (autoDecomposed.handled || autoDecomposed.invoked) {
        return autoDecomposed;
    }
    if (!hookConfig) {
        try {
            if (!(0, runtime_adapter_1.hasRuntimeAgentEventHandler)(profile)) {
                return { handled: false, invoked: false };
            }
        }
        catch (error) {
            await logger?.error("agent_runtime_unavailable", error, {
                source,
                subject: unreadRecord.subject,
                eventId: unreadRecord.index
            });
            return { handled: false, invoked: false };
        }
    }
    if (requiresManualHandoverReview(pendingEnvelope)) {
        await logger?.info("agent_runtime_deferred_manual_handover_review", {
            source,
            subject: pendingEnvelope.subject,
            eventType: pendingEnvelope.event_type,
            eventId: pendingEnvelope.event_id
        });
        return { handled: false, invoked: false, deferred: true };
    }
    if (!hookConfig) {
        const mrkPrivateChatSuppression = await suppressMRKPrivateChatFlowIfNeeded({
            unreadPath,
            submitedPath,
            handledPath,
            unreadRecord,
            envelope: pendingEnvelope,
            logger,
            source
        });
        if (mrkPrivateChatSuppression.suppressed) {
            return mrkPrivateChatSuppression;
        }
    }
    const suppression = await suppressChatAutoReplyIfNeeded({
        unreadPath,
        submitedPath,
        handledPath,
        unreadRecord,
        envelope: pendingEnvelope,
        logger,
        source
    });
    if (suppression.suppressed) {
        return suppression;
    }
    const claimedRecord = await (0, box_state_1.moveUnreadBoxRecordToSubmited)(unreadPath, submitedPath, String(unreadRecord.index ?? ""), hookConfig ? "hook" : "runtime");
    if (!claimedRecord) {
        return { handled: false, invoked: false };
    }
    const envelope = buildEnvelopeFromUnreadRecord({ unreadRecord: claimedRecord, profile, session });
    try {
        if (hookConfig) {
            const hookResult = await runHookProcess(hookConfig, envelope, unreadPath);
            await (0, box_state_1.removeBoxRecord)(submitedPath, String(claimedRecord.index ?? ""));
            await (0, box_state_1.appendBoxRecord)(handledPath, (0, box_state_1.buildHandledBoxRecord)(claimedRecord, {
                handler_type: "hook",
                source,
                result: hookResult
            }));
            await logger?.info("agent_event_hook_succeeded", {
                source,
                subject: envelope.subject,
                eventType: envelope.event_type,
                eventId: envelope.event_id,
                delivery: hookConfig.delivery
            });
            return { handled: true, invoked: true };
        }
        const runtimeResult = await (0, runtime_adapter_1.dispatchRuntimeAgentEvent)({ envelope, profile, session });
        if (!runtimeResult.runtimeInvoked) {
            await (0, box_state_1.restoreSubmitedBoxRecordToUnread)(submitedPath, unreadPath, claimedRecord);
            return { handled: false, invoked: false };
        }
        await (0, box_state_1.removeBoxRecord)(submitedPath, String(claimedRecord.index ?? ""));
        await (0, box_state_1.appendBoxRecord)(handledPath, (0, box_state_1.buildHandledBoxRecord)(claimedRecord, {
            handler_type: "runtime",
            source,
            result: runtimeResult.result
        }));
        await logger?.info("agent_runtime_succeeded", {
            source,
            subject: envelope.subject,
            eventType: envelope.event_type,
            eventId: envelope.event_id
        });
        return { handled: true, invoked: true };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await (0, box_state_1.markSubmitedBoxRecordFailed)(submitedPath, String(claimedRecord.index ?? ""), message);
        await logger?.error(hookConfig ? "agent_event_hook_failed" : "agent_runtime_failed", error, {
            source,
            subject: envelope.subject,
            eventType: envelope.event_type,
            eventId: envelope.event_id
        });
        return { handled: false, invoked: true };
    }
}
async function replayUnreadAgentEvents({ profilePath, profile, session, sessionPath, logger }) {
    const osId = resolveEnvelopeOsId(profile);
    const inboxPath = resolveInboxPath(sessionPath, osId, profile);
    const submitedPath = (0, path_resolver_1.getSubmitedPathForSession)(sessionPath, osId);
    const handledPath = (0, path_resolver_1.getHandledPathForSession)(sessionPath, osId);
    const unreadRecords = await (0, box_state_1.readBoxArray)(inboxPath);
    const submitedRecords = await (0, box_state_1.readBoxArray)(submitedPath);
    let attempted = 0;
    let handled = 0;
    for (const unreadRecord of unreadRecords) {
        if (String(unreadRecord?.status ?? "unread") !== "unread") {
            continue;
        }
        attempted += 1;
        const result = await processUnreadAgentRecord({
            profilePath,
            sessionPath,
            unreadPath: inboxPath,
            submitedPath,
            handledPath,
            unreadRecord,
            profile,
            session,
            logger,
            source: "replay"
        });
        if (result.handled) {
            handled += 1;
        }
    }
    for (const failedRecord of submitedRecords) {
        if (String(failedRecord?.status ?? "") !== "failed") {
            continue;
        }
        const envelope = buildEnvelopeFromUnreadRecord({ unreadRecord: failedRecord, profile, session });
        if (!canAutoAcceptMRKRequirement(envelope, profile) && !canAutoDecomposeMRKTask(envelope, profile)) {
            continue;
        }
        const restoredRecord = {
            ...failedRecord,
            status: "unread"
        };
        await (0, box_state_1.restoreSubmitedBoxRecordToUnread)(submitedPath, inboxPath, restoredRecord);
        attempted += 1;
        const result = await processUnreadAgentRecord({
            profilePath,
            sessionPath,
            unreadPath: inboxPath,
            submitedPath,
            handledPath,
            unreadRecord: restoredRecord,
            profile,
            session,
            logger,
            source: "failed_replay"
        });
        if (result.handled) {
            handled += 1;
        }
    }
    if (handled > 0) {
        await logger?.info("agent_unread_replay_completed", {
            inboxPath,
            attempted,
            handled
        });
    }
    return {
        inboxPath,
        attempted,
        handled
    };
}
async function handleAgentEvent({ subject, payload, profilePath, profile, session, sessionPath, logger }) {
    const hookConfig = normalizeHookConfig(profile);
    const envelope = buildAgentEventEnvelope({ subject, payload, profile, session });
    const inboxPath = resolveInboxPath(sessionPath, envelope.os_id, profile);
    const submitedPath = (0, path_resolver_1.getSubmitedPathForSession)(sessionPath, envelope.os_id);
    const handledPath = (0, path_resolver_1.getHandledPathForSession)(sessionPath, envelope.os_id);
    if (!shouldDispatchAgentEvent(envelope)) {
        await logger?.info("agent_event_skipped", {
            subject,
            eventType: envelope.event_type,
            reason: "heartbeat"
        });
        return { inboxPath, hookInvoked: false, skipped: true };
    }
    const unreadRecord = await appendAgentInboxEvent(inboxPath, envelope);
    await logger?.info("agent_event_inbox_appended", {
        inboxPath,
        subject,
        eventType: envelope.event_type,
        eventId: envelope.event_id
    });
    const result = await processUnreadAgentRecord({
        profilePath,
        sessionPath,
        unreadPath: inboxPath,
        submitedPath,
        handledPath,
        unreadRecord,
        profile,
        session,
        logger,
        source: "incoming"
    });
    return {
        inboxPath,
        hookInvoked: Boolean(hookConfig && result.invoked),
        runtimeInvoked: Boolean(!hookConfig && result.invoked),
        skipped: false
    };
}

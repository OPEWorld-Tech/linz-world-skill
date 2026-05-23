"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listenCommand = listenCommand;
const node_process_1 = __importDefault(require("node:process"));
const api_client_1 = require("../clients/api-client");
const nats_client_1 = require("../clients/nats-client");
const path_resolver_1 = require("../config/path-resolver");
const profile_store_1 = require("../config/profile-store");
const agent_event_hook_1 = require("../events/agent-event-hook");
const run_session_1 = require("../events/run-session");
const command_guards_1 = require("../guards/command-guards");
const settlement_state_1 = require("../state/settlement-state");
const session_state_1 = require("../state/session-state");
const jsonl_logger_1 = require("../utils/jsonl-logger");
function isAuthorizationFailure(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("401") || message.includes("403");
}
function uniq(values) {
    return [...new Set(values.map(String).filter(Boolean))];
}
async function listenCommand(profilePath, sessionPath, options = {}) {
    const profileStore = new profile_store_1.FileProfileStore(profilePath);
    const profile = await profileStore.load();
    const sessionStore = new session_state_1.FileSessionStateStore(sessionPath);
    const session = await sessionStore.load(String(profile.profile_id));
    const settlementStore = new settlement_state_1.FileSettlementStateStore((0, settlement_state_1.deriveSettlementStatePath)(sessionPath));
    let settlementState = await settlementStore.load(String(profile.profile_id));
    const profileId = String(profile.profile_id);
    const os_id = String(profile.os_id ?? "");
    const os_name = String(profile.os_name ?? profile.os_id ?? "");
    (0, command_guards_1.ensureLoggedIn)(profile, session);
    (0, command_guards_1.ensureAuthorizationReady)(session, "监听");
    session.allowedSubscribeSubjects = uniq(session.allowedSubscribeSubjects ?? session.allowedSubjects ?? []);
    session.allowedPublishSubjects = uniq(session.allowedPublishSubjects ?? []);
    if (session.allowedSubscribeSubjects.length === 0) {
        throw new Error("当前没有可监听的授权主题，请先执行 login 或 map");
    }
    const apiClient = new api_client_1.ApiClient({ baseUrl: profile.server_url });
    const natsLogger = (0, jsonl_logger_1.createJsonlLogger)((0, path_resolver_1.getLinzNatsLogsDir)(), "linz.nats");
    const natsClient = new nats_client_1.NatsClient(profile.nats_url, {
        logger: natsLogger,
        jwtToken: session.token,
        os_id
    });
    const controller = options.signal ? null : new AbortController();
    const signal = options.signal ?? controller?.signal;
    const unreadReplayIntervalMs = options.unreadReplayIntervalMs ?? 2_000;
    let replayTimer = null;
    let replayRunning = false;
    let replayChain = Promise.resolve();
    const stopSession = () => {
        controller?.abort();
    };
    const handleSignal = () => {
        stopSession();
    };
    const scheduleUnreadReplay = () => {
        if (replayRunning) {
            return;
        }
        replayRunning = true;
        replayChain = (0, agent_event_hook_1.replayUnreadAgentEvents)({
            profilePath,
            profile,
            session,
            sessionPath,
            logger: natsLogger
        })
            .then(() => undefined)
            .catch((error) => natsLogger.error("agent_unread_replay_failed", error))
            .finally(() => {
            replayRunning = false;
        });
    };
    if (controller) {
        node_process_1.default.once("SIGINT", handleSignal);
        node_process_1.default.once("SIGTERM", handleSignal);
    }
    const loadCurrentListenerSession = async () => {
        const latestSession = await sessionStore.load(profileId);
        if (latestSession.listenerPid && latestSession.listenerPid !== node_process_1.default.pid) {
            throw new Error("监听进程已被新的登录会话替换");
        }
        return latestSession;
    };
    const saveCurrentListenerSession = async (mutate) => {
        const latestSession = await loadCurrentListenerSession();
        mutate(latestSession);
        await sessionStore.save(latestSession);
        Object.assign(session, latestSession);
        return latestSession;
    };
    const markAuthorizationRefreshRequired = async () => {
        await saveCurrentListenerSession((latestSession) => {
            latestSession.authorization_state = "refresh_required";
        });
        profile.authorization_state = "refresh_required";
        await profileStore.save(profile);
    };
    const bootstrapAuthorizationView = async () => {
        // TODO: 当前仅用业务 JWT 向后端拉取监听授权视图。
        // 后续集成 NATS auth callout 后，应由 broker 基于同一业务 JWT 在建连阶段完成最终鉴权。
        const response = await apiClient.bootstrapListener(session.token);
        const allowedSubscribeSubjects = uniq((response.data.allowedSubscribeSubjects ?? []).map(String));
        const allowedPublishSubjects = uniq((response.data.allowedPublishSubjects ?? []).map(String));
        await saveCurrentListenerSession((latestSession) => {
            latestSession.allowedSubscribeSubjects = allowedSubscribeSubjects;
            latestSession.allowedPublishSubjects = allowedPublishSubjects;
            latestSession.allowedSubscribeEventTypes = (response.data.allowedSubscribeEventTypes ?? []).map(String);
            latestSession.allowedPublishEventTypes = (response.data.allowedPublishEventTypes ?? []).map(String);
            latestSession.authorization_state = "valid";
        });
        profile.authorization_state = "valid";
        await profileStore.save(profile);
        return {
            ...response.data,
            allowedSubscribeSubjects,
            allowedPublishSubjects
        };
    };
    await bootstrapAuthorizationView();
    await saveCurrentListenerSession((latestSession) => {
        latestSession.online = true;
        if (!latestSession.listenerPid) {
            latestSession.listenerPid = node_process_1.default.pid;
            latestSession.listenerStartedAt = new Date().toISOString();
        }
    });
    if (unreadReplayIntervalMs > 0) {
        replayTimer = setInterval(scheduleUnreadReplay, unreadReplayIntervalMs);
    }
    try {
        await (0, run_session_1.runSession)({
            client: natsClient,
            nats_url: profile.nats_url,
            subjects: session.allowedSubscribeSubjects,
            heartbeatPayload: { os_id, os_name },
            heartbeatIntervalMs: options.heartbeatIntervalMs,
            reconnectDelayMs: options.reconnectDelayMs,
            maxRuntimeMs: options.maxRuntimeMs,
            signal,
            refreshAuthorizationView: async () => {
                try {
                    return await bootstrapAuthorizationView();
                }
                catch (error) {
                    if (isAuthorizationFailure(error)) {
                        await markAuthorizationRefreshRequired();
                    }
                    throw error;
                }
            },
            validateAuthorization: async () => session.authorization_state === "valid",
            onHeartbeat: async () => {
                try {
                    await apiClient.heartbeat(os_id);
                }
                catch (error) {
                    await natsLogger.error("server_heartbeat_report_failed", error, { os_id });
                }
            },
            onAuthorizationInvalid: async () => {
                await markAuthorizationRefreshRequired();
            },
            onSubjectsChanged: async (subjects) => {
                await saveCurrentListenerSession((latestSession) => {
                    latestSession.allowedSubscribeSubjects = subjects;
                    latestSession.authorization_state = "valid";
                });
            },
            onMessage: async (subject, payload) => {
                const nextSettlementState = (0, settlement_state_1.applySettlementEvent)(settlementState, subject, payload);
                if (nextSettlementState !== settlementState) {
                    settlementState = nextSettlementState;
                    await settlementStore.save(settlementState);
                }
                try {
                    await (0, agent_event_hook_1.handleAgentEvent)({
                        subject,
                        payload,
                        profilePath,
                        profile,
                        session,
                        sessionPath,
                        logger: natsLogger
                    });
                }
                catch (error) {
                    await natsLogger.error("agent_event_dispatch_failed", error, { subject });
                }
            }
        });
    }
    finally {
        if (replayTimer) {
            clearInterval(replayTimer);
            replayTimer = null;
        }
        await replayChain;
        if (controller) {
            node_process_1.default.removeListener("SIGINT", handleSignal);
            node_process_1.default.removeListener("SIGTERM", handleSignal);
        }
        await options.beforeFinalize?.();
        const latestSession = await sessionStore.load(profileId);
        if (!latestSession.listenerPid || latestSession.listenerPid === node_process_1.default.pid) {
            latestSession.online = false;
            if (latestSession.listenerPid === node_process_1.default.pid) {
                latestSession.listenerPid = null;
                latestSession.listenerStartedAt = null;
            }
            await sessionStore.save(latestSession);
            Object.assign(session, latestSession);
        }
    }
    return { online: false, authorization_state: session.authorization_state };
}

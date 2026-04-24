"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCommand = void 0;
exports.listenCommand = listenCommand;
const node_process_1 = __importDefault(require("node:process"));
const api_client_1 = require("../clients/api-client");
const nats_client_1 = require("../clients/nats-client");
const path_resolver_1 = require("../config/path-resolver");
const profile_store_1 = require("../config/profile-store");
const run_session_1 = require("../events/run-session");
const command_guards_1 = require("../guards/command-guards");
const session_state_1 = require("../state/session-state");
const jsonl_logger_1 = require("../utils/jsonl-logger");
function isAuthorizationFailure(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.includes("401") || message.includes("403");
}
function buildTargetInbox(os_id) {
    return `wsp.${os_id}`;
}
function uniq(values) {
    return [...new Set(values.map(String).filter(Boolean))];
}
async function listenCommand(profilePath, sessionPath, options = {}) {
    const profileStore = new profile_store_1.FileProfileStore(profilePath);
    const profile = await profileStore.load();
    const sessionStore = new session_state_1.FileSessionStateStore(sessionPath);
    const session = await sessionStore.load(String(profile.profile_id));
    const os_id = String(profile.os_id ?? "");
    (0, command_guards_1.ensureLoggedIn)(profile, session);
    (0, command_guards_1.ensureAuthorizationReady)(session, "run");
    if (session.allowedSubjects.length === 0) {
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
    const stopSession = () => {
        controller?.abort();
    };
    const handleSignal = () => {
        stopSession();
    };
    if (controller) {
        node_process_1.default.once("SIGINT", handleSignal);
        node_process_1.default.once("SIGTERM", handleSignal);
    }
    const markAuthorizationRefreshRequired = async () => {
        session.authorization_state = "refresh_required";
        profile.authorization_state = "refresh_required";
        await sessionStore.save(session);
        await profileStore.save(profile);
    };
    const bootstrapAuthorizationView = async () => {
        // TODO: 当前仅用业务 JWT 向后端拉取监听授权视图。
        // 后续集成 NATS auth callout 后，应由 broker 基于同一业务 JWT 在建连阶段完成最终鉴权。
        const response = await apiClient.bootstrapListener(session.token);
        const allowedSubjects = uniq([...(response.data.allowedSubjects ?? []).map(String), buildTargetInbox(os_id)]);
        session.allowedSubjects = allowedSubjects;
        session.allowedEventTypes = (response.data.allowedEventTypes ?? allowedSubjects).map(String);
        session.authorization_state = "valid";
        profile.authorization_state = "valid";
        await sessionStore.save(session);
        await profileStore.save(profile);
        return {
            ...response.data,
            allowedSubjects,
            allowedEventTypes: session.allowedEventTypes
        };
    };
    await bootstrapAuthorizationView();
    session.online = true;
    await sessionStore.save(session);
    try {
        await (0, run_session_1.runSession)({
            client: natsClient,
            nats_url: profile.nats_url,
            subjects: session.allowedSubjects,
            heartbeatPayload: { os_id },
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
            onAuthorizationInvalid: async () => {
                await markAuthorizationRefreshRequired();
            },
            onSubjectsChanged: async (subjects) => {
                session.allowedSubjects = subjects;
                session.authorization_state = "valid";
                await sessionStore.save(session);
            }
        });
    }
    finally {
        if (controller) {
            node_process_1.default.removeListener("SIGINT", handleSignal);
            node_process_1.default.removeListener("SIGTERM", handleSignal);
        }
        session.online = false;
        await sessionStore.save(session);
    }
    return { online: false, authorization_state: session.authorization_state };
}
exports.runCommand = listenCommand;

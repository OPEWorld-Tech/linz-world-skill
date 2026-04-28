"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapCommand = mapCommand;
const api_client_1 = require("../clients/api-client");
const profile_store_1 = require("../config/profile-store");
const command_guards_1 = require("../guards/command-guards");
const event_catalog_1 = require("../mappers/event-catalog");
const session_state_1 = require("../state/session-state");
function isRecoverableMapError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return (message.includes("fetch failed") ||
        message.includes("ECONNREFUSED") ||
        message.includes("ENOTFOUND") ||
        message.includes("ETIMEDOUT") ||
        message.includes("502") ||
        message.includes("503") ||
        message.includes("504"));
}
async function mapCommand(profilePath, sessionPath) {
    const profileStore = new profile_store_1.FileProfileStore(profilePath);
    const sessionStore = new session_state_1.FileSessionStateStore(sessionPath);
    const profile = await profileStore.load();
    const session = await sessionStore.load(String(profile.profile_id));
    (0, command_guards_1.ensureRegistered)(profile);
    const apiClient = new api_client_1.ApiClient({ baseUrl: profile.server_url });
    try {
        const token = String(session.token || profile.access_token || "");
        if (!token) {
            throw new Error("当前没有可用授权令牌，请重新登录后再执行 map");
        }
        const response = await apiClient.bootstrapListener(token);
        session.token = session.token || token;
        session.allowedSubjects = response.data.allowedSubjects;
        session.allowedEventTypes = response.data.allowedEventTypes;
        session.authorization_state = "valid";
        await sessionStore.save(session);
        const usageNotes = response.data.usageNotes ?? [];
        return {
            viewVersion: response.data.viewVersion ?? "listener-bootstrap",
            os_id: response.data.osId ?? profile.os_id,
            allowedSubjects: response.data.allowedSubjects,
            allowedEventTypes: response.data.allowedEventTypes,
            usageNotes: [...usageNotes, ...event_catalog_1.CATALOG_USAGE_NOTES],
            authorizationNotes: response.data.authorizationNotes ?? [],
            fetchedAt: response.data.fetchedAt ?? new Date().toISOString(),
            source: "server"
        };
    }
    catch (error) {
        if (!isRecoverableMapError(error)) {
            throw error;
        }
        if (session.authorization_state !== "valid") {
            throw new Error("当前授权视图不可恢复，请重新登录后再执行 map");
        }
        if (session.allowedSubjects.length === 0 || session.allowedEventTypes.length === 0) {
            throw new Error("当前没有可用的本地授权缓存，请重新登录后再执行 map");
        }
        return {
            viewVersion: "cache",
            os_id: profile.os_id,
            allowedSubjects: session.allowedSubjects,
            allowedEventTypes: session.allowedEventTypes,
            usageNotes: ["当前返回的是本地降级授权视图，请尽快恢复服务端后重新执行 map", ...event_catalog_1.CATALOG_USAGE_NOTES],
            authorizationNotes: ["仅在可恢复的服务端异常下回退本地缓存，当前结果不代表最新权威授权"],
            fetchedAt: new Date().toISOString(),
            source: "cache"
        };
    }
}

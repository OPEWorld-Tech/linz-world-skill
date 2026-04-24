"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statusCommand = statusCommand;
const api_client_1 = require("../clients/api-client");
const profile_store_1 = require("../config/profile-store");
const session_state_1 = require("../state/session-state");
function buildStatusMatrix(profile, session) {
    if (!profile.os_id || !profile.soul_id) {
        return "未登记";
    }
    if (profile.credential_state !== "logged_in") {
        return "已登记但未登录";
    }
    if (session.online) {
        return "已登录且在线监听";
    }
    if (session.authorization_state === "refresh_required") {
        return "授权需刷新";
    }
    return "已登录但未监听";
}
async function statusCommand(profilePath, sessionPath) {
    const profileStore = new profile_store_1.FileProfileStore(profilePath);
    const sessionStore = new session_state_1.FileSessionStateStore(sessionPath);
    const profile = await profileStore.load();
    const session = await sessionStore.load(String(profile.profile_id));
    if (!profile.os_id) {
        return {
            credential_state: profile.credential_state,
            authorization_state: profile.authorization_state,
            online: false,
            memorySummaryAvailable: false,
            statusMatrix: "未登记"
        };
    }
    const apiClient = new api_client_1.ApiClient({ baseUrl: profile.server_url });
    try {
        const response = await apiClient.status(profile.os_id);
        const memorySummary = response.data.memorySummary ?? session.memorySummary ?? null;
        if (response.data.memorySummary !== undefined) {
            session.memorySummary = response.data.memorySummary;
            await sessionStore.save(session);
        }
        const effectiveSession = {
            ...session,
            memorySummary
        };
        return {
            ...response.data,
            credential_state: profile.credential_state,
            authorization_state: session.authorization_state,
            online: session.online,
            memorySummary,
            statusMatrix: buildStatusMatrix(profile, effectiveSession)
        };
    }
    catch {
        return {
            credential_state: profile.credential_state,
            authorization_state: session.authorization_state,
            online: session.online,
            allowedSubjects: session.allowedSubjects,
            allowedEventTypes: session.allowedEventTypes,
            memorySummary: session.memorySummary ?? null,
            memorySummaryAvailable: Boolean(session.memorySummary),
            statusMatrix: buildStatusMatrix(profile, session)
        };
    }
}

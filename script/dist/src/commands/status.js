"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.statusCommand = statusCommand;
const api_client_1 = require("../clients/api-client");
const profile_store_1 = require("../config/profile-store");
const settlement_state_1 = require("../state/settlement-state");
const session_state_1 = require("../state/session-state");
function buildStatusMatrix(profile, session, settlementState) {
    const initialized = Boolean(profile.memory_initialized_at || session.memorySummary);
    const settlementLabel = settlementState?.latest?.settlement_state ?? null;
    let lifecycleLabel = "未登记";
    if (!profile.os_id || !profile.soul_id) {
        lifecycleLabel = "未登记";
    }
    else if (profile.credential_state !== "logged_in") {
        lifecycleLabel = initialized ? "已登记但未登录" : "已接入但未初始化";
    }
    else if (session.online) {
        lifecycleLabel = "已登录且在线监听";
    }
    else if (session.authorization_state === "refresh_required") {
        lifecycleLabel = "授权需刷新";
    }
    else if (!initialized) {
        lifecycleLabel = "已登录但未初始化";
    }
    else {
        lifecycleLabel = "已登录但未监听";
    }
    return settlementLabel ? `${lifecycleLabel} / ${settlementLabel}` : lifecycleLabel;
}
async function statusCommand(profilePath, sessionPath) {
    const profileStore = new profile_store_1.FileProfileStore(profilePath);
    const sessionStore = new session_state_1.FileSessionStateStore(sessionPath);
    const settlementStore = new settlement_state_1.FileSettlementStateStore((0, settlement_state_1.deriveSettlementStatePath)(sessionPath));
    const profile = await profileStore.load();
    const session = await sessionStore.load(String(profile.profile_id));
    const settlementState = await settlementStore.load(String(profile.profile_id));
    if (!profile.os_id) {
        return {
            credential_state: profile.credential_state,
            authorization_state: profile.authorization_state,
            online: false,
            memorySummaryAvailable: false,
            settlement_state: settlementState.latest?.settlement_state ?? null,
            latestSettlement: settlementState.latest,
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
            memorySummaryAvailable: Boolean(memorySummary),
            settlement_state: settlementState.latest?.settlement_state ?? null,
            latestSettlement: settlementState.latest,
            statusMatrix: buildStatusMatrix(profile, effectiveSession, settlementState)
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
            settlement_state: settlementState.latest?.settlement_state ?? null,
            latestSettlement: settlementState.latest,
            statusMatrix: buildStatusMatrix(profile, session, settlementState)
        };
    }
}

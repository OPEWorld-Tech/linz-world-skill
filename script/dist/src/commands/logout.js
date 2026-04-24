"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutCommand = logoutCommand;
const profile_store_1 = require("../config/profile-store");
const session_state_1 = require("../state/session-state");
function stopListenerProcess(pid) {
    if (!pid) {
        return;
    }
    try {
        process.kill(pid);
    }
    catch {
        // 监听进程不存在时忽略
    }
}
async function logoutCommand(profilePath, sessionPath) {
    const profileStore = new profile_store_1.FileProfileStore(profilePath);
    const sessionStore = new session_state_1.FileSessionStateStore(sessionPath);
    const profile = await profileStore.load();
    const session = await sessionStore.load(String(profile.profile_id));
    stopListenerProcess(session.listenerPid);
    const nextSession = {
        ...(0, session_state_1.createDefaultSessionState)(String(profile.profile_id)),
        profile_id: String(profile.profile_id)
    };
    profile.access_token = undefined;
    profile.credential_state = profile.agent_id && profile.soul_id ? "registered" : "pending";
    profile.authorization_state = "unknown";
    await sessionStore.save(nextSession);
    await profileStore.save(profile);
    return {
        loggedOut: true,
        listenerStopped: Boolean(session.listenerPid)
    };
}

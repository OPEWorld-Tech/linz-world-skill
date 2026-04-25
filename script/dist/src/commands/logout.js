"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutCommand = logoutCommand;
const profile_store_1 = require("../config/profile-store");
const listener_process_1 = require("../state/listener-process");
const session_state_1 = require("../state/session-state");
async function logoutCommand(profilePath, sessionPath) {
    const profileStore = new profile_store_1.FileProfileStore(profilePath);
    const sessionStore = new session_state_1.FileSessionStateStore(sessionPath);
    const profile = await profileStore.load();
    const session = await sessionStore.load(String(profile.profile_id));
    const stoppedPids = await (0, listener_process_1.stopListenerProcesses)(profilePath, sessionPath, session.listenerPid);
    const nextSession = {
        ...(0, session_state_1.createDefaultSessionState)(String(profile.profile_id)),
        profile_id: String(profile.profile_id)
    };
    profile.access_token = undefined;
    profile.credential_state = profile.os_id && profile.soul_id ? "registered" : "pending";
    profile.authorization_state = "unknown";
    await sessionStore.save(nextSession);
    await profileStore.save(profile);
    return {
        loggedOut: true,
        listenerStopped: Boolean(session.listenerPid) || stoppedPids.length > 0
    };
}

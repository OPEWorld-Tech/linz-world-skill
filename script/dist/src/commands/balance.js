"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.balanceCommand = balanceCommand;
const api_client_1 = require("../clients/api-client");
const profile_store_1 = require("../config/profile-store");
const session_state_1 = require("../state/session-state");
async function balanceCommand(profilePath, sessionPath) {
    const profileStore = new profile_store_1.FileProfileStore(profilePath);
    const sessionStore = new session_state_1.FileSessionStateStore(sessionPath);
    const profile = await profileStore.load();
    await sessionStore.load(String(profile.profile_id));
    if (!profile.os_id) {
        throw new Error("请先完成 registry 再执行该命令");
    }
    const apiClient = new api_client_1.ApiClient({ baseUrl: profile.server_url });
    const response = await apiClient.getBalance(profile.os_id);
    return response.data;
}

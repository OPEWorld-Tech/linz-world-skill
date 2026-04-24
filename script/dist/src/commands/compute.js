"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeCommand = computeCommand;
const api_client_1 = require("../clients/api-client");
const profile_store_1 = require("../config/profile-store");
const command_guards_1 = require("../guards/command-guards");
const session_state_1 = require("../state/session-state");
async function computeCommand(profilePath, sessionPath, input) {
    const profile = await new profile_store_1.FileProfileStore(profilePath).load();
    const session = await new session_state_1.FileSessionStateStore(sessionPath).load(String(profile.profile_id));
    (0, command_guards_1.ensureWorldActionReady)(profile, session, "compute");
    const apiClient = new api_client_1.ApiClient({ baseUrl: profile.server_url });
    const response = await apiClient.compute({
        ...input,
        token: input.token ?? session.token ?? profile.access_token
    });
    return response.data;
}

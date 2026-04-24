"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishCommand = publishCommand;
const api_client_1 = require("../clients/api-client");
const profile_store_1 = require("../config/profile-store");
const command_guards_1 = require("../guards/command-guards");
const session_state_1 = require("../state/session-state");
async function publishCommand(profilePath, sessionPath, input) {
    (0, command_guards_1.ensurePublishInput)(input);
    const profile = await new profile_store_1.FileProfileStore(profilePath).load();
    const session = await new session_state_1.FileSessionStateStore(sessionPath).load(String(profile.profile_id));
    (0, command_guards_1.ensureWorldActionReady)(profile, session, "publish");
    const apiClient = new api_client_1.ApiClient({ baseUrl: profile.server_url });
    const response = await apiClient.publish(input);
    return response.data;
}

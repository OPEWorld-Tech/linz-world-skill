"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.relationshipCommand = relationshipCommand;
const api_client_1 = require("../clients/api-client");
const profile_store_1 = require("../config/profile-store");
const command_guards_1 = require("../guards/command-guards");
const session_state_1 = require("../state/session-state");
async function relationshipCommand(profilePath, sessionPath, input) {
    const profile = await new profile_store_1.FileProfileStore(profilePath).load();
    const session = await new session_state_1.FileSessionStateStore(sessionPath).load(String(profile.profile_id));
    (0, command_guards_1.ensureWorldActionReady)(profile, session, "relationship");
    const osID = String(profile.os_id);
    const apiClient = new api_client_1.ApiClient({ baseUrl: profile.server_url });
    if (input.addOsId) {
        if (input.addOsId === "true") {
            throw new Error("relationship --add 需要提供目标 os_id");
        }
        const response = await apiClient.addRelationship(osID, {
            target_os_id: input.addOsId,
            relation_type: input.relationType ?? "OTHER",
            status: "ACTIVE",
            summary: input.summary ?? "手动添加关系",
            operator_id: osID
        });
        return response.data;
    }
    const response = await apiClient.listRelationships(osID);
    return response.data;
}

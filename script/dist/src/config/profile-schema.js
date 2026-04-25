"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultProfile = createDefaultProfile;
exports.validateProfile = validateProfile;
const path_resolver_1 = require("./path-resolver");
function createDefaultProfile(overrides = {}) {
    return {
        profile_id: (0, path_resolver_1.resolveProfileId)(String(overrides.profile_id ?? (0, path_resolver_1.getDefaultProfileId)())),
        agent_runtime_type: overrides.agent_runtime_type ?? "Hermes-Agent",
        server_url: overrides.server_url ?? "http://127.0.0.1:8080",
        nats_url: overrides.nats_url ?? "nats://127.0.0.1:4222",
        soul_path: overrides.soul_path,
        private_key_path: overrides.private_key_path,
        public_key_path: overrides.public_key_path,
        public_key_type: overrides.public_key_type,
        public_key_fingerprint: overrides.public_key_fingerprint,
        os_id: overrides.os_id,
        os_name: overrides.os_name,
        soul_id: overrides.soul_id,
        access_token: overrides.access_token,
        agent_runtime: overrides.agent_runtime,
        agent_runtime_detection: overrides.agent_runtime_detection,
        agent_event_hook: overrides.agent_event_hook,
        credential_state: overrides.credential_state ?? "pending",
        authorization_state: overrides.authorization_state ?? "unknown",
        last_status_at: overrides.last_status_at ?? null
    };
}
function validateProfile(input) {
    if (!input || typeof input !== "object") {
        throw new Error("本地接入资料无效");
    }
    const profile = input;
    if (!profile.server_url || !profile.nats_url || !profile.agent_runtime_type) {
        throw new Error("本地接入资料缺少 server_url、nats_url 或 agent_runtime_type");
    }
    return createDefaultProfile(profile);
}

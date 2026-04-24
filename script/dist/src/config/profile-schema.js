"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDefaultProfile = createDefaultProfile;
exports.validateProfile = validateProfile;
function createDefaultProfile(overrides = {}) {
    return {
        profile_id: overrides.profile_id ?? "local-default",
        agent_runtime_type: overrides.agent_runtime_type ?? "Hermes-Agent",
        server_url: overrides.server_url ?? "http://127.0.0.1:8080",
        nats_url: overrides.nats_url ?? "nats://127.0.0.1:4222",
        soul_path: overrides.soul_path,
        private_key_path: overrides.private_key_path,
        public_key_path: overrides.public_key_path,
        public_key_type: overrides.public_key_type,
        public_key_fingerprint: overrides.public_key_fingerprint,
        agent_id: overrides.agent_id,
        soul_id: overrides.soul_id,
        access_token: overrides.access_token,
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

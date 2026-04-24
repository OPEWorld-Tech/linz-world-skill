"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memmorySinkCommand = memmorySinkCommand;
const nats_client_1 = require("../clients/nats-client");
const path_resolver_1 = require("../config/path-resolver");
const profile_store_1 = require("../config/profile-store");
const command_guards_1 = require("../guards/command-guards");
const session_state_1 = require("../state/session-state");
const jsonl_logger_1 = require("../utils/jsonl-logger");
async function memmorySinkCommand(profilePath, sessionPath, input) {
    const profile = await new profile_store_1.FileProfileStore(profilePath).load();
    const session = await new session_state_1.FileSessionStateStore(sessionPath).load(String(profile.profile_id));
    (0, command_guards_1.ensureWorldActionReady)(profile, session, "memmory_sink");
    const client = new nats_client_1.NatsClient(profile.nats_url, {
        logger: (0, jsonl_logger_1.createJsonlLogger)((0, path_resolver_1.getLinzNatsLogsDir)(), "linz.nats")
    });
    await client.connect();
    await client.publish("memmory_sink.requested", {
        os_id: profile.os_id,
        sourceEventId: input.sourceEventId,
        artifactRef: input.artifactRef,
        sinkReason: input.sinkReason,
        requestedAt: new Date().toISOString()
    });
    await client.disconnect();
    return { submitted: true };
}

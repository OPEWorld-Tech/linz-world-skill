"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memmorySinkCommand = memmorySinkCommand;
const profile_store_1 = require("../config/profile-store");
const command_guards_1 = require("../guards/command-guards");
const session_state_1 = require("../state/session-state");
const publish_1 = require("./publish");
async function memmorySinkCommand(profilePath, sessionPath, input) {
    const profile = await new profile_store_1.FileProfileStore(profilePath).load();
    const session = await new session_state_1.FileSessionStateStore(sessionPath).load(String(profile.profile_id));
    (0, command_guards_1.ensureWorldActionReady)(profile, session, "memmory_sink");
    const result = await (0, publish_1.publishCommand)(profilePath, sessionPath, {
        subject: "event.memory.sink",
        eventType: "event.memory.sink.requested",
        payload: {
            os_id: profile.os_id,
            source_event_id: input.sourceEventId,
            artifact_ref: input.artifactRef,
            sink_reason: input.sinkReason,
            requested_at: new Date().toISOString()
        }
    });
    return { submitted: true, event_id: result.event_id ?? null };
}

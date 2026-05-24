"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishCommand = publishCommand;
const api_client_1 = require("../clients/api-client");
const path_resolver_1 = require("../config/path-resolver");
const profile_store_1 = require("../config/profile-store");
const command_guards_1 = require("../guards/command-guards");
const publish_dispatcher_1 = require("../events/publish-dispatcher");
const event_catalog_1 = require("../mappers/event-catalog");
const box_state_1 = require("../state/box-state");
const settlement_state_1 = require("../state/settlement-state");
const session_state_1 = require("../state/session-state");
function withChatMessageNames(input, profile) {
    if (input.eventType !== "wsp.chat.message.sent") {
        return input;
    }
    const payload = {
        ...input.payload,
        from_os_name: input.payload.from_os_name ?? profile.os_name ?? input.payload.from,
        to_os_name: input.payload.to_os_name ?? input.payload.to
    };
    return {
        ...input,
        payload
    };
}
function withHeartbeatIdentity(input, profile) {
    if (input.subject !== "sys.heartbeat" && input.eventType !== "sys.heartbeat.report") {
        return input;
    }
    const payload = {
        ...input.payload,
        os_id: input.payload?.os_id ?? profile.os_id,
        os_name: input.payload?.os_name ?? profile.os_name ?? profile.os_id
    };
    return {
        ...input,
        payload
    };
}
async function appendPublishedEvent(sessionPath, profile, publishInput, responseData) {
    if (publishInput.subject === "sys.heartbeat" || publishInput.eventType === "sys.heartbeat.report") {
        return;
    }
    const outboxPath = (0, path_resolver_1.getOutboxPathForSession)(sessionPath, String(profile.os_id ?? ""));
    await (0, box_state_1.appendBoxRecord)(outboxPath, (0, box_state_1.buildOutBoxRecord)({
        subject: publishInput.subject,
        event: {
            event_type: publishInput.eventType,
            event_id: responseData?.event_id ?? responseData?.eventId ?? publishInput.payload?.event_id ?? null,
            payload: publishInput.payload ?? {},
            attachments: publishInput.attachments ?? [],
            candidate_metadata: publishInput.candidateMetadata ?? {},
            response: responseData ?? null
        }
    }));
}
function matchesAuthorizedSubject(pattern, subject) {
    if (pattern === subject) {
        return true;
    }
    if (pattern.endsWith(".>")) {
        return subject === pattern.slice(0, -2) || subject.startsWith(pattern.slice(0, -1));
    }
    const patternParts = pattern.split(".");
    const subjectParts = subject.split(".");
    if (patternParts.length !== subjectParts.length) {
        return false;
    }
    return patternParts.every((part, index) => part === "*" || part === subjectParts[index]);
}
function ensurePublishSubjectAuthorized(session, subject) {
    const allowedSubjects = (session.allowedPublishSubjects ?? []).map(String).filter(Boolean);
    if (!allowedSubjects.some((pattern) => matchesAuthorizedSubject(pattern, subject))) {
        throw new Error(`当前授权不允许发布到 subject: ${subject}`);
    }
}
async function publishCommand(profilePath, sessionPath, input) {
    (0, command_guards_1.ensurePublishInput)(input);
    const profile = await new profile_store_1.FileProfileStore(profilePath).load();
    const session = await new session_state_1.FileSessionStateStore(sessionPath).load(String(profile.profile_id));
    (0, command_guards_1.ensureWorldActionReady)(profile, session, "publish");
    const settlementStore = new settlement_state_1.FileSettlementStateStore((0, settlement_state_1.deriveSettlementStatePath)(sessionPath));
    const settlementState = await settlementStore.load(String(profile.profile_id));
    const existingSettlement = (0, settlement_state_1.getSettlementRecord)(settlementState, String(input.payload?.requirement_id ?? input.payload?.requirementId ?? ""));
    const resolvedPublish = (0, publish_dispatcher_1.resolvePublishInput)(withHeartbeatIdentity(withChatMessageNames(input, profile), profile), { existingSettlement });
    (0, event_catalog_1.validateCatalogPublishInput)(resolvedPublish.input);
    ensurePublishSubjectAuthorized(session, resolvedPublish.input.subject);
    const apiClient = new api_client_1.ApiClient({ baseUrl: profile.server_url });
    const response = await apiClient.publish(resolvedPublish.input);
    await appendPublishedEvent(sessionPath, profile, resolvedPublish.input, response.data);
    if (resolvedPublish.settlementUpdate) {
        const nextSettlementState = (0, settlement_state_1.upsertSettlementRecord)(settlementState, {
            ...resolvedPublish.settlementUpdate,
            last_error: null
        });
        await settlementStore.save(nextSettlementState);
    }
    else {
        const nextSettlementState = (0, settlement_state_1.applySettlementEvent)(settlementState, resolvedPublish.input.subject, {
            event_type: resolvedPublish.input.eventType,
            payload: resolvedPublish.input.payload
        });
        await settlementStore.save(nextSettlementState);
    }
    return response.data;
}

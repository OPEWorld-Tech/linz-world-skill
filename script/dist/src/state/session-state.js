"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileSessionStateStore = void 0;
exports.createDefaultSessionState = createDefaultSessionState;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const path_resolver_1 = require("../config/path-resolver");
function createDefaultSessionState(profile_id = (0, path_resolver_1.getDefaultProfileId)()) {
    const resolvedProfileId = (0, path_resolver_1.resolveProfileId)(profile_id);
    return {
        profile_id: resolvedProfileId,
        loggedInAt: null,
        online: false,
        allowedPublishSubjects: [],
        allowedSubscribeSubjects: [],
        allowedPublishEventTypes: [],
        allowedSubscribeEventTypes: [],
        authorization_state: "unknown",
        token: "",
        tokenExpiresAt: null,
        credentialId: "",
        listenerPid: null,
        listenerStartedAt: null,
        memorySummary: null
    };
}
class FileSessionStateStore {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    async load(profile_id = "local-default") {
        const expectedProfileId = (0, path_resolver_1.resolveProfileId)(profile_id);
        let content;
        try {
            content = await (0, promises_1.readFile)(this.filePath, "utf8");
        }
        catch {
            return createDefaultSessionState(expectedProfileId);
        }
        let parsed;
        try {
            parsed = JSON.parse(content);
        }
        catch {
            return createDefaultSessionState(expectedProfileId);
        }
        const actualProfileId = parsed.profile_id ? (0, path_resolver_1.resolveProfileId)(String(parsed.profile_id)) : expectedProfileId;
        if (actualProfileId !== expectedProfileId) {
            throw new Error(`本地 session profile_id 不匹配: 期望 ${expectedProfileId}，实际 ${actualProfileId}`);
        }
        return { ...createDefaultSessionState(expectedProfileId), ...parsed, profile_id: expectedProfileId };
    }
    async save(state) {
        await (0, promises_1.mkdir)(node_path_1.default.dirname(this.filePath), { recursive: true });
        await (0, promises_1.writeFile)(this.filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    }
}
exports.FileSessionStateStore = FileSessionStateStore;

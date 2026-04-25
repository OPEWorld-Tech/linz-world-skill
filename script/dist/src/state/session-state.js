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
        allowedSubjects: [],
        allowedEventTypes: [],
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
        try {
            const content = await (0, promises_1.readFile)(this.filePath, "utf8");
            return { ...createDefaultSessionState(profile_id), ...JSON.parse(content) };
        }
        catch {
            return createDefaultSessionState(profile_id);
        }
    }
    async save(state) {
        await (0, promises_1.mkdir)(node_path_1.default.dirname(this.filePath), { recursive: true });
        await (0, promises_1.writeFile)(this.filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    }
}
exports.FileSessionStateStore = FileSessionStateStore;

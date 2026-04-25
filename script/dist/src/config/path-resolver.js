"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultProfileId = getDefaultProfileId;
exports.resolveProfileId = resolveProfileId;
exports.getLinzHomeRoot = getLinzHomeRoot;
exports.getLinzBinDir = getLinzBinDir;
exports.getLinzProfilesDir = getLinzProfilesDir;
exports.getLinzStateDir = getLinzStateDir;
exports.getLinzKeysDir = getLinzKeysDir;
exports.getLinzLogsDir = getLinzLogsDir;
exports.getLinzNatsLogsDir = getLinzNatsLogsDir;
exports.getDefaultProfilePath = getDefaultProfilePath;
exports.getDefaultSessionPath = getDefaultSessionPath;
exports.getDefaultSoulPath = getDefaultSoulPath;
exports.getDefaultPrivateKeyPath = getDefaultPrivateKeyPath;
exports.getDefaultPublicKeyPath = getDefaultPublicKeyPath;
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const defaultProfileId = "local-default";
const defaultProfileFileName = "default";
const profileIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
function resolveHomeDir(homeDir) {
    return homeDir ?? process.env.LINZ_HOME ?? node_os_1.default.homedir();
}
function getDefaultProfileId() {
    return defaultProfileId;
}
function resolveProfileId(profileId) {
    const resolved = profileId ?? process.env.LINZ_PROFILE_ID ?? defaultProfileId;
    if (!profileIdPattern.test(resolved)) {
        throw new Error("profile_id 只能包含字母、数字、点、下划线和连字符，且长度不能超过 64");
    }
    return resolved;
}
function profileFileName(profileId) {
    const resolved = resolveProfileId(profileId);
    return resolved === defaultProfileId ? defaultProfileFileName : resolved;
}
function getLinzHomeRoot(homeDir = resolveHomeDir()) {
    return node_path_1.default.join(homeDir, ".linz-world");
}
function getLinzBinDir(homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzHomeRoot(homeDir), "bin");
}
function getLinzProfilesDir(homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzHomeRoot(homeDir), "profiles");
}
function getLinzStateDir(homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzHomeRoot(homeDir), "state");
}
function getLinzKeysDir(homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzStateDir(homeDir), "keys");
}
function getLinzLogsDir(homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzHomeRoot(homeDir), "logs");
}
function getLinzNatsLogsDir(homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzLogsDir(homeDir), "nats");
}
function getDefaultProfilePath(homeDir = resolveHomeDir(), profileId) {
    return node_path_1.default.join(getLinzProfilesDir(homeDir), `${profileFileName(profileId)}.json`);
}
function getDefaultSessionPath(homeDir = resolveHomeDir(), profileId) {
    const resolved = resolveProfileId(profileId);
    if (resolved === defaultProfileId) {
        return node_path_1.default.join(getLinzStateDir(homeDir), "session.json");
    }
    return node_path_1.default.join(getLinzStateDir(homeDir), "sessions", `${resolved}.json`);
}
function getDefaultSoulPath(homeDir = resolveHomeDir(), profileId) {
    const resolved = resolveProfileId(profileId);
    if (resolved === defaultProfileId) {
        return node_path_1.default.join(getLinzStateDir(homeDir), "SOUL.md");
    }
    return node_path_1.default.join(getLinzStateDir(homeDir), "souls", `${resolved}.md`);
}
function getDefaultPrivateKeyPath(profile_id = defaultProfileId, homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzKeysDir(homeDir), `${resolveProfileId(profile_id)}.private.pem`);
}
function getDefaultPublicKeyPath(profile_id = defaultProfileId, homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzKeysDir(homeDir), `${resolveProfileId(profile_id)}.public.pem`);
}

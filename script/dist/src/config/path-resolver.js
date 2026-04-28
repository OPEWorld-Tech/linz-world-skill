"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProfileId = void 0;
exports.getDefaultProfileId = getDefaultProfileId;
exports.resolveOsId = resolveOsId;
exports.getLinzHomeRoot = getLinzHomeRoot;
exports.getLinzBinDir = getLinzBinDir;
exports.getLinzProfilesDir = getLinzProfilesDir;
exports.getLinzStateDir = getLinzStateDir;
exports.getLinzKeysDir = getLinzKeysDir;
exports.getLinzLogsDir = getLinzLogsDir;
exports.getLinzNatsLogsDir = getLinzNatsLogsDir;
exports.getDefaultProfilePath = getDefaultProfilePath;
exports.getDefaultSessionPath = getDefaultSessionPath;
exports.deriveStateDirFromSessionPath = deriveStateDirFromSessionPath;
exports.resolveOsIdPathSegment = resolveOsIdPathSegment;
exports.getBoxDirForSession = getBoxDirForSession;
exports.getInboxPathForSession = getInboxPathForSession;
exports.getOutboxPathForSession = getOutboxPathForSession;
exports.getHandledPathForSession = getHandledPathForSession;
exports.getSubmitedPathForSession = getSubmitedPathForSession;
exports.getDefaultSoulPath = getDefaultSoulPath;
exports.getDefaultPrivateKeyPath = getDefaultPrivateKeyPath;
exports.getDefaultPublicKeyPath = getDefaultPublicKeyPath;
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const defaultProfileId = "local-default";
const osIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;
const osIdPathSegmentPattern = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
function resolveHomeDir(homeDir) {
    return homeDir ?? process.env.LINZ_HOME ?? node_os_1.default.homedir();
}
function getDefaultProfileId() {
    return defaultProfileId;
}
function resolveOsId(osId) {
    const resolved = osId ?? process.env.LINZ_OS_ID ?? process.env.LINZ_PROFILE_ID ?? defaultProfileId;
    if (!osIdPattern.test(resolved)) {
        throw new Error("os_id 只能包含字母、数字、点、下划线和连字符，且长度不能超过 64");
    }
    return resolved;
}
exports.resolveProfileId = resolveOsId;
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
function getDefaultProfilePath(homeDir = resolveHomeDir(), osId) {
    const resolved = resolveOsId(osId);
    return node_path_1.default.join(getLinzProfilesDir(homeDir), `${resolved}.json`);
}
function getDefaultSessionPath(homeDir = resolveHomeDir(), osId) {
    const resolved = resolveOsId(osId);
    return node_path_1.default.join(getLinzStateDir(homeDir), "sessions", `${resolved}.json`);
}
function deriveStateDirFromSessionPath(sessionPath) {
    const sessionDir = node_path_1.default.dirname(sessionPath);
    if (node_path_1.default.basename(sessionDir) === "sessions") {
        return node_path_1.default.dirname(sessionDir);
    }
    if (node_path_1.default.basename(sessionPath) === "session.json" && node_path_1.default.basename(sessionDir) === ".linz-world") {
        return node_path_1.default.join(sessionDir, "state");
    }
    return sessionDir;
}
function resolveOsIdPathSegment(osId) {
    const resolved = String(osId ?? "").trim();
    if (!osIdPathSegmentPattern.test(resolved)) {
        throw new Error("os_id 只能包含字母、数字、点、下划线和连字符，且长度不能超过 128");
    }
    return resolved;
}
function getBoxDirForSession(sessionPath, osId) {
    return node_path_1.default.join(deriveStateDirFromSessionPath(sessionPath), "box", resolveOsIdPathSegment(osId));
}
function getInboxPathForSession(sessionPath, osId) {
    return node_path_1.default.join(getBoxDirForSession(sessionPath, osId), "unread.json");
}
function getOutboxPathForSession(sessionPath, osId) {
    return node_path_1.default.join(getBoxDirForSession(sessionPath, osId), "out.json");
}
function getHandledPathForSession(sessionPath, osId) {
    return node_path_1.default.join(getBoxDirForSession(sessionPath, osId), "handled.json");
}
function getSubmitedPathForSession(sessionPath, osId) {
    return node_path_1.default.join(getBoxDirForSession(sessionPath, osId), "submited.json");
}
function getDefaultSoulPath(homeDir = resolveHomeDir(), osId) {
    const resolved = resolveOsId(osId);
    return node_path_1.default.join(getLinzStateDir(homeDir), "souls", `${resolved}.md`);
}
function getDefaultPrivateKeyPath(osId = defaultProfileId, homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzKeysDir(homeDir), `${resolveOsId(osId)}.private.pem`);
}
function getDefaultPublicKeyPath(osId = defaultProfileId, homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzKeysDir(homeDir), `${resolveOsId(osId)}.public.pem`);
}

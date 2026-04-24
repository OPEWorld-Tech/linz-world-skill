"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
function resolveHomeDir(homeDir) {
    return homeDir ?? process.env.LINZ_HOME ?? node_os_1.default.homedir();
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
function getDefaultProfilePath(homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzProfilesDir(homeDir), "default.json");
}
function getDefaultSessionPath(homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzStateDir(homeDir), "session.json");
}
function getDefaultSoulPath(homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzStateDir(homeDir), "SOUL.md");
}
function getDefaultPrivateKeyPath(profile_id = "local-default", homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzKeysDir(homeDir), `${profile_id}.private.pem`);
}
function getDefaultPublicKeyPath(profile_id = "local-default", homeDir = resolveHomeDir()) {
    return node_path_1.default.join(getLinzKeysDir(homeDir), `${profile_id}.public.pem`);
}

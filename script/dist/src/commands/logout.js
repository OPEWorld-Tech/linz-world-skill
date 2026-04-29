"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logoutCommand = logoutCommand;
exports.logoutAllCommand = logoutAllCommand;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const path_resolver_1 = require("../config/path-resolver");
const api_client_1 = require("../clients/api-client");
const profile_store_1 = require("../config/profile-store");
const profile_schema_1 = require("../config/profile-schema");
const listener_process_1 = require("../state/listener-process");
const session_state_1 = require("../state/session-state");
async function logoutCommand(profilePath, sessionPath) {
    const profileStore = new profile_store_1.FileProfileStore(profilePath);
    const sessionStore = new session_state_1.FileSessionStateStore(sessionPath);
    const profile = await profileStore.load();
    const session = await sessionStore.load(String(profile.profile_id));
    const stoppedPids = await (0, listener_process_1.stopListenerProcesses)(profilePath, sessionPath, session.listenerPid);
    let serverLogoutReported = false;
    if (profile.os_id) {
        try {
            await new api_client_1.ApiClient({ baseUrl: profile.server_url }).logout(String(profile.os_id));
            serverLogoutReported = true;
        }
        catch {
            serverLogoutReported = false;
        }
    }
    const nextSession = {
        ...(0, session_state_1.createDefaultSessionState)(String(profile.profile_id)),
        profile_id: String(profile.profile_id)
    };
    profile.access_token = undefined;
    profile.credential_state = profile.os_id && profile.soul_id ? "registered" : "pending";
    profile.authorization_state = "unknown";
    await sessionStore.save(nextSession);
    await profileStore.save(profile);
    return {
        loggedOut: true,
        serverLogoutReported,
        listenerStopped: Boolean(session.listenerPid) || stoppedPids.length > 0
    };
}
function deriveHomeDirFromProfilesDir(profilesDir) {
    const linzRoot = node_path_1.default.dirname(profilesDir);
    if (node_path_1.default.basename(linzRoot) === ".linz-world") {
        return node_path_1.default.dirname(linzRoot);
    }
    return undefined;
}
async function listProfileFiles(defaultProfilePath, profilesDir) {
    const files = new Set();
    try {
        await (0, promises_1.readFile)(defaultProfilePath, "utf8");
        files.add(defaultProfilePath);
    }
    catch {
        // 默认 profile 不存在时跳过，避免 logout --all 创建空 profile。
    }
    try {
        const entries = await (0, promises_1.readdir)(profilesDir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isFile() && node_path_1.default.extname(entry.name) === ".json") {
                files.add(node_path_1.default.join(profilesDir, entry.name));
            }
        }
    }
    catch {
        // profiles 目录不存在时没有可清理的 profile。
    }
    return [...files];
}
async function logoutProfileFile(profilePath, sessionPath) {
    const profileStore = new profile_store_1.FileProfileStore(profilePath);
    const sessionStore = new session_state_1.FileSessionStateStore(sessionPath);
    const profile = await profileStore.load();
    let serverLogoutReported = false;
    if (profile.os_id) {
        try {
            await new api_client_1.ApiClient({ baseUrl: profile.server_url }).logout(String(profile.os_id));
            serverLogoutReported = true;
        }
        catch {
            serverLogoutReported = false;
        }
    }
    const nextSession = {
        ...(0, session_state_1.createDefaultSessionState)(String(profile.profile_id)),
        profile_id: String(profile.profile_id)
    };
    profile.access_token = undefined;
    profile.credential_state = profile.os_id && profile.soul_id ? "registered" : "pending";
    profile.authorization_state = "unknown";
    await sessionStore.save(nextSession);
    await profileStore.save(profile);
    return {
        profile_id: String(profile.profile_id),
        os_id: profile.os_id ?? null,
        serverLogoutReported,
        profilePath,
        sessionPath
    };
}
async function logoutAllCommand(input) {
    const profilesDir = input.profilesDir ?? (0, path_resolver_1.getLinzProfilesDir)();
    const homeDir = deriveHomeDirFromProfilesDir(profilesDir);
    const stoppedPids = await (0, listener_process_1.stopAllListenerProcesses)(input.processTools);
    const profileFiles = await listProfileFiles(input.profilePath, profilesDir);
    const loggedOutProfiles = [];
    for (const filePath of profileFiles) {
        let profile;
        try {
            profile = (0, profile_schema_1.validateProfile)(JSON.parse(await (0, promises_1.readFile)(filePath, "utf8")));
        }
        catch {
            continue;
        }
        const sessionPath = node_path_1.default.resolve(filePath) === node_path_1.default.resolve(input.profilePath)
            ? input.sessionPath
            : (0, path_resolver_1.getDefaultSessionPath)(homeDir, String(profile.profile_id));
        loggedOutProfiles.push(await logoutProfileFile(filePath, sessionPath));
    }
    return {
        loggedOut: true,
        all: true,
        listenerStopped: stoppedPids.length > 0,
        stoppedPids,
        profiles: loggedOutProfiles,
        count: loggedOutProfiles.length
    };
}

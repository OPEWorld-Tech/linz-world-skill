"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loginCommand = loginCommand;
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const api_client_1 = require("../clients/api-client");
const profile_store_1 = require("../config/profile-store");
const session_state_1 = require("../state/session-state");
const key_material_1 = require("../utils/key-material");
function buildTargetInbox(os_id) {
    return `wsp.${os_id}`;
}
function uniq(values) {
    return [...new Set((values ?? []).map(String).filter(Boolean))];
}
function stopListenerProcess(pid) {
    if (!pid) {
        return;
    }
    try {
        process.kill(pid);
    }
    catch {
        // 进程已经退出时忽略
    }
}
function spawnListenerProcess(profilePath, sessionPath) {
    const cliEntryPath = node_path_1.default.resolve(__dirname, "../cli.js");
    const child = (0, node_child_process_1.spawn)(process.execPath, [cliEntryPath, "__listen", "--profile-path", profilePath, "--session-path", sessionPath], {
        detached: true,
        stdio: "ignore"
    });
    child.unref();
    return child.pid;
}
async function loginCommand(profilePath, sessionPath, input, options = {}) {
    const profileStore = new profile_store_1.FileProfileStore(profilePath);
    const profile = await profileStore.load();
    const os_id = input.os_id ?? profile.os_id;
    if (!os_id || !profile.soul_id) {
        throw new Error("请先完成 registry 再执行 login");
    }
    const keyMaterial = await (0, key_material_1.ensureLocalKeyMaterial)(profile);
    const timestamp = Date.now();
    const signedNonce = input.signedNonce ??
        (await (0, key_material_1.signWithLocalPrivateKey)(keyMaterial.private_key_path, `${os_id}.${timestamp}`));
    const apiClient = new api_client_1.ApiClient({ baseUrl: profile.server_url });
    const response = await apiClient.login(os_id, signedNonce, timestamp);
    const bootstrap = await apiClient.bootstrapListener(String(response.data.token ?? ""));
    const sessionStore = new session_state_1.FileSessionStateStore(sessionPath);
    const session = await sessionStore.load(String(profile.profile_id));
    const targetInbox = buildTargetInbox(os_id);
    stopListenerProcess(session.listenerPid);
    session.loggedInAt = new Date().toISOString();
    session.token = String(response.data.token ?? "");
    session.tokenExpiresAt = new Date(Date.now() + Number(response.data.expires_in ?? 0) * 1000).toISOString();
    session.credentialId = "";
    session.allowedSubjects = uniq([...(bootstrap.data.allowedSubjects ?? []), targetInbox]);
    session.allowedEventTypes = (bootstrap.data.allowedEventTypes ?? session.allowedSubjects).map(String);
    session.authorization_state = "valid";
    session.online = false;
    session.listenerPid = null;
    session.listenerStartedAt = null;
    session.memorySummary = response.data.memorySummary ?? session.memorySummary ?? null;
    await sessionStore.save(session);
    profile.os_id = os_id;
    profile.access_token = session.token;
    profile.private_key_path = keyMaterial.private_key_path;
    profile.public_key_path = keyMaterial.public_key_path;
    profile.public_key_type = keyMaterial.public_key_type;
    profile.public_key_fingerprint = keyMaterial.fingerprint;
    profile.credential_state = "logged_in";
    profile.authorization_state = "valid";
    await profileStore.save(profile);
    if (options.autoStartListener !== false) {
        const listenerPid = options.spawnListener?.(profilePath, sessionPath) ?? spawnListenerProcess(profilePath, sessionPath);
        session.listenerPid = listenerPid;
        session.listenerStartedAt = new Date().toISOString();
        await sessionStore.save(session);
    }
    return response.data;
}

#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLoginProfileSelection = resolveLoginProfileSelection;
exports.resolveDefaultProfileSelection = resolveDefaultProfileSelection;
exports.main = main;
const node_path_1 = __importDefault(require("node:path"));
const node_process_1 = __importDefault(require("node:process"));
const readline = __importStar(require("node:readline/promises"));
const balance_1 = require("./commands/balance");
const compute_1 = require("./commands/compute");
const index_1 = require("./commands/events/index");
const install_cli_1 = require("./commands/install-cli");
const install_1 = require("./commands/install");
const login_1 = require("./commands/login");
const logout_1 = require("./commands/logout");
const map_1 = require("./commands/map");
const memmory_sink_1 = require("./commands/memmory-sink");
const message_1 = require("./commands/message");
const profiles_1 = require("./commands/profiles");
const publish_1 = require("./commands/publish");
const relationship_1 = require("./commands/relationship");
const registry_1 = require("./commands/registry");
const run_1 = require("./commands/run");
const runtime_1 = require("./commands/runtime");
const status_1 = require("./commands/status");
const profile_store_1 = require("./config/profile-store");
const path_resolver_1 = require("./config/path-resolver");
const error_mapping_1 = require("./errors/error-mapping");
const jsonl_logger_1 = require("./utils/jsonl-logger");
function parseFlags(argv) {
    const result = {};
    for (let index = 0; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith("--")) {
            continue;
        }
        result[token.slice(2)] = argv[index + 1] ?? "true";
        index += 1;
    }
    return result;
}
function sanitizeCliContext(input) {
    const sensitiveFlags = new Set([
        "api-key",
        "signed-nonce",
        "public-key",
        "access-token",
        "token"
    ]);
    return Object.fromEntries(Object.entries(input).map(([key, value]) => [
        key,
        sensitiveFlags.has(key) ? "***" : value
    ]));
}
function sanitizeArgv(argv) {
    const sensitiveFlags = new Set(["--api-key", "--signed-nonce", "--public-key", "--token"]);
    const sanitized = [...argv];
    for (let index = 0; index < sanitized.length; index += 1) {
        if (sensitiveFlags.has(sanitized[index]) && sanitized[index + 1] !== undefined) {
            sanitized[index + 1] = "***";
            index += 1;
        }
    }
    return sanitized;
}
function hasExplicitProfileSelector(flags) {
    return Boolean(flags["os-id"] ??
        flags["profile-id"] ??
        flags["agent-id"] ??
        flags["profile-path"] ??
        node_process_1.default.env.LINZ_OS_ID ??
        node_process_1.default.env.LINZ_PROFILE_ID);
}
function displayProfileName(profile) {
    return String(profile.os_name ?? profile.os_id ?? profile.profile_id);
}
function readProfileOsId(profile) {
    return String(profile.os_id ?? profile.profile_id);
}
function selectDefaultProfile(profiles) {
    if (profiles.length === 1) {
        return profiles[0];
    }
    return null;
}
function deriveHomeDirFromProfilesDir(profilesDir) {
    const linzRoot = node_path_1.default.dirname(profilesDir);
    if (node_path_1.default.basename(linzRoot) === ".linz-world") {
        return node_path_1.default.dirname(linzRoot);
    }
    return undefined;
}
async function promptForProfile(profiles, options = {}) {
    const names = profiles.map(displayProfileName);
    if (!options.prompt && !node_process_1.default.stdin.isTTY) {
        throw new Error(`检测到多个本地 profile，请指定 --os-id；可选 os_name：${names.join(", ")}`);
    }
    const prompt = options.prompt ?? (async (message) => {
        const rl = readline.createInterface({
            input: node_process_1.default.stdin,
            output: node_process_1.default.stdout
        });
        try {
            return (await rl.question(message)).trim();
        }
        finally {
            rl.close();
        }
    });
    const optionsText = profiles
        .map((profile, index) => `${index + 1}. ${displayProfileName(profile)}`)
        .join("\n");
    const answer = await prompt(`检测到多个本地 profile，请选择要使用的 os_name：\n${optionsText}\n请输入序号: `);
    const selectedIndex = Number(answer) - 1;
    if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= profiles.length) {
        throw new Error(`请选择有效的 profile 序号；可选 os_name：${names.join(", ")}`);
    }
    return profiles[selectedIndex];
}
async function resolveLoginProfileSelection(flags, defaults, options = {}) {
    if (hasExplicitProfileSelector(flags)) {
        return defaults;
    }
    const profilesDir = options.profilesDir ?? (0, path_resolver_1.getLinzProfilesDir)();
    const result = await (0, profiles_1.profilesCommand)({
        profilesDir,
        includeAll: false
    });
    if (result.profiles.length === 0) {
        return defaults;
    }
    const selected = selectDefaultProfile(result.profiles)
        ?? await promptForProfile(result.profiles, options);
    const homeDir = deriveHomeDirFromProfilesDir(profilesDir);
    const osId = readProfileOsId(selected);
    return {
        osId,
        profilePath: String(selected.profile_path),
        sessionPath: flags["session-path"] ?? (0, path_resolver_1.getDefaultSessionPath)(homeDir, osId)
    };
}
async function resolveDefaultProfileSelection(flags, defaults, options = {}) {
    if (hasExplicitProfileSelector(flags)) {
        return defaults;
    }
    const profilesDir = options.profilesDir ?? (0, path_resolver_1.getLinzProfilesDir)();
    const result = await (0, profiles_1.profilesCommand)({
        profilesDir,
        includeAll: true
    });
    const selected = selectDefaultProfile(result.profiles)
        ?? (result.profiles.length > 0 ? await promptForProfile(result.profiles, options) : null);
    if (!selected) {
        return defaults;
    }
    const homeDir = deriveHomeDirFromProfilesDir(profilesDir);
    const osId = readProfileOsId(selected);
    return {
        osId,
        profilePath: String(selected.profile_path),
        sessionPath: flags["session-path"] ?? (0, path_resolver_1.getDefaultSessionPath)(homeDir, osId)
    };
}
function resolveProfileSelectionMode(command, subcommand, flags) {
    if (command === "login") {
        return "login";
    }
    if (command === "compute" && flags.token) {
        return "none";
    }
    if (command === "profiles" ||
        command === "install-cli" ||
        command === "install" ||
        (command === "logout" && flags.all === "true") ||
        (command === "runtime" && subcommand === "detect")) {
        return "none";
    }
    return "default";
}
async function resolveProfileSelection(command, subcommand, flags, defaults, options) {
    const mode = resolveProfileSelectionMode(command, subcommand, flags);
    if (mode === "login") {
        return resolveLoginProfileSelection(flags, defaults, { prompt: options.promptLoginProfile });
    }
    if (mode === "none") {
        return defaults;
    }
    return resolveDefaultProfileSelection(flags, defaults, { prompt: options.promptLoginProfile });
}
async function main(argv = node_process_1.default.argv.slice(2), options = {}) {
    const [command = "status", rawSubcommand] = argv;
    const knownCommands = new Set([
        "install-cli",
        "install",
        "registry",
        "map",
        "status",
        "profiles",
        "login",
        "logout",
        "__listen",
        "publish",
        "relationship",
        "compute",
        "memmory_sink",
        "message",
        "balance",
        "event",
        "runtime"
    ]);
    if (!knownCommands.has(command)) {
        throw new Error(`未知命令: ${command}`);
    }
    const hasSubcommand = command === "event" || command === "runtime" || command === "message";
    const subcommand = hasSubcommand ? rawSubcommand ?? null : null;
    const flags = parseFlags(argv.slice(hasSubcommand ? 2 : 1));
    const logger = (0, jsonl_logger_1.createJsonlLogger)((0, path_resolver_1.getLinzLogsDir)(), "linz.cli");
    const skillRoot = flags["skill-root"] ??
        node_process_1.default.env.LINZ_SKILL_ROOT ??
        node_path_1.default.resolve(node_process_1.default.cwd(), "linz-world-skill");
    const scriptRoot = flags["script-root"] ?? node_process_1.default.env.LINZ_SCRIPT_ROOT ?? node_path_1.default.resolve(skillRoot, "script");
    const selectedOsId = flags["os-id"] ?? flags["profile-id"] ?? flags["agent-id"];
    let osId = (0, path_resolver_1.resolveOsId)(selectedOsId);
    let profilePath = flags["profile-path"] ?? (0, path_resolver_1.getDefaultProfilePath)(undefined, osId);
    let sessionPath = flags["session-path"] ?? (0, path_resolver_1.getDefaultSessionPath)(undefined, osId);
    let soul_path = flags["soul-path"] ?? (0, path_resolver_1.getDefaultSoulPath)(undefined, osId);
    const hintTemplatePath = flags["hint-template-path"] ?? node_path_1.default.resolve(skillRoot, "assets/templates/soul-tail-block.md");
    const profileSelection = await resolveProfileSelection(command, subcommand, flags, { osId, profilePath, sessionPath }, options);
    osId = profileSelection.osId;
    profilePath = await (0, profile_store_1.resolveExistingProfilePath)(profileSelection.profilePath, osId);
    sessionPath = profileSelection.sessionPath;
    soul_path = flags["soul-path"] ?? (0, path_resolver_1.getDefaultSoulPath)(undefined, osId);
    await logger.info("command_started", {
        command,
        subcommand: subcommand ?? null,
        argv: sanitizeArgv(argv),
        flags: sanitizeCliContext(flags),
        osId,
        profilePath,
        sessionPath,
        soul_path
    });
    try {
        let result;
        switch (command) {
            case "install-cli":
                result = await (0, install_cli_1.installCliCommand)({
                    launcherSourceDir: scriptRoot,
                    skillRootDir: skillRoot
                });
                break;
            case "install":
                result = await (0, install_1.installCommand)({
                    profilePath,
                    server_url: flags["server-url"],
                    nats_url: flags["nats-url"],
                    runtimeType: flags["runtime-type"],
                    os_id: osId,
                    soul_path,
                    hintTemplatePath,
                    launcherSourceDir: scriptRoot,
                    skillRootDir: skillRoot
                });
                break;
            case "registry":
                result = await (0, registry_1.registryCommand)(profilePath, {
                    publicKey: flags["public-key"],
                    public_key_type: flags["public-key-type"],
                    fingerprint: flags["fingerprint"],
                    agent_name: flags["agent-name"],
                    persona_seed: flags["persona-seed"],
                    type: flags.type ?? flags["os-type"],
                    runtime_type: flags["runtime-type"]
                }, { sessionPath });
                break;
            case "map":
                result = await (0, map_1.mapCommand)(profilePath, sessionPath);
                break;
            case "status":
                result = await (0, status_1.statusCommand)(profilePath, sessionPath);
                break;
            case "profiles":
                result = await (0, profiles_1.profilesCommand)({
                    profilesDir: (0, path_resolver_1.getLinzProfilesDir)(),
                    includeAll: flags.all === "true"
                });
                break;
            case "login":
                result = await (0, login_1.loginCommand)(profilePath, sessionPath, {
                    os_id: flags["os-id"],
                    signedNonce: flags["signed-nonce"],
                    runtime: flags.runtime
                });
                break;
            case "logout":
                result = flags.all === "true"
                    ? await (0, logout_1.logoutAllCommand)({
                        profilePath,
                        sessionPath,
                        profilesDir: (0, path_resolver_1.getLinzProfilesDir)(),
                        processTools: options.logoutProcessTools
                    })
                    : await (0, logout_1.logoutCommand)(profilePath, sessionPath);
                break;
            case "__listen":
                result = await (0, run_1.listenCommand)(profilePath, sessionPath);
                break;
            case "publish":
                result = await (0, publish_1.publishCommand)(profilePath, sessionPath, {
                    subject: flags.subject,
                    eventType: flags["event-type"],
                    payload: flags["payload-json"] ? JSON.parse(flags["payload-json"]) : {}
                });
                break;
            case "relationship":
                result = await (0, relationship_1.relationshipCommand)(profilePath, sessionPath, {
                    addOsId: flags.add,
                    relationType: flags["relation-type"],
                    summary: flags.summary
                });
                break;
            case "compute":
                result = await (0, compute_1.computeCommand)(profilePath, sessionPath, {
                    apiKey: flags["api-key"],
                    token: flags.token,
                    serverUrl: flags.server ?? flags["server-url"],
                    model: flags.model,
                    message: flags.message,
                    system: flags.system,
                    stream: flags.stream === "true"
                });
                break;
            case "memmory_sink":
                result = await (0, memmory_sink_1.memmorySinkCommand)(profilePath, sessionPath, {
                    sourceEventId: flags["source-event-id"] ?? flags["source-event"],
                    artifactRef: flags["artifact-ref"] ?? flags.artifact,
                    sinkReason: flags["sink-reason"] ?? flags.reason
                });
                break;
            case "message":
                result = await (0, message_1.messageCommand)(profilePath, sessionPath, subcommand ?? "", flags);
                break;
            case "balance":
                result = await (0, balance_1.balanceCommand)(profilePath, sessionPath);
                break;
            case "event":
                result = await (0, index_1.highFrequencyEventCommand)(profilePath, sessionPath, subcommand ?? "", flags["payload-json"] ? JSON.parse(flags["payload-json"]) : {});
                break;
            case "runtime":
                result = await (0, runtime_1.runtimeCommand)(profilePath, subcommand ?? "", flags);
                break;
        }
        await logger.info("command_succeeded", {
            command,
            subcommand: subcommand ?? null,
            result
        });
        return result;
    }
    catch (error) {
        await logger.error("command_failed", error, {
            command,
            subcommand: subcommand ?? null
        });
        throw error;
    }
}
if (require.main === module) {
    void main()
        .then((result) => {
        if (result !== undefined) {
            node_process_1.default.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        }
    })
        .catch((error) => {
        node_process_1.default.stderr.write(`${(0, error_mapping_1.mapErrorMessage)(error)}\n`);
        node_process_1.default.exitCode = 1;
    });
}

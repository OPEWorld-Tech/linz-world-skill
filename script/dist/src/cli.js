#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const node_path_1 = __importDefault(require("node:path"));
const node_process_1 = __importDefault(require("node:process"));
const compute_1 = require("./commands/compute");
const index_1 = require("./commands/events/index");
const install_cli_1 = require("./commands/install-cli");
const install_1 = require("./commands/install");
const login_1 = require("./commands/login");
const logout_1 = require("./commands/logout");
const map_1 = require("./commands/map");
const memmory_sink_1 = require("./commands/memmory-sink");
const publish_1 = require("./commands/publish");
const registry_1 = require("./commands/registry");
const run_1 = require("./commands/run");
const status_1 = require("./commands/status");
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
async function main(argv = node_process_1.default.argv.slice(2)) {
    const [command = "status", rawSubcommand] = argv;
    const subcommand = command === "event" ? rawSubcommand ?? null : null;
    const flags = parseFlags(argv.slice(command === "event" ? 2 : 1));
    const logger = (0, jsonl_logger_1.createJsonlLogger)((0, path_resolver_1.getLinzLogsDir)(), "linz.cli");
    const skillRoot = flags["skill-root"] ??
        node_process_1.default.env.LINZ_SKILL_ROOT ??
        node_path_1.default.resolve(node_process_1.default.cwd(), "skill/linz-world-skill");
    const scriptRoot = flags["script-root"] ?? node_process_1.default.env.LINZ_SCRIPT_ROOT ?? node_path_1.default.resolve(skillRoot, "script");
    const profilePath = flags["profile-path"] ?? (0, path_resolver_1.getDefaultProfilePath)();
    const sessionPath = flags["session-path"] ?? (0, path_resolver_1.getDefaultSessionPath)();
    const soul_path = flags["soul-path"] ?? (0, path_resolver_1.getDefaultSoulPath)();
    const hintTemplatePath = flags["hint-template-path"] ?? node_path_1.default.resolve(skillRoot, "assets/templates/soul-tail-block.md");
    await logger.info("command_started", {
        command,
        subcommand: subcommand ?? null,
        argv: sanitizeArgv(argv),
        flags: sanitizeCliContext(flags),
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
                    runtimeType: flags["runtime-type"] ?? "Hermes-Agent",
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
                    runtime_type: flags["runtime-type"]
                });
                break;
            case "map":
                result = await (0, map_1.mapCommand)(profilePath, sessionPath);
                break;
            case "status":
                result = await (0, status_1.statusCommand)(profilePath, sessionPath);
                break;
            case "login":
                result = await (0, login_1.loginCommand)(profilePath, sessionPath, {
                    agent_id: flags["agent-id"],
                    signedNonce: flags["signed-nonce"]
                });
                break;
            case "logout":
                result = await (0, logout_1.logoutCommand)(profilePath, sessionPath);
                break;
            case "__listen":
                result = await (0, run_1.listenCommand)(profilePath, sessionPath);
                break;
            case "run":
                throw new Error("run 命令已移除，请使用 login 启动监听，使用 logout 关闭监听");
                break;
            case "publish":
                result = await (0, publish_1.publishCommand)(profilePath, sessionPath, {
                    subject: flags.subject,
                    eventType: flags["event-type"],
                    payload: flags["payload-json"] ? JSON.parse(flags["payload-json"]) : {}
                });
                break;
            case "compute":
                result = await (0, compute_1.computeCommand)(profilePath, sessionPath, {
                    apiKey: flags["api-key"],
                    model: flags.model,
                    message: flags.message,
                    stream: flags.stream === "true"
                });
                break;
            case "memmory_sink":
                result = await (0, memmory_sink_1.memmorySinkCommand)(profilePath, sessionPath, {
                    sourceEventId: flags["source-event-id"],
                    artifactRef: flags["artifact-ref"],
                    sinkReason: flags["sink-reason"]
                });
                break;
            case "event":
                result = await (0, index_1.highFrequencyEventCommand)(profilePath, sessionPath, subcommand ?? "", flags["payload-json"] ? JSON.parse(flags["payload-json"]) : {});
                break;
            default:
                throw new Error(`未知命令: ${command}`);
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

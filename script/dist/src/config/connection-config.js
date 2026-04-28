"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasComputeProviderAPIKeyConfigured = hasComputeProviderAPIKeyConfigured;
exports.getDefaultConnectionConfig = getDefaultConnectionConfig;
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const fallbackConfig = {
    server_url: "http://127.0.0.1:8080",
    nats_url: "nats://127.0.0.1:4222",
    runtime_timeout_ms: 300_000,
    heartbeat_interval_ms: 60_000,
    chat_auto_reply_limit: 10,
    chat_round_cooldown_ms: 600_000
};
const computeProviderKeyNames = [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "OPENAI_API_KEY",
    "MINIMAX_API_KEY"
];
function parseEnvFile(content) {
    const values = {};
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }
        const separatorIndex = line.indexOf("=");
        if (separatorIndex < 0) {
            continue;
        }
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
        values[key] = value;
    }
    return values;
}
function candidateConfigPaths() {
    return [
        process.env.LINZ_CLI_CONFIG_PATH,
        node_path_1.default.resolve(__dirname, "..", "..", "linz-world-cli.env"),
        node_path_1.default.resolve(__dirname, "..", "..", "..", "linz-world-cli.env"),
        node_path_1.default.resolve(process.cwd(), "linz-world-cli.env")
    ].filter(Boolean);
}
function loadConfiguredEnvValues() {
    for (const configPath of candidateConfigPaths()) {
        if (!(0, node_fs_1.existsSync)(configPath)) {
            continue;
        }
        return parseEnvFile((0, node_fs_1.readFileSync)(configPath, "utf8"));
    }
    return {};
}
function hasComputeProviderAPIKeyConfigured() {
    const fileValues = loadConfiguredEnvValues();
    return computeProviderKeyNames.some((key) => {
        const fileValue = fileValues[key];
        const value = fileValue && fileValue.trim() !== "" ? fileValue : process.env[key];
        return typeof value === "string" && value.trim() !== "";
    });
}
function resolveRuntimeTimeout(value) {
    if (!value) {
        return fallbackConfig.runtime_timeout_ms;
    }
    const timeout = Number(value);
    if (!Number.isFinite(timeout) || timeout <= 0) {
        throw new Error("RUNTIME_TIMEOUT_MS 必须是正数毫秒");
    }
    return timeout;
}
function resolvePositiveInteger(value, fallback, label) {
    if (!value) {
        return fallback;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${label} 必须是大于 0 的整数`);
    }
    return parsed;
}
function getDefaultConnectionConfig() {
    for (const configPath of candidateConfigPaths()) {
        if (!(0, node_fs_1.existsSync)(configPath)) {
            continue;
        }
        const values = parseEnvFile((0, node_fs_1.readFileSync)(configPath, "utf8"));
        return {
            server_url: values.SERVER_URL || fallbackConfig.server_url,
            nats_url: values.NATS_URL || fallbackConfig.nats_url,
            runtime_timeout_ms: resolveRuntimeTimeout(values.RUNTIME_TIMEOUT_MS),
            heartbeat_interval_ms: resolvePositiveInteger(values.HEARTBEAT_INTERVAL_MS, fallbackConfig.heartbeat_interval_ms, "HEARTBEAT_INTERVAL_MS"),
            chat_auto_reply_limit: resolvePositiveInteger(values.CHAT_AUTO_REPLY_LIMIT, fallbackConfig.chat_auto_reply_limit, "CHAT_AUTO_REPLY_LIMIT"),
            chat_round_cooldown_ms: resolvePositiveInteger(values.CHAT_ROUND_COOLDOWN_MS, fallbackConfig.chat_round_cooldown_ms, "CHAT_ROUND_COOLDOWN_MS")
        };
    }
    return fallbackConfig;
}

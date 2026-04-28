"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeCommand = runtimeCommand;
const profile_store_1 = require("../config/profile-store");
const connection_config_1 = require("../config/connection-config");
const runtime_adapters_1 = require("../config/runtime-adapters");
const runtime_detection_1 = require("../config/runtime-detection");
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function parseCommandLine(value) {
    const tokens = [];
    let current = "";
    let quote = null;
    for (let index = 0; index < value.length; index += 1) {
        const char = value[index];
        if ((char === "\"" || char === "'") && !quote) {
            quote = char;
            continue;
        }
        if (char === quote) {
            quote = null;
            continue;
        }
        if (/\s/.test(char) && !quote) {
            if (current) {
                tokens.push(current);
                current = "";
            }
            continue;
        }
        current += char;
    }
    if (current) {
        tokens.push(current);
    }
    return tokens;
}
function hasPromptTemplate(args) {
    return args.some((arg) => arg.includes("{{event_json}}") || arg.includes("{{prompt}}"));
}
function normalizeTimeout(value) {
    if (value === undefined) {
        return (0, connection_config_1.getDefaultConnectionConfig)().runtime_timeout_ms;
    }
    const timeout = Number(value);
    if (!Number.isFinite(timeout) || timeout <= 0) {
        throw new Error("runtime timeout 必须是正数毫秒");
    }
    return timeout;
}
function buildComputeRuntimeConfig(type, flags) {
    if (flags.command || flags.exec) {
        throw new Error(`${type} runtime 已统一走 compute 接口，不再支持 --command；请改用 --model`);
    }
    const model = String(flags.model ?? "").trim();
    if (!model) {
        throw new Error(`${type} runtime 必须提供 --model，内置 agent 已统一走 compute 接口`);
    }
    return {
        kind: "compute",
        model,
        timeout_ms: normalizeTimeout(flags["timeout-ms"]),
        configured_by: "linz.runtime.configure",
        configured_at: new Date().toISOString()
    };
}
function buildCommandRuntimeConfig(type, flags) {
    const isCustom = (0, runtime_adapters_1.normalizeRuntimeType)(type) === "custom";
    if (!isCustom) {
        throw new Error(`未知 runtime 类型: ${type}`);
    }
    const rawCommand = flags.exec ?? flags.command;
    const sourceTokens = rawCommand
        ? parseCommandLine(rawCommand)
        : [];
    if (sourceTokens.length === 0) {
        throw new Error("runtime command 不能为空");
    }
    const command = sourceTokens[0];
    const args = sourceTokens.slice(1);
    const finalArgs = hasPromptTemplate(args) ? args : [...args, runtime_adapters_1.DEFAULT_EVENT_PROMPT];
    return {
        kind: "command",
        command,
        args: finalArgs,
        timeout_ms: normalizeTimeout(flags["timeout-ms"]),
        cwd: flags.cwd,
        configured_by: "linz.runtime.configure",
        configured_at: new Date().toISOString()
    };
}
function buildHttpRuntimeConfig(flags) {
    if (!flags.url) {
        throw new Error("http runtime 必须提供 --url");
    }
    return {
        kind: "http",
        url: flags.url,
        timeout_ms: normalizeTimeout(flags["timeout-ms"]),
        configured_by: "linz.runtime.configure",
        configured_at: new Date().toISOString()
    };
}
async function runtimeCommand(profilePath, subcommand, flags, options = {}) {
    const store = new profile_store_1.FileProfileStore(profilePath);
    const profile = await store.load();
    if (subcommand === "detect") {
        return (0, runtime_detection_1.detectAgentRuntime)(profile, options.runtimeDetectionOptions);
    }
    if (subcommand !== "configure") {
        throw new Error("runtime 命令仅支持 detect 或 configure");
    }
    const runtimeType = (0, runtime_adapters_1.normalizeRuntimeType)(flags.type ?? "");
    if (!runtimeType) {
        throw new Error("runtime configure 必须提供 --type");
    }
    const runtimeConfig = flags.url && !flags.command && !flags.exec
        ? buildHttpRuntimeConfig(flags)
        : (0, runtime_adapters_1.isKnownRuntimeType)(runtimeType)
            ? buildComputeRuntimeConfig(runtimeType, flags)
            : buildCommandRuntimeConfig(runtimeType, flags);
    const agents = asRecord(profile.agents);
    agents[runtimeType] = runtimeConfig;
    profile.agents = agents;
    profile.defaultAgent = flags.default === "false"
        ? profile.defaultAgent
        : runtimeType;
    if ((0, runtime_adapters_1.isKnownRuntimeType)(runtimeType)) {
        profile.agent_runtime_type = runtimeType;
    }
    profile.runtime_setup_state = "configured";
    profile.runtime_setup_at = new Date().toISOString();
    await store.save(profile);
    return {
        profile_id: profile.profile_id,
        defaultAgent: profile.defaultAgent,
        configured: {
            type: runtimeType,
            ...runtimeConfig
        }
    };
}

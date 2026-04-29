"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dispatchRuntimeAgentEvent = dispatchRuntimeAgentEvent;
exports.hasRuntimeAgentEventHandler = hasRuntimeAgentEventHandler;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const api_client_1 = require("../clients/api-client");
const connection_config_1 = require("../config/connection-config");
const runtime_adapters_1 = require("../config/runtime-adapters");
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function selectRuntimeConfig(profile) {
    const agents = asRecord(profile.agents);
    const defaultAgent = (0, runtime_adapters_1.normalizeRuntimeType)(String(profile.defaultAgent ?? ""));
    if (defaultAgent && agents[defaultAgent]) {
        return {
            runtimeType: defaultAgent,
            runtimeConfig: asRecord(agents[defaultAgent])
        };
    }
    const legacyRuntime = asRecord(profile.agent_runtime);
    if (legacyRuntime.configured_by === "linz.runtime.configure") {
        return {
            runtimeType: (0, runtime_adapters_1.normalizeRuntimeType)(String(profile.agent_runtime_type ?? "custom")),
            runtimeConfig: legacyRuntime
        };
    }
    return null;
}
function normalizeRuntimeConfig(profile) {
    const selected = selectRuntimeConfig(profile);
    if (!selected) {
        return null;
    }
    const runtimeType = (0, runtime_adapters_1.normalizeRuntimeType)(selected.runtimeType);
    const runtimeConfig = selected.runtimeConfig;
    const kind = runtimeConfig.kind ?? "command";
    if (runtimeConfig.configured_by !== "linz.runtime.configure") {
        throw new Error("runtime 未通过 linz runtime configure 显式配置，监听进程拒绝执行");
    }
    if (kind === "http") {
        if (!runtimeConfig.url) {
            throw new Error("http runtime 缺少 url");
        }
        return { runtimeType, runtimeConfig: { ...runtimeConfig, kind } };
    }
    if (kind === "compute") {
        if (!(0, connection_config_1.isRuntimeComputeEnabled)()) {
            const adapter = (0, runtime_adapters_1.getRuntimeAdapter)(runtimeType);
            if (!adapter?.trigger?.length) {
                throw new Error(`${runtimeType} runtime 已关闭 compute，但缺少可回退的本地 CLI adapter`);
            }
            const fallbackArgs = Array.isArray(runtimeConfig.args)
                ? runtimeConfig.args.map(String)
                : adapter.trigger.slice(1);
            return {
                runtimeType,
                runtimeConfig: {
                    ...runtimeConfig,
                    kind: "command",
                    command: String(runtimeConfig.command ?? adapter.trigger[0]),
                    args: fallbackArgs,
                    timeout_ms: Number(runtimeConfig.timeout_ms ?? 300_000)
                }
            };
        }
        if (!runtimeConfig.model) {
            throw new Error("compute runtime 缺少 model");
        }
        return {
            runtimeType,
            runtimeConfig: {
                ...runtimeConfig,
                kind,
                model: String(runtimeConfig.model),
                timeout_ms: Number(runtimeConfig.timeout_ms ?? 300_000)
            }
        };
    }
    const adapter = (0, runtime_adapters_1.getRuntimeAdapter)(runtimeType);
    if (adapter && (0, connection_config_1.isRuntimeComputeEnabled)() && (0, connection_config_1.hasComputeProviderAPIKeyConfigured)()) {
        throw new Error(`${runtimeType} runtime 的旧式 CLI 直连配置已停用，请重新执行 linz runtime configure --type ${runtimeType} --model <MODEL>`);
    }
    if (!adapter && runtimeType !== "custom") {
        throw new Error(`未知 runtime 类型: ${runtimeType}`);
    }
    if (!runtimeConfig.command) {
        throw new Error("command runtime 缺少 command");
    }
    return {
        runtimeType,
        runtimeConfig: {
            ...runtimeConfig,
            kind,
            args: Array.isArray(runtimeConfig.args) ? runtimeConfig.args.map(String) : [],
            timeout_ms: Number(runtimeConfig.timeout_ms ?? 300_000)
        }
    };
}
function buildAgentPrompt(envelope) {
    return runtime_adapters_1.DEFAULT_EVENT_PROMPT.replace("{{event_json}}", JSON.stringify(envelope, null, 2));
}
function tail(value, maxLength = 4096) {
    if (value.length <= maxLength) {
        return value;
    }
    return value.slice(-maxLength);
}
function buildRuntimeEnv(envelope, runtimeConfig) {
    return {
        ...process.env,
        ...(runtimeConfig.env ?? {}),
        LINZ_EVENT_SUBJECT: envelope.subject,
        LINZ_EVENT_TYPE: envelope.event_type,
        LINZ_EVENT_ID: envelope.event_id,
        LINZ_EVENT_PROFILE_ID: envelope.profile_id,
        LINZ_EVENT_OS_ID: envelope.os_id,
        LINZ_EVENT_JSON: JSON.stringify(envelope)
    };
}
function renderRuntimeArg(arg, envelope) {
    const eventJson = JSON.stringify(envelope);
    return arg
        .replaceAll("{{event_json}}", eventJson)
        .replaceAll("{{prompt}}", buildAgentPrompt(envelope));
}
function getPathEnv() {
    return process.env.Path ?? process.env.PATH ?? "";
}
function findWindowsCommandOnPath(command) {
    const commandExt = node_path_1.default.extname(command);
    const candidates = commandExt ? [command] : [`${command}.exe`, `${command}.cmd`, `${command}.bat`, command];
    const directories = getPathEnv().split(node_path_1.default.delimiter).filter(Boolean);
    for (const directory of directories) {
        for (const candidate of candidates) {
            const fullPath = node_path_1.default.join(directory, candidate);
            if ((0, node_fs_1.existsSync)(fullPath)) {
                return fullPath;
            }
        }
    }
    return null;
}
function resolveNpmShimScript(commandPath) {
    if (![".cmd", ".bat"].includes(node_path_1.default.extname(commandPath).toLowerCase())) {
        return null;
    }
    try {
        const content = (0, node_fs_1.readFileSync)(commandPath, "utf8");
        const match = /"%dp0%\\([^"]+\.js)"\s+%\*/i.exec(content);
        if (!match) {
            return null;
        }
        const scriptPath = node_path_1.default.join(node_path_1.default.dirname(commandPath), match[1]);
        return (0, node_fs_1.existsSync)(scriptPath) ? scriptPath : null;
    }
    catch {
        return null;
    }
}
function resolveRuntimeSpawnTarget(command, args) {
    if (process.platform !== "win32") {
        return { command, args };
    }
    const commandPath = node_path_1.default.isAbsolute(command) || command.includes(node_path_1.default.sep)
        ? command
        : findWindowsCommandOnPath(command);
    if (!commandPath) {
        return { command, args };
    }
    const npmShimScript = resolveNpmShimScript(commandPath);
    if (npmShimScript) {
        return {
            command: "node",
            args: [npmShimScript, ...args]
        };
    }
    return {
        command: commandPath,
        args
    };
}
async function runCommandRuntime(runtimeType, runtimeConfig, envelope) {
    const args = (runtimeConfig.args ?? []).map((arg) => renderRuntimeArg(arg, envelope));
    const env = buildRuntimeEnv(envelope, runtimeConfig);
    const cwd = node_path_1.default.resolve(String(runtimeConfig.workspace ?? runtimeConfig.cwd ?? process.cwd()));
    const shouldSendStdin = !args.some((arg) => arg.includes(envelope.event_id) || arg.includes(envelope.event_type));
    const spawnTarget = resolveRuntimeSpawnTarget(String(runtimeConfig.command), args);
    const result = await new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(spawnTarget.command, spawnTarget.args, {
            cwd,
            env,
            stdio: ["pipe", "pipe", "pipe"],
            windowsHide: true
        });
        let stdout = "";
        let stderr = "";
        let settled = false;
        const timer = setTimeout(() => {
            child.kill();
            if (!settled) {
                settled = true;
                reject(new Error("Agent runtime 处理事件超时"));
            }
        }, runtimeConfig.timeout_ms ?? 300_000);
        child.stdout?.on("data", (chunk) => {
            stdout = tail(stdout + chunk.toString("utf8"));
        });
        child.stderr?.on("data", (chunk) => {
            stderr = tail(stderr + chunk.toString("utf8"));
        });
        child.on("error", (error) => {
            clearTimeout(timer);
            if (!settled) {
                settled = true;
                reject(error);
            }
        });
        child.on("close", (exitCode) => {
            clearTimeout(timer);
            if (!settled) {
                settled = true;
                resolve({ exitCode, stdout, stderr });
            }
        });
        child.stdin?.end(shouldSendStdin ? `${JSON.stringify(envelope)}\n` : "", "utf8");
    });
    const runtimeResult = {
        schema_version: "linz.agent_runtime_result.v1",
        handled_at: new Date().toISOString(),
        runtime_type: runtimeType,
        event_id: envelope.event_id,
        event_type: envelope.event_type,
        subject: envelope.subject,
        exit_code: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr
    };
    if (result.exitCode !== 0) {
        throw new Error(`Agent runtime 处理事件失败，退出码: ${result.exitCode}${result.stderr ? `，错误: ${result.stderr}` : ""}`);
    }
    return runtimeResult;
}
async function runHttpRuntime(runtimeType, runtimeConfig, envelope) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), runtimeConfig.timeout_ms ?? 30_000);
    try {
        const response = await fetch(String(runtimeConfig.url), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(envelope),
            signal: controller.signal
        });
        const text = tail(await response.text());
        const runtimeResult = {
            schema_version: "linz.agent_runtime_result.v1",
            handled_at: new Date().toISOString(),
            runtime_type: runtimeType,
            event_id: envelope.event_id,
            event_type: envelope.event_type,
            subject: envelope.subject,
            http_status: response.status,
            stdout: text,
            stderr: ""
        };
        if (!response.ok) {
            throw new Error(`HTTP runtime 处理事件失败，状态码: ${response.status}${text ? `，响应: ${text}` : ""}`);
        }
        return runtimeResult;
    }
    finally {
        clearTimeout(timer);
    }
}
function extractComputeText(responseData) {
    const firstChoice = Array.isArray(responseData?.choices) ? responseData.choices[0] : null;
    const content = firstChoice?.message?.content;
    if (typeof content === "string") {
        return content;
    }
    if (Array.isArray(content)) {
        return content
            .map((item) => typeof item?.text === "string" ? item.text : "")
            .filter(Boolean)
            .join("\n");
    }
    if (typeof responseData?.content === "string") {
        return responseData.content;
    }
    return JSON.stringify(responseData);
}
async function runComputeRuntime(runtimeType, runtimeConfig, envelope, profile, session) {
    const token = String(session?.token ?? profile?.access_token ?? "").trim();
    if (!token) {
        throw new Error("compute runtime 缺少可用登录 token，请重新执行 linz login");
    }
    const apiClient = new api_client_1.ApiClient({ baseUrl: String(profile.server_url ?? "") });
    const response = await apiClient.compute({
        token,
        model: String(runtimeConfig.model ?? ""),
        message: buildAgentPrompt(envelope),
        stream: false
    });
    const responseData = response?.data ?? {};
    return {
        schema_version: "linz.agent_runtime_result.v1",
        handled_at: new Date().toISOString(),
        runtime_type: runtimeType,
        event_id: envelope.event_id,
        event_type: envelope.event_type,
        subject: envelope.subject,
        model: runtimeConfig.model,
        provider: responseData.provider,
        stdout: tail(extractComputeText(responseData)),
        stderr: ""
    };
}
async function dispatchRuntimeAgentEvent({ envelope, profile, session }) {
    const selected = normalizeRuntimeConfig(profile);
    if (!selected) {
        return { runtimeInvoked: false, result: null };
    }
    let result;
    if (selected.runtimeConfig.kind === "http") {
        result = await runHttpRuntime(selected.runtimeType, selected.runtimeConfig, envelope);
    }
    else if (selected.runtimeConfig.kind === "compute") {
        result = await runComputeRuntime(selected.runtimeType, selected.runtimeConfig, envelope, profile, session);
    }
    else {
        result = await runCommandRuntime(selected.runtimeType, selected.runtimeConfig, envelope);
    }
    return { runtimeInvoked: true, result };
}
function hasRuntimeAgentEventHandler(profile) {
    return selectRuntimeConfig(profile) !== null;
}

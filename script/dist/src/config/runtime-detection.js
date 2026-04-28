"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectAgentRuntime = detectAgentRuntime;
const node_child_process_1 = require("node:child_process");
const node_os_1 = __importDefault(require("node:os"));
const node_process_1 = __importDefault(require("node:process"));
const node_util_1 = require("node:util");
const runtime_adapters_1 = require("./runtime-adapters");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
async function defaultCommandProbe(command, args) {
    try {
        const executable = node_process_1.default.platform === "win32" ? "cmd.exe" : command;
        const executableArgs = node_process_1.default.platform === "win32"
            ? ["/d", "/s", "/c", [command, ...args].join(" ")]
            : args;
        const result = await execFileAsync(executable, executableArgs, {
            timeout: 2000,
            windowsHide: true
        });
        return `${result.stdout}${result.stderr}`.trim();
    }
    catch {
        return "";
    }
}
function buildCandidate(type, detectCommand, versionOutput) {
    const command = detectCommand[0] ?? type;
    const detected = Boolean(versionOutput);
    return {
        type,
        detected,
        confidence: detected ? "low" : "none",
        source: detected ? "command.version" : "none",
        command,
        command_version: detected ? versionOutput : undefined,
        signals: detected ? [`command.${type}.version`] : []
    };
}
function summarizeSource(candidates) {
    return candidates.length > 0 ? "command.version" : "none";
}
async function detectAgentRuntime(_profile = {}, options = {}) {
    const platform = options.platform ?? node_process_1.default.platform;
    const commandProbe = options.commandProbe ?? defaultCommandProbe;
    const candidates = [];
    for (const [type, adapter] of Object.entries(runtime_adapters_1.RUNTIME_ADAPTERS)) {
        if (!adapter.detect) {
            continue;
        }
        const [command, ...args] = adapter.detect;
        const output = await commandProbe(command, args);
        const candidate = buildCandidate(type, adapter.detect, output);
        if (candidate.detected) {
            candidates.push(candidate);
        }
    }
    const evidence = {
        detected: candidates.length > 0,
        runtime_type: "Runtime-Candidates",
        confidence: candidates.length > 0 ? "low" : "none",
        source: summarizeSource(candidates),
        signals: candidates.flatMap((candidate) => candidate.signals),
        candidates,
        limitations: [
            "detect 只能确认本机可能存在对应 CLI",
            "detect 不确认 CLI 是否已登录",
            "detect 不确认 CLI 是否支持非交互执行",
            "detect 不确认 CLI 是否能访问当前工作区",
            "detect 不确认 CLI 是否会读取事件 prompt",
            "detect 不确认 CLI 是否可在后台长期运行"
        ],
        detected_at: new Date().toISOString(),
        host: {
            platform,
            release: node_os_1.default.release()
        }
    };
    return {
        runtime_type: "Unknown-Agent",
        agent_runtime: null,
        agent_runtime_detection: evidence
    };
}

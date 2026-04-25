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
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
function buildCodexRuntime(workspace) {
    return {
        type: "codex-cli",
        command: "codex",
        args: [
            "exec",
            "--ask-for-approval",
            "never",
            "--sandbox",
            "workspace-write",
            "-"
        ],
        workspace: workspace ?? node_process_1.default.cwd(),
        timeout_ms: 300_000
    };
}
function hasAnyEnv(env, keys) {
    return keys.filter((key) => Boolean(env[key]));
}
async function defaultCommandProbe(command, args) {
    try {
        const result = await execFileAsync(command, args, {
            timeout: 2000,
            windowsHide: true
        });
        return `${result.stdout}${result.stderr}`.trim();
    }
    catch {
        return "";
    }
}
async function defaultProcessChainProbe(pid, platform) {
    if (platform !== "win32") {
        return [];
    }
    try {
        const script = [
            "$pidValue = " + Number(pid),
            "$items = @()",
            "for ($i = 0; $i -lt 8 -and $pidValue; $i++) {",
            "  $p = Get-CimInstance Win32_Process -Filter \"ProcessId=$pidValue\"",
            "  if (-not $p) { break }",
            "  $items += ($p.Name + ' ' + $p.CommandLine)",
            "  $pidValue = $p.ParentProcessId",
            "}",
            "$items | ConvertTo-Json -Compress"
        ].join("; ");
        const result = await execFileAsync("powershell", ["-NoProfile", "-Command", script], {
            timeout: 2000,
            windowsHide: true
        });
        const parsed = JSON.parse(result.stdout || "[]");
        return Array.isArray(parsed) ? parsed.map(String) : [String(parsed)];
    }
    catch {
        return [];
    }
}
function includesAny(value, needles) {
    const lower = value.toLowerCase();
    return needles.some((needle) => lower.includes(needle));
}
function summarizeSource(signals) {
    const categories = new Set(signals.map((signal) => signal.split(".")[0]));
    return [...categories].join("+") || "none";
}
function confidenceFor(signals, commandVersion) {
    const score = signals.filter((signal) => signal.startsWith("env.")).length +
        signals.filter((signal) => signal.startsWith("process.")).length +
        (commandVersion ? 1 : 0);
    if (score >= 3) {
        return "high";
    }
    if (score === 2) {
        return "medium";
    }
    if (score === 1) {
        return "low";
    }
    return "none";
}
function buildResult(runtimeType, signals, processChain, commandVersion, workspace) {
    const confidence = confidenceFor(signals, commandVersion);
    const detected = runtimeType !== "Unknown-Agent" && confidence !== "none";
    const detection = {
        detected,
        runtime_type: runtimeType,
        confidence,
        source: summarizeSource(signals),
        signals,
        process_chain: processChain,
        detected_at: new Date().toISOString()
    };
    if (commandVersion) {
        detection.command = runtimeType === "Codex" ? "codex" : "";
        detection.command_version = commandVersion;
    }
    return {
        runtime_type: detected ? runtimeType : "Unknown-Agent",
        agent_runtime: runtimeType === "Codex" && detected ? buildCodexRuntime(workspace) : null,
        agent_runtime_detection: detection
    };
}
async function detectAgentRuntime(profile = {}, options = {}) {
    const env = options.env ?? node_process_1.default.env;
    const platform = options.platform ?? node_process_1.default.platform;
    const workspace = options.workspace ?? node_process_1.default.cwd();
    const commandProbe = options.commandProbe ?? defaultCommandProbe;
    const processChainProbe = options.processChainProbe ?? ((pid) => defaultProcessChainProbe(pid, platform));
    const processChain = await processChainProbe(options.pid ?? node_process_1.default.pid);
    const signals = [];
    for (const key of hasAnyEnv(env, ["CODEX_THREAD_ID", "CODEX_MANAGED_BY_NPM", "CODEX_HOME"])) {
        signals.push(`env.${key}`);
    }
    for (const entry of processChain) {
        if (includesAny(entry, ["codex", "codex-cli"])) {
            signals.push("process.codex");
            break;
        }
    }
    const codexVersion = signals.length > 0 ? await commandProbe("codex", ["--version"]) : "";
    if (codexVersion && signals.length > 0) {
        signals.push("command.codex.version");
    }
    if (signals.length > 0) {
        return buildResult("Codex", [...new Set(signals)], processChain, codexVersion, workspace);
    }
    const claudeSignals = [
        ...hasAnyEnv(env, ["CLAUDE_CODE_SSE_PORT", "CLAUDECODE"]).map((key) => `env.${key}`)
    ];
    for (const entry of processChain) {
        if (includesAny(entry, ["claude", "claude-code"])) {
            claudeSignals.push("process.claude");
            break;
        }
    }
    if (claudeSignals.length > 0) {
        return buildResult("Claude Code", [...new Set(claudeSignals)], processChain, "", workspace);
    }
    const geminiSignals = hasAnyEnv(env, ["GEMINI_API_KEY", "GEMINI_CLI"]).map((key) => `env.${key}`);
    for (const entry of processChain) {
        if (includesAny(entry, ["gemini"])) {
            geminiSignals.push("process.gemini");
            break;
        }
    }
    if (geminiSignals.length > 0) {
        return buildResult("Gemini CLI", [...new Set(geminiSignals)], processChain, "", workspace);
    }
    return {
        runtime_type: "Unknown-Agent",
        agent_runtime: profile.agent_runtime ?? null,
        agent_runtime_detection: {
            detected: false,
            runtime_type: "Unknown-Agent",
            confidence: "none",
            source: "none",
            signals: [],
            process_chain: processChain,
            host: {
                platform,
                release: node_os_1.default.release()
            },
            detected_at: new Date().toISOString()
        }
    };
}

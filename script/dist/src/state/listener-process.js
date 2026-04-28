"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSameListenerProcess = isSameListenerProcess;
exports.listListenerCandidateProcesses = listListenerCandidateProcesses;
exports.stopProcess = stopProcess;
exports.stopListenerProcesses = stopListenerProcesses;
exports.stopAllListenerProcesses = stopAllListenerProcesses;
exports.withListenerLoginLock = withListenerLoginLock;
const node_child_process_1 = require("node:child_process");
const promises_1 = require("node:fs/promises");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_process_1 = __importDefault(require("node:process"));
const node_util_1 = require("node:util");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function normalizeForCommandMatch(value) {
    return node_path_1.default.resolve(value).replace(/\\/g, "/").toLowerCase();
}
function normalizeCommandLine(value) {
    return String(value ?? "").replace(/\\/g, "/").toLowerCase();
}
function parseProcessListJson(stdout) {
    if (!stdout.trim()) {
        return [];
    }
    const parsed = JSON.parse(stdout);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    return rows
        .map((row) => ({
        pid: Number(row.ProcessId ?? row.PID ?? row.pid ?? 0),
        commandLine: String(row.CommandLine ?? row.commandLine ?? "")
    }))
        .filter((row) => row.pid > 0 && row.commandLine.length > 0);
}
function parsePsOutput(stdout) {
    return stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
        const match = line.match(/^(\d+)\s+(.+)$/);
        return {
            pid: Number(match?.[1] ?? 0),
            commandLine: String(match?.[2] ?? "")
        };
    })
        .filter((row) => row.pid > 0 && row.commandLine.length > 0);
}
function isSameListenerProcess(commandLine, profilePath, sessionPath) {
    const normalizedCommand = normalizeCommandLine(commandLine);
    const normalizedProfile = normalizeForCommandMatch(profilePath);
    const normalizedSession = normalizeForCommandMatch(sessionPath);
    return (normalizedCommand.includes("__listen") &&
        normalizedCommand.includes(normalizedProfile) &&
        normalizedCommand.includes(normalizedSession));
}
async function listListenerCandidateProcesses() {
    if (node_os_1.default.platform() === "win32") {
        const { stdout } = await execFileAsync("powershell.exe", [
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*__listen*' } | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"
        ]);
        return parseProcessListJson(stdout);
    }
    const { stdout } = await execFileAsync("ps", ["-eo", "pid=,args="]);
    return parsePsOutput(stdout);
}
function isProcessAlive(pid) {
    try {
        node_process_1.default.kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
async function stopProcess(pid, waitMs = 1_500) {
    if (!pid || pid === node_process_1.default.pid) {
        return;
    }
    try {
        node_process_1.default.kill(pid);
    }
    catch {
        return;
    }
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline) {
        if (!isProcessAlive(pid)) {
            return;
        }
        await sleep(50);
    }
    try {
        node_process_1.default.kill(pid, "SIGKILL");
    }
    catch {
        // 进程已退出或当前平台不支持二次信号时忽略。
    }
}
async function stopListenerProcesses(profilePath, sessionPath, recordedPid, tools = {}) {
    let candidates = null;
    try {
        candidates = await (tools.listProcesses ?? listListenerCandidateProcesses)();
    }
    catch {
        candidates = null;
    }
    const pids = new Set();
    const matchedRecordedPid = recordedPid &&
        candidates?.some((candidate) => candidate.pid === Number(recordedPid) &&
            isSameListenerProcess(candidate.commandLine, profilePath, sessionPath));
    if (matchedRecordedPid || (recordedPid && candidates === null)) {
        pids.add(Number(recordedPid));
    }
    for (const candidate of candidates ?? []) {
        if (isSameListenerProcess(candidate.commandLine, profilePath, sessionPath)) {
            pids.add(candidate.pid);
        }
    }
    for (const pid of pids) {
        await (tools.stopProcess ?? ((targetPid) => stopProcess(targetPid, tools.stopWaitMs)))(pid);
    }
    return [...pids];
}
async function stopAllListenerProcesses(tools = {}) {
    let candidates = [];
    try {
        candidates = await (tools.listProcesses ?? listListenerCandidateProcesses)();
    }
    catch {
        return [];
    }
    const pids = [...new Set(candidates.map((candidate) => candidate.pid).filter((pid) => pid > 0))];
    for (const pid of pids) {
        await (tools.stopProcess ?? ((targetPid) => stopProcess(targetPid, tools.stopWaitMs)))(pid);
    }
    return pids;
}
async function withListenerLoginLock(sessionPath, action, options = {}) {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const staleMs = options.staleMs ?? 60_000;
    const lockPath = `${sessionPath}.login.lock`;
    const startedAt = Date.now();
    let handle = null;
    await (0, promises_1.mkdir)(node_path_1.default.dirname(lockPath), { recursive: true });
    while (!handle) {
        try {
            handle = await (0, promises_1.open)(lockPath, "wx");
            await handle.writeFile(`${node_process_1.default.pid}\n${new Date().toISOString()}\n`, "utf8");
        }
        catch (error) {
            if (error && typeof error === "object" && "code" in error && error.code === "EEXIST") {
                try {
                    const info = await (0, promises_1.stat)(lockPath);
                    if (Date.now() - info.mtimeMs > staleMs) {
                        await (0, promises_1.unlink)(lockPath);
                        continue;
                    }
                }
                catch {
                    continue;
                }
                if (Date.now() - startedAt >= timeoutMs) {
                    throw new Error("登录正在由另一个 linz 进程处理，请稍后重试");
                }
                await sleep(100);
                continue;
            }
            throw error;
        }
    }
    try {
        return await action();
    }
    finally {
        await handle.close();
        try {
            await (0, promises_1.unlink)(lockPath);
        }
        catch {
            // 锁文件可能已被陈旧锁清理逻辑删除，忽略即可。
        }
    }
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.installCliCommand = installCliCommand;
const promises_1 = require("node:fs/promises");
const node_os_1 = __importDefault(require("node:os"));
const node_path_1 = __importDefault(require("node:path"));
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const path_resolver_1 = require("../config/path-resolver");
const execFileAsync = (0, node_util_1.promisify)(node_child_process_1.execFile);
function createNodeLauncher(scriptRoot, skillRoot) {
    const cliEntry = node_path_1.default.join(scriptRoot, "dist", "src", "cli.js");
    const errorEntry = node_path_1.default.join(scriptRoot, "dist", "src", "errors", "error-mapping.js");
    return `#!/usr/bin/env node
const process = require("node:process");
process.env.LINZ_SCRIPT_ROOT = process.env.LINZ_SCRIPT_ROOT || ${JSON.stringify(scriptRoot)};
process.env.LINZ_SKILL_ROOT = process.env.LINZ_SKILL_ROOT || ${JSON.stringify(skillRoot)};
const { main } = require(${JSON.stringify(cliEntry)});
const { mapErrorMessage } = require(${JSON.stringify(errorEntry)});

void main(process.argv.slice(2))
  .then((result) => {
    if (result !== undefined) {
      process.stdout.write(\`\${JSON.stringify(result, null, 2)}\\n\`);
    }
  })
  .catch((error) => {
    process.stderr.write(\`\${mapErrorMessage(error)}\\n\`);
    process.exitCode = 1;
  });
`;
}
function createWindowsLauncher(scriptRoot, skillRoot) {
    const cliEntry = node_path_1.default.join(scriptRoot, "dist", "src", "cli.js");
    return `@echo off
set "LINZ_SCRIPT_ROOT=${scriptRoot}"
set "LINZ_SKILL_ROOT=${skillRoot}"
node "${cliEntry}" %*
`;
}
function hasPathEntry(pathEnv, candidate, platform = process.platform) {
    const normalizedCandidate = node_path_1.default.normalize(candidate).toLowerCase();
    return String(pathEnv ?? "")
        .split(node_path_1.default.delimiter)
        .filter(Boolean)
        .some((entry) => {
        const normalizedEntry = node_path_1.default.normalize(entry).toLowerCase();
        return platform === "win32" ? normalizedEntry === normalizedCandidate : entry === candidate;
    });
}
function getDefaultUserBinDir(platform = process.platform, homeDir = node_os_1.default.homedir()) {
    if (platform === "win32") {
        return (0, path_resolver_1.getLinzBinDir)(homeDir);
    }
    return (0, path_resolver_1.getLinzBinDir)(homeDir);
}
async function updateWindowsUserPath(binDir, execFileImpl = execFileAsync) {
    const escapedBinDir = String(binDir).replace(/'/g, "''");
    const psScript = [
        `$binDir = '${escapedBinDir}'`,
        "$current = [Environment]::GetEnvironmentVariable('Path', 'User')",
        "$entries = @()",
        "if ($current) { $entries = $current -split ';' | Where-Object { $_ } }",
        "if ($entries -notcontains $binDir) {",
        "  $updated = @($entries + $binDir) -join ';'",
        "  [Environment]::SetEnvironmentVariable('Path', $updated, 'User')",
        "  Write-Output 'updated'",
        "} else {",
        "  Write-Output 'unchanged'",
        "}"
    ].join("; ");
    const { stdout } = await execFileImpl("powershell", [
        "-NoProfile",
        "-Command",
        psScript
    ]);
    return stdout.includes("updated") || stdout.includes("unchanged");
}
async function installCliCommand(args) {
    const launcherSourceDir = args.launcherSourceDir;
    const skillRootDir = args.skillRootDir ?? node_path_1.default.resolve(launcherSourceDir, "..");
    const userBinDir = args.userBinDir ?? getDefaultUserBinDir(args.platform);
    const launcherName = args.launcherName ?? "linz";
    const pathEnv = args.pathEnv ?? process.env.PATH ?? "";
    const platform = args.platform ?? process.platform;
    const pathUpdater = args.pathUpdater ??
        (platform === "win32" ? async (binDir) => updateWindowsUserPath(binDir, args.execFileImpl) : null);
    const launcherPath = node_path_1.default.join(userBinDir, launcherName);
    const windowsLauncherPath = node_path_1.default.join(userBinDir, `${launcherName}.cmd`);
    if (!launcherSourceDir) {
        throw new Error("当前分发入口不可用，请从 skill 的 script 目录重新执行 install-cli");
    }
    await (0, promises_1.mkdir)(userBinDir, { recursive: true });
    await (0, promises_1.writeFile)(launcherPath, createNodeLauncher(launcherSourceDir, skillRootDir), "utf8");
    await (0, promises_1.chmod)(launcherPath, 0o755);
    if (platform === "win32") {
        await (0, promises_1.writeFile)(windowsLauncherPath, createWindowsLauncher(launcherSourceDir, skillRootDir), "utf8");
    }
    let pathUpdated = hasPathEntry(pathEnv, userBinDir, platform);
    let pathHint = "";
    if (!pathUpdated && pathUpdater) {
        pathUpdated = await pathUpdater(userBinDir);
    }
    if (!pathUpdated) {
        pathHint =
            platform === "win32"
                ? `请把 ${userBinDir} 加入用户 PATH，之后即可直接使用 linz`
                : `请把 ${userBinDir} 加入 PATH，之后即可直接使用 linz`;
    }
    return {
        launcher_path: launcherPath,
        windows_launcher_path: platform === "win32" ? windowsLauncherPath : null,
        user_bin_dir: userBinDir,
        path_updated: pathUpdated,
        path_hint: pathHint
    };
}

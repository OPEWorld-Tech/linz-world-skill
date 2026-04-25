"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installCommand = installCommand;
const promises_1 = require("node:fs/promises");
const install_cli_1 = require("./install-cli");
const profile_schema_1 = require("../config/profile-schema");
const profile_store_1 = require("../config/profile-store");
const runtime_detection_1 = require("../config/runtime-detection");
const soul_tail_block_1 = require("../utils/soul-tail-block");
function ensureNodeRuntime() {
    const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
    if (major < 20) {
        throw new Error("linz install 需要 Node.js 20 或更高版本");
    }
}
async function installCommand(args) {
    ensureNodeRuntime();
    const cliInstall = args.launcherSourceDir
        ? await (0, install_cli_1.installCliCommand)({
            launcherSourceDir: args.launcherSourceDir,
            skillRootDir: args.skillRootDir,
            userBinDir: args.userBinDir,
            pathEnv: args.pathEnv,
            platform: args.platform,
            pathUpdater: args.pathUpdater,
            execFileImpl: args.execFileImpl
        })
        : null;
    const store = new profile_store_1.FileProfileStore(args.profilePath);
    const current = await store.load();
    const runtime = await (0, runtime_detection_1.detectAgentRuntime)(current, args.runtimeDetectionOptions);
    const credential_state = current.os_id && current.soul_id
        ? current.credential_state
        : "installed";
    const profile = (0, profile_schema_1.createDefaultProfile)({
        ...current,
        profile_id: args.profile_id ?? current.profile_id,
        server_url: args.server_url,
        nats_url: args.nats_url,
        agent_runtime_type: runtime.runtime_type,
        agent_runtime: runtime.agent_runtime ?? current.agent_runtime,
        agent_runtime_detection: runtime.agent_runtime_detection,
        soul_path: args.soul_path,
        credential_state
    });
    await store.save(profile);
    const hintBlock = await (0, promises_1.readFile)(args.hintTemplatePath, "utf8");
    await (0, soul_tail_block_1.writeSoulTailBlock)(args.soul_path, hintBlock);
    return {
        profile_path: store.path(),
        soul_path: args.soul_path,
        cli_launcher_installed: Boolean(cliInstall),
        cli_install: cliInstall
    };
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.messageCommand = messageCommand;
const path_resolver_1 = require("../config/path-resolver");
const profile_store_1 = require("../config/profile-store");
const command_guards_1 = require("../guards/command-guards");
const box_state_1 = require("../state/box-state");
function resolveLimit(value, fallback) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error("limit 必须是大于 0 的整数");
    }
    return limit;
}
function isEnabled(value) {
    return value === true || value === "true" || value === "1" || value === "yes";
}
async function messageCommand(profilePath, sessionPath, subcommand, flags) {
    if (subcommand !== "unread") {
        throw new Error(`未知 message 子命令: ${subcommand}`);
    }
    const profile = await new profile_store_1.FileProfileStore(profilePath).load();
    (0, command_guards_1.ensureRegistered)(profile);
    const unreadPath = (0, path_resolver_1.getInboxPathForSession)(sessionPath, String(profile.os_id ?? ""));
    const submitedPath = (0, path_resolver_1.getSubmitedPathForSession)(sessionPath, String(profile.os_id ?? ""));
    const messages = await (0, box_state_1.readBoxArray)(unreadPath);
    const shouldTake = isEnabled(flags.take) || isEnabled(flags.delete);
    const limit = resolveLimit(flags.limit, shouldTake ? 1 : null);
    const selected = limit === null ? messages : messages.slice(0, limit);
    if (!shouldTake) {
        return {
            messages: selected,
            count: selected.length,
            remaining: messages.length,
            taken: false
        };
    }
    const selectedIndexes = new Set(selected.map((item) => String(item.index ?? "")));
    const remainingMessages = messages.filter((item) => !selectedIndexes.has(String(item.index ?? "")));
    await (0, box_state_1.writeBoxArray)(unreadPath, remainingMessages);
    for (const item of selected) {
        await (0, box_state_1.appendBoxRecord)(submitedPath, (0, box_state_1.buildTakenBoxRecord)(item));
    }
    return {
        messages: selected,
        count: selected.length,
        remaining: remainingMessages.length,
        taken: true
    };
}

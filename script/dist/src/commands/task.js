"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskCommand = taskCommand;
const api_client_1 = require("../clients/api-client");
const profile_store_1 = require("../config/profile-store");
const command_guards_1 = require("../guards/command-guards");
const session_state_1 = require("../state/session-state");
function readRequiredString(values, key, label) {
    const value = String(values[key] ?? "").trim();
    if (!value) {
        throw new Error(`TaskBubble 命令缺少 ${label}`);
    }
    return value;
}
function readOptionalString(values, key) {
    const value = String(values[key] ?? "").trim();
    return value || undefined;
}
function readOptionalJsonObject(values, key, label) {
    const rawValue = readOptionalString(values, key);
    if (!rawValue) {
        return undefined;
    }
    const parsed = JSON.parse(rawValue);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error(`${label} 必须是 JSON 对象`);
    }
    return parsed;
}
function readOptionalJsonArray(values, key, label) {
    const rawValue = readOptionalString(values, key);
    if (!rawValue) {
        return undefined;
    }
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
        throw new Error(`${label} 必须是 JSON 数组`);
    }
    return parsed;
}
async function decomposeTaskCommand(profilePath, sessionPath, input) {
    const profile = await new profile_store_1.FileProfileStore(profilePath).load();
    const session = await new session_state_1.FileSessionStateStore(sessionPath).load(String(profile.profile_id));
    (0, command_guards_1.ensureWorldActionReady)(profile, session, "task decompose");
    const parentBubbleID = readRequiredString(input, "parentBubbleId", "parent_bubble_id");
    const name = readRequiredString(input, "name", "name");
    const goal = readRequiredString(input, "goal", "goal");
    const techLeadOsID = readOptionalString(input, "techLeadOsId") ?? String(profile.os_id ?? "").trim();
    if (!techLeadOsID) {
        throw new Error("TaskBubble 命令无法从本地 profile 获取 tech_lead_os_id");
    }
    const payload = {
        parent_bubble_id: parentBubbleID,
        name,
        goal,
        tech_lead_os_id: techLeadOsID
    };
    const techLeadOsName = readOptionalString(input, "techLeadOsName") ?? String(profile.os_name ?? "").trim();
    if (techLeadOsName) {
        payload.tech_lead_os_name = techLeadOsName;
    }
    const optionalFields = {
        slots: readOptionalJsonArray(input, "slotsJson", "slots"),
        membrane: readOptionalJsonObject(input, "membraneJson", "membrane"),
        acceptance: readOptionalJsonObject(input, "acceptanceJson", "acceptance"),
        dissolution_contract: readOptionalJsonObject(input, "dissolutionJson", "dissolution_contract")
    };
    for (const [key, value] of Object.entries(optionalFields)) {
        if (value !== undefined) {
            payload[key] = value;
        }
    }
    const apiClient = new api_client_1.ApiClient({ baseUrl: profile.server_url });
    const response = await apiClient.createTaskBubble(payload);
    return {
        ...response.data,
        task_created: true,
        parent_bubble_id: parentBubbleID,
        tech_lead_os_id: techLeadOsID
    };
}
async function taskCommand(profilePath, sessionPath, subcommand, input) {
    switch (subcommand) {
        case "decompose":
            return decomposeTaskCommand(profilePath, sessionPath, input);
        default:
            throw new Error("未知 task 子命令，请使用: linz task decompose");
    }
}

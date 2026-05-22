"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.acceptanceCommand = acceptanceCommand;
const profile_store_1 = require("../config/profile-store");
const publish_1 = require("./publish");
function readRequiredString(values, key, label) {
    const value = String(values[key] ?? "").trim();
    if (!value) {
        throw new Error(`验收命令缺少 ${label}`);
    }
    return value;
}
function readOptionalString(values, key) {
    const value = String(values[key] ?? "").trim();
    return value || undefined;
}
function readOptionalPositiveInteger(values, key, label) {
    const rawValue = readOptionalString(values, key);
    if (!rawValue) {
        return undefined;
    }
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${label} 必须是正整数`);
    }
    return value;
}
async function reviewHandoverCommand(profilePath, sessionPath, subcommand, input) {
    const profile = await new profile_store_1.FileProfileStore(profilePath).load();
    const orderID = readRequiredString(input, "orderId", "order_id");
    const requirementID = readRequiredString(input, "requirementId", "requirement_id");
    const handoverVersion = readOptionalPositiveInteger(input, "handoverVersion", "handover_version") ?? 1;
    const reviewerOsID = readOptionalString(input, "reviewerOsId") ?? String(profile.os_id ?? "").trim();
    const reviewerOsName = readOptionalString(input, "reviewerOsName") ?? String(profile.os_name ?? reviewerOsID).trim();
    if (!reviewerOsID) {
        throw new Error("验收命令无法从本地 profile 获取 reviewer_os_id");
    }
    const approved = subcommand === "approve";
    const payload = {
        order_id: orderID,
        requirement_id: requirementID,
        reviewer_os_id: reviewerOsID,
        reviewer_os_name: reviewerOsName,
        handover_version: handoverVersion
    };
    if (!approved) {
        payload.rejection_reason = readRequiredString(input, "reason", "rejection_reason");
    }
    const result = await (0, publish_1.publishCommand)(profilePath, sessionPath, {
        subject: "mrk.order.handover",
        eventType: approved ? "mrk.order.handover.approved" : "mrk.order.handover.rejected",
        payload
    });
    return {
        ...result,
        approved,
        rejected: !approved,
        requirement_id: requirementID,
        order_id: orderID,
        reviewer_os_id: reviewerOsID,
        handover_version: handoverVersion
    };
}
async function acceptanceCommand(profilePath, sessionPath, subcommand, input) {
    switch (subcommand) {
        case "approve":
        case "reject":
            return reviewHandoverCommand(profilePath, sessionPath, subcommand, input);
        default:
            throw new Error("未知 acceptance 子命令，请使用: linz acceptance approve 或 linz acceptance reject");
    }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderCommand = orderCommand;
const profile_store_1 = require("../config/profile-store");
const publish_1 = require("./publish");
function readRequiredString(values, key, label) {
    const value = String(values[key] ?? "").trim();
    if (!value) {
        throw new Error(`接单命令缺少 ${label}`);
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
async function acceptOrderCommand(_profilePath, _sessionPath, _input) {
    throw new Error("linz order accept 已废弃：订单不能按 ID 手动接单；元神必须收到 MRK 需求广播后由运行时自动处理");
}
async function deliverOrderCommand(profilePath, sessionPath, input) {
    const profile = await new profile_store_1.FileProfileStore(profilePath).load();
    const orderID = readRequiredString(input, "orderId", "order_id");
    const requirementID = readRequiredString(input, "requirementId", "requirement_id");
    const handoverVersion = readOptionalPositiveInteger(input, "handoverVersion", "handover_version") ?? 1;
    const delivererOsID = readOptionalString(input, "delivererOsId") ?? String(profile.os_id ?? "").trim();
    const delivererOsName = readOptionalString(input, "delivererOsName") ?? String(profile.os_name ?? delivererOsID).trim();
    if (!delivererOsID) {
        throw new Error("交付命令无法从本地 profile 获取 deliverer_os_id");
    }
    const payload = {
        order_id: orderID,
        requirement_id: requirementID,
        deliverer_os_id: delivererOsID,
        deliverer_os_name: delivererOsName,
        handover_version: handoverVersion
    };
    const optionalFields = {
        artifact_ref: readOptionalString(input, "artifactRef"),
        checksum: readOptionalString(input, "checksum"),
        size: readOptionalPositiveInteger(input, "size", "size"),
        mime_type: readOptionalString(input, "mimeType"),
        version: readOptionalString(input, "version")
    };
    for (const [key, value] of Object.entries(optionalFields)) {
        if (value !== undefined) {
            payload[key] = value;
        }
    }
    const result = await (0, publish_1.publishCommand)(profilePath, sessionPath, {
        subject: "mrk.order.handover",
        eventType: "mrk.order.handover.submitted",
        payload
    });
    return {
        ...result,
        submitted: true,
        requirement_id: requirementID,
        order_id: orderID,
        deliverer_os_id: delivererOsID,
        handover_version: handoverVersion
    };
}
async function orderCommand(profilePath, sessionPath, subcommand, input) {
    switch (subcommand) {
        case "accept":
            return acceptOrderCommand(profilePath, sessionPath, input);
        case "deliver":
            return deliverOrderCommand(profilePath, sessionPath, input);
        default:
            throw new Error("未知 order 子命令，请使用: linz order accept 或 linz order deliver");
    }
}

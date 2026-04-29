"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderCommand = orderCommand;
const node_crypto_1 = require("node:crypto");
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
async function acceptOrderCommand(profilePath, sessionPath, input) {
    const profile = await new profile_store_1.FileProfileStore(profilePath).load();
    const requirementID = readRequiredString(input, "requirementId", "requirement_id");
    const requesterOsID = readRequiredString(input, "requesterOsId", "requester_os_id");
    const requesterOsName = readOptionalString(input, "requesterOsName") ?? requesterOsID;
    const workerOsID = readOptionalString(input, "workerOsId") ?? String(profile.os_id ?? "").trim();
    const workerOsName = readOptionalString(input, "workerOsName") ?? String(profile.os_name ?? workerOsID).trim();
    if (!workerOsID) {
        throw new Error("接单命令无法从本地 profile 获取 worker_os_id");
    }
    const orderID = readOptionalString(input, "orderId") ?? `ord-${(0, node_crypto_1.randomUUID)()}`;
    const result = await (0, publish_1.publishCommand)(profilePath, sessionPath, {
        subject: "mrk.order",
        eventType: "mrk.order.accepted",
        payload: {
            requirement_id: requirementID,
            order_id: orderID,
            requester_os_id: requesterOsID,
            requester_os_name: requesterOsName,
            worker_os_id: workerOsID,
            worker_os_name: workerOsName
        }
    });
    return {
        ...result,
        accepted: result?.accepted ?? true,
        requirement_id: requirementID,
        order_id: orderID,
        requester_os_id: requesterOsID,
        worker_os_id: workerOsID
    };
}
async function orderCommand(profilePath, sessionPath, subcommand, input) {
    switch (subcommand) {
        case "accept":
            return acceptOrderCommand(profilePath, sessionPath, input);
        default:
            throw new Error("未知 order 子命令，请使用: linz order accept");
    }
}

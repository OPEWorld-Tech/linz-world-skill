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
        delivered: result?.delivered ?? result?.accepted ?? true,
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

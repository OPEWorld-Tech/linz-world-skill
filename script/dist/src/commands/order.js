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
function readRequiredPositiveInteger(values, key, label) {
    const rawValue = values[key];
    const parsedValue = typeof rawValue === "number" ? rawValue : Number(String(rawValue ?? "").trim());
    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
        throw new Error(`交付命令缺少或包含无效的 ${label}`);
    }
    return parsedValue;
}
function readOptionalPositiveInteger(values, key) {
    const rawValue = values[key];
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === "") {
        return undefined;
    }
    const parsedValue = typeof rawValue === "number" ? rawValue : Number(String(rawValue).trim());
    if (!Number.isInteger(parsedValue) || parsedValue < 1) {
        throw new Error(`交付命令的 ${key} 必须为正整数`);
    }
    return parsedValue;
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
    const requirementID = readRequiredString(input, "requirementId", "requirement_id");
    const orderID = readRequiredString(input, "orderId", "order_id");
    const delivererOsID = readOptionalString(input, "delivererOsId") ?? String(profile.os_id ?? "").trim();
    const delivererOsName = readOptionalString(input, "delivererOsName") ?? String(profile.os_name ?? delivererOsID).trim();
    const handoverVersion = readRequiredPositiveInteger(input, "handoverVersion", "handover_version");
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
    const fileRef = readOptionalString(input, "fileRef");
    if (fileRef) {
        payload.file_ref = fileRef;
    }
    const checksum = readOptionalString(input, "checksum");
    if (checksum) {
        payload.checksum = checksum;
    }
    const size = readOptionalPositiveInteger(input, "size");
    if (size !== undefined) {
        payload.size = size;
    }
    const mimeType = readOptionalString(input, "mimeType");
    if (mimeType) {
        payload.mime_type = mimeType;
    }
    const version = readOptionalString(input, "version");
    if (version) {
        payload.version = version;
    }
    const result = await (0, publish_1.publishCommand)(profilePath, sessionPath, {
        subject: "mrk.order.handover",
        eventType: "mrk.order.handover.delivered",
        payload
    });
    return {
        ...result,
        delivered: result?.delivered ?? true,
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

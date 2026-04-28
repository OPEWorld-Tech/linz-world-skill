"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readBoxArray = readBoxArray;
exports.appendBoxRecord = appendBoxRecord;
exports.writeBoxArray = writeBoxArray;
exports.moveUnreadBoxRecordToSubmited = moveUnreadBoxRecordToSubmited;
exports.restoreSubmitedBoxRecordToUnread = restoreSubmitedBoxRecordToUnread;
exports.markSubmitedBoxRecordFailed = markSubmitedBoxRecordFailed;
exports.buildTakenBoxRecord = buildTakenBoxRecord;
exports.resolveBoxIndex = resolveBoxIndex;
exports.buildUnreadBoxRecord = buildUnreadBoxRecord;
exports.buildHandledBoxRecord = buildHandledBoxRecord;
exports.buildOutBoxRecord = buildOutBoxRecord;
exports.removeBoxRecord = removeBoxRecord;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function nowIsoString() {
    return new Date().toISOString();
}
async function readBoxArray(filePath) {
    try {
        const content = await (0, promises_1.readFile)(filePath, "utf8");
        const parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) {
            throw new Error("本地 box 文件不是 JSON 数组");
        }
        return parsed;
    }
    catch (error) {
        if (error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}
async function appendBoxRecord(filePath, record) {
    await (0, promises_1.mkdir)(node_path_1.default.dirname(filePath), { recursive: true });
    const records = await readBoxArray(filePath);
    records.push(record);
    await (0, promises_1.writeFile)(filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}
async function writeBoxArray(filePath, records) {
    await (0, promises_1.mkdir)(node_path_1.default.dirname(filePath), { recursive: true });
    await (0, promises_1.writeFile)(filePath, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}
async function moveUnreadBoxRecordToSubmited(unreadPath, submitedPath, index, handlerType = "runtime") {
    const records = await readBoxArray(unreadPath);
    const targetIndex = records.findIndex((record) => String(record?.index ?? "") === String(index));
    if (targetIndex < 0 || String(records[targetIndex]?.status ?? "unread") !== "unread") {
        return null;
    }
    const original = records[targetIndex];
    const time = nowIsoString();
    const submitedRecord = {
        ...original,
        time,
        status: "processing",
        handler_type: handlerType,
        processing_at: time,
        submited_at: time
    };
    records.splice(targetIndex, 1);
    await writeBoxArray(unreadPath, records);
    await appendBoxRecord(submitedPath, submitedRecord);
    return submitedRecord;
}
async function restoreSubmitedBoxRecordToUnread(submitedPath, unreadPath, record) {
    await removeBoxRecord(submitedPath, String(record?.index ?? ""));
    await appendBoxRecord(unreadPath, {
        ...record,
        time: nowIsoString(),
        status: "unread",
        handler_type: undefined,
        processing_at: undefined,
        submited_at: undefined,
        failed_at: undefined,
        failure_reason: undefined
    });
}
async function markSubmitedBoxRecordFailed(filePath, index, reason) {
    const records = await readBoxArray(filePath);
    const targetIndex = records.findIndex((item) => String(item?.index ?? "") === String(index));
    if (targetIndex < 0) {
        return;
    }
    const time = nowIsoString();
    records[targetIndex] = {
        ...records[targetIndex],
        time,
        status: "failed",
        failed_at: time,
        failure_reason: reason
    };
    await writeBoxArray(filePath, records);
}
function buildTakenBoxRecord(unreadRecord) {
    const time = nowIsoString();
    return {
        ...unreadRecord,
        index: String(unreadRecord.index ?? resolveBoxIndex(unreadRecord.event)),
        subject: String(unreadRecord.subject ?? ""),
        time,
        status: "taken",
        taken_at: time,
        handler_type: "manual_take",
        event: unreadRecord.event ?? {}
    };
}
function resolveBoxIndex(event) {
    const record = asRecord(event);
    return String(record.event_id ??
        record.eventId ??
        record.message_id ??
        record.messageId ??
        record.id ??
        `${Date.now()}-${Math.random().toString(36).slice(2)}`);
}
function buildUnreadBoxRecord(envelope) {
    return {
        index: resolveBoxIndex(envelope.payload) || resolveBoxIndex(envelope),
        time: nowIsoString(),
        subject: envelope.subject,
        status: "unread",
        event: envelope.payload ?? {}
    };
}
function buildHandledBoxRecord(unreadRecord, handling = {}) {
    const time = nowIsoString();
    return {
        index: String(unreadRecord.index ?? resolveBoxIndex(unreadRecord.event)),
        subject: String(unreadRecord.subject ?? ""),
        time,
        status: "handled",
        handled_at: time,
        ...asRecord(handling),
        event: unreadRecord.event ?? {}
    };
}
function buildOutBoxRecord({ subject, event }) {
    return {
        index: resolveBoxIndex(event),
        time: nowIsoString(),
        subject,
        event: event ?? {}
    };
}
async function removeBoxRecord(filePath, index) {
    const records = await readBoxArray(filePath);
    const nextRecords = records.filter((record) => String(record?.index ?? "") !== String(index));
    if (nextRecords.length !== records.length) {
        await writeBoxArray(filePath, nextRecords);
    }
}

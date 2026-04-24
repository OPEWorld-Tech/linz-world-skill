"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeNatsPayload = summarizeNatsPayload;
exports.createJsonlLogger = createJsonlLogger;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
function resolveLogFilePath(logsDir, date = new Date()) {
    return node_path_1.default.join(logsDir, `${date.toISOString().slice(0, 10)}.log`);
}
function formatPart(value) {
    return String(value).padStart(2, "0");
}
function formatTimestamp(date = new Date()) {
    const year = date.getFullYear();
    const month = formatPart(date.getMonth() + 1);
    const day = formatPart(date.getDate());
    const hour = formatPart(date.getHours());
    const minute = formatPart(date.getMinutes());
    const second = formatPart(date.getSeconds());
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}
function maskString(value) {
    if (typeof value !== "string" || value.length <= 8) {
        return "***";
    }
    return `${value.slice(0, 4)}***${value.slice(-2)}`;
}
function sanitizeValue(value, key = "") {
    if (value === null || value === undefined) {
        return value;
    }
    const normalizedKey = key.toLowerCase();
    const sensitiveKeys = [
        "apikey",
        "accesstoken",
        "token",
        "signednonce",
        "publickey",
        "authorization",
        "credential"
    ];
    if (sensitiveKeys.some((item) => normalizedKey.includes(item))) {
        return maskString(String(value));
    }
    if (Array.isArray(value)) {
        return value.map((item) => sanitizeValue(item));
    }
    if (typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [
            entryKey,
            sanitizeValue(entryValue, entryKey)
        ]));
    }
    return value;
}
function buildErrorPayload(error) {
    if (error instanceof Error) {
        const payload = {
            name: error.name,
            message: error.message,
            stack: error.stack
        };
        const requestContext = error.request_context;
        if (requestContext) {
            payload.request_context = sanitizeValue(requestContext);
        }
        return payload;
    }
    return { message: String(error) };
}
function summarizeNatsPayload(payload) {
    if (!payload || typeof payload !== "object") {
        return { payloadType: typeof payload };
    }
    const record = payload;
    return sanitizeValue({
        eventType: record.event_type ?? record.eventType ?? "",
        os_id: record.os_id ?? "",
        sourceEventId: record.sourceEventId ?? "",
        keys: Object.keys(record).slice(0, 12)
    });
}
function createJsonlLogger(logsDir, source) {
    async function write(level, event, data = {}) {
        try {
            await (0, promises_1.mkdir)(logsDir, { recursive: true });
            const line = `${formatTimestamp()} ${String(level).toUpperCase()} ${source} ${JSON.stringify({
                event,
                ...sanitizeValue(data)
            })}\n`;
            await (0, promises_1.appendFile)(resolveLogFilePath(logsDir), line, "utf8");
        }
        catch { }
    }
    return {
        info(event, data = {}) {
            return write("info", event, data);
        },
        error(event, error, data = {}) {
            return write("error", event, {
                ...data,
                error: buildErrorPayload(error)
            });
        }
    };
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NatsClient = void 0;
const node_net_1 = __importDefault(require("node:net"));
const node_url_1 = require("node:url");
const jsonl_logger_1 = require("../utils/jsonl-logger");
function isLocalHost(hostname) {
    return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}
function encodePayload(payload) {
    return Buffer.from(JSON.stringify(payload ?? {}), "utf8");
}
function tryDecodePayload(data) {
    const text = data.toString("utf8");
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
function findLineEnd(buffer) {
    for (let index = 0; index < buffer.length - 1; index += 1) {
        if (buffer[index] === 13 && buffer[index + 1] === 10) {
            return index;
        }
    }
    return -1;
}
class NatsClient {
    url;
    logger;
    subscriptions = new Map();
    connected = false;
    jwtToken;
    os_id;
    connectTimeoutMs;
    allowLocalMemoryFallback;
    socket = null;
    readBuffer = Buffer.alloc(0);
    sidBySubject = new Map();
    subjectBySid = new Map();
    nextSid = 1;
    memoryMode = false;
    constructor(url, options = {}) {
        this.url = url;
        this.logger = options.logger ?? null;
        this.jwtToken = options.jwtToken ?? null;
        this.os_id = options.os_id ?? null;
        this.connectTimeoutMs = options.connectTimeoutMs ?? 3000;
        this.allowLocalMemoryFallback = options.allowLocalMemoryFallback ?? true;
    }
    async connect() {
        if (this.connected) {
            return;
        }
        const parsed = new node_url_1.URL(this.url);
        const hostname = parsed.hostname || "127.0.0.1";
        const port = Number(parsed.port || 4222);
        try {
            await this.connectSocket(hostname, port);
            this.memoryMode = false;
        }
        catch (error) {
            if (!this.allowLocalMemoryFallback || !isLocalHost(hostname)) {
                throw error;
            }
            this.memoryMode = true;
        }
        this.connected = true;
        await this.logger?.info("nats_connect", {
            url: this.url,
            os_id: this.os_id,
            authMode: this.jwtToken ? "business_jwt" : "anonymous",
            transport: this.memoryMode ? "memory-fallback" : "tcp"
        });
    }
    async disconnect() {
        this.connected = false;
        this.memoryMode = false;
        this.sidBySubject.clear();
        this.subjectBySid.clear();
        if (this.socket) {
            this.socket.destroy();
            this.socket = null;
        }
        await this.logger?.info("nats_disconnect", { url: this.url });
    }
    async publish(subject, payload) {
        if (!this.connected) {
            throw new Error(`NATS 未连接: ${this.url}`);
        }
        await this.logger?.info("nats_publish", {
            url: this.url,
            subject,
            payload: (0, jsonl_logger_1.summarizeNatsPayload)(payload),
            transport: this.memoryMode ? "memory-fallback" : "tcp"
        });
        if (this.memoryMode) {
            const handlers = this.subscriptions.get(subject);
            handlers?.forEach((handler) => handler(payload));
            return;
        }
        const data = encodePayload(payload);
        this.write(`PUB ${subject} ${data.length}\r\n`);
        this.write(data);
        this.write("\r\n");
    }
    subscribe(subject, handler) {
        if (!this.connected) {
            throw new Error(`NATS 未连接: ${this.url}`);
        }
        const handlers = this.subscriptions.get(subject) ?? new Set();
        const wrappedHandler = (payload) => {
            void this.logger?.info("nats_message_received", {
                url: this.url,
                subject,
                payload: (0, jsonl_logger_1.summarizeNatsPayload)(payload),
                transport: this.memoryMode ? "memory-fallback" : "tcp"
            });
            handler(payload);
        };
        handlers.add(wrappedHandler);
        this.subscriptions.set(subject, handlers);
        if (!this.memoryMode && !this.sidBySubject.has(subject)) {
            const sid = String(this.nextSid);
            this.nextSid += 1;
            this.sidBySubject.set(subject, sid);
            this.subjectBySid.set(sid, subject);
            this.write(`SUB ${subject} ${sid}\r\n`);
        }
        void this.logger?.info("nats_subscribe", { url: this.url, subject });
        return () => {
            handlers.delete(wrappedHandler);
            if (handlers.size === 0) {
                this.subscriptions.delete(subject);
                const sid = this.sidBySubject.get(subject);
                if (sid && !this.memoryMode && this.connected) {
                    this.write(`UNSUB ${sid}\r\n`);
                }
                if (sid) {
                    this.sidBySubject.delete(subject);
                    this.subjectBySid.delete(sid);
                }
            }
            void this.logger?.info("nats_unsubscribe", { url: this.url, subject });
        };
    }
    async reconnect() {
        await this.disconnect();
        await this.connect();
        await this.logger?.info("nats_reconnect", {
            url: this.url,
            os_id: this.os_id,
            authMode: this.jwtToken ? "business_jwt" : "anonymous",
            transport: this.memoryMode ? "memory-fallback" : "tcp"
        });
    }
    connectSocket(hostname, port) {
        return new Promise((resolve, reject) => {
            const socket = node_net_1.default.createConnection({ host: hostname, port });
            let settled = false;
            const timer = setTimeout(() => {
                socket.destroy();
                if (!settled) {
                    settled = true;
                    reject(new Error(`NATS 连接超时: ${this.url}`));
                }
            }, this.connectTimeoutMs);
            socket.on("connect", () => {
                this.socket = socket;
                this.writeConnectFrame();
                clearTimeout(timer);
                if (!settled) {
                    settled = true;
                    resolve();
                }
            });
            socket.on("data", (chunk) => {
                this.readBuffer = Buffer.concat([this.readBuffer, chunk]);
                this.drainReadBuffer();
            });
            socket.on("error", (error) => {
                clearTimeout(timer);
                if (!settled) {
                    settled = true;
                    reject(error);
                }
                else {
                    void this.logger?.info("nats_socket_error", { url: this.url, message: error.message });
                }
            });
            socket.on("close", () => {
                if (this.socket === socket) {
                    this.socket = null;
                }
            });
        });
    }
    writeConnectFrame() {
        this.write(`CONNECT ${JSON.stringify({
            verbose: false,
            pedantic: false,
            lang: "node",
            version: "0.1.0",
            name: this.os_id ? `linz-${this.os_id}` : "linz-cli"
        })}\r\n`);
        this.write("PING\r\n");
    }
    write(data) {
        if (!this.socket) {
            throw new Error(`NATS 未连接: ${this.url}`);
        }
        this.socket.write(data);
    }
    drainReadBuffer() {
        while (this.readBuffer.length > 0) {
            const lineEnd = findLineEnd(this.readBuffer);
            if (lineEnd < 0) {
                return;
            }
            const line = this.readBuffer.subarray(0, lineEnd).toString("utf8");
            const bodyStart = lineEnd + 2;
            if (line.startsWith("MSG ")) {
                const parts = line.split(/\s+/);
                const sid = parts[2];
                const size = Number(parts[parts.length - 1]);
                const frameEnd = bodyStart + size + 2;
                if (this.readBuffer.length < frameEnd) {
                    return;
                }
                const payload = this.readBuffer.subarray(bodyStart, bodyStart + size);
                this.readBuffer = this.readBuffer.subarray(frameEnd);
                this.dispatchMessage(sid, payload);
                continue;
            }
            this.readBuffer = this.readBuffer.subarray(bodyStart);
            if (line === "PING") {
                this.write("PONG\r\n");
            }
        }
    }
    dispatchMessage(sid, payload) {
        const subject = this.subjectBySid.get(sid);
        if (!subject) {
            return;
        }
        const handlers = this.subscriptions.get(subject);
        if (!handlers || handlers.size === 0) {
            return;
        }
        const decoded = tryDecodePayload(payload);
        handlers.forEach((handler) => handler(decoded));
    }
}
exports.NatsClient = NatsClient;

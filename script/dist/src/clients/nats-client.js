"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NatsClient = void 0;
const jsonl_logger_1 = require("../utils/jsonl-logger");
class NatsClient {
    url;
    logger;
    subscriptions = new Map();
    connected = false;
    jwtToken;
    os_id;
    constructor(url, options = {}) {
        this.url = url;
        this.logger = options.logger ?? null;
        this.jwtToken = options.jwtToken ?? null;
        this.os_id = options.os_id ?? null;
    }
    async connect() {
        // TODO: 接入真实 NATS broker 后，这里需要把业务 JWT 对接到服务端 auth callout，
        // 由 broker 在建连阶段完成令牌校验和主题权限裁决；当前实现仅保留本地监听占位逻辑。
        this.connected = true;
        await this.logger?.info("nats_connect", {
            url: this.url,
            os_id: this.os_id,
            authMode: this.jwtToken ? "business_jwt" : "anonymous"
        });
    }
    async disconnect() {
        this.connected = false;
        this.subscriptions.clear();
        await this.logger?.info("nats_disconnect", { url: this.url });
    }
    async publish(subject, payload) {
        if (!this.connected) {
            throw new Error(`NATS 未连接: ${this.url}`);
        }
        await this.logger?.info("nats_publish", {
            url: this.url,
            subject,
            payload: (0, jsonl_logger_1.summarizeNatsPayload)(payload)
        });
        const handlers = this.subscriptions.get(subject);
        handlers?.forEach((handler) => handler(payload));
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
                payload: (0, jsonl_logger_1.summarizeNatsPayload)(payload)
            });
            handler(payload);
        };
        handlers.add(wrappedHandler);
        this.subscriptions.set(subject, handlers);
        void this.logger?.info("nats_subscribe", { url: this.url, subject });
        return () => {
            handlers.delete(wrappedHandler);
            void this.logger?.info("nats_unsubscribe", { url: this.url, subject });
        };
    }
    async reconnect() {
        // TODO: 接入真实 NATS broker 后，重连同样需要走 auth callout 校验，
        // 不能只依赖本地缓存的业务 JWT 直接视为已重新鉴权。
        this.connected = true;
        await this.logger?.info("nats_reconnect", {
            url: this.url,
            os_id: this.os_id,
            authMode: this.jwtToken ? "business_jwt" : "anonymous"
        });
    }
}
exports.NatsClient = NatsClient;

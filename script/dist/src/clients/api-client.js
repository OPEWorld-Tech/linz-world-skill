"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiClient = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
class ApiClient {
    options;
    fetchImpl;
    constructor(options) {
        this.options = options;
        this.fetchImpl = options.fetchImpl ?? fetch;
    }
    async register(input) {
        return this.post("/api/v1/auth/register", input);
    }
    async status(osId) {
        return this.get(`/api/v1/linz-world/status?osId=${encodeURIComponent(osId)}`);
    }
    async heartbeat(osId) {
        return this.post("/api/v1/linz-world/heartbeat", { os_id: osId });
    }
    async logout(osId) {
        return this.post("/api/v1/auth/logout", { os_id: osId });
    }
    async map(osId) {
        return this.get(`/api/v1/linz-world/map?osId=${encodeURIComponent(osId)}`);
    }
    async bootstrapListener(token) {
        return this.post("/api/v1/event/agents/listener/bootstrap", {}, {
            Authorization: `Bearer ${token}`
        });
    }
    async login(osId, signedNonce, timestamp) {
        return this.post("/api/v1/auth/login", { osId, signedNonce, timestamp });
    }
    async submitPersonaSeed(osId, input) {
        return this.post(`/api/v1/memory/agents/${encodeURIComponent(osId)}/persona-seeds`, {
            source_type: input.sourceType,
            raw_text: input.rawText,
            source_metadata: input.sourceMetadata ?? {}
        });
    }
    async getAgentMemoryOverview(osId) {
        return this.get(`/api/v1/memory/agents/${encodeURIComponent(osId)}/overview`);
    }
    async publish(input) {
        return this.post("/api/v1/event/publish", {
            subject: input.subject,
            eventType: input.eventType,
            payload: input.payload,
            attachments: input.attachments ?? [],
            candidateMetadata: input.candidateMetadata ?? {}
        });
    }
    async createTaskBubble(input) {
        return this.post("/api/v1/bubbles/tasks", input);
    }
    async getBubbleSnapshot(bubbleId) {
        return this.get(`/api/v1/bubbles/${encodeURIComponent(bubbleId)}/snapshot`);
    }
    async listRelationships(osId) {
        return this.get(`/api/v1/memory/relationships/${encodeURIComponent(osId)}`);
    }
    async addRelationship(osId, input) {
        return this.post(`/api/v1/memory/relationships/${encodeURIComponent(osId)}`, {
            target_os_id: input.target_os_id,
            relation_type: input.relation_type ?? "OTHER",
            status: input.status ?? "ACTIVE",
            summary: input.summary ?? "手动添加关系",
            operator_id: input.operator_id ?? osId
        });
    }
    async compute(input) {
        const bearerToken = input.token ?? input.apiKey;
        const messages = [];
        if (input.system) {
            messages.push({ role: "system", content: input.system });
        }
        messages.push({ role: "user", content: input.message });
        return this.post("/api/v1/compute/chat", {
            model: input.model,
            messages,
            stream: input.stream ?? false
        }, {
            Authorization: `Bearer ${bearerToken ?? ""}`
        });
    }
    async getBalance(osId) {
        return this.get(`/api/v1/linz-world/balance?osId=${encodeURIComponent(osId)}`);
    }
    async uploadArtifact(filePath) {
        const content = await (0, promises_1.readFile)(filePath);
        const fileName = node_path_1.default.basename(filePath);
        const boundary = `linz-${Date.now()}-${Math.random().toString(16).slice(2)}`;
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\n`
                + `Content-Disposition: form-data; name="file"; filename="${escapeMultipartFilename(fileName)}"\r\n`
                + "Content-Type: application/octet-stream\r\n\r\n", "utf8"),
            content,
            Buffer.from(`\r\n--${boundary}--\r\n`, "utf8")
        ]);
        return this.postRaw("/api/v1/artifacts/upload", body, {
            "Content-Type": `multipart/form-data; boundary=${boundary}`
        }, {
            file_path: filePath,
            file_name: fileName
        });
    }
    async runDemoEventStream(input = {}) {
        const pathname = input.agenticRelease
            ? "/api/v1/event/demo/agentic-release/event-stream"
            : "/api/v1/event/demo/event-stream";
        return this.post(pathname, {});
    }
    async get(pathname) {
        const url = new URL(pathname, this.options.baseUrl);
        const requestContext = {
            method: "GET",
            url: url.toString(),
            request_body: null
        };
        const response = await this.fetchWithContext(url, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        }, requestContext);
        return this.parseResponse(response, requestContext);
    }
    async post(pathname, body, extraHeaders = {}) {
        const url = new URL(pathname, this.options.baseUrl);
        const requestContext = {
            method: "POST",
            url: url.toString(),
            request_body: body
        };
        const response = await this.fetchWithContext(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...extraHeaders
            },
            body: JSON.stringify(body)
        }, requestContext);
        return this.parseResponse(response, requestContext);
    }
    async postRaw(pathname, body, extraHeaders = {}, requestBody = {}) {
        const url = new URL(pathname, this.options.baseUrl);
        const requestContext = {
            method: "POST",
            url: url.toString(),
            request_body: requestBody
        };
        const response = await this.fetchWithContext(url, {
            method: "POST",
            headers: extraHeaders,
            body
        }, requestContext);
        return this.parseResponse(response, requestContext);
    }
    async fetchWithContext(url, init, requestContext) {
        try {
            return await this.fetchImpl(url, init);
        }
        catch (error) {
            throw this.buildTransportError(error, requestContext);
        }
    }
    async parseResponse(response, requestContext) {
        const rawBody = await response.text();
        const json = this.tryParseJson(rawBody);
        if (!json) {
            const message = rawBody.trim() || "服务端返回了非 JSON 响应";
            throw this.buildRequestError(`${response.status}: ${message}`, response.status, rawBody, requestContext);
        }
        if (!response.ok || json.code !== 0) {
            throw this.buildRequestError(`${response.status}: ${json.message}`, response.status, rawBody, requestContext);
        }
        return json;
    }
    buildRequestError(message, status, rawBody, requestContext) {
        const error = new Error(message);
        error.request_context = {
            ...requestContext,
            status,
            raw_body: rawBody
        };
        return error;
    }
    buildTransportError(error, requestContext) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        const transportMessage = originalMessage && originalMessage !== "fetch failed"
            ? `fetch failed: ${originalMessage}`
            : "fetch failed";
        const wrappedError = new Error(transportMessage);
        wrappedError.request_context = requestContext;
        wrappedError.cause = error;
        return wrappedError;
    }
    tryParseJson(rawBody) {
        if (!rawBody.trim()) {
            return null;
        }
        try {
            return JSON.parse(rawBody);
        }
        catch {
            return null;
        }
    }
}
exports.ApiClient = ApiClient;
function escapeMultipartFilename(value) {
    return value.replace(/["\r\n]/g, "_");
}

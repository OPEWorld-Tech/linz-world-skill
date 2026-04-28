"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiClient = void 0;
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

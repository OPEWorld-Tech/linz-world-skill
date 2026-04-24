"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapErrorMessage = mapErrorMessage;
function mapErrorMessage(error) {
    const message = error instanceof Error ? error.message : String(error);
    const requestContext = error && typeof error === "object" && "request_context" in error
        ? error.request_context
        : undefined;
    const requestUrl = typeof requestContext?.url === "string" ? requestContext.url : undefined;
    if (message.includes("fetch failed") ||
        message.includes("ECONNREFUSED") ||
        message.includes("ENOTFOUND") ||
        message.includes("ETIMEDOUT")) {
        const suffix = requestUrl ? `（当前地址: ${requestUrl}）` : "";
        return `无法连接到灵治世界服务，请检查 server_url 配置或确认后端已启动${suffix}`;
    }
    if (message.includes("401")) {
        return "鉴权失败，请重新登录或检查 API Key";
    }
    if (message.includes("403")) {
        return "当前身份没有访问该主题或事件类型的授权";
    }
    if (message.includes("429")) {
        return "请求被限流，请稍后再试";
    }
    if (message.includes("502") || message.includes("503")) {
        return "外部依赖当前不可用，请稍后重试";
    }
    if (message.includes("NATS")) {
        return "NATS 连接失败，请检查事件总线配置";
    }
    if (message.includes("subject") && message.includes("event_type")) {
        return "正式事件缺少 subject 或 event_type";
    }
    return message;
}

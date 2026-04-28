"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapErrorMessage = mapErrorMessage;
function mapErrorMessage(error) {
    const message = error instanceof Error ? error.message : String(error);
    const requestContext = error && typeof error === "object" && "request_context" in error
        ? error.request_context
        : undefined;
    const requestUrl = typeof requestContext?.url === "string" ? requestContext.url : undefined;
    const isComputeRequest = typeof requestUrl === "string" && requestUrl.includes("/api/v1/compute/chat");
    if (message.includes("fetch failed") ||
        message.includes("ECONNREFUSED") ||
        message.includes("ENOTFOUND") ||
        message.includes("ETIMEDOUT")) {
        const suffix = requestUrl ? `（当前地址: ${requestUrl}）` : "";
        return `无法连接到灵治世界服务，请检查 server_url 配置或确认后端已启动${suffix}`;
    }
    if (isComputeRequest &&
        (message.includes("provider request failed with status 401") || message.includes("invalid api key"))) {
        return "外部模型服务鉴权失败，请检查 MiniMax / OpenAI / Anthropic 的 API Key 配置";
    }
    if (message.includes("401")) {
        return "鉴权失败，请重新登录或检查 API Key";
    }
    if (message.includes("eligible to use compute")) {
        return "当前元神没有 compute 资格，请先开通 compute eligibility";
    }
    if (message.includes("403")) {
        if (isComputeRequest) {
            return "当前元神没有 compute 资格，请先开通 compute eligibility";
        }
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
    if (message.includes("ec.transfer")) {
        return "需求预算和奖励结算对应的 ec.transfer 只能由世界侧发送";
    }
    if (message.includes("待扣减") || message.includes("待发奖")) {
        return "需求结算仍在处理中，请稍后执行 linz status 查看结果";
    }
    if (message.includes("扣减失败") || message.includes("结算失败")) {
        return "需求结算失败，请检查世界侧转账结果后重试";
    }
    if (message.includes("已处理") || message.includes("幂等")) {
        return "当前业务事务已处理，无需重复提交";
    }
    if (message.includes("固定预算")) {
        return "固定预算需求的发布扣减金额与完成奖励金额必须一致";
    }
    if (message.includes("subject") && message.includes("event_type")) {
        return "正式事件缺少 subject 或 event_type";
    }
    return message;
}

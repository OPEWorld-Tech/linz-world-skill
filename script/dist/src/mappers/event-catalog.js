"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CATALOG_USAGE_NOTES = exports.BLOCKED_EVENT_VALUES = exports.EVENT_CATALOG = void 0;
exports.listCatalogSubjects = listCatalogSubjects;
exports.isAllowedSubjectEvent = isAllowedSubjectEvent;
exports.isBlockedSubject = isBlockedSubject;
exports.isBlockedEventType = isBlockedEventType;
exports.validateCatalogPublishInput = validateCatalogPublishInput;
exports.EVENT_CATALOG = [
    { subject: "sys.heartbeat", eventTypes: ["sys.heartbeat.report"] },
    { subject: "sys.broadcast", eventTypes: ["sys.broadcast.notice_published"] },
    { subject: "auth.login.request", eventTypes: ["auth.login.request"] },
    {
        subject: "wsp.{os_id}",
        eventTypes: [
            "wsp.sys.login.response",
            "wsp.sys.subject.changed",
            "wsp.sys.credential.issued",
            "wsp.sys.credential.expiring",
            "wsp.sys.rent.assessed",
            "wsp.sys.rent.deducted",
            "wsp.sys.rent.failed",
            "wsp.chat.message.sent",
            "wsp.chat.message.read",
            "wsp.task.notified",
            "wsp.task.reminded",
            "wsp.task.acknowledged",
            "wsp.task.status.synced",
            "wsp.mrk.requirement.published",
            "wsp.mrk.order.accepted",
            "wsp.mrk.order.handover.delivered",
            "wsp.mrk.order.handover.approved",
            "wsp.mrk.order.handover.rejected",
            "wsp.mrk.settlement.completed",
            "wsp.mrk.settlement.failed",
            "wsp.oso.consultation.report.generated",
            "wsp.oso.recommendation.generated",
            "wsp.oso.warning.raised",
            "wsp.oso.intervention.suggested"
        ]
    },
    {
        subject: "mrk.requirement.published",
        eventTypes: ["mrk.requirement.published"]
    },
    {
        subject: "mrk.requirement.published.broadcast",
        eventTypes: ["mrk.requirement.published.broadcast"]
    },
    {
        subject: "mrk.requirement",
        eventTypes: [
            "mrk.requirement.updated",
            "mrk.requirement.withdrawn",
            "mrk.requirement.closed"
        ]
    },
    {
        subject: "mrk.order",
        eventTypes: ["mrk.order.created", "mrk.order.accepted", "mrk.order.cancelled", "mrk.order.completed"]
    },
    {
        subject: "mrk.order.handover",
        eventTypes: [
            "mrk.order.handover.submitted",
            "mrk.order.handover.delivered",
            "mrk.order.handover.approved",
            "mrk.order.handover.rejected"
        ]
    },
    {
        subject: "mrk.settlement",
        eventTypes: [
            "mrk.settlement.requested",
            "mrk.settlement.completed",
            "mrk.settlement.failed",
            "mrk.settlement.reversed"
        ]
    },
    { subject: "ec.transfer", eventTypes: ["ec.transfer.requested", "ec.transfer.completed", "ec.transfer.failed"] },
    { subject: "event.memory.sink", eventTypes: ["event.memory.sink.requested"] },
    {
        subject: "oso.consultation",
        eventTypes: ["oso.consultation.requested", "oso.consultation.report.generated"]
    },
    { subject: "oso.recommendation", eventTypes: ["oso.recommendation.generated"] },
    { subject: "oso.warning", eventTypes: ["oso.warning.raised"] },
    { subject: "oso.intervention", eventTypes: ["oso.intervention.suggested"] },
    { subject: "apl.case", eventTypes: ["apl.case.created", "apl.case.accepted", "apl.case.withdrawn"] },
    { subject: "apl.review", eventTypes: ["apl.review.started", "apl.review.completed", "apl.review.reopened"] },
    {
        subject: "apl.decision",
        eventTypes: ["apl.decision.drafted", "apl.decision.published", "apl.decision.executed"]
    },
    { subject: "rent.cycle", eventTypes: ["rent.cycle.started"] },
    { subject: "rent.accrual", eventTypes: ["rent.accrual.calculated"] },
    {
        subject: "rent.settlement",
        eventTypes: ["rent.settlement.created", "rent.settlement.completed", "rent.settlement.failed"]
    },
    { subject: "rent.distribution", eventTypes: ["rent.distribution.allocated", "rent.distribution.reversed"] },
    {
        subject: "poca.assessment",
        eventTypes: ["poca.assessment.submitted", "poca.assessment.accepted", "poca.assessment.rejected"]
    },
    { subject: "poca.review", eventTypes: ["poca.review.started", "poca.review.completed", "poca.review.reopened"] },
    {
        subject: "poca.reputation",
        eventTypes: ["poca.reputation.increased", "poca.reputation.decreased", "poca.reputation.corrected"]
    },
    { subject: "poca.reward", eventTypes: ["poca.reward.issued", "poca.reward.reversed"] }
];
exports.BLOCKED_EVENT_VALUES = [
    { value: "sys.boardcast", scope: "subject", replacement: "sys.broadcast" },
    { value: "wsp.{os_id}.sys", scope: "subject", replacement: "wsp.{os_id}" },
    { value: "wsp.{os_id}.oso", scope: "subject", replacement: "wsp.{os_id}" },
    { value: "sys.login.request", scope: "event_type", replacement: "auth.login.request" },
    { value: "sys.login.result", scope: "event_type", replacement: "wsp.sys.login.response" },
    { value: "subject_change", scope: "event_type", replacement: "wsp.sys.subject.changed" }
];
exports.CATALOG_USAGE_NOTES = [
    "用户元神通过 mrk.requirement.published 发布需求，需求中心消费后落库",
    "已登录用户元神可按授权订阅 mrk.requirement.published.broadcast 公开广播流",
    "已登录用户元神可通过 wsp.mrk.requirement.published 接收需求发布定向通知",
    "需求发布方不接收自己发布需求对应的 mrk.requirement.published 或 wsp.mrk.requirement.published",
    "mrk.order.handover.submitted 只是待校验的交付提交输入，不直接等同于可确认交付",
    "wsp.mrk.order.handover.delivered 只能携带最小通知投影字段，且缺失通知只能由需求市场领域服务补发",
    "rent.* 是数字税权威事实流，cycle_id、账户与结算标识只进入 payload，不进入 subject",
    "wsp.sys.rent.* 是面向单个元神的数字税通知投影，发布到 wsp.{os_id} 收件箱",
    "oso.recommendation.generated、oso.warning.raised、oso.intervention.suggested 是 OSO 服务侧权威事实，不应由普通客户端伪造",
    "wsp.oso.* 只能作为 wsp.{os_id} 下的收件箱通知投影，必须携带 source_event_id 追溯 OSO 权威事实"
];
const RESERVED_WSP_INBOX_NAMES = new Set(["chat", "task", "sys", "mrk", "rent", "poca", "apl", "ec", "oso"]);
function matchesCatalogSubject(subjectPattern, subject) {
    if (subjectPattern === subject) {
        return true;
    }
    if (subjectPattern === "wsp.{os_id}") {
        return /^wsp\.[^.]+$/.test(subject);
    }
    return false;
}
function listCatalogSubjects() {
    return exports.EVENT_CATALOG.map((entry) => entry.subject);
}
function isAllowedSubjectEvent(subject, eventType) {
    return exports.EVENT_CATALOG.some((entry) => matchesCatalogSubject(entry.subject, subject) && entry.eventTypes.includes(eventType));
}
function isBlockedSubject(subject) {
    const reservedWspInbox = /^wsp\.([^.]+)$/.exec(subject);
    return (subject === "sys.boardcast" ||
        /^wsp\.[^.]+\.(sys|oso)$/.test(subject) ||
        Boolean(reservedWspInbox && RESERVED_WSP_INBOX_NAMES.has(reservedWspInbox[1])));
}
function isBlockedEventType(eventType) {
    return ["sys.login.request", "sys.login.result", "subject_change"].includes(eventType);
}
function readString(value) {
    if (value === undefined || value === null) {
        return "";
    }
    return String(value).trim();
}
function ensureRequiredFields(payload, fields) {
    for (const field of fields) {
        if (!readString(payload[field])) {
            throw new Error(`payload 缺少必填字段 "${field}"`);
        }
    }
}
function ensurePositiveIntegerField(payload, field) {
    const value = payload[field];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
        throw new Error(`payload 字段 "${field}" 必须为正整数`);
    }
}
function ensureAllowedFields(payload, fields) {
    const allowed = new Set(fields);
    for (const field of Object.keys(payload)) {
        if (!allowed.has(field)) {
            throw new Error(`payload 包含未定义字段 "${field}"`);
        }
    }
}
function ensureNonEmptyArrayField(payload, field) {
    const value = payload[field];
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`payload 字段 "${field}" 必须为非空数组`);
    }
    for (const item of value) {
        if (!readString(item)) {
            throw new Error(`payload 字段 "${field}" 不能包含空值`);
        }
    }
}
function validateCatalogPublishInput(input) {
    if (isBlockedSubject(input.subject)) {
        throw new Error(`事件主题 ${input.subject} 已被禁止，请改用正式主题`);
    }
    if (isBlockedEventType(input.eventType)) {
        throw new Error(`事件类型 ${input.eventType} 已被禁止，请改用正式事件类型`);
    }
    if (!isAllowedSubjectEvent(input.subject, input.eventType)) {
        throw new Error(`事件主题 ${input.subject} 与事件类型 ${input.eventType} 不属于同一正式目录项`);
    }
    if (input.eventType === "wsp.chat.message.sent") {
        const payload = input.payload ?? {};
        ensureRequiredFields(payload, ["message_id", "from", "to", "content"]);
        const expectedSubject = `wsp.${readString(payload.to)}`;
        if (input.subject !== expectedSubject) {
            throw new Error(`聊天消息必须发布到接收方收件箱 ${expectedSubject}`);
        }
    }
    if (input.eventType === "wsp.mrk.requirement.published") {
        const payload = input.payload ?? {};
        ensureRequiredFields(payload, ["recipient_os_id", "publisher_os_id"]);
        if (readString(payload.recipient_os_id) === readString(payload.publisher_os_id)) {
            throw new Error("需求发布方不接收自己发布的需求消息");
        }
    }
    if (input.eventType === "mrk.order.handover.submitted") {
        const payload = input.payload ?? {};
        ensureRequiredFields(payload, ["order_id", "requirement_id", "deliverer_os_id"]);
        ensurePositiveIntegerField(payload, "handover_version");
    }
    if (input.eventType === "mrk.order.handover.delivered") {
        const payload = input.payload ?? {};
        ensureRequiredFields(payload, ["order_id", "requirement_id", "deliverer_os_id", "handover_version"]);
        ensurePositiveIntegerField(payload, "handover_version");
        if (payload.size !== undefined) {
            ensurePositiveIntegerField(payload, "size");
        }
        ensureAllowedFields(payload, [
            "order_id",
            "requirement_id",
            "deliverer_os_id",
            "deliverer_os_name",
            "handover_version",
            "file_ref",
            "checksum",
            "size",
            "mime_type",
            "version"
        ]);
    }
    if (input.eventType === "mrk.settlement.requested") {
        const payload = input.payload ?? {};
        ensureRequiredFields(payload, ["settlement_id", "order_id", "requirement_id", "amount", "business_transaction_id"]);
    }
    if (input.eventType === "wsp.mrk.order.handover.delivered") {
        const payload = input.payload ?? {};
        ensureRequiredFields(payload, [
            "order_id",
            "requirement_id",
            "recipient_os_id",
            "recipient_os_name",
            "deliverer_os_id",
            "deliverer_os_name"
        ]);
        ensurePositiveIntegerField(payload, "handover_version");
        ensureAllowedFields(payload, [
            "order_id",
            "requirement_id",
            "recipient_os_id",
            "recipient_os_name",
            "deliverer_os_id",
            "deliverer_os_name",
            "handover_version"
        ]);
    }
    if (input.eventType === "oso.consultation.requested") {
        const payload = input.payload ?? {};
        ensureRequiredFields(payload, ["requirement_id", "publisher_os_id", "recipient_os_id", "task_title", "consult_content"]);
    }
    if (input.eventType === "oso.consultation.report.generated") {
        const payload = input.payload ?? {};
        ensureRequiredFields(payload, [
            "requirement_id",
            "publisher_os_id",
            "recipient_os_id",
            "report_id",
            "risk_level",
            "analysis_summary"
        ]);
    }
    if (input.eventType === "oso.recommendation.generated") {
        const payload = input.payload ?? {};
        ensureRequiredFields(payload, ["requirement_id", "publisher_os_id", "recipient_os_id", "recommend_reason"]);
        ensureNonEmptyArrayField(payload, "recommend_list");
    }
    if (input.eventType === "oso.warning.raised") {
        const payload = input.payload ?? {};
        ensureRequiredFields(payload, ["requirement_id", "order_id", "publisher_os_id", "warning_level", "warning_reason"]);
        ensureNonEmptyArrayField(payload, "target_os_ids");
    }
    if (input.eventType === "oso.intervention.suggested") {
        const payload = input.payload ?? {};
        ensureRequiredFields(payload, [
            "requirement_id",
            "order_id",
            "publisher_os_id",
            "recipient_os_id",
            "intervention_type",
            "suggestion"
        ]);
    }
    if ([
        "wsp.oso.consultation.report.generated",
        "wsp.oso.recommendation.generated",
        "wsp.oso.warning.raised",
        "wsp.oso.intervention.suggested"
    ].includes(input.eventType)) {
        const payload = input.payload ?? {};
        ensureRequiredFields(payload, ["recipient_os_id", "source_event_id", "requirement_id"]);
        if (input.eventType === "wsp.oso.warning.raised" || input.eventType === "wsp.oso.intervention.suggested") {
            ensureRequiredFields(payload, ["order_id"]);
        }
    }
}

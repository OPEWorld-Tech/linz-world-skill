"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EVENT_CATALOG = void 0;
exports.listCatalogSubjects = listCatalogSubjects;
exports.isAllowedSubjectEvent = isAllowedSubjectEvent;
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
            "wsp.mrk.settlement.failed"
        ]
    },
    {
        subject: "mrk.requirement",
        eventTypes: [
            "mrk.requirement.published",
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

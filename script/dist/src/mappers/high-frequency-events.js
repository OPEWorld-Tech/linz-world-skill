"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HIGH_FREQUENCY_EVENTS = void 0;
exports.resolveHighFrequencyEvent = resolveHighFrequencyEvent;
exports.HIGH_FREQUENCY_EVENTS = [
    { command: "heartbeat", subject: "sys.heartbeat", eventType: "sys.heartbeat.report" },
    { command: "broadcast", subject: "sys.broadcast", eventType: "sys.broadcast.notice_published" },
    { command: "requirement", subject: "mrk.requirement.published", eventType: "mrk.requirement.published" },
    { command: "order", subject: "mrk.order", eventType: "mrk.order.created" },
    { command: "settlement", subject: "mrk.settlement", eventType: "mrk.settlement.requested" }
];
function resolveHighFrequencyEvent(command) {
    return exports.HIGH_FREQUENCY_EVENTS.find((item) => item.command === command);
}

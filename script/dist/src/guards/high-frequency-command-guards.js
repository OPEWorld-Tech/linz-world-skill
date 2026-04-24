"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureHighFrequencyMapping = ensureHighFrequencyMapping;
const event_catalog_1 = require("../mappers/event-catalog");
function ensureHighFrequencyMapping(subject, eventType) {
    if (!(0, event_catalog_1.isAllowedSubjectEvent)(subject, eventType)) {
        throw new Error("高频事件命令映射不在正式主题词典中");
    }
}

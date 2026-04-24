"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePublishInput = resolvePublishInput;
exports.resolveHighFrequencyPublish = resolveHighFrequencyPublish;
const high_frequency_command_guards_1 = require("../guards/high-frequency-command-guards");
const high_frequency_events_1 = require("../mappers/high-frequency-events");
function resolvePublishInput(input) {
    return input;
}
function resolveHighFrequencyPublish(command, payload) {
    const mapping = (0, high_frequency_events_1.resolveHighFrequencyEvent)(command);
    if (!mapping) {
        throw new Error(`未知高频事件命令: ${command}`);
    }
    (0, high_frequency_command_guards_1.ensureHighFrequencyMapping)(mapping.subject, mapping.eventType);
    return {
        subject: mapping.subject,
        eventType: mapping.eventType,
        payload
    };
}

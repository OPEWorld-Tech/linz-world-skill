"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.highFrequencyEventCommand = highFrequencyEventCommand;
const publish_1 = require("../publish");
const publish_dispatcher_1 = require("../../events/publish-dispatcher");
async function highFrequencyEventCommand(profilePath, sessionPath, command, payload) {
    const input = (0, publish_dispatcher_1.resolveHighFrequencyPublish)(command, payload);
    return (0, publish_1.publishCommand)(profilePath, sessionPath, input);
}

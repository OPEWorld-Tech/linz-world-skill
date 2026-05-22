"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.govCommand = govCommand;
const node_crypto_1 = require("node:crypto");
const profile_store_1 = require("../config/profile-store");
const publish_1 = require("./publish");
function readRequiredString(values, key, label) {
    const value = String(values[key] ?? "").trim();
    if (!value) {
        throw new Error(`治理命令缺少 ${label}`);
    }
    return value;
}
function readOptionalString(values, key) {
    const value = String(values[key] ?? "").trim();
    return value || undefined;
}
async function preRiskCommand(profilePath, sessionPath, input) {
    const profile = await new profile_store_1.FileProfileStore(profilePath).load();
    const requirementID = readRequiredString(input, "requirementId", "requirement_id");
    const publisherOsID = readRequiredString(input, "publisherOsId", "publisher_os_id");
    const recipientOsID = readRequiredString(input, "recipientOsId", "recipient_os_id");
    const riskLevel = readRequiredString(input, "riskLevel", "risk_level");
    const analysisSummary = readRequiredString(input, "analysisSummary", "analysis_summary");
    const reportID = readOptionalString(input, "reportId") ?? `risk-${(0, node_crypto_1.randomUUID)()}`;
    const result = await (0, publish_1.publishCommand)(profilePath, sessionPath, {
        subject: "oso.consultation",
        eventType: "oso.consultation.report.generated",
        payload: {
            requirement_id: requirementID,
            publisher_os_id: publisherOsID,
            recipient_os_id: recipientOsID,
            report_id: reportID,
            risk_level: riskLevel,
            analysis_summary: analysisSummary
        }
    });
    return {
        ...result,
        pre_risk_reported: true,
        requirement_id: requirementID,
        report_id: reportID,
        reviewer_os_id: profile.os_id
    };
}
async function govCommand(profilePath, sessionPath, subcommand, input) {
    switch (subcommand) {
        case "pre-risk":
            return preRiskCommand(profilePath, sessionPath, input);
        default:
            throw new Error("未知 gov 子命令，请使用: linz gov pre-risk");
    }
}

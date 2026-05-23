"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disputeCommand = disputeCommand;
const node_crypto_1 = require("node:crypto");
const profile_store_1 = require("../config/profile-store");
const publish_1 = require("./publish");
function readRequiredString(values, key, label) {
    const value = String(values[key] ?? "").trim();
    if (!value) {
        throw new Error(`争议命令缺少 ${label}`);
    }
    return value;
}
function readOptionalString(values, key) {
    const value = String(values[key] ?? "").trim();
    return value || undefined;
}
async function createDisputeCommand(profilePath, sessionPath, input) {
    const profile = await new profile_store_1.FileProfileStore(profilePath).load();
    const needID = readOptionalString(input, "needId") ?? `dispute-${(0, node_crypto_1.randomUUID)()}`;
    const title = readRequiredString(input, "title", "title");
    const sourceOsID = readOptionalString(input, "sourceOsId") ?? String(profile.os_id ?? "").trim();
    if (!sourceOsID) {
        throw new Error("争议命令无法从本地 profile 获取 source_os_id");
    }
    const payload = {
        need_id: needID,
        source_os_id: sourceOsID,
        title
    };
    const suggestedRuleType = readOptionalString(input, "suggestedRuleType");
    const suggestedTargetRef = readOptionalString(input, "suggestedTargetRef");
    if (suggestedRuleType) {
        payload.suggested_rule_type = suggestedRuleType;
    }
    if (suggestedTargetRef) {
        payload.suggested_target_ref = suggestedTargetRef;
    }
    const result = await (0, publish_1.publishCommand)(profilePath, sessionPath, {
        subject: "co_gov.need",
        eventType: "co_gov.need.collected",
        payload
    });
    return {
        ...result,
        dispute_created: true,
        need_id: needID,
        source_os_id: sourceOsID
    };
}
async function adjudicateDisputeCommand(profilePath, sessionPath, input) {
    const needID = readRequiredString(input, "needId", "need_id");
    const ruleID = readOptionalString(input, "ruleId") ?? `rule-${(0, node_crypto_1.randomUUID)()}`;
    const ruleVersion = readOptionalString(input, "ruleVersion") ?? "v1";
    const ruleType = readOptionalString(input, "ruleType") ?? "dispute_adjudication";
    const ruleTitle = readOptionalString(input, "ruleTitle") ?? `争议裁决规则 ${ruleID}`;
    const targetRef = readOptionalString(input, "targetRef");
    const decision = readOptionalString(input, "decision");
    const ruleContent = readOptionalString(input, "ruleContent") ?? buildDefaultRuleContent({
        needID,
        ruleID,
        ruleType,
        decision,
        targetRef
    });
    const payload = {
        need_id: needID,
        rule_id: ruleID,
        rule_version: ruleVersion,
        rule_type: ruleType,
        rule_title: ruleTitle,
        rule_content: ruleContent
    };
    if (decision) {
        payload.decision = decision;
    }
    if (targetRef) {
        payload.target_ref = targetRef;
    }
    const result = await (0, publish_1.publishCommand)(profilePath, sessionPath, {
        subject: "co_gov.rule",
        eventType: "co_gov.rule.deposited",
        payload
    });
    return {
        ...result,
        dispute_adjudicated: true,
        need_id: needID,
        rule_id: ruleID,
        rule_version: ruleVersion,
        rule_title: ruleTitle
    };
}
function buildDefaultRuleContent(input) {
    const decision = input.decision ?? "supplement_required";
    const target = input.targetRef ?? `co_gov.need://${input.needID}`;
    return [
        `规则 ${input.ruleID} 适用于 ${target}。`,
        `规则类型：${input.ruleType}。`,
        `裁决结论：${decision}。`,
        "交付验收争议中，若交付物缺少测试记录、经营指标截图或 EvidenceBubble 证据引用，甲方可以拒收并要求乙方补充证据。",
        "乙方补充后的新版本必须重新提交 handover.submitted，并由甲方验证后投递 handover.delivered，之后才允许 approve。",
        "只有基于正式 delivered 的 approve 才能进入结算链路。"
    ].join("\n");
}
async function disputeCommand(profilePath, sessionPath, subcommand, input) {
    switch (subcommand) {
        case "create":
            return createDisputeCommand(profilePath, sessionPath, input);
        case "adjudicate":
            return adjudicateDisputeCommand(profilePath, sessionPath, input);
        default:
            throw new Error("未知 dispute 子命令，请使用: linz dispute create 或 linz dispute adjudicate");
    }
}

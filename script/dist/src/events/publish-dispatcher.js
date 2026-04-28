"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvePublishInput = resolvePublishInput;
exports.resolveHighFrequencyPublish = resolveHighFrequencyPublish;
const node_crypto_1 = require("node:crypto");
const high_frequency_command_guards_1 = require("../guards/high-frequency-command-guards");
const high_frequency_events_1 = require("../mappers/high-frequency-events");
function asRecord(value) {
    return value && typeof value === "object" ? value : {};
}
function readString(...values) {
    for (const value of values) {
        if (value === undefined || value === null) {
            continue;
        }
        const text = String(value).trim();
        if (text) {
            return text;
        }
    }
    return "";
}
function normalizeAmount(...values) {
    const resolved = readString(...values);
    if (!resolved) {
        return "";
    }
    return resolved;
}
function resolvePublishInput(input, options = {}) {
    if (input.subject === "ec.transfer") {
        throw new Error("需求预算和奖励结算对应的 ec.transfer 必须由世界侧发送，CLI 不支持直接发布该主题");
    }
    const payload = { ...asRecord(input.payload) };
    const candidateMetadata = { ...asRecord(input.candidateMetadata) };
    const existingSettlement = asRecord(options.existingSettlement);
    if (input.subject === "mrk.requirement.published" && input.eventType === "mrk.requirement.published") {
        const requirementId = readString(payload.requirement_id, payload.requirementId);
        const budgetAmount = normalizeAmount(payload.budget_amount, payload.budgetAmount);
        if (!requirementId) {
            throw new Error("发布需求时必须提供 requirement_id");
        }
        if (!budgetAmount) {
            throw new Error("发布需求时必须提供固定预算 budget_amount");
        }
        const businessTransactionId = readString(payload.business_transaction_id, payload.businessTransactionId, candidateMetadata.business_transaction_id) ||
            (0, node_crypto_1.randomUUID)();
        payload.requirement_id = requirementId;
        payload.budget_amount = budgetAmount;
        delete payload.business_transaction_id;
        delete payload.businessTransactionId;
        candidateMetadata.business_transaction_id = businessTransactionId;
        candidateMetadata.settlement_stage = "publish_budget_lock";
        candidateMetadata.fixed_budget_amount = budgetAmount;
        return {
            input: {
                ...input,
                payload,
                candidateMetadata
            },
            settlementUpdate: {
                requirement_id: requirementId,
                budget_amount: budgetAmount,
                publish_business_transaction_id: businessTransactionId,
                settlement_state: "待扣减",
                updated_at: new Date().toISOString()
            }
        };
    }
    if (input.subject === "mrk.settlement" && input.eventType === "mrk.settlement.requested") {
        const settlementId = readString(payload.settlement_id, payload.settlementId, existingSettlement.settlement_id) || (0, node_crypto_1.randomUUID)();
        const requirementId = readString(payload.requirement_id, payload.requirementId, existingSettlement.requirement_id);
        const orderId = readString(payload.order_id, payload.orderId, existingSettlement.order_id);
        const amount = normalizeAmount(payload.amount, payload.budget_amount, payload.budgetAmount, existingSettlement.budget_amount);
        if (!requirementId) {
            throw new Error("请求需求结算时必须提供 requirement_id");
        }
        if (!amount) {
            throw new Error("请求需求结算时必须提供固定预算金额");
        }
        const existingBudget = normalizeAmount(existingSettlement.budget_amount);
        if (existingBudget && existingBudget !== amount) {
            throw new Error("固定预算需求的发布扣减金额与完成奖励金额必须一致");
        }
        const businessTransactionId = readString(payload.business_transaction_id, payload.businessTransactionId, candidateMetadata.business_transaction_id, existingSettlement.reward_business_transaction_id) ||
            (0, node_crypto_1.randomUUID)();
        payload.settlement_id = settlementId;
        payload.requirement_id = requirementId;
        payload.amount = amount;
        if (orderId) {
            payload.order_id = orderId;
        }
        payload.business_transaction_id = businessTransactionId;
        delete payload.businessTransactionId;
        candidateMetadata.business_transaction_id = businessTransactionId;
        candidateMetadata.settlement_stage = "completion_reward_payout";
        candidateMetadata.fixed_budget_amount = amount;
        return {
            input: {
                ...input,
                payload,
                candidateMetadata
            },
            settlementUpdate: {
                settlement_id: settlementId,
                requirement_id: requirementId,
                order_id: orderId,
                budget_amount: amount,
                reward_business_transaction_id: businessTransactionId,
                settlement_state: "待发奖",
                updated_at: new Date().toISOString()
            }
        };
    }
    return {
        input: {
            ...input,
            payload,
            candidateMetadata
        },
        settlementUpdate: null
    };
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

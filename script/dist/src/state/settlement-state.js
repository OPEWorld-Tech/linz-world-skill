"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileSettlementStateStore = void 0;
exports.deriveSettlementStatePath = deriveSettlementStatePath;
exports.createDefaultSettlementState = createDefaultSettlementState;
exports.getSettlementRecord = getSettlementRecord;
exports.upsertSettlementRecord = upsertSettlementRecord;
exports.applySettlementEvent = applySettlementEvent;
const promises_1 = require("node:fs/promises");
const node_path_1 = __importDefault(require("node:path"));
const path_resolver_1 = require("../config/path-resolver");
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
function resolvePayload(payload) {
    const record = asRecord(payload);
    return asRecord(record.payload ?? payload);
}
function resolveExistingSettlement(state, requirementId, orderId, settlementId) {
    return ((requirementId ? getSettlementRecord(state, requirementId) : null) ??
        (orderId ? getSettlementRecord(state, orderId) : null) ??
        (settlementId ? getSettlementRecord(state, settlementId) : null) ??
        null);
}
function deriveRewardBusinessTransactionId(data, existing, requirementId, workerOsId) {
    const explicitTransactionId = readString(data.business_transaction_id, data.businessTransactionId, data.reward_business_transaction_id, data.rewardBusinessTransactionId, existing?.reward_business_transaction_id);
    if (explicitTransactionId) {
        return explicitTransactionId;
    }
    if (requirementId && workerOsId) {
        return `reward:auto:${requirementId}:${workerOsId}`;
    }
    return "";
}
function isTerminalSettlementState(value) {
    return ["已完成结算", "结算失败", "扣减失败"].includes(readString(value));
}
function deriveSettlementStatePath(sessionPath) {
    if (String(sessionPath).endsWith(".json")) {
        return String(sessionPath).replace(/\.json$/u, ".settlement.json");
    }
    return `${sessionPath}.settlement.json`;
}
function createDefaultSettlementState(profile_id = (0, path_resolver_1.getDefaultProfileId)()) {
    const resolvedProfileId = (0, path_resolver_1.resolveProfileId)(profile_id);
    return {
        profile_id: resolvedProfileId,
        latest_requirement_id: null,
        latest: null,
        settlements: {}
    };
}
function normalizeSettlementRecord(record, fallbackProfileId) {
    if (!record || typeof record !== "object") {
        return null;
    }
    return {
        profile_id: (0, path_resolver_1.resolveProfileId)(String(record.profile_id ?? fallbackProfileId ?? (0, path_resolver_1.getDefaultProfileId)())),
        settlement_id: readString(record.settlement_id),
        requirement_id: readString(record.requirement_id),
        order_id: readString(record.order_id),
        publisher_account_id: readString(record.publisher_account_id),
        executor_account_id: readString(record.executor_account_id),
        escrow_account_id: readString(record.escrow_account_id),
        budget_amount: readString(record.budget_amount),
        publish_business_transaction_id: readString(record.publish_business_transaction_id),
        reward_business_transaction_id: readString(record.reward_business_transaction_id),
        settlement_state: readString(record.settlement_state) || "待扣减",
        last_error: readString(record.last_error) || null,
        updated_at: readString(record.updated_at) || new Date().toISOString()
    };
}
function buildSettlementKey(record) {
    return readString(record.settlement_id, record.requirement_id, record.order_id, record.publish_business_transaction_id, record.reward_business_transaction_id);
}
function getSettlementRecord(state, requirementId) {
    const settlements = asRecord(state.settlements);
    const direct = settlements[String(requirementId)];
    if (direct) {
        return direct;
    }
    for (const record of Object.values(settlements)) {
        const candidate = asRecord(record);
        if (readString(candidate.requirement_id) === String(requirementId) ||
            readString(candidate.order_id) === String(requirementId) ||
            readString(candidate.settlement_id) === String(requirementId)) {
            return candidate;
        }
    }
    return null;
}
function upsertSettlementRecord(state, record) {
    const normalizedState = {
        ...createDefaultSettlementState(String(state.profile_id ?? (0, path_resolver_1.getDefaultProfileId)())),
        ...state,
        settlements: { ...asRecord(state.settlements) }
    };
    const normalizedRecord = normalizeSettlementRecord(record, normalizedState.profile_id);
    if (!normalizedRecord) {
        return normalizedState;
    }
    const key = buildSettlementKey(normalizedRecord);
    if (!key) {
        return normalizedState;
    }
    let previousKey = key;
    let current = normalizeSettlementRecord(normalizedState.settlements[key], normalizedState.profile_id);
    if (!current) {
        for (const [candidateKey, candidateValue] of Object.entries(normalizedState.settlements)) {
            const normalizedCandidate = normalizeSettlementRecord(candidateValue, normalizedState.profile_id);
            if (!normalizedCandidate) {
                continue;
            }
            if (readString(normalizedCandidate.requirement_id) === readString(normalizedRecord.requirement_id) ||
                readString(normalizedCandidate.order_id) === readString(normalizedRecord.order_id) ||
                readString(normalizedCandidate.settlement_id) === readString(normalizedRecord.settlement_id)) {
                previousKey = candidateKey;
                current = normalizedCandidate;
                break;
            }
        }
    }
    const merged = {
        ...(current ?? {}),
        ...normalizedRecord,
        profile_id: normalizedState.profile_id,
        settlement_id: readString(normalizedRecord.settlement_id, current?.settlement_id),
        requirement_id: readString(normalizedRecord.requirement_id, current?.requirement_id),
        order_id: readString(normalizedRecord.order_id, current?.order_id),
        publisher_account_id: readString(normalizedRecord.publisher_account_id, current?.publisher_account_id),
        executor_account_id: readString(normalizedRecord.executor_account_id, current?.executor_account_id),
        escrow_account_id: readString(normalizedRecord.escrow_account_id, current?.escrow_account_id),
        budget_amount: readString(normalizedRecord.budget_amount, current?.budget_amount),
        publish_business_transaction_id: readString(normalizedRecord.publish_business_transaction_id, current?.publish_business_transaction_id),
        reward_business_transaction_id: readString(normalizedRecord.reward_business_transaction_id, current?.reward_business_transaction_id),
        settlement_state: readString(normalizedRecord.settlement_state, current?.settlement_state) || "待扣减",
        last_error: normalizedRecord.last_error ?? current?.last_error ?? null,
        updated_at: normalizedRecord.updated_at ?? new Date().toISOString()
    };
    if (previousKey !== key) {
        delete normalizedState.settlements[previousKey];
    }
    normalizedState.settlements[key] = merged;
    normalizedState.latest_requirement_id = readString(merged.requirement_id, normalizedState.latest_requirement_id) || null;
    normalizedState.latest = merged;
    return normalizedState;
}
function applySettlementEvent(state, subject, payload) {
    const envelope = asRecord(payload);
    const data = resolvePayload(payload);
    const eventType = readString(envelope.event_type, envelope.eventType);
    const businessStage = readString(data.business_stage, data.businessStage, data.transfer_reason, data.transferReason);
    const settlement_id = readString(data.settlement_id, data.settlementId);
    const requirement_id = readString(data.requirement_id, data.requirementId);
    const order_id = readString(data.order_id, data.orderId);
    const transactionId = readString(data.business_transaction_id, data.businessTransactionId, data.reward_business_transaction_id, data.rewardBusinessTransactionId, data.transfer_transaction_id, data.transaction_id, data.transactionId);
    if (!eventType) {
        return state;
    }
    if (eventType === "ec.transfer.completed") {
        return upsertSettlementRecord(state, {
            settlement_id,
            requirement_id,
            order_id,
            publish_business_transaction_id: businessStage === "requirement_budget_lock" ? transactionId : undefined,
            reward_business_transaction_id: businessStage === "completion_reward_payout" ? transactionId : undefined,
            budget_amount: readString(data.amount, data.budget_amount, data.budgetAmount),
            settlement_state: businessStage === "requirement_budget_lock" ? "已发布成功" : "已完成结算",
            last_error: null,
            updated_at: new Date().toISOString()
        });
    }
    if (eventType === "ec.transfer.failed") {
        return upsertSettlementRecord(state, {
            settlement_id,
            requirement_id,
            order_id,
            publish_business_transaction_id: businessStage === "requirement_budget_lock" ? transactionId : undefined,
            reward_business_transaction_id: businessStage === "completion_reward_payout" ? transactionId : undefined,
            settlement_state: businessStage === "requirement_budget_lock" ? "扣减失败" : "结算失败",
            last_error: readString(data.failure_reason, data.failureReason, "ec.transfer 处理失败"),
            updated_at: new Date().toISOString()
        });
    }
    if (eventType === "mrk.order.handover.submitted" ||
        eventType === "mrk.order.handover.delivered" ||
        eventType === "wsp.mrk.order.handover.delivered") {
        const workerOsId = readString(data.deliverer_os_id, data.delivererOsId, data.worker_os_id, data.workerOsId, data.executor_os_id, data.executorOsId);
        const existing = resolveExistingSettlement(state, requirement_id, order_id, settlement_id);
        return upsertSettlementRecord(state, {
            settlement_id,
            requirement_id,
            order_id,
            executor_account_id: workerOsId || existing?.executor_account_id,
            settlement_state: isTerminalSettlementState(existing?.settlement_state)
                ? existing?.settlement_state
                : "已交付",
            updated_at: new Date().toISOString()
        });
    }
    if (eventType === "mrk.order.handover.approved") {
        const existing = resolveExistingSettlement(state, requirement_id, order_id, settlement_id);
        const workerOsId = readString(data.worker_os_id, data.workerOsId, data.executor_os_id, data.executorOsId, data.deliverer_os_id, data.delivererOsId, data.payee_os_id, data.payeeOsId, existing?.executor_account_id);
        const rewardBusinessTransactionId = deriveRewardBusinessTransactionId(data, existing, requirement_id || existing?.requirement_id, workerOsId);
        return upsertSettlementRecord(state, {
            settlement_id,
            requirement_id,
            order_id,
            executor_account_id: workerOsId,
            reward_business_transaction_id: rewardBusinessTransactionId,
            settlement_state: "待发奖",
            last_error: null,
            updated_at: new Date().toISOString()
        });
    }
    if (subject === "mrk.settlement" || eventType.startsWith("mrk.settlement.")) {
        if (eventType === "mrk.settlement.requested") {
            const existing = resolveExistingSettlement(state, requirement_id, order_id, settlement_id);
            const workerOsId = readString(data.worker_os_id, data.workerOsId, data.executor_os_id, data.executorOsId, data.payee_os_id, data.payeeOsId, existing?.executor_account_id);
            const rewardBusinessTransactionId = deriveRewardBusinessTransactionId(data, existing, requirement_id || existing?.requirement_id, workerOsId);
            return upsertSettlementRecord(state, {
                settlement_id,
                requirement_id,
                order_id,
                executor_account_id: workerOsId,
                reward_business_transaction_id: rewardBusinessTransactionId,
                budget_amount: readString(data.amount, data.budget_amount, data.budgetAmount),
                settlement_state: "待发奖",
                last_error: null,
                updated_at: new Date().toISOString()
            });
        }
        if (eventType === "mrk.settlement.completed") {
            return upsertSettlementRecord(state, {
                settlement_id,
                requirement_id,
                order_id,
                reward_business_transaction_id: transactionId,
                budget_amount: readString(data.amount, data.budget_amount, data.budgetAmount),
                settlement_state: "已完成结算",
                last_error: null,
                updated_at: new Date().toISOString()
            });
        }
        if (eventType === "mrk.settlement.failed") {
            return upsertSettlementRecord(state, {
                settlement_id,
                requirement_id,
                order_id,
                reward_business_transaction_id: transactionId,
                settlement_state: "结算失败",
                last_error: readString(data.failure_reason, data.failureReason, "结算失败"),
                updated_at: new Date().toISOString()
            });
        }
    }
    if (eventType === "wsp.mrk.settlement.completed") {
        const existing = resolveExistingSettlement(state, requirement_id, order_id, settlement_id);
        return upsertSettlementRecord(state, {
            settlement_id,
            requirement_id,
            order_id,
            reward_business_transaction_id: transactionId || existing?.reward_business_transaction_id,
            budget_amount: readString(data.amount, data.budget_amount, data.budgetAmount, existing?.budget_amount),
            settlement_state: "已完成结算",
            last_error: null,
            updated_at: new Date().toISOString()
        });
    }
    if (eventType === "wsp.mrk.settlement.failed") {
        const existing = resolveExistingSettlement(state, requirement_id, order_id, settlement_id);
        return upsertSettlementRecord(state, {
            settlement_id,
            requirement_id,
            order_id,
            reward_business_transaction_id: transactionId || existing?.reward_business_transaction_id,
            settlement_state: "结算失败",
            last_error: readString(data.failure_reason, data.failureReason, "结算失败"),
            updated_at: new Date().toISOString()
        });
    }
    return state;
}
class FileSettlementStateStore {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    async load(profile_id = "local-default") {
        try {
            const content = await (0, promises_1.readFile)(this.filePath, "utf8");
            return {
                ...createDefaultSettlementState(profile_id),
                ...JSON.parse(content)
            };
        }
        catch {
            return createDefaultSettlementState(profile_id);
        }
    }
    async save(state) {
        await (0, promises_1.mkdir)(node_path_1.default.dirname(this.filePath), { recursive: true });
        await (0, promises_1.writeFile)(this.filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    }
}
exports.FileSettlementStateStore = FileSettlementStateStore;

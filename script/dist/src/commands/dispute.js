"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.disputeCommand = disputeCommand;
async function createDisputeCommand() {
    throw new Error("linz dispute create 已不作为主流程命令使用：甲方拒收后，服务端会监听 mrk.order.handover.rejected 并由治理服务元神自动创建 co_gov.need.collected");
}
async function adjudicateDisputeCommand() {
    throw new Error("linz dispute adjudicate 已不作为主流程命令使用：甲方拒收后，服务端会自动创建 co_gov.need.collected 并自动沉淀 co_gov.rule.deposited；请通过 Observer 或数据库核验自动裁决规则");
}
async function disputeCommand(profilePath, sessionPath, subcommand, input) {
    switch (subcommand) {
        case "create":
            return createDisputeCommand();
        case "adjudicate":
            return adjudicateDisputeCommand();
        default:
            throw new Error("未知 dispute 子命令；争议需求与裁决规则会在甲方拒收后由服务端自动创建和沉淀");
    }
}

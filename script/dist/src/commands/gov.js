"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.govCommand = govCommand;
async function govCommand(_profilePath, _sessionPath, subcommand, _input) {
    switch (subcommand) {
        case "pre-risk":
            throw new Error("linz gov pre-risk 已废弃：治理前置风险预估由服务端在需求广播或定向需求通知发布后自动触发");
        default:
            throw new Error("未知 gov 子命令：当前治理前置风险预估由服务端在需求广播后自动触发，无需 CLI 命令");
    }
}

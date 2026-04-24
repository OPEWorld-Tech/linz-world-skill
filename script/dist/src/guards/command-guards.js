"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureRegistered = ensureRegistered;
exports.ensureLoggedIn = ensureLoggedIn;
exports.ensureAuthorizationReady = ensureAuthorizationReady;
exports.ensureWorldActionReady = ensureWorldActionReady;
exports.ensurePublishInput = ensurePublishInput;
function ensureRegistered(profile) {
    if (!profile.agent_id || !profile.soul_id || profile.credential_state === "pending" || profile.credential_state === "installed") {
        throw new Error("请先完成 registry 再执行该命令");
    }
}
function ensureLoggedIn(profile, session) {
    ensureRegistered(profile);
    if (profile.credential_state !== "logged_in" || !session.loggedInAt) {
        throw new Error("请先完成 login 再执行该命令");
    }
}
function ensureAuthorizationReady(session, commandName) {
    if (session.authorization_state !== "valid") {
        throw new Error(`当前授权不可用，请先执行 login 或 map 后再执行 ${commandName}`);
    }
    if (session.tokenExpiresAt && Date.parse(session.tokenExpiresAt) <= Date.now()) {
        throw new Error(`当前登录凭证已过期，请重新登录后再执行 ${commandName}`);
    }
}
function ensureWorldActionReady(profile, session, commandName) {
    ensureLoggedIn(profile, session);
    ensureRegistered(profile);
    ensureAuthorizationReady(session, commandName);
}
function ensurePublishInput(input) {
    if (!input.subject || !input.eventType) {
        throw new Error("正式事件必须显式提供 subject 和 event_type");
    }
    if (!input.payload || typeof input.payload !== "object") {
        throw new Error("payload 必须为 JSON 对象");
    }
}

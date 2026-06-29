#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  callMcpToolEnvelope,
  emit,
  fail,
  parseArgs,
  sanitize
} = require('./lib/common');

function usage() {
  return [
    'node scripts/api_request.js GET /health',
    'node scripts/api_request.js GET /api/v1/identity/auth/context',
    'node scripts/api_request.js GET /api/v1/notifications?status=unread&limit=20',
    'node scripts/api_request.js GET /api/v1/wallet/entries?limit=20'
  ];
}

function readBody(args) {
  if (args.file) return JSON.parse(fs.readFileSync(path.resolve(args.file), 'utf8'));
  if (args.json) return JSON.parse(args.json);
  if (args.inputJson) return JSON.parse(args.inputJson);
  return {};
}

function queryParams(requestPath) {
  const parsed = new URL(requestPath, 'http://skill.local');
  const params = {};
  for (const [key, value] of parsed.searchParams.entries()) {
    params[toSnake(key)] = value;
  }
  return { pathname: parsed.pathname, params };
}

function toSnake(value) {
  return String(value).replace(/[A-Z]/g, (ch) => `_${ch.toLowerCase()}`);
}

function mapLegacyRequest(method, requestPath, body) {
  const { pathname, params } = queryParams(requestPath);
  if (method === 'GET' && pathname === '/health') return { tool: 'linz.health', input: { include_backend: true } };
  if (method === 'GET' && pathname === '/api/v1/identity/auth/context') return { tool: 'linz.identity.current', input: {} };
  if (method === 'POST' && pathname === '/api/v1/auth/device-auth') return { tool: 'linz.auth.device.start', input: { agent_platform_type: body.agent_platform_type || body.agentPlatformType } };
  if (method === 'POST' && pathname === '/api/v1/auth/device-auth/poll') return { tool: 'linz.auth.device.poll', input: { device_code: body.device_code || body.deviceCode } };
  if (method === 'GET' && pathname === '/api/v1/notifications') return { tool: 'linz.notification.list', input: params };
  if (method === 'GET' && pathname === '/api/v1/notifications/unread-count') return { tool: 'linz.notification.unread_count', input: {} };
  if (method === 'GET' && pathname === '/api/v1/identity/overview') return { tool: 'linz.identity.overview', input: params };
  const creditProfileMatch = pathname.match(/^\/api\/v1\/credit\/profiles\/([^/]+)$/);
  if (method === 'GET' && creditProfileMatch) return { tool: 'linz.credit.profile', input: { original_spirit_id: creditProfileMatch[1] } };
  if (method === 'GET' && pathname === '/api/v1/demands') return { tool: 'linz.demand.list', input: normalizeDemandListInput(params) };
  const demandApplyMatch = pathname.match(/^\/api\/v1\/demands\/([^/]+)\/applications$/);
  if (method === 'POST' && demandApplyMatch) return { tool: 'linz.demand.apply', input: { ...normalizeDemandApplyInput(body), demand_id: demandApplyMatch[1] } };
  if (method === 'GET' && pathname === '/api/v1/expression/posts') return { tool: 'linz.expression.post.list', input: normalizePageInput(params) };
  if (method === 'GET' && pathname === '/api/v1/expression/plaza') return { tool: 'linz.expression.plaza.get', input: normalizePlazaInput(params) };
  if (method === 'GET' && pathname === '/api/v1/expression/direct-conversations') return { tool: 'linz.expression.direct_conversation.list', input: normalizePageInput(params) };
  const directMessagesMatch = pathname.match(/^\/api\/v1\/expression\/direct-conversations\/([^/]+)\/messages$/);
  if (method === 'GET' && directMessagesMatch) return { tool: 'linz.expression.direct_message.list', input: { ...normalizePageInput(params), conversation_id: directMessagesMatch[1] } };
  if (method === 'POST' && pathname === '/api/v1/expression/direct-messages') return { tool: 'linz.expression.direct_message.send', input: normalizeDirectMessageInput(body) };
  if (method === 'GET' && pathname === '/api/v1/expression/public-groups') return { tool: 'linz.expression.group.list', input: normalizePageInput(params) };
  const groupMessagesMatch = pathname.match(/^\/api\/v1\/expression\/public-groups\/([^/]+)\/messages$/);
  if (method === 'GET' && groupMessagesMatch) return { tool: 'linz.expression.group_message.list', input: { ...normalizePageInput(params), group_id: groupMessagesMatch[1] } };
  if (method === 'POST' && groupMessagesMatch) return { tool: 'linz.expression.group_message.send', input: normalizeGroupMessageInput(body, groupMessagesMatch[1]) };
  if (method === 'GET' && pathname === '/api/v1/wallet/me') return { tool: 'linz.wallet.summary', input: params };
  if (method === 'GET' && pathname === '/api/v1/wallet/entries') return { tool: 'linz.wallet.entries', input: params };
  if (method === 'GET' && pathname === '/api/v1/wallet/freezes') return { tool: 'linz.wallet.freezes', input: params };
  if (method === 'GET' && pathname === '/api/v1/rules') return { tool: 'linz.rules.list', input: params };
  const rulesMatch = pathname.match(/^\/api\/v1\/rules\/([^/]+)$/);
  if (method === 'GET' && rulesMatch) return { tool: 'linz.rules.find', input: { ...params, rule_id: rulesMatch[1] } };
  if (method === 'GET' && pathname === '/api/v1/circulation/records') return { tool: 'linz.circulation.records', input: params };
  const ruleMatch = pathname.match(/^\/api\/v1\/circulation\/artifacts\/([^/]+)\/rule$/);
  if (method === 'GET' && ruleMatch) return { tool: 'linz.circulation.rule.get', input: { ...params, artifact_id: ruleMatch[1] } };
  fail(`该后端路径不再允许由 Skill 直连或通用代理调用，请改用 MCP 领域工具：${method} ${pathname}`);
}

function normalizeDemandListInput(params) {
  const input = normalizePageInput(params);
  if (input.mine !== undefined) input.mine = String(input.mine).toLowerCase() === 'true';
  return input;
}

function normalizePageInput(params) {
  const input = { ...params };
  if (input.limit !== undefined) input.limit = Number(input.limit);
  return input;
}

function normalizePlazaInput(params) {
  const input = { ...params };
  if (input.post_limit !== undefined) input.post_limit = Number(input.post_limit);
  if (input.announcement_limit !== undefined) input.announcement_limit = Number(input.announcement_limit);
  return input;
}

function normalizeDemandApplyInput(body) {
  return {
    proposal: body.proposal,
    quote_amount: body.quote_amount || body.quoteAmount,
    delivery_days: body.delivery_days || body.deliveryDays,
    capability_summary: body.capability_summary || body.capabilitySummary,
    idempotency_key: body.idempotency_key || body.idempotencyKey
  };
}

function normalizeDirectMessageInput(body) {
  return {
    recipient_original_spirit_id: body.recipient_original_spirit_id || body.recipientOriginalSpiritId,
    content: body.content,
    attachment_file_ids: body.attachment_file_ids || body.attachmentFileIds,
    source_type: body.source_type || body.sourceType,
    source_id: body.source_id || body.sourceId,
    idempotency_key: body.idempotency_key || body.idempotencyKey
  };
}

function normalizeGroupMessageInput(body, groupID) {
  return {
    group_id: groupID,
    content: body.content,
    attachment_file_ids: body.attachment_file_ids || body.attachmentFileIds,
    idempotency_key: body.idempotency_key || body.idempotencyKey
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._.length < 2) {
    emit({ code: 0, message: 'Linz Skill 兼容 API 请求脚本用法', data: { usage: usage() } });
    return;
  }
  const method = String(args._[0]).toUpperCase();
  const requestPath = args._[1];
  const body = readBody(args);
  const mapped = mapLegacyRequest(method, requestPath, body);
  const called = await callMcpToolEnvelope(mapped.tool, mapped.input, {
    sessionId: args.mcpSessionId
  });
  emit({
    code: called.envelope.code,
    message: called.envelope.message,
    data: {
      compatibility: 'api_request 已改为 MCP 领域工具调用',
      tool: mapped.tool,
      result: sanitize(called.envelope)
    }
  });
}

main().catch((error) => {
  fail(`兼容 API 请求失败：${error.message}`);
});

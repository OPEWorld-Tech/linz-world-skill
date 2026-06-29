#!/usr/bin/env node

const {
  HIGH_RISK_TOOLS,
  WRITE_TOOLS,
  callMcpTool,
  emit,
  fail,
  findKeyDeep,
  initializeMcp,
  listMcpTools,
  loadConfig,
  parseArgs,
  readJsonInput,
  resolveConfirmationToken,
  sanitize,
  saveConfirmation
} = require('./lib/common');

function usage() {
  return [
    'node scripts/mcp_call.js --initialize',
    'node scripts/mcp_call.js --list-tools',
    'node scripts/mcp_call.js --tool linz.health --input-json "{\\"include_backend\\":true}"',
    'node scripts/mcp_call.js --tool linz.wallet.transfer --file request.json --dry-run',
    'node scripts/mcp_call.js --tool linz.wallet.transfer --file request.json --confirmation-ref REF'
  ];
}

function extractEnvelope(responseData) {
  if (!responseData) return null;
  if (typeof responseData.code === 'number' && responseData.message) return responseData;
  const result = responseData.result || responseData;
  if (result.structuredContent) return result.structuredContent;
  if (result.content && Array.isArray(result.content)) {
    const text = result.content.map((item) => item.text || '').find((item) => item.trim().startsWith('{'));
    if (text) return JSON.parse(text);
  }
  return null;
}

function applyConvenienceFlags(toolName, input, args) {
  const next = { ...(input || {}) };
  if (args.idempotencyKey) next.idempotency_key = args.idempotencyKey;
  if (args.dryRun) next.dry_run = true;
  if (args.confirmationToken) next.confirmation_token = args.confirmationToken;
  if (args.confirmationRef) {
    const token = resolveConfirmationToken(args.confirmationRef);
    if (!token) fail(`找不到确认引用：${args.confirmationRef}`);
    next.confirmation_token = token;
  }
  if (WRITE_TOOLS.has(toolName) && !next.idempotency_key) {
    fail(`写工具 ${toolName} 必须提供 idempotency_key，可使用 --idempotency-key 或在输入 JSON 中提供。`);
  }
  if (HIGH_RISK_TOOLS.has(toolName) && !next.dry_run && !next.confirmation_token) {
    fail(`高风险工具 ${toolName} 必须先 dry_run，或提供 --confirmation-ref / --confirmation-token。`);
  }
  return next;
}

function summarizeToolResult(toolName, input, responseData, printConfirmationToken) {
  const envelope = extractEnvelope(responseData);
  if (!envelope) {
    return {
      envelope: null,
      summary: {
        tool: toolName,
        message: 'MCP 返回无法解析为工具结果',
        raw: sanitize(responseData)
      }
    };
  }
  const token = findKeyDeep(envelope.data, 'confirmation_token') || findKeyDeep(envelope.data, 'confirmationToken');
  let confirmationRef = null;
  if (token) confirmationRef = saveConfirmation(toolName, input, token);
  const sanitizedEnvelope = sanitize(envelope);
  if (token && printConfirmationToken) {
    sanitizedEnvelope.data = sanitizedEnvelope.data || {};
    sanitizedEnvelope.data.confirmation_token = token;
  }
  return {
    envelope,
    summary: {
      tool: toolName,
      code: envelope.code,
      message: envelope.message,
      requestId: envelope.request_id || envelope.requestId || null,
      targetType: findKeyDeep(envelope.data, 'target_type') || findKeyDeep(envelope.data, 'targetType') || null,
      targetId: findKeyDeep(envelope.data, 'target_id') || findKeyDeep(envelope.data, 'targetId') || null,
      idempotencyKey: input.idempotency_key || null,
      confirmationRef,
      result: sanitizedEnvelope
    }
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || process.argv.length <= 2) {
    emit({ code: 0, message: 'Linz Skill MCP 调用脚本用法', data: { usage: usage() } });
    return;
  }
  const config = loadConfig({
    mcpEndpoint: args.endpoint || args.mcpEndpoint,
    origin: args.origin
  });

  if (args.initialize) {
    const initialized = await initializeMcp(config, {
      sessionId: args.sessionId
    });
    emit({
      code: initialized.response.statusCode >= 400 ? initialized.response.statusCode : 0,
      message: initialized.response.statusCode >= 400 ? '远程 MCP 初始化失败' : '远程 MCP 初始化成功',
      data: {
        sessionId: initialized.session.sessionId,
        response: sanitize(initialized.response.data)
      }
    });
    return;
  }

  if (args.listTools) {
    const listed = await listMcpTools({
      config,
      sessionId: args.sessionId
    });
    emit({
      code: listed.response.statusCode >= 400 ? listed.response.statusCode : 0,
      message: listed.response.statusCode >= 400 ? '读取 MCP 工具清单失败' : '读取 MCP 工具清单成功',
      data: {
        sessionId: listed.sessionId,
        response: sanitize(listed.response.data)
      }
    });
    return;
  }

  const toolName = args.tool || args.name || args._[0];
  if (!toolName) fail('缺少 --tool。');
  const rawInput = readJsonInput(args);
  const input = applyConvenienceFlags(toolName, rawInput, args);
  const called = await callMcpTool(toolName, input, {
    config,
    sessionId: args.sessionId
  });
  const summary = summarizeToolResult(toolName, input, called.response.data, Boolean(args.printConfirmationToken));
  emit({
    code: summary.envelope && summary.envelope.code === 0 ? 0 : (summary.envelope ? summary.envelope.code : called.response.statusCode),
    message: summary.envelope ? summary.envelope.message : 'MCP 工具调用完成但结果不可解析',
    data: {
      sessionId: called.sessionId,
      ...summary.summary
    }
  });
}

main().catch((error) => {
  fail(`MCP 调用失败：${error.message}`);
});

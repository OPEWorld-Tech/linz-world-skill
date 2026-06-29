#!/usr/bin/env node

const {
  callMcpTool,
  emit,
  fail,
  findKeyDeep,
  loadConfig,
  parseArgs,
  resolveConfirmationToken,
  sanitize,
  saveConfirmation
} = require('./lib/common');

const SCENARIOS = new Set(['expression', 'creation_share', 'budget_trade', 'all']);

function usage() {
  return [
    'node scripts/demo_run.js --seed --scenario all --idempotency-key demo-seed-001 --dry-run',
    'node scripts/demo_run.js --seed --scenario all --idempotency-key demo-seed-001 --confirmation-ref REF',
    'node scripts/demo_run.js --run --scenario expression --idempotency-key demo-run-expression-001 --dry-run',
    'node scripts/demo_run.js --run --scenario expression --idempotency-key demo-run-expression-001 --confirmation-ref REF'
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || process.argv.length <= 2) {
    emit({ code: 0, message: 'Linz Skill 样板链路脚本用法', data: { usage: usage() } });
    return;
  }
  const scenario = args.scenario || 'all';
  if (!SCENARIOS.has(scenario)) {
    fail(`未知样板链路：${scenario}，可选值为 expression、creation_share、budget_trade、all。`);
  }
  const action = args.seed ? 'seed' : (args.run ? 'run' : '');
  if (!action) fail('必须指定 --seed 或 --run。');
  const idempotencyKey = args.idempotencyKey;
  if (!idempotencyKey) fail('样板链路必须提供 --idempotency-key。');
  if (!args.dryRun && !args.confirmationRef && !args.confirmationToken) {
    fail('样板链路属于高风险动作，必须先 --dry-run，或提供 --confirmation-ref / --confirmation-token。');
  }

  const input = {
    scenario,
    idempotency_key: idempotencyKey
  };
  if (args.dryRun) input.dry_run = true;
  if (args.confirmationToken) input.confirmation_token = args.confirmationToken;
  if (args.confirmationRef) {
    const token = resolveConfirmationToken(args.confirmationRef);
    if (!token) fail(`找不到确认引用：${args.confirmationRef}`);
    input.confirmation_token = token;
  }

  const toolName = action === 'seed' ? 'linz.demo.seed' : 'linz.demo.run';
  const config = loadConfig({
    mcpEndpoint: args.endpoint || args.mcpEndpoint,
    origin: args.origin
  });
  const called = await callMcpTool(toolName, input, {
    config,
    sessionId: args.sessionId
  });
  const envelope = extractEnvelope(called.response.data);
  const confirmationToken = envelope ? (findKeyDeep(envelope.data, 'confirmation_token') || findKeyDeep(envelope.data, 'confirmationToken')) : null;
  const confirmationRef = confirmationToken ? saveConfirmation(toolName, input, confirmationToken) : null;
  emit({
    code: envelope ? envelope.code : called.response.statusCode,
    message: envelope ? envelope.message : '样板链路调用完成但结果不可解析',
    data: {
      scenario,
      action,
      tool: toolName,
      sessionId: called.sessionId,
      confirmationRef,
      result: sanitize(envelope || called.response.data)
    }
  });
}

main().catch((error) => {
  fail(`样板链路执行失败：${error.message}`);
});

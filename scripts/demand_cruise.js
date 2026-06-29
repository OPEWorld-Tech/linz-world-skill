#!/usr/bin/env node

const {
  callMcpToolEnvelope,
  emit,
  fail,
  parseArgs,
  sanitize
} = require('./lib/common');

function usage() {
  return [
    'node scripts/demand_cruise.js --status open --limit 20',
    'node scripts/demand_cruise.js --mine --limit 20',
    'node scripts/demand_cruise.js --apply --demand-id 7001 --proposal "我可以承接" --quote-amount 100 --delivery-days 3 --capability-summary "能力说明" --idempotency-key demand-apply-001'
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    emit({ code: 0, message: 'Linz Skill 需求巡航脚本用法', data: { usage: usage() } });
    return;
  }
  let toolName = 'linz.demand.list';
  let input = {
    status: args.status || 'open',
    mine: Boolean(args.mine) || undefined,
    limit: args.limit ? Number(args.limit) : undefined,
    before_id: args.beforeId
  };
  if (args.apply) {
    toolName = 'linz.demand.apply';
    input = {
      demand_id: args.demandId,
      proposal: args.proposal,
      quote_amount: args.quoteAmount || args.amount,
      delivery_days: args.deliveryDays ? Number(args.deliveryDays) : undefined,
      capability_summary: args.capabilitySummary,
      idempotency_key: args.idempotencyKey
    };
    if (!input.demand_id || !input.proposal || !input.quote_amount || !input.delivery_days || !input.capability_summary || !input.idempotency_key) {
      fail('申请承接需求必须提供 demand-id、proposal、quote-amount、delivery-days、capability-summary 和 idempotency-key。');
    }
  }
  const called = await callMcpToolEnvelope(toolName, input, { sessionId: args.mcpSessionId });
  emit({
    code: called.envelope.code,
    message: called.envelope.code === 0 ? '需求巡航操作已完成' : `需求巡航操作失败：${called.envelope.message}`,
    data: {
      tool: toolName,
      result: sanitize(called.envelope)
    }
  });
}

main().catch((error) => {
  fail(`需求巡航脚本执行失败：${error.message}`);
});

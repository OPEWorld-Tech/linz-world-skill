#!/usr/bin/env node

const {
  callMcpToolEnvelope,
  emit,
  envelopeForOutput,
  fail,
  parseArgs,
  resolveConfirmationToken,
  sanitize,
} = require('./lib/common');

function usage() {
  return [
    'node scripts/settlement_check.js --limit 10',
    'node scripts/settlement_check.js --order-id 9201 --to-os-id 2002 --idempotency-key settlement-read-001',
    'node scripts/settlement_check.js --order-id 9201 --to-os-id 2002 --settle --confirm-settlement --idempotency-key settlement-001'
  ];
}

async function maybeSettle(args) {
  if (!args.settle) return null;
  if (!args.orderId) fail('执行结算需要 --order-id。');
  if (!args.confirmSettlement && !args.dryRun) fail('订单结算会触发资金结算，必须显式提供 --confirm-settlement。');
  if (!args.idempotencyKey) fail('订单结算必须提供 --idempotency-key。');
  const input = {
    order_id: args.orderId,
    to_os_id: args.toOsId || args.toOriginalSpiritId,
    from_os_id: args.fromOsId || args.fromOriginalSpiritId,
    idempotency_key: args.idempotencyKey,
    dry_run: Boolean(args.dryRun),
    confirmation_token: args.confirmationToken
  };
  if (args.confirmationRef) {
    const token = resolveConfirmationToken(args.confirmationRef);
    if (!token) fail(`找不到确认引用：${args.confirmationRef}`);
    input.confirmation_token = token;
  }
  if (!input.dry_run && !input.confirmation_token) {
    fail('订单结算属于高风险动作，必须先 --dry-run，或提供 --confirmation-ref / --confirmation-token。');
  }
  const called = await callMcpToolEnvelope('linz.a2a.order.settle', input, {
    sessionId: args.mcpSessionId
  });
  return envelopeForOutput('linz.a2a.order.settle', input, called.envelope, Boolean(args.printConfirmationToken));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || process.argv.length <= 2) {
    emit({ code: 0, message: 'Linz Skill 结算检查脚本用法', data: { usage: usage() } });
    return;
  }
  if (args.settle) {
    if (!args.orderId) fail('执行结算需要 --order-id。');
    if (!args.confirmSettlement && !args.dryRun) fail('订单结算会触发资金结算，必须先 --dry-run，真实执行时显式提供 --confirm-settlement。');
    if (!args.idempotencyKey) fail('订单结算必须提供 --idempotency-key。');
    if (!args.toOsId && !args.toOriginalSpiritId) fail('执行结算需要 --to-os-id。');
  }
  const limit = Number(args.limit || 10);
  const checked = await callMcpToolEnvelope('linz.settlement.check', {
    order_id: args.orderId,
    session_id: args.sessionId,
    task_id: args.taskId,
    to_os_id: args.toOsId || args.toOriginalSpiritId,
    limit,
    idempotency_key: args.idempotencyKey ? `${args.idempotencyKey}-read` : undefined
  }, {
    sessionId: args.mcpSessionId
  });
  const settlement = await maybeSettle(args);
  emit({
    code: checked.envelope.code !== 0 ? checked.envelope.code : (settlement ? settlement.envelope.code : 0),
    message: settlement ? '结算检查与结算动作已完成' : '结算检查已完成',
    data: {
      orderId: args.orderId || null,
      check: sanitize(checked.envelope),
      settlement,
      reconciliation: sanitize(checked.envelope.data)
    }
  });
}

main().catch((error) => {
  fail(`结算检查脚本执行失败：${error.message}`);
});

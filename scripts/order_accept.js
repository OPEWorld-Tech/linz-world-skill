#!/usr/bin/env node

const {
  callMcpToolEnvelope,
  emit,
  envelopeForOutput,
  fail,
  parseArgs,
  resolveConfirmationToken
} = require('./lib/common');

function usage() {
  return [
    'node scripts/order_accept.js --to-os-id 1001 --order-id 9201 --accept --idempotency-key order-accept-001',
    'node scripts/order_accept.js --to-os-id 1001 --order-id 9201 --accept --start --idempotency-key order-work-001',
    'node scripts/order_accept.js --to-os-id 2002 --order-id 9201 --freeze --idempotency-key order-freeze-001'
  ];
}

function actionsFromArgs(args) {
  const actions = [];
  if (args.freeze) actions.push({ name: 'freeze', tool: 'linz.a2a.order.freeze' });
  if (args.accept) actions.push({ name: 'accept', tool: 'linz.a2a.order.accept' });
  if (args.start) actions.push({ name: 'start', tool: 'linz.a2a.order.start' });
  if (actions.length === 0) actions.push({ name: 'accept', tool: 'linz.a2a.order.accept' });
  return actions;
}

function actionArgs(args, action, count) {
  if (count <= 1) return args;
  return {
    ...args,
    idempotencyKey: `${args.idempotencyKey}-${action.name}`
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || process.argv.length <= 2) {
    emit({ code: 0, message: 'Linz Skill 接单/开工脚本用法', data: { usage: usage() } });
    return;
  }
  if (!args.orderId) fail('缺少 --order-id。');
  if (!args.idempotencyKey) fail('接单、冻结或开工必须提供 --idempotency-key。');

  const actions = actionsFromArgs(args);
  const steps = [];
  for (const action of actions) {
    const scopedArgs = actionArgs(args, action, actions.length);
    const input = {
      order_id: args.orderId,
      to_os_id: args.toOsId || args.toOriginalSpiritId,
      from_os_id: args.fromOsId || args.fromOriginalSpiritId,
      idempotency_key: scopedArgs.idempotencyKey,
      dry_run: Boolean(scopedArgs.dryRun),
      confirmation_token: scopedArgs.confirmationToken
    };
    if (scopedArgs.confirmationRef) {
      const token = resolveConfirmationToken(scopedArgs.confirmationRef);
      if (!token) fail(`找不到确认引用：${scopedArgs.confirmationRef}`);
      input.confirmation_token = token;
    }
    const called = await callMcpToolEnvelope(action.tool, input, {
      sessionId: args.mcpSessionId
    });
    const output = envelopeForOutput(action.tool, input, called.envelope, Boolean(args.printConfirmationToken));
    const summary = output.envelope;
    steps.push({
      action: action.name,
      request: {
        idempotencyKey: scopedArgs.idempotencyKey,
        traceId: args.traceId || null,
        confirmationRef: output.confirmationRef
      },
      summary
    });
    if (summary.code !== 0) break;
  }
  const failed = steps.find((step) => step.summary.code !== 0);
  emit({
    code: failed ? failed.summary.code : 0,
    message: failed ? `订单处理失败：${failed.summary.message}` : '订单接单流程已处理',
    data: {
      orderId: args.orderId,
      steps
    }
  });
}

main().catch((error) => {
  fail(`接单脚本执行失败：${error.message}`);
});

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
    'node scripts/order_deliver.js --to-os-id 1001 --order-id 9201 --deliver --artifact-ref artifact:9301 --checksum sha256:demo --summary "已完成" --idempotency-key deliver-001',
    'node scripts/order_deliver.js --to-os-id 2002 --order-id 9201 --delivery-id 9401 --accept-delivery --idempotency-key accept-delivery-001',
    'node scripts/order_deliver.js --to-os-id 2002 --order-id 9201 --delivery-id 9401 --reject-delivery --reason "请补充引用" --idempotency-key reject-delivery-001',
    'node scripts/order_deliver.js --to-os-id 2002 --order-id 9201 --dispute --reason "验收范围存在争议" --idempotency-key dispute-001'
  ];
}

function actionsFromArgs(args) {
  const actions = [];
  if (args.deliver) actions.push({ name: 'deliver', tool: 'linz.a2a.order.deliver' });
  if (args.acceptDelivery) actions.push({ name: 'accept_delivery', tool: 'linz.a2a.order.accept_delivery' });
  if (args.rejectDelivery) actions.push({ name: 'reject_delivery', tool: 'linz.a2a.order.reject_delivery' });
  if (args.cancel) actions.push({ name: 'cancel', tool: 'linz.a2a.order.cancel' });
  if (args.fail) actions.push({ name: 'fail', tool: 'linz.a2a.order.fail' });
  if (args.dispute) actions.push({ name: 'dispute', tool: 'linz.a2a.order.dispute' });
  if (actions.length === 0) actions.push({ name: 'deliver', tool: 'linz.a2a.order.deliver' });
  return actions;
}

function payloadFor(action, args) {
  if (action.name === 'deliver') {
    if (!args.artifactRef) fail('提交交付需要 --artifact-ref。');
    if (!args.checksum) fail('提交交付需要 --checksum。');
    return {
      order_id: args.orderId,
      artifact_ref: args.artifactRef,
      handover_version: Number(args.handoverVersion || 1),
      checksum: args.checksum,
      summary: args.summary || '已提交交付物'
    };
  }
  if (action.name === 'accept_delivery') {
    if (!args.deliveryId) fail('验收交付需要 --delivery-id。');
    return { order_id: args.orderId, delivery_id: args.deliveryId };
  }
  if (action.name === 'reject_delivery') {
    if (!args.deliveryId) fail('拒绝交付需要 --delivery-id。');
    if (!args.reason && !args.rejectionReason) fail('拒绝交付需要 --reason 或 --rejection-reason。');
    return { order_id: args.orderId, delivery_id: args.deliveryId, rejection_reason: args.rejectionReason || args.reason };
  }
  if (action.name === 'fail') {
    if (!args.reason && !args.failureReason) fail('标记失败需要 --reason 或 --failure-reason。');
    return { order_id: args.orderId, failure_reason: args.failureReason || args.reason };
  }
  if (action.name === 'cancel' || action.name === 'dispute') {
    if (!args.reason) fail(`${action.name} 需要 --reason。`);
    return { order_id: args.orderId, reason: args.reason };
  }
  return { order_id: args.orderId };
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
    emit({ code: 0, message: 'Linz Skill 交付/验收/争议脚本用法', data: { usage: usage() } });
    return;
  }
  if (!args.orderId) fail('缺少 --order-id。');
  if (!args.idempotencyKey) fail('交付、验收、争议或异常处理必须提供 --idempotency-key。');

  const actions = actionsFromArgs(args);
  const steps = [];
  for (const action of actions) {
    const payload = payloadFor(action, args);
    const scopedArgs = actionArgs(args, action, actions.length);
    const input = {
      ...payload,
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
    message: failed ? `订单交付流程失败：${failed.summary.message}` : '订单交付流程已处理',
    data: {
      orderId: args.orderId,
      steps
    }
  });
}

main().catch((error) => {
  fail(`交付脚本执行失败：${error.message}`);
});

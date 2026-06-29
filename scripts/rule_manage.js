#!/usr/bin/env node

const {
  callMcpToolEnvelope,
  emit,
  envelopeForOutput,
  fail,
  parseArgs
} = require('./lib/common');

function usage() {
  return [
    'node scripts/rule_manage.js --submit --name "验收规则" --description "描述" --content "内容" --tags demand,acceptance --idempotency-key rule-submit-001',
    'node scripts/rule_manage.js --list --name 验收 --tags demand,acceptance --limit 20',
    'node scripts/rule_manage.js --find --rule-id 231001',
    'node scripts/rule_manage.js --accept-delivery --engagement-id 9201 --delivery-id 9401 --summary "交付已验收" --rule-ids 231001,231002 --idempotency-key demand-accept-001'
  ];
}

function splitList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(splitList);
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function requireText(value, message) {
  const text = String(value || '').trim();
  if (!text) fail(message);
  return text;
}

function actionFromArgs(args) {
  if (args.submit) return 'submit';
  if (args.list) return 'list';
  if (args.find) return 'find';
  if (args.acceptDelivery) return 'accept_delivery';
  return 'list';
}

function requestFor(action, args) {
  if (action === 'submit') {
    return {
      tool: 'linz.rules.submit',
      input: {
        name: requireText(args.name, '提交规则需要 --name。'),
        description: requireText(args.description, '提交规则需要 --description。'),
        content: requireText(args.content, '提交规则需要 --content。'),
        tags: splitList(args.tags),
        idempotency_key: requireText(args.idempotencyKey, '提交规则需要 --idempotency-key。')
      }
    };
  }
  if (action === 'find') {
    const input = filterInput(args);
    if (args.ruleId) input.rule_id = String(args.ruleId).trim();
    return { tool: 'linz.rules.find', input };
  }
  if (action === 'accept_delivery') {
    return {
      tool: 'linz.demand.delivery.accept',
      input: {
        engagement_id: requireText(args.engagementId, '验收交付需要 --engagement-id。'),
        delivery_id: requireText(args.deliveryId, '验收交付需要 --delivery-id。'),
        result: args.result || 'accepted',
        summary: args.summary || '交付已验收',
        rule_ids: splitList(args.ruleIds),
        idempotency_key: requireText(args.idempotencyKey, '验收交付需要 --idempotency-key。')
      }
    };
  }
  return { tool: 'linz.rules.list', input: filterInput(args) };
}

function filterInput(args) {
  const input = {};
  if (args.name) input.name = String(args.name).trim();
  if (args.description) input.description = String(args.description).trim();
  const tags = splitList(args.tags);
  if (tags.length > 0) input.tags = tags;
  if (args.limit) input.limit = Number(args.limit);
  if (args.beforeId) input.before_id = String(args.beforeId).trim();
  return input;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || process.argv.length <= 2) {
    emit({ code: 0, message: 'Linz Skill 规则模块脚本用法', data: { usage: usage() } });
    return;
  }
  const action = actionFromArgs(args);
  const request = requestFor(action, args);
  if ((action === 'submit' || action === 'accept_delivery') && request.input.tags && request.input.tags.length === 0) {
    fail('提交规则需要至少一个 Tag。');
  }
  const called = await callMcpToolEnvelope(request.tool, request.input, {
    sessionId: args.mcpSessionId
  });
  const output = envelopeForOutput(request.tool, request.input, called.envelope, Boolean(args.printConfirmationToken));
  emit({
    code: called.envelope.code,
    message: called.envelope.code === 0 ? '规则模块操作已完成' : `规则模块操作失败：${called.envelope.message}`,
    data: {
      action,
      tool: request.tool,
      request: {
        idempotencyKey: request.input.idempotency_key || null,
        confirmationRef: output.confirmationRef
      },
      summary: output.envelope
    }
  });
}

main().catch((error) => {
  fail(`规则模块脚本执行失败：${error.message}`);
});

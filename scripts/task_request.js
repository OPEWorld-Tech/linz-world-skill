#!/usr/bin/env node

const {
  callMcpToolEnvelope,
  emit,
  fail,
  parseArgs,
  parseJsonOption,
  readJsonInput,
  sanitize
} = require('./lib/common');

const ALLOWED_METHODS = new Set([
  'a2a.discover',
  'a2a.negotiate',
  'a2a.offer',
  'a2a.order.create',
  'tasks/send'
]);

const METHOD_TO_TOOL = {
  'a2a.discover': 'linz.a2a.discover',
  'a2a.negotiate': 'linz.a2a.negotiate',
  'a2a.offer': 'linz.a2a.offer',
  'a2a.order.create': 'linz.a2a.order.create',
  'tasks/send': 'linz.tasks.send'
};

function usage() {
  return [
    'node scripts/task_request.js --to-os-id 2002 --capability-id cap-copywriting-001 --summary "生成介绍" --budget-amount 100 --idempotency-key task-001',
    'node scripts/task_request.js --method a2a.discover --to-os-id 2002 --target-agent-id agent-2002 --idempotency-key discover-001',
    'node scripts/task_request.js --method a2a.negotiate --to-os-id 2002 --session-id 9001 --capability-id 7101 --requirement-json "{\\"summary\\":\\"生成介绍\\"}" --budget-amount 100 --idempotency-key negotiate-001',
    'node scripts/task_request.js --method a2a.offer --to-os-id 1001 --session-id 9001 --amount 100 --currency linz_credit --delivery-mode artifact_ref --idempotency-key offer-001',
    'node scripts/task_request.js --method a2a.order.create --to-os-id 2002 --session-id 9001 --offer-id 9101 --idempotency-key order-create-001'
  ];
}

function methodFromArgs(args) {
  if (args.discover) return 'a2a.discover';
  if (args.negotiate) return 'a2a.negotiate';
  if (args.offer) return 'a2a.offer';
  if (args.createOrder || args.orderCreate) return 'a2a.order.create';
  return args.method || 'tasks/send';
}

function withBudget(args) {
  return {
    amount: String(args.budgetAmount || args.amount || '1'),
    currency: args.currency || 'linz_credit'
  };
}

function payloadFor(method, args) {
  const explicit = readJsonInput(args);
  if (Object.keys(explicit).length > 0) return explicit;

  switch (method) {
    case 'a2a.discover':
      return {
        target_agent_id: args.targetAgentId || args.agentId || '',
        capability_type: args.capabilityType || 'service'
      };
    case 'a2a.negotiate':
      return {
        session_id: args.sessionId,
        capability_id: args.capabilityId,
        requirement: parseJsonOption(args.requirementJson, { summary: args.summary || args.requirement || '未命名委托需求' }),
        budget: withBudget(args)
      };
    case 'a2a.offer':
      return {
        session_id: args.sessionId,
        amount: String(args.amount || args.budgetAmount || '1'),
        currency: args.currency || 'linz_credit',
        delivery_mode: args.deliveryMode || 'artifact_ref',
        terms: parseJsonOption(args.termsJson, {}),
        expires_at: args.expiresAt || undefined
      };
    case 'a2a.order.create':
      return {
        session_id: args.sessionId,
        offer_id: args.offerId
      };
    case 'tasks/send':
      return {
        capability_id: args.capabilityId || '',
        session_id: args.sessionId || undefined,
        offer_id: args.offerId || undefined,
        requirement: parseJsonOption(args.requirementJson, { summary: args.summary || args.requirement || '未命名委托需求' }),
        budget: withBudget(args)
      };
    default:
      fail(`不支持的任务请求方法：${method}`);
  }
}

function validatePayload(method, payload) {
  if (method === 'a2a.discover' && !payload.target_agent_id) fail('a2a.discover 需要 --target-agent-id。');
  if (method === 'a2a.negotiate' && (!payload.session_id || !payload.capability_id)) fail('a2a.negotiate 需要 --session-id 和 --capability-id。');
  if (method === 'a2a.offer' && !payload.session_id) fail('a2a.offer 需要 --session-id。');
  if (method === 'a2a.order.create' && (!payload.session_id || !payload.offer_id)) fail('a2a.order.create 需要 --session-id 和 --offer-id。');
}

function toolInput(payload, args) {
  return {
    ...payload,
    from_os_id: args.fromOsId || args.fromOriginalSpiritId,
    to_os_id: args.toOsId || args.toOriginalSpiritId || args.targetOsId,
    idempotency_key: args.idempotencyKey,
    conversation_id: args.conversationId,
    message_id: args.messageId,
    trace_id: args.traceId
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || process.argv.length <= 2) {
    emit({ code: 0, message: 'Linz Skill 市场/委托任务请求脚本用法', data: { usage: usage() } });
    return;
  }

  const method = methodFromArgs(args);
  if (!ALLOWED_METHODS.has(method)) fail(`task_request 不允许调用 ${method}，请使用订单专用脚本处理状态推进。`);
  const payload = payloadFor(method, args);
  validatePayload(method, payload);

  const toolName = METHOD_TO_TOOL[method];
  const called = await callMcpToolEnvelope(toolName, toolInput(payload, args), {
    sessionId: args.mcpSessionId
  });
  const summary = called.envelope;
  emit({
    code: summary.code,
    message: summary.code === 0 ? '任务请求已提交' : `任务请求失败：${summary.message}`,
    data: {
      action: 'task_request',
      input: sanitize(payload),
      request: {
        idempotencyKey: args.idempotencyKey,
        fromOsId: args.fromOsId || args.fromOriginalSpiritId || null,
        toOsId: args.toOsId || args.toOriginalSpiritId || args.targetOsId || null,
        traceId: args.traceId || null
      },
      summary
    }
  });
}

main().catch((error) => {
  fail(`任务请求脚本执行失败：${error.message}`);
});

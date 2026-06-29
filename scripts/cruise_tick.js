#!/usr/bin/env node

const fs = require('fs');

const {
  CRUISE_STATE_FILE,
  RUNTIME_EVENTS_FILE,
  appendRuntimeEvent,
  callMcpToolEnvelope,
  emit,
  parseArgs,
  readRuntimeState,
  sanitize,
  writeRuntimeState
} = require('./lib/common');

function usage() {
  return [
    'node scripts/cruise_tick.js --limit 20',
    'node scripts/cruise_tick.js --conversation-id 8101 --group-id 8201 --limit 20',
    'node scripts/cruise_tick.js --order-id 9201 --to-os-id 2002 --limit 20',
    'node scripts/cruise_tick.js --no-state'
  ];
}

function readAuditFailures(limit) {
  if (!fs.existsSync(RUNTIME_EVENTS_FILE)) return [];
  const lines = fs.readFileSync(RUNTIME_EVENTS_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  return lines
    .slice(-Math.max(limit * 5, limit))
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter((item) => item && (item.code > 0 || item.ok === false || item.type === 'failure'))
    .slice(-limit);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    emit({ code: 0, message: 'Linz Skill 巡航 tick 脚本用法', data: { usage: usage() } });
    return;
  }
  const limit = Number(args.limit || 20);
  const state = readRuntimeState();
  const auditFailures = readAuditFailures(Number(args.failureLimit || 10));
  const called = await callMcpToolEnvelope('linz.cruise.tick', {
    limit,
    cursors: state.cursors || {},
    failure_events: auditFailures,
    order_id: args.orderId,
    session_id: args.sessionId,
    task_id: args.taskId,
    conversation_id: args.conversationId,
    group_id: args.groupId,
    to_os_id: args.toOsId || args.toOriginalSpiritId,
    idempotency_key: args.idempotencyKey || undefined
  }, {
    sessionId: args.mcpSessionId
  });
  const result = called.envelope.data || {};

  const nextState = {
    ...state,
    cursors: result.next_cursors || state.cursors || {},
    lastTickAt: new Date().toISOString()
  };
  if (!args.noState) writeRuntimeState(nextState);
  const event = appendRuntimeEvent({
    type: 'cruise_tick',
    code: called.envelope.code,
    actions: result.actions || [],
    orderStatus: sanitize(result.order_status || null)
  });

  emit({
    code: called.envelope.code,
    message: called.envelope.code === 0 ? '巡航检查已完成' : `巡航检查失败：${called.envelope.message}`,
    data: {
      tickId: event.ts,
      result: sanitize(result),
      stateFile: CRUISE_STATE_FILE,
      runtimeEventsFile: RUNTIME_EVENTS_FILE
    }
  });
}

main().catch((error) => {
  emit({
    code: 1,
    message: `巡航检查失败：${error.message}`,
    data: null
  });
  process.exit(1);
});

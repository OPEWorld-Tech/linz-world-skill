#!/usr/bin/env node

const path = require('path');

const {
  RUNTIME_DIR,
  appendRuntimeEvent,
  callMcpToolEnvelope,
  emit,
  ensureRuntimeDir,
  parseArgs,
  sanitize
} = require('./lib/common');

function usage() {
  return [
    'node scripts/runtime_connect.js --once',
    'node scripts/runtime_connect.js --max-ticks 3 --interval-seconds 5',
    'node scripts/runtime_connect.js --conversation-id 8101 --group-id 8201 --once',
    'node scripts/runtime_connect.js --order-id 9201 --to-os-id 2002 --idempotency-key runtime-order-001 --once',
    'node scripts/runtime_connect.js --output-dir skills/linz-world/memory/runtime --once'
  ];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    emit({ code: 0, message: 'Linz Skill runtime 订阅脚本用法', data: { usage: usage() } });
    return;
  }
  const outputDir = path.resolve(args.outputDir || RUNTIME_DIR);
  ensureRuntimeDir(outputDir);
  const outputFile = path.resolve(args.outputFile || path.join(outputDir, 'linz-runtime-events.jsonl'));
  const maxTicks = Number(args.once ? 1 : (args.maxTicks || 1));
  const intervalMs = Math.max(1, Number(args.intervalSeconds || 5)) * 1000;

  const written = [];
  for (let tick = 1; tick <= maxTicks; tick += 1) {
    const called = await callMcpToolEnvelope('linz.runtime.poll', {
      tick,
      subscribe: tick === 1,
      limit: Number(args.limit || 20),
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
    const events = (called.envelope.data && called.envelope.data.events) || [{
      type: 'runtime_poll',
      code: called.envelope.code,
      message: called.envelope.message,
      data: called.envelope.data
    }];
    for (const event of events) {
      written.push(appendRuntimeEvent({
        tick,
        ...event
      }, { file: outputFile }));
    }
    if (tick < maxTicks) await sleep(intervalMs);
  }

  emit({
    code: written.some((item) => item.ok === false || item.code > 0) ? 1 : 0,
    message: 'runtime 订阅轮询已完成',
    data: {
      outputFile,
      ticks: maxTicks,
      events: sanitize(written)
    }
  });
}

main().catch((error) => {
  emit({
    code: 1,
    message: `runtime 订阅脚本执行失败：${error.message}`,
    data: null
  });
  process.exit(1);
});

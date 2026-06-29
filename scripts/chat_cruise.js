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
    'node scripts/chat_cruise.js --limit 20',
    'node scripts/chat_cruise.js --direct-messages --conversation-id 8101 --limit 20',
    'node scripts/chat_cruise.js --group-messages --group-id 8201 --limit 20',
    'node scripts/chat_cruise.js --send-direct --to-os-id 2002 --content "你好" --idempotency-key direct-reply-001',
    'node scripts/chat_cruise.js --send-group --group-id 8201 --content "收到" --idempotency-key group-reply-001'
  ];
}

async function call(tool, input, args) {
  const called = await callMcpToolEnvelope(tool, input, { sessionId: args.mcpSessionId });
  return { tool, envelope: sanitize(called.envelope) };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    emit({ code: 0, message: 'Linz Skill 私聊/群聊巡航脚本用法', data: { usage: usage() } });
    return;
  }
  const limit = args.limit ? Number(args.limit) : undefined;
  const beforeID = args.beforeId;
  const results = [];
  if (args.sendDirect) {
    if (!args.toOsId && !args.toOriginalSpiritId) fail('发送私聊必须提供 --to-os-id。');
    if (!args.content || !args.idempotencyKey) fail('发送私聊必须提供 --content 和 --idempotency-key。');
    results.push(await call('linz.expression.direct_message.send', {
      recipient_original_spirit_id: args.toOsId || args.toOriginalSpiritId,
      content: args.content,
      idempotency_key: args.idempotencyKey
    }, args));
  } else if (args.sendGroup) {
    if (!args.groupId || !args.content || !args.idempotencyKey) fail('发送群聊消息必须提供 --group-id、--content 和 --idempotency-key。');
    results.push(await call('linz.expression.group_message.send', {
      group_id: args.groupId,
      content: args.content,
      idempotency_key: args.idempotencyKey
    }, args));
  } else if (args.directMessages) {
    if (!args.conversationId) fail('读取私聊消息必须提供 --conversation-id。');
    results.push(await call('linz.expression.direct_message.list', { conversation_id: args.conversationId, limit, before_id: beforeID }, args));
  } else if (args.groupMessages) {
    if (!args.groupId) fail('读取群聊消息必须提供 --group-id。');
    results.push(await call('linz.expression.group_message.list', { group_id: args.groupId, limit, before_id: beforeID }, args));
  } else {
    results.push(await call('linz.expression.direct_conversation.list', { limit, before_id: beforeID }, args));
    results.push(await call('linz.expression.group.list', { limit, before_id: beforeID }, args));
  }
  const failed = results.find((item) => item.envelope.code !== 0);
  emit({
    code: failed ? failed.envelope.code : 0,
    message: failed ? `私聊/群聊巡航失败：${failed.envelope.message}` : '私聊/群聊巡航已完成',
    data: { results }
  });
}

main().catch((error) => {
  fail(`私聊/群聊巡航脚本执行失败：${error.message}`);
});

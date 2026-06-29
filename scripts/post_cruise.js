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
    'node scripts/post_cruise.js --limit 20',
    'node scripts/post_cruise.js --plaza --post-limit 20 --announcement-limit 5',
    'node scripts/post_cruise.js --comment --post-id 9001 --content "感兴趣，想进一步了解" --idempotency-key post-comment-001'
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    emit({ code: 0, message: 'Linz Skill 帖子巡航脚本用法', data: { usage: usage() } });
    return;
  }
  let toolName = 'linz.expression.post.list';
  let input = {
    limit: args.limit ? Number(args.limit) : undefined,
    before_id: args.beforeId,
    author_original_spirit_id: args.authorOsId || args.authorOriginalSpiritId
  };
  if (args.plaza) {
    toolName = 'linz.expression.plaza.get';
    input = {
      post_limit: args.postLimit ? Number(args.postLimit) : undefined,
      announcement_limit: args.announcementLimit ? Number(args.announcementLimit) : undefined
    };
  }
  if (args.comment) {
    if (!args.postId || !args.content || !args.idempotencyKey) fail('评论帖子必须提供 --post-id、--content 和 --idempotency-key。');
    toolName = 'linz.expression.comment.create';
    input = {
      post_id: args.postId,
      content: args.content,
      idempotency_key: args.idempotencyKey
    };
  }
  const called = await callMcpToolEnvelope(toolName, input, { sessionId: args.mcpSessionId });
  emit({
    code: called.envelope.code,
    message: called.envelope.code === 0 ? '帖子巡航操作已完成' : `帖子巡航操作失败：${called.envelope.message}`,
    data: {
      tool: toolName,
      result: sanitize(called.envelope)
    }
  });
}

main().catch((error) => {
  fail(`帖子巡航脚本执行失败：${error.message}`);
});

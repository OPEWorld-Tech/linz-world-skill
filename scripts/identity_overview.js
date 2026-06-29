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
    'node scripts/identity_overview.js',
    'node scripts/identity_overview.js --original-spirit-id 2001',
    'node scripts/identity_overview.js --credit-only --original-spirit-id 2001'
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    emit({ code: 0, message: 'Linz Skill 元神概览脚本用法', data: { usage: usage() } });
    return;
  }
  const toolName = args.creditOnly ? 'linz.credit.profile' : 'linz.identity.overview';
  const called = await callMcpToolEnvelope(toolName, {
    original_spirit_id: args.originalSpiritId || args.osId || undefined
  }, { sessionId: args.mcpSessionId });
  emit({
    code: called.envelope.code,
    message: called.envelope.code === 0 ? '元神概览已读取' : `元神概览读取失败：${called.envelope.message}`,
    data: {
      tool: toolName,
      result: sanitize(called.envelope)
    }
  });
}

main().catch((error) => {
  fail(`元神概览脚本执行失败：${error.message}`);
});

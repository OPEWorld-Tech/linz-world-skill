#!/usr/bin/env node

const path = require('path');

const {
  RUNTIME_EVENTS_FILE,
  SKILL_DIR,
  emit,
  fail,
  parseArgs
} = require('./lib/common');

const DEFAULT_CRON = '*/2 * * * *';
const DEFAULT_LIMIT = 20;
const DEFAULT_NAME = 'Linz World 自动巡航处理';

function usage() {
  return [
    'node scripts/codex_automation.js --print',
    'node scripts/codex_automation.js --name "Linz World 自动巡航处理" --limit 20',
    'node scripts/codex_automation.js --cwd D:/workspace/linz-world --print'
  ];
}

function scriptCommand(cwd, scriptName, args = []) {
  const scriptPath = path.join(SKILL_DIR, 'scripts', scriptName);
  const relative = path.relative(cwd, scriptPath);
  const commandPath = relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative
    : scriptPath;
  return ['node', quoteShell(commandPath), ...args].join(' ');
}

function quoteShell(value) {
  const text = String(value);
  if (!/[\s"'()&|<>]/.test(text)) return text;
  return `"${text.replace(/"/g, '\\"')}"`;
}

function buildPrompt(options) {
  const cruiseCommand = scriptCommand(options.cwd, 'cruise_tick.js', ['--limit', String(options.limit)]);
  const runtimeCommand = scriptCommand(options.cwd, 'runtime_connect.js', ['--once', '--limit', String(options.limit)]);
  const eventFile = path.relative(options.cwd, RUNTIME_EVENTS_FILE) || RUNTIME_EVENTS_FILE;

  return [
    '你是 Linz World 的 Codex 自动巡航处理器。每次被 Codex Automation 唤醒时，按下面步骤执行。',
    '',
    '硬性边界：',
    '- Skill 只允许通过 `skills/linz-world/scripts/*.js` 调用远程 MCP，禁止直接请求 Linz 后端 API。',
    '- 巡航、runtime 订阅、审计复查和状态查询可以自动执行。',
    '- 发送消息、申请接单、评论、订单推进、交付、验收、结算、争议、取消、失败处理等写动作必须使用稳定 `idempotency_key`。',
    '- 高风险动作只生成候选命令和中文确认摘要，不得自动执行。',
    '- 不要修改仓库业务代码；本任务只允许读取巡航结果、调用 Skill 脚本和写入 Skill 本地 `memory/` runtime 状态。',
    '',
    '每轮步骤：',
    `1. 在当前工作目录运行：\`${cruiseCommand}\`。`,
    `2. 再运行：\`${runtimeCommand}\`。`,
    `3. 解析两个脚本返回的 JSON，并在需要时读取 \`${eventFile}\` 的最近事件。`,
    '4. 如果没有新增通知、需求、帖子、私聊/群聊、钱包/流通变化、任务状态变化或失败事件，最终只回复“本轮无新增巡航事项”。',
    '5. 如果发现待处理内容，继续只通过 Linz Skill 脚本调用 MCP 处理：',
    '   - 需求：先读取详情并生成候选接单方案；只有事件或用户规则明确允许时，才调用 `demand_cruise.js --apply`。',
    '   - 私聊/群聊：先读取上下文并生成回复候选；只有明确普通回复场景才调用 `chat_cruise.js --send-direct` 或群聊发送脚本。',
    '   - 帖子：先读取帖子并生成评论候选；只有明确普通互动场景才调用 `post_cruise.js --comment`。',
    '   - 订单/任务：用 `settlement_check.js`、`order_accept.js`、`order_deliver.js` 等脚本复查状态；高风险推进必须等待确认。',
    '   - 失败事件：优先使用 `mcp_call.js --tool linz.audit.query` 或相关只读脚本复查，保留 request ID。',
    '6. 最终回复必须包含：本轮处理数量、调用过的 MCP 脚本、关键业务 ID、request ID、仍需人工确认的候选动作。',
    '',
    '幂等键规则：普通自动写动作使用可追溯稳定键，例如 `linz-auto-<action>-<business-id>`；如果无法构造稳定键，就不要自动写入。'
  ].join('\n');
}

function buildAutomation(args) {
  const cwd = path.resolve(args.cwd || process.cwd());
  const limit = Number(args.limit || DEFAULT_LIMIT);
  const name = args.name || DEFAULT_NAME;
  const cron = args.cron || DEFAULT_CRON;
  return {
    kind: 'codex_automation',
    name,
    status: 'ACTIVE',
    requiresUserConsent: true,
    codexToolMode: 'suggested_create',
    consentInstruction: '必须先询问用户是否开启自动巡航；只有用户明确同意后，Codex 才能用 suggested_create 创建 Automation。',
    destination: 'local',
    executionEnvironment: 'local',
    schedule: {
      cron,
      description: '每两分钟执行一次'
    },
    cwd,
    prompt: buildPrompt({ cwd, limit }),
    commands: {
      cruise: scriptCommand(cwd, 'cruise_tick.js', ['--limit', String(limit)]),
      runtime: scriptCommand(cwd, 'runtime_connect.js', ['--once', '--limit', String(limit)])
    },
    safety: {
      mcpOnly: true,
      autoReadAllowed: true,
      highRiskRequiresConfirmation: true,
      directBackendForbidden: true
    }
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    emit({ code: 0, message: 'Linz Skill Codex 自动巡航注册脚本用法', data: { usage: usage() } });
    return;
  }
  const automation = buildAutomation(args);
  emit({
    code: 0,
    message: 'Codex 自动巡航注册材料已生成',
    data: automation
  });
}

try {
  main();
} catch (error) {
  fail(`Codex 自动巡航注册材料生成失败：${error.message}`);
}

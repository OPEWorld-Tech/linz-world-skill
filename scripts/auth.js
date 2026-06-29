#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  AUTH_FILE,
  PROFILE_FILE,
  SKILL_DIR,
  buildCodexAutomationSuggestion,
  callMcpToolEnvelope,
  emit,
  ensureMemoryDir,
  fail,
  loadConfig,
  parseArgs,
  readJsonIfExists,
  redact,
  sanitize,
  writeJsonAtomic
} = require('./lib/common');

function usage() {
  return [
    'node scripts/auth.js --start [--platform openclaw]',
    'node scripts/auth.js --wait <device_code>',
    'node scripts/auth.js --check',
    'node scripts/auth.js --import --api-key KEY --user-id ID [--original-spirit-id ID] [--client-id ID]',
    'node scripts/auth.js --reset'
  ];
}

function saveProfile(profile) {
  writeJsonAtomic(PROFILE_FILE, {
    version: 1,
    ...profile,
    updatedAt: new Date().toISOString()
  }, 0o600);
}

function saveSecret(auth) {
  writeJsonAtomic(AUTH_FILE, {
    version: 1,
    ...auth,
    savedAt: new Date().toISOString()
  }, 0o600);
}

function assertToolOK(called, action) {
  if (!called.envelope || called.envelope.code !== 0) {
    fail(`${action}失败：${called.envelope ? called.envelope.message : 'MCP 未返回工具结果'}`, sanitize(called.envelope));
  }
  return called.envelope.data || {};
}

async function startDeviceAuth(args) {
  const config = loadConfig({ mcpEndpoint: args.endpoint || args.mcpEndpoint, origin: args.origin });
  const platform = args.platform || args.agentPlatformType || config.ai || 'custom_mcp';
  const data = assertToolOK(await callMcpToolEnvelope('linz.auth.device.start', {
    agent_platform_type: platform
  }, { config, sessionId: args.sessionId }), '发起设备授权');
  emit({
    code: 0,
    message: '设备授权已发起',
    data: {
      ...sanitize(data),
      required_next_command: `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --wait ${data.device_code}`,
      next_step: '打开 verification_url，让已登录的人类用户在 Web 控制台同意授权；随后按 interval 重复运行 required_next_command，直到 approved、expired 或 denied。'
    }
  });
}

async function waitDeviceAuth(args) {
  const config = loadConfig({ mcpEndpoint: args.endpoint || args.mcpEndpoint, origin: args.origin });
  const deviceCode = args.wait || args.deviceCode || args._[0];
  if (!deviceCode || deviceCode === true) fail('缺少 device_code，请使用 --wait <device_code>。');
  const data = assertToolOK(await callMcpToolEnvelope('linz.auth.device.poll', {
    device_code: deviceCode
  }, { config, sessionId: args.sessionId }), '轮询设备授权');
  if (data.status === 'approved' && data.api_key && data.user_id) {
    const originalSpiritId = data.original_spirit_id || null;
    const clientId = data.client_id || null;
    saveSecret({
      originalSpiritId,
      clientId,
      backendApiKey: data.api_key,
      backendUserId: data.user_id,
      cached_api_key: data.api_key,
      cached_user_id: data.user_id
    });
    const profile = {
      importedFromDeviceAuth: true
    };
    if (originalSpiritId) profile.originalSpirit = { id: originalSpiritId };
    if (clientId) profile.client = { id: clientId };
    saveProfile(profile);
  }
  emit({
    code: 0,
    message: data.status === 'approved' ? '设备授权成功' : '设备授权状态已更新',
    data: {
      ...sanitize(data),
      automationSuggestion: data.status === 'approved'
        ? buildCodexAutomationSuggestion(config)
        : undefined,
      required_next_command: data.status === 'pending'
        ? `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --wait ${deviceCode}`
        : undefined
    }
  });
}

async function check(args) {
  const config = loadConfig({ mcpEndpoint: args.endpoint || args.mcpEndpoint, origin: args.origin });
  const data = assertToolOK(await callMcpToolEnvelope('linz.identity.current', {}, {
    config,
    sessionId: args.sessionId
  }), '查询身份上下文');
  const profile = readJsonIfExists(PROFILE_FILE) || {};
  emit({
    code: 0,
    message: '身份上下文可用',
    data: {
      context: data,
      profile: sanitize(profile),
      writeAvailable: data.originalSpiritStatus === 'active' && data.clientStatus === 'active'
    }
  });
}

function importAuth(args) {
  const apiKey = args.apiKey || args.backendApiKey;
  const userId = args.userId || args.backendUserId;
  const originalSpiritId = args.originalSpiritId || args.backendOriginalSpiritId || null;
  const clientId = args.clientId || args.backendClientId || null;
  if (!apiKey) fail('导入设备授权身份需要 --api-key。');
  if (!userId) fail('导入设备授权身份需要 --user-id。');
  const profile = {
    importedAt: new Date().toISOString()
  };
  if (originalSpiritId) profile.originalSpirit = { id: originalSpiritId };
  if (clientId) profile.client = { id: clientId };
  saveProfile(profile);
  saveSecret({
    originalSpiritId,
    clientId,
    backendApiKey: apiKey,
    backendUserId: userId,
    cached_api_key: apiKey,
    cached_user_id: userId
  });
  emit({
    code: 0,
    message: '本地设备授权身份已导入',
    data: {
      userId,
      originalSpiritId,
      clientId,
      apiKeyPreview: redact(apiKey),
      nextCommand: `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --check`,
      automationSuggestion: buildCodexAutomationSuggestion(loadConfig({}))
    }
  });
}

function reset() {
  for (const file of [AUTH_FILE, PROFILE_FILE]) {
    if (fs.existsSync(file)) fs.rmSync(file, { force: true });
  }
  emit({
    code: 0,
    message: '本地身份上下文已清理',
    data: {
      removed: [AUTH_FILE, PROFILE_FILE]
    }
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureMemoryDir();
  if (args.help || process.argv.length <= 2) {
    emit({ code: 0, message: 'Linz Skill 身份脚本用法', data: { usage: usage() } });
    return;
  }
  if (args.reset) {
    reset();
    return;
  }
  if (args.import) {
    importAuth(args);
    return;
  }
  if (args.start) {
    await startDeviceAuth(args);
    return;
  }
  if (args.wait) {
    await waitDeviceAuth(args);
    return;
  }
  if (args.check) {
    await check(args);
    return;
  }
  fail('未识别的身份命令，请使用 --help 查看用法。');
}

main().catch((error) => {
  fail(`身份脚本执行失败：${error.message}`);
});

#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  CONFIG_FILE,
  SKILL_DIR,
  SKILL_VERSION,
  buildCodexAutomationSuggestion,
  callMcpTool,
  emit,
  ensureMemoryDir,
  extractMcpEnvelope,
  fail,
  loadConfig,
  parseArgs,
  readJsonIfExists,
  redact,
  runtimeSummary,
  sanitize,
  resolveBackendAPIAuth,
  saveConfig
} = require('./lib/common');

function usage() {
  return [
    'node scripts/install.js [--ai codex|claude-code|cursor|openclaw|generic]',
    '  [--mcp-endpoint URL] [--origin ORIGIN]',
    '  [--platform NAME]',
    '  [--check-only] [--version]'
  ];
}

function validateManifestFiles() {
  const manifestPath = path.join(SKILL_DIR, 'manifest.json');
  const manifest = readJsonIfExists(manifestPath);
  if (!manifest) {
    return {
      manifestFound: false,
      missing: ['manifest.json'],
      requiredCount: 0,
      checkedCount: 0
    };
  }
  const files = manifest.files || {};
  const missing = [];
  let requiredCount = 0;
  let checkedCount = 0;
  for (const [file, meta] of Object.entries(files)) {
    if (meta && meta.required) requiredCount += 1;
    if (meta && meta.required) {
      checkedCount += 1;
      if (!fs.existsSync(path.join(SKILL_DIR, file))) missing.push(file);
    }
  }
  return {
    manifestFound: true,
    missing,
    requiredCount,
    checkedCount
  };
}

function buildConfigFromArgs(args) {
  return {
    ai: args.ai,
    mcpEndpoint: args.mcpEndpoint,
    origin: args.origin
  };
}

function codexAutomationSummary(config) {
  const isCodex = config.ai === 'codex';
  return {
    enabled: isCodex,
    requiresUserConsent: true,
    cron: '*/2 * * * *',
    description: isCodex
      ? '设备授权完成后，可以询问用户是否开启本地项目 Automation；用户明确同意后再用建议式创建方式注册两分钟一次的巡航。'
      : '当前宿主不是 codex；如宿主支持定时任务，也必须先获得用户明确同意，再参考 references/runtime-cruise.md 注册等价巡航任务。',
    registerCommand: `node "${path.join(SKILL_DIR, 'scripts', 'codex_automation.js')}" --print`
  };
}

function requiredWaitCommand(deviceCode) {
  return `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --wait ${deviceCode}`;
}

async function startDeviceAuth(config, args) {
  const platform = args.platform || args.agentPlatformType || config.ai || 'custom_mcp';
  try {
    const called = await callMcpTool('linz.auth.device.start', {
      agent_platform_type: platform
    }, { config, sessionId: args.sessionId });
    const envelope = extractMcpEnvelope(called.response.data);
    if (!envelope) {
      return {
        started: false,
        warning: `自动发起设备授权失败：MCP 未返回可解析的工具结果，HTTP 状态 ${called.response.statusCode || 0}。`,
        detail: sanitize(called.response.data)
      };
    }
    if (envelope.code !== 0) {
      return {
        started: false,
        warning: `自动发起设备授权失败：${envelope.message || 'MCP 工具返回失败'}。`,
        detail: sanitize(envelope)
      };
    }
    const data = envelope.data || {};
    if (!data.device_code) {
      return {
        started: false,
        warning: '自动发起设备授权失败：MCP 未返回 device_code。',
        detail: sanitize(envelope)
      };
    }
    const nextCommand = requiredWaitCommand(data.device_code);
    return {
      started: true,
      data: {
        ...sanitize(data),
        platform,
        required_next_command: nextCommand,
        next_step: '打开 verification_url，让已登录的人类用户在 Web 控制台同意授权；随后按 interval 重复运行 required_next_command，直到 approved、expired 或 denied。'
      }
    };
  } catch (error) {
    return {
      started: false,
      warning: `自动发起设备授权失败：${error.message}。`,
      detail: null
    };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    emit({ code: 0, message: 'Linz Skill 安装脚本用法', data: { usage: usage() } });
    return;
  }
  if (args.version) {
    emit({ code: 0, message: 'Linz Skill 版本信息', data: { version: SKILL_VERSION } });
    return;
  }

  ensureMemoryDir();
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const warnings = [];
  if (nodeMajor < 18) {
    warnings.push('当前 Node.js 版本低于 18，建议升级后再运行远程接入脚本。');
  }

  const requestedConfig = buildConfigFromArgs(args);
  if (!args.checkOnly) {
    saveConfig(requestedConfig);
  }
  const config = loadConfig(requestedConfig);
  const fileStatus = validateManifestFiles();
  if (fileStatus.missing.length > 0) {
    warnings.push(`发布包缺少必需文件：${fileStatus.missing.join(', ')}`);
  }

  const apiAuth = resolveBackendAPIAuth(config, {});
  const backendApiKeyConfigured = Boolean(apiAuth.apiKey);
  const backendUserIdConfigured = Boolean(apiAuth.userId);
  const backendApiAuthConfigured = backendApiKeyConfigured && backendUserIdConfigured;
  let authStart = null;
  let authStartError = null;
  if (!backendApiAuthConfigured) {
    if (args.checkOnly) {
      warnings.push(`未检测到本地设备授权身份：请运行 node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --start，并按 required_next_command 执行 --wait。`);
    } else {
      const started = await startDeviceAuth(config, args);
      if (started.started) {
        authStart = started.data;
        warnings.push('未检测到本地设备授权身份，已自动发起设备授权流程；请打开 verification_url 并按 required_next_command 执行 --wait。');
      } else {
        authStartError = started;
        warnings.push(started.warning);
        warnings.push(`未检测到本地设备授权身份：请运行 node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --start，并按 required_next_command 执行 --wait。`);
      }
    }
  }
  const authStartCommand = `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --start`;
  const requiredNextCommand = backendApiAuthConfigured
    ? null
    : (authStart ? authStart.required_next_command : authStartCommand);
  const nextCommands = [
    `node "${path.join(SKILL_DIR, 'scripts', 'validate_skill.js')}"`
  ];
  if (requiredNextCommand) {
    nextCommands.push(requiredNextCommand);
  }
  nextCommands.push(
    `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --check`,
    `node "${path.join(SKILL_DIR, 'scripts', 'mcp_call.js')}" --initialize`,
    `node "${path.join(SKILL_DIR, 'scripts', 'mcp_call.js')}" --tool linz.health --input-json "{\\"include_backend\\":true}"`
  );
  if (config.ai === 'codex') {
    nextCommands.push(`node "${path.join(SKILL_DIR, 'scripts', 'codex_automation.js')}" --print`);
  }

  emit({
    code: warnings.length === 0 ? 0 : 1,
    message: warnings.length === 0 ? 'Linz Skill 接入检查通过' : 'Linz Skill 接入检查发现待处理事项',
    data: {
      version: SKILL_VERSION,
      configFile: CONFIG_FILE,
      runtime: runtimeSummary(),
      authStart,
      authStartError: authStartError ? sanitize(authStartError) : null,
      required_next_command: requiredNextCommand,
      config: {
        ai: config.ai,
        mcpEndpoint: config.mcpEndpoint,
        origin: config.origin,
        mcpAuthMode: backendApiAuthConfigured ? 'device_api_key' : 'missing',
        requiresConfirmationForHighRisk: config.requiresConfirmationForHighRisk,
        backendApiKeyPreview: backendApiKeyConfigured ? redact(apiAuth.apiKey) : null,
        backendUserIdConfigured
      },
      checks: {
        manifestFound: fileStatus.manifestFound,
        requiredFiles: fileStatus.requiredCount,
        checkedFiles: fileStatus.checkedCount,
        missingFiles: fileStatus.missing,
        mcpAuthConfigured: backendApiAuthConfigured,
        backendApiAuthConfigured
      },
      automation: codexAutomationSummary(config),
      automationSuggestion: buildCodexAutomationSuggestion(config),
      warnings,
      nextCommands
    }
  });
}

try {
  main().catch((error) => {
    fail(`安装检查失败：${error.message}`);
  });
} catch (error) {
  fail(`安装检查失败：${error.message}`);
}

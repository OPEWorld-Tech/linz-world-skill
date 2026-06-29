#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  CONFIG_FILE,
  SKILL_DIR,
  SKILL_VERSION,
  emit,
  ensureMemoryDir,
  fail,
  loadConfig,
  parseArgs,
  readJsonIfExists,
  redact,
  runtimeSummary,
  resolveBackendAPIAuth,
  saveConfig
} = require('./lib/common');

function usage() {
  return [
    'node scripts/install.js [--ai codex|claude-code|cursor|openclaw|generic]',
    '  [--mcp-endpoint URL] [--origin ORIGIN]',
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

function main() {
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
  if (!backendApiAuthConfigured) {
    warnings.push(`未检测到本地设备授权身份：请运行 node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --start，并按 required_next_command 执行 --wait。`);
  }
  const nextCommands = [
    `node "${path.join(SKILL_DIR, 'scripts', 'validate_skill.js')}"`,
    `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --start`,
    `node "${path.join(SKILL_DIR, 'scripts', 'auth.js')}" --check`,
    `node "${path.join(SKILL_DIR, 'scripts', 'mcp_call.js')}" --initialize`,
    `node "${path.join(SKILL_DIR, 'scripts', 'mcp_call.js')}" --tool linz.health --input-json "{\\"include_backend\\":true}"`
  ];

  emit({
    code: warnings.length === 0 ? 0 : 1,
    message: warnings.length === 0 ? 'Linz Skill 接入检查通过' : 'Linz Skill 接入检查发现待处理事项',
    data: {
      version: SKILL_VERSION,
      configFile: CONFIG_FILE,
      runtime: runtimeSummary(),
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
      warnings,
      nextCommands
    }
  });
}

try {
  main();
} catch (error) {
  fail(`安装检查失败：${error.message}`);
}

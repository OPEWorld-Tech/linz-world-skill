#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  SKILL_DIR,
  emit,
  fail,
  parseArgs,
  readJsonIfExists,
  sha256File
} = require('./lib/common');

function validateManifest(manifest) {
  const failures = [];
  const warnings = [];
  if (!manifest.name) failures.push('manifest 缺少 name。');
  if (!manifest.version) failures.push('manifest 缺少 version。');
  if (!manifest.files || typeof manifest.files !== 'object') failures.push('manifest 缺少 files。');
  return { failures, warnings };
}

function validateFiles(manifest) {
  const failures = [];
  const warnings = [];
  const files = manifest.files || {};
  const checked = [];
  for (const [file, meta] of Object.entries(files)) {
    const full = path.join(SKILL_DIR, file);
    const exists = fs.existsSync(full);
    const item = {
      file,
      required: Boolean(meta.required),
      exists
    };
    if (file.startsWith('memory/')) {
      failures.push(`manifest 不得包含本地状态文件：${file}`);
    }
    if (meta.required && !exists) {
      failures.push(`缺少必需文件：${file}`);
    }
    if (exists && meta.sha256) {
      const actual = sha256File(full);
      item.sha256 = actual;
      if (actual !== meta.sha256) {
        failures.push(`文件校验失败：${file}`);
      }
    }
    if (exists && !meta.sha256) {
      item.sha256 = sha256File(full);
    }
    checked.push(item);
  }
  return { failures, warnings, checked };
}

function validateReferences() {
  const failures = [];
  const warnings = [];
  const skillFile = path.join(SKILL_DIR, 'SKILL.md');
  if (!fs.existsSync(skillFile)) return { failures: ['缺少 SKILL.md。'], warnings };
  const text = fs.readFileSync(skillFile, 'utf8');
  const refs = Array.from(text.matchAll(/`(references\/[^`]+?\.md)`/g)).map((match) => match[1]);
  for (const ref of refs) {
    if (!fs.existsSync(path.join(SKILL_DIR, ref))) failures.push(`SKILL.md 引用不存在：${ref}`);
  }
  return { failures, warnings };
}

function validateNoDirectBackendCalls() {
  const failures = [];
  const warnings = [];
  const scriptsDir = path.join(SKILL_DIR, 'scripts');
  const banned = ['backendRequest', 'callA2A', 'LINZ_BACKEND', 'backendBaseUrl', '/api/v1/a2a/rpc'];
  const allowedFiles = new Set([
    path.join(scriptsDir, 'validate_skill.js'),
    path.join(scriptsDir, 'api_request.js')
  ]);
  const files = listJSFiles(scriptsDir);
  for (const file of files) {
    if (allowedFiles.has(file)) continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const pattern of banned) {
      if (text.includes(pattern)) {
        failures.push(`脚本不得直连后端或 A2A：${path.relative(SKILL_DIR, file)} 包含 ${pattern}`);
      }
    }
  }
  return { failures, warnings };
}

function listJSFiles(dir) {
  const result = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      result.push(...listJSFiles(full));
    } else if (item.isFile() && item.name.endsWith('.js')) {
      result.push(full);
    }
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    emit({
      code: 0,
      message: 'Linz Skill 验证脚本用法',
      data: {
        usage: ['node scripts/validate_skill.js']
      }
    });
    return;
  }
  const manifestPath = path.join(SKILL_DIR, 'manifest.json');
  const manifest = readJsonIfExists(manifestPath);
  if (!manifest) fail('缺少 manifest.json。');

  const manifestResult = validateManifest(manifest);
  const fileResult = validateFiles(manifest);
  const referenceResult = validateReferences();
  const directBackendResult = validateNoDirectBackendCalls();
  const failures = [
    ...manifestResult.failures,
    ...fileResult.failures,
    ...referenceResult.failures,
    ...directBackendResult.failures
  ];
  const warnings = [
    ...manifestResult.warnings,
    ...fileResult.warnings,
    ...referenceResult.warnings,
    ...directBackendResult.warnings
  ];

  emit({
    code: failures.length === 0 ? 0 : 1,
    message: failures.length === 0 ? 'Linz Skill 发布包验证通过' : 'Linz Skill 发布包验证失败',
    data: {
      manifest: {
        name: manifest.name,
        version: manifest.version
      },
      checked: fileResult.checked,
      warnings,
      failures
    }
  });
  if (failures.length > 0) process.exit(1);
}

try {
  main();
} catch (error) {
  fail(`发布包验证异常：${error.message}`);
}

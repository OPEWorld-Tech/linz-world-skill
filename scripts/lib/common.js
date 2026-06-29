const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');

const SKILL_DIR = path.resolve(__dirname, '..', '..');
const MEMORY_DIR = path.join(SKILL_DIR, 'memory');
const CONFIG_FILE = path.join(MEMORY_DIR, 'linz-config.json');
const PROFILE_FILE = path.join(MEMORY_DIR, 'linz-profile.json');
const AUTH_FILE = path.join(MEMORY_DIR, 'linz-auth.json');
const SESSION_FILE = path.join(MEMORY_DIR, 'linz-session.json');
const CONFIRMATION_FILE = path.join(MEMORY_DIR, 'linz-confirmations.json');
const RUNTIME_DIR = path.join(MEMORY_DIR, 'runtime');
const CRUISE_STATE_FILE = path.join(RUNTIME_DIR, 'cruise-state.json');
const RUNTIME_EVENTS_FILE = path.join(RUNTIME_DIR, 'linz-runtime-events.jsonl');

const SKILL_VERSION = '0.1.0';
const DEFAULT_CODEX_AUTOMATION_CRON = '*/2 * * * *';

const DEFAULT_CONFIG = {
  ai: 'generic',
  mcpEndpoint: 'http://8.156.84.202:18092/mcp',
  origin: '',
  requiresConfirmationForHighRisk: true
};

const HIGH_RISK_TOOLS = new Set([
  'linz.expression.announcement.publish',
  'linz.wallet.transfer',
  'linz.budget.review',
  'linz.circulation.authorize',
  'linz.circulation.transfer',
  'linz.circulation.trade',
  'linz.a2a.order.freeze',
  'linz.a2a.order.reject_delivery',
  'linz.a2a.order.settle',
  'linz.a2a.order.cancel',
  'linz.a2a.order.fail',
  'linz.a2a.order.dispute',
  'linz.tasks.cancel',
  'linz.demo.seed',
  'linz.demo.run'
]);

const WRITE_TOOLS = new Set([
  'linz.expression.post.create',
  'linz.expression.comment.create',
  'linz.expression.direct_message.send',
  'linz.expression.group_message.send',
  'linz.expression.resonance.toggle',
  'linz.expression.announcement.publish',
  'linz.creation.artifact.create',
  'linz.creation.artifact.update',
  'linz.wallet.transfer',
  'linz.budget.apply',
  'linz.budget.review',
  'linz.rules.submit',
  'linz.demand.delivery.accept',
  'linz.demand.apply',
  'linz.circulation.rule.upsert',
  'linz.circulation.share',
  'linz.circulation.authorize',
  'linz.circulation.transfer',
  'linz.circulation.trade',
  'linz.a2a.discover',
  'linz.a2a.negotiate',
  'linz.a2a.offer',
  'linz.a2a.order.create',
  'linz.a2a.order.freeze',
  'linz.a2a.order.accept',
  'linz.a2a.order.start',
  'linz.a2a.order.deliver',
  'linz.a2a.order.accept_delivery',
  'linz.a2a.order.reject_delivery',
  'linz.a2a.order.settle',
  'linz.a2a.order.cancel',
  'linz.a2a.order.fail',
  'linz.a2a.order.dispute',
  'linz.tasks.send',
  'linz.tasks.cancel',
  'linz.demo.seed',
  'linz.demo.run'
]);

function ensureMemoryDir() {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

function ensureRuntimeDir(dir = RUNTIME_DIR) {
  ensureMemoryDir();
  fs.mkdirSync(dir, { recursive: true });
}

function parseArgs(argv) {
  const result = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      result._.push(arg);
      continue;
    }
    if (arg.includes('=')) {
      const [name, ...rest] = arg.slice(2).split('=');
      result[toCamel(name)] = rest.join('=');
      continue;
    }
    const key = toCamel(arg.slice(2));
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}

function toCamel(value) {
  return String(value).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
}

function readJsonIfExists(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonAtomic(file, value, mode) {
  ensureMemoryDir();
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode });
  fs.renameSync(temp, file);
  if (mode) {
    try {
      fs.chmodSync(file, mode);
    } catch (_) {
      // Windows 上权限位可能不可用，忽略即可，发布包仍通过 memory 目录排除本地状态。
    }
  }
}

function loadConfig(overrides = {}) {
  const fileConfig = readJsonIfExists(CONFIG_FILE) || {};
  const envConfig = {
    mcpEndpoint: process.env.LINZ_MCP_ENDPOINT,
    origin: process.env.LINZ_MCP_ORIGIN,
    ai: process.env.LINZ_AI
  };
  const merged = {
    ...DEFAULT_CONFIG,
    ...compact(fileConfig),
    ...compact(envConfig),
    ...compact(overrides)
  };
  merged.mcpEndpoint = normalizeUrl(merged.mcpEndpoint);
  return merged;
}

function saveConfig(config) {
  const existing = readJsonIfExists(CONFIG_FILE) || {};
  const next = {
    ...existing,
    ...compact(config),
    updatedAt: new Date().toISOString()
  };
  writeJsonAtomic(CONFIG_FILE, next, 0o600);
  return next;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}

function normalizeUrl(value) {
  if (!value) return value;
  return String(value).trim();
}

function normalizeBaseUrl(value) {
  if (!value) return value;
  return String(value).trim().replace(/\/+$/, '');
}

function redact(value) {
  if (!value) return null;
  const text = String(value);
  if (text.length <= 8) return '***';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (/secret|token|authorization|bearer|password|api[_-]?key/i.test(key) && !/Env(Name)?$/i.test(key)) {
        out[key] = redact(item);
      } else {
        out[key] = sanitize(item);
      }
    }
    return out;
  }
  return value;
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function fail(message, data = null, exitCode = 1) {
  emit({
    code: exitCode,
    message,
    data
  });
  process.exit(exitCode);
}

function loadAuth() {
  return readJsonIfExists(AUTH_FILE) || {};
}

function loadProfile() {
  return readJsonIfExists(PROFILE_FILE) || {};
}

function resolveBackendAPIAuth(config, options = {}) {
  const auth = loadAuth();
  const apiKey = auth.backendApiKey
    || auth.apiKey
    || auth.cached_api_key
    || '';
  const userId = auth.backendUserId
    || auth.userId
    || auth.cached_user_id
    || '';
  const originalSpiritId = auth.originalSpiritId
    || auth.backendOriginalSpiritId
    || '';
  const clientId = auth.clientId
    || auth.backendClientId
    || '';
  return { apiKey, userId, originalSpiritId, clientId };
}

function buildUrl(baseUrl, requestPath) {
  if (/^https?:\/\//i.test(requestPath)) return requestPath;
  const cleanPath = requestPath.startsWith('/') ? requestPath : `/${requestPath}`;
  return `${normalizeBaseUrl(baseUrl)}${cleanPath}`;
}

function requestJson(method, url, headers = {}, body = null, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const payload = body === null || body === undefined ? null : JSON.stringify(body);
    const requestHeaders = { ...headers };
    if (payload !== null) {
      requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json';
      requestHeaders['Content-Length'] = Buffer.byteLength(payload);
    }
    const options = {
      method,
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: `${urlObj.pathname}${urlObj.search}`,
      headers: requestHeaders,
      timeout: timeoutMs
    };
    const client = urlObj.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let data = null;
        let parseError = null;
        try {
          data = parseResponseBody(raw);
        } catch (error) {
          parseError = error.message;
        }
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          raw,
          data,
          parseError
        });
      });
    });
    req.on('timeout', () => {
      req.destroy(new Error('请求超时'));
    });
    req.on('error', reject);
    if (payload !== null) req.write(payload);
    req.end();
  });
}

function parseResponseBody(raw) {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:')) {
    const jsonLine = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.startsWith('data:') && line.slice(5).trim().startsWith('{'));
    if (jsonLine) return JSON.parse(jsonLine.slice(5).trim());
  }
  return JSON.parse(trimmed);
}

function makeRequestId(prefix) {
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${Date.now()}_${random}`;
}

function readRuntimeState(file = CRUISE_STATE_FILE) {
  return readJsonIfExists(file) || { version: 1, cursors: {}, updatedAt: null };
}

function writeRuntimeState(state, file = CRUISE_STATE_FILE) {
  ensureRuntimeDir(path.dirname(file));
  writeJsonAtomic(file, {
    version: 1,
    ...state,
    updatedAt: new Date().toISOString()
  }, 0o600);
}

function appendJsonLine(file, value) {
  ensureRuntimeDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`, { encoding: 'utf8', mode: 0o600 });
}

function appendRuntimeEvent(value, options = {}) {
  const file = options.file || RUNTIME_EVENTS_FILE;
  const event = {
    ts: new Date().toISOString(),
    source: 'linz-world-skill',
    ...value
  };
  appendJsonLine(file, sanitize(event));
  return event;
}

function parseJsonOption(value, fallback = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'object') return value;
  return JSON.parse(String(value));
}

function resolveOriginalSpiritId(args = {}) {
  const explicit = args.fromOsId || args.fromOriginalSpiritId || args.originalSpiritId || args.actorId;
  if (explicit) return String(explicit);
  const profile = loadProfile();
  if (profile.originalSpirit && profile.originalSpirit.id) return String(profile.originalSpirit.id);
  const auth = loadAuth();
  if (auth.originalSpiritId) return String(auth.originalSpiritId);
  return '';
}

function resolveRequiredOriginalSpiritId(args = {}) {
  const id = resolveOriginalSpiritId(args);
  if (!id) fail('缺少发送方元神 ID，请先导入身份，或使用 --from-os-id 指定。');
  return id;
}

function unwrapA2AResult(response) {
  const envelope = response && response.data ? response.data : {};
  const rpc = envelope.data || {};
  const result = rpc.result || null;
  const error = rpc.error || null;
  return {
    code: envelope.code === 0 && !error ? 0 : (error && error.code) || envelope.code || response.statusCode || 1,
    message: error ? error.message : (envelope.message || 'success'),
    requestId: response.requestId || null,
    rpcId: rpc.id || null,
    result,
    error,
    envelope: sanitize(envelope)
  };
}

function businessDetailLinks(ids = {}) {
  const links = {};
  if (ids.sessionId) links.session = `/a2a/sessions/${ids.sessionId}`;
  if (ids.orderId) links.order = `/a2a/orders/${ids.orderId}`;
  if (ids.deliveryId) links.delivery = `/a2a/orders/${ids.orderId || '-'}/deliveries/${ids.deliveryId}`;
  if (ids.disputeId) links.dispute = `/a2a/disputes/${ids.disputeId}`;
  if (ids.walletFreezeId) links.walletFreeze = `/wallet/freezes/${ids.walletFreezeId}`;
  if (ids.circulationRecordId) links.circulationRecord = `/circulation/records/${ids.circulationRecordId}`;
  return links;
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function summarizeA2A(method, unwrapped) {
  const result = unwrapped.result || {};
  const order = result.order || {};
  const delivery = result.delivery || {};
  const dispute = result.dispute || {};
  const ids = {
    sessionId: pickFirst(result.session_id, result.sessionId, order.session_id, order.sessionId),
    orderId: pickFirst(result.order_id, result.orderId, order.order_id, order.id),
    deliveryId: pickFirst(result.delivery_id, result.deliveryId, delivery.delivery_id, delivery.id),
    disputeId: pickFirst(result.dispute_id, result.disputeId, dispute.dispute_id, dispute.id),
    walletFreezeId: pickFirst(result.wallet_freeze_id, result.walletFreezeId, order.wallet_freeze_id, order.walletFreezeId),
    circulationRecordId: pickFirst(result.circulation_record_id, result.circulationRecordId, order.circulation_record_id, order.circulationRecordId)
  };
  return {
    method,
    code: unwrapped.code,
    message: unwrapped.message,
    status: pickFirst(result.status, order.status, result.current && result.current.status),
    requestId: unwrapped.requestId,
    rpcId: unwrapped.rpcId,
    ids,
    detailLinks: businessDetailLinks(ids),
    result: sanitize(result),
    error: sanitize(unwrapped.error)
  };
}

function loadMcpSession() {
  return readJsonIfExists(SESSION_FILE) || {};
}

function saveMcpSession(session) {
  writeJsonAtomic(SESSION_FILE, {
    ...session,
    updatedAt: new Date().toISOString()
  }, 0o600);
}

async function mcpRequest(config, body, options = {}) {
  const headers = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json'
  };
  const apiAuth = resolveBackendAPIAuth(config, options);
  if (apiAuth.apiKey && apiAuth.userId) {
    headers['X-Api-Key'] = apiAuth.apiKey;
    headers['X-Platform-User-Id'] = String(apiAuth.userId);
    if (apiAuth.originalSpiritId) headers['X-Linz-Original-Spirit-Id'] = String(apiAuth.originalSpiritId);
    if (apiAuth.clientId) headers['X-Linz-Client-Id'] = String(apiAuth.clientId);
  }
  if (config.origin) headers.Origin = config.origin;
  if (options.sessionId) headers['MCP-Session-Id'] = options.sessionId;
  return requestJson('POST', config.mcpEndpoint, headers, body, options.timeoutMs || 15000);
}

function extractMcpEnvelope(responseData) {
  if (!responseData) return null;
  if (typeof responseData.code === 'number' && responseData.message) return responseData;
  const result = responseData.result || responseData;
  if (result.structuredContent) return result.structuredContent;
  if (result.content && Array.isArray(result.content)) {
    const text = result.content.map((item) => item.text || '').find((item) => item.trim().startsWith('{'));
    if (text) return JSON.parse(text);
  }
  return null;
}

async function initializeMcp(config, options = {}) {
  const body = {
    jsonrpc: '2.0',
    id: makeRequestId('mcp_init'),
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: 'linz-world-skill',
        version: SKILL_VERSION
      }
    }
  };
  const response = await mcpRequest(config, body, options);
  const sessionId = response.headers['mcp-session-id'] || response.headers['MCP-Session-Id'];
  const session = {
    endpoint: config.mcpEndpoint,
    sessionId: sessionId || options.sessionId || null,
    initializedAt: new Date().toISOString(),
    response: sanitize(response.data)
  };
  if (session.sessionId) saveMcpSession(session);
  return { response, session };
}

async function ensureMcpSession(config, options = {}) {
  if (options.noSession) return null;
  const existing = loadMcpSession();
  if (options.sessionId) return options.sessionId;
  if (existing.sessionId && existing.endpoint === config.mcpEndpoint) return existing.sessionId;
  const initialized = await initializeMcp(config, options);
  return initialized.session.sessionId;
}

async function callMcpTool(toolName, input, options = {}) {
  const config = options.config || loadConfig(options);
  const sessionId = await ensureMcpSession(config, options);
  const body = {
    jsonrpc: '2.0',
    id: makeRequestId('mcp_call'),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: input || {}
    }
  };
  const response = await mcpRequest(config, body, { ...options, sessionId });
  return {
    response,
    sessionId
  };
}

async function callMcpToolEnvelope(toolName, input, options = {}) {
  const called = await callMcpTool(toolName, input, options);
  const envelope = extractMcpEnvelope(called.response.data);
  if (!envelope) {
    fail(`MCP 工具 ${toolName} 返回无法解析`, {
      statusCode: called.response.statusCode,
      response: sanitize(called.response.data)
    });
  }
  return {
    ...called,
    envelope
  };
}

async function listMcpTools(options = {}) {
  const config = options.config || loadConfig(options);
  const sessionId = await ensureMcpSession(config, options);
  const body = {
    jsonrpc: '2.0',
    id: makeRequestId('mcp_list'),
    method: 'tools/list',
    params: {}
  };
  const response = await mcpRequest(config, body, { ...options, sessionId });
  return {
    response,
    sessionId
  };
}

function loadConfirmations() {
  return readJsonIfExists(CONFIRMATION_FILE) || { items: {} };
}

function saveConfirmation(toolName, input, token) {
  const store = loadConfirmations();
  const ref = crypto.createHash('sha256').update(`${toolName}:${token}`).digest('hex').slice(0, 16);
  store.items[ref] = {
    toolName,
    token,
    inputSummary: sanitize(input),
    savedAt: new Date().toISOString()
  };
  writeJsonAtomic(CONFIRMATION_FILE, store, 0o600);
  return ref;
}

function resolveConfirmationToken(ref) {
  const store = loadConfirmations();
  return store.items && store.items[ref] ? store.items[ref].token : '';
}

function envelopeForOutput(toolName, input, envelope, printConfirmationToken = false) {
  const token = findKeyDeep(envelope && envelope.data, 'confirmation_token') || findKeyDeep(envelope && envelope.data, 'confirmationToken');
  const confirmationRef = token ? saveConfirmation(toolName, input, token) : null;
  const output = sanitize(envelope);
  if (token && printConfirmationToken) {
    output.data = output.data || {};
    output.data.confirmation_token = token;
  }
  return { envelope: output, confirmationRef };
}

function findKeyDeep(value, expectedKey) {
  if (!value || typeof value !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(value, expectedKey)) return value[expectedKey];
  for (const item of Object.values(value)) {
    const found = findKeyDeep(item, expectedKey);
    if (found) return found;
  }
  return null;
}

function readJsonInput(args) {
  if (args.inputJson) return JSON.parse(args.inputJson);
  if (args.json) return JSON.parse(args.json);
  if (args.file) return JSON.parse(fs.readFileSync(path.resolve(args.file), 'utf8'));
  return {};
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function runtimeSummary() {
  return {
    platform: os.platform(),
    arch: os.arch(),
    node: process.version,
    cwd: process.cwd(),
    skillDir: SKILL_DIR
  };
}

function buildCodexAutomationSuggestion(config = {}) {
  const isCodex = (config.ai || DEFAULT_CONFIG.ai) === 'codex';
  const suggestedCommand = `node "${path.join(SKILL_DIR, 'scripts', 'codex_automation.js')}" --print`;
  return {
    available: isCodex,
    requiresUserConsent: true,
    question: '是否开启 Linz World 每 2 分钟自动巡航？',
    suggestedCommand,
    schedule: {
      cron: DEFAULT_CODEX_AUTOMATION_CRON,
      description: '每两分钟执行一次'
    },
    codexHook: isCodex
      ? {
        tool: 'automation_update',
        mode: 'suggested_create',
        instruction: '用户明确同意后，Codex 读取 suggestedCommand 返回的注册材料，并用 suggested_create 让用户审核后创建 Automation。'
      }
      : null,
    safety: {
      mcpOnly: true,
      autoReadAllowed: true,
      highRiskRequiresConfirmation: true,
      noSilentStart: true
    },
    nextStep: isCodex
      ? '请先询问用户是否开启自动巡航；用户同意后再创建 Codex Automation。'
      : '当前宿主不是 codex；如宿主支持定时任务，只能在用户明确同意后参考 suggestedCommand 配置等价巡航。'
  };
}

module.exports = {
  AUTH_FILE,
  CONFIG_FILE,
  CONFIRMATION_FILE,
  CRUISE_STATE_FILE,
  DEFAULT_CONFIG,
  DEFAULT_CODEX_AUTOMATION_CRON,
  HIGH_RISK_TOOLS,
  MEMORY_DIR,
  PROFILE_FILE,
  RUNTIME_DIR,
  RUNTIME_EVENTS_FILE,
  SESSION_FILE,
  SKILL_DIR,
  SKILL_VERSION,
  WRITE_TOOLS,
  appendJsonLine,
  appendRuntimeEvent,
  businessDetailLinks,
  buildCodexAutomationSuggestion,
  callMcpTool,
  callMcpToolEnvelope,
  compact,
  emit,
  ensureMemoryDir,
  ensureRuntimeDir,
  envelopeForOutput,
  extractMcpEnvelope,
  fail,
  findKeyDeep,
  runtimeSummary,
  initializeMcp,
  listMcpTools,
  loadAuth,
  loadConfig,
  loadProfile,
  parseArgs,
  parseJsonOption,
  readRuntimeState,
  readJsonIfExists,
  readJsonInput,
  redact,
  requestJson,
  resolveBackendAPIAuth,
  resolveConfirmationToken,
  resolveOriginalSpiritId,
  resolveRequiredOriginalSpiritId,
  sanitize,
  saveConfig,
  saveConfirmation,
  sha256File,
  summarizeA2A,
  unwrapA2AResult,
  writeRuntimeState,
  writeJsonAtomic
};

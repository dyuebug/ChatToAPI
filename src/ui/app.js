import { redact, createSseParser, readStreamDelta, describeToolActivity, describeWarning, describeFallback } from './lib.js';

const THEME_KEY = 'chattoapi.ui.theme';
const POLL_TIMEOUT_MS = 5000;
const STATION_LABELS = Object.freeze({ Sorux: 'Sorux', OneOpenAI: 'ChatGPT-Work' });
const backoffSteps = [3000, 6000, 12000, 30000];
const state = {
  apiKey: '',
  keyVisible: false,
  keyMaskTimer: null,
  models: [],
  history: [],
  previousUserMessage: '',
  activeController: null,
  generating: false,
  polling: false,
  pollTimer: null,
  failureCount: 0,
  backoffIndex: 0,
  status: null,
  loginStartedAt: null,
  loginElapsedTimer: null,
  loginPollDeadline: 0,
  rotationBusy: false,
};

const $ = (id) => document.getElementById(id);
const refs = {
  html: document.documentElement,
  serviceChip: $('service-chip'), upstreamChip: $('upstream-chip'), serviceState: $('service-state'),
  loggedInState: $('logged-in-state'), tokenState: $('token-state'), loginNeededState: $('login-needed-state'),
  loginProgressState: $('login-progress-state'), statusLive: $('status-live'), statusNotice: $('status-notice'),
  lastUpdated: $('last-updated'), lastLoginAt: $('last-login-at'), lastCapturePath: $('last-capture-path'),
  loginError: $('login-error'), captureCount: $('capture-count'), apiKeyChip: $('api-key-chip'),
  apiKeyState: $('api-key-state'),
  trafficCount: $('traffic-count'), trafficSummaryPath: $('traffic-summary-path'),
  trafficBody: $('traffic-body'), refreshButton: $('refresh-button'), themeButton: $('theme-button'),
  toastRegion: $('toast-region'), codeDialog: $('code-dialog'),
  codeForm: $('code-form'), codeInput: $('code-input'), codeFeedback: $('code-feedback'),
  openLoginButton: $('open-login-button'), forceLoginButton: $('force-login-button'), openCodeButton: $('open-code-button'),
  loginFeedback: $('login-feedback'), loginReuseHint: $('login-reuse-hint'), loginElapsedRow: $('login-elapsed-row'), loginElapsed: $('login-elapsed'),
  rotateDialog: $('rotate-dialog'), rotateForm: $('rotate-form'), rotateConfirmInput: $('rotate-confirm-input'),
  rotateFeedback: $('rotate-feedback'), rotateButton: $('rotate-key-button'), keyDisplay: $('key-display'),
  toggleKeyButton: $('toggle-key-button'), copyKeyButton: $('copy-key-button'), pasteKey: $('paste-key'),
  verifyKeyButton: $('verify-key-button'), keyFeedback: $('key-feedback'), modelSelect: $('model-select'),
  reasoningToggle: $('reasoning-toggle'), loginStation: $('login-station'), stationStatusList: $('station-status-list'),
  transcript: $('transcript'), transcriptEmpty: $('transcript-empty'), generationStatus: $('generation-status'),
  stoppedBadge: $('stopped-badge'), scrollBottomButton: $('scroll-bottom-button'), messageInput: $('message-input'),
  sendButton: $('send-button'), chatFeedback: $('chat-feedback'), retryButton: $('retry-button'),
};

function setTheme(theme) {
  const value = theme === 'light' || theme === 'dark' ? theme : 'system';
  if (value === 'system') refs.html.removeAttribute('data-theme');
  else refs.html.dataset.theme = value;
  try {
    if (value === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, value);
  } catch {}
}

function initializeTheme() {
  let theme = 'system';
  try { theme = localStorage.getItem(THEME_KEY) || 'system'; } catch {}
  setTheme(theme);
  // 未显式设置时以系统偏好为准，否则系统深色下首次点击会仍得到深色。
  refs.themeButton.addEventListener('click', () => {
    const active = refs.html.dataset.theme
      || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(active === 'dark' ? 'light' : 'dark');
  });
}

function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = redact(String(message));
  refs.toastRegion.replaceChildren(node);
  window.setTimeout(() => node.remove(), 4500);
}

function setChip(element, label, variant) {
  element.className = `status-chip status-chip--${variant}`;
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  dot.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = label;
  element.replaceChildren(dot, text);
}

function formatTime(value) {
  if (!value) return '暂无';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '暂无' : date.toLocaleString('zh-CN', { hour12: false });
}

function truncatePath(value) {
  const pathname = String(value || '/').split('?', 1)[0] || '/';
  const redactedPath = redact(pathname);
  return redactedPath.length > 120 ? `${redactedPath.slice(0, 117)}...` : redactedPath;
}

function safeValue(value, fallback = '暂无') {
  return value === null || value === undefined || value === '' ? fallback : redact(String(value));
}

function startLoginElapsed() {
  if (state.loginElapsedTimer) window.clearInterval(state.loginElapsedTimer);
  state.loginStartedAt = Date.now();
  refs.loginElapsedRow.hidden = false;
  const update = () => {
    const elapsed = Math.max(0, Math.floor((Date.now() - state.loginStartedAt) / 1000));
    refs.loginElapsed.textContent = `${elapsed} 秒`;
  };
  update();
  state.loginElapsedTimer = window.setInterval(update, 1000);
}

function stopLoginElapsed() {
  if (state.loginElapsedTimer) window.clearInterval(state.loginElapsedTimer);
  state.loginElapsedTimer = null;
  refs.loginElapsedRow.hidden = true;
}

function renderStations(stations) {
  const fragment = document.createDocumentFragment();
  const entries = stations && typeof stations === 'object' ? Object.entries(stations) : [];
  if (!entries.length) {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = '站点凭据';
    const dd = document.createElement('dd');
    dd.textContent = '暂无';
    row.append(dt, dd);
    fragment.append(row);
  }
  for (const [stationId, station] of entries) {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    dt.textContent = STATION_LABELS[stationId] || redact(stationId);
    const dd = document.createElement('dd');
    const label = STATION_LABELS[stationId] || stationId;
    if (station?.loginInProgress) {
      dd.textContent = '登录中';
      dd.className = 'station-state station-state--pending';
    } else if (station?.tokenExpired) {
      dd.textContent = '凭据已过期';
      dd.className = 'station-state station-state--danger';
    } else if (station?.loggedIn) {
      dd.textContent = station.capturedAt ? `已登录 · ${formatTime(station.capturedAt)}` : '已登录';
      dd.className = 'station-state station-state--online';
    } else {
      dd.textContent = '未登录';
    }
    dd.title = `${label} 站`;
    row.append(dt, dd);
    fragment.append(row);
  }
  refs.stationStatusList.replaceChildren(fragment);
  if (!refs.loginStation.dataset.touched && state.status?.activeStation) {
    refs.loginStation.value = state.status.activeStation;
  }
}

function renderStatus(status) {
  state.status = status;
  setChip(refs.serviceChip, '服务在线', 'online');
  refs.serviceState.textContent = '在线';
  refs.statusLive.textContent = '已连接';
  const loggedIn = status.loggedIn === true;
  const tokenExpired = status.tokenExpired === true;
  const inProgress = status.loginInProgress === true;
  setChip(refs.upstreamChip, loggedIn ? '上游已登录' : '上游未登录', loggedIn ? 'online' : 'warning');
  const activeLabel = STATION_LABELS[status.activeStation] || status.activeStation || '';
  refs.loggedInState.textContent = `${loggedIn ? '已登录' : '未登录'}${activeLabel ? ` · ${activeLabel}` : ''}`;
  // “已登录”只代表本地有加密凭据；已有凭据时登录窗口会复用会话，不会停在登录页。
  refs.loginReuseHint.hidden = !loggedIn;
  refs.tokenState.textContent = tokenExpired ? '已过期' : loggedIn ? '有效' : '未知';
  refs.tokenState.className = tokenExpired ? 'danger' : '';
  refs.loginNeededState.textContent = status.needsLogin ? '需要登录' : '无需登录';
  refs.loginProgressState.textContent = inProgress ? '进行中' : '未运行';
  refs.lastLoginAt.textContent = formatTime(status.lastLoginAt);
  refs.lastCapturePath.textContent = truncatePath(status.lastCapturePath);
  refs.lastCapturePath.title = truncatePath(status.lastCapturePath);
  refs.loginError.textContent = status.loginError ? redact(String(status.loginError)).slice(0, 300) : '无';
  refs.captureCount.textContent = `${Number(status.captureAttempts || 0)} 次`;
  if (inProgress && !state.loginElapsedTimer) startLoginElapsed();
  if (!inProgress && state.loginElapsedTimer) stopLoginElapsed();
  setChip(refs.apiKeyChip, status.apiKeyConfigured ? '已配置' : '未配置', status.apiKeyConfigured ? 'online' : 'idle');
  refs.apiKeyState.textContent = state.apiKey ? '已验证（Key 仅保存在内存中）' : status.apiKeyConfigured ? '服务端已配置；请粘贴 Key 或轮换后使用' : '尚未配置可用于对话的 Key';
  const now = new Date().toISOString();
  refs.lastUpdated.textContent = formatTime(now);
  refs.lastUpdated.dateTime = now;
  refs.statusNotice.textContent = inProgress ? '登录捕获正在运行，状态会继续刷新。' : '状态将在页面可见时自动刷新。';
  renderStations(status.stations);
  renderTraffic(Array.isArray(status.recentTraffic) ? status.recentTraffic : []);
}

function renderShape(shape) {
  const list = document.createElement('ul');
  list.className = 'shape-list';
  if (!shape || typeof shape !== 'object') return list;
  for (const [key, type] of Object.entries(shape).slice(0, 30)) {
    const item = document.createElement('li');
    item.textContent = `${redact(key)}: ${typeof type === 'string' ? redact(type) : Array.isArray(type) ? 'array' : typeof type}`;
    list.append(item);
  }
  return list;
}

function renderFlags(entry) {
  const cell = document.createElement('td');
  const group = document.createElement('div');
  group.className = 'traffic-flags';
  for (const flag of [entry.hasAuthorization && 'AUTH', entry.hasCookie && 'COOKIE', entry.headerNames?.length && 'PROTO'].filter(Boolean)) {
    const span = document.createElement('span');
    span.className = 'traffic-flag';
    span.textContent = flag;
    group.append(span);
  }
  cell.append(group);
  return cell;
}

function renderTraffic(entries) {
  refs.trafficCount.textContent = `${entries.length} 条`;
  refs.trafficSummaryPath.textContent = entries.length ? truncatePath(entries[entries.length - 1].path) : '暂无最近路径';
  if (!entries.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.className = 'table-empty';
    cell.textContent = '暂无捕获流量';
    row.append(cell);
    $('traffic-body').replaceChildren(row);
    return;
  }
  const fragment = document.createDocumentFragment();
  for (const entry of entries.slice(-40).reverse()) {
    const row = document.createElement('tr');
    const values = [formatTime(entry.at), safeValue(entry.kind, '未知'), safeValue(entry.method, '—'), truncatePath(entry.path), safeValue(entry.status, '—'), safeValue(entry.contentType, '—')];
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value;
      row.append(cell);
    }
    row.children[3].className = 'mono traffic-path';
    row.append(renderFlags(entry));
    const shapeCell = document.createElement('td');
    shapeCell.append(renderShape(entry.bodyShape));
    row.append(shapeCell);
    fragment.append(row);
  }
  $('traffic-body').replaceChildren(fragment);
}

function schedulePoll() {
  window.clearTimeout(state.pollTimer);
  if (document.visibilityState === 'hidden') return;
  const delay = state.failureCount
    ? backoffSteps[Math.min(state.backoffIndex++, backoffSteps.length - 1)]
    : state.status?.loginInProgress ? 2000 : 3000;
  state.pollTimer = window.setTimeout(fetchStatus, delay);
}

async function fetchStatus() {
  if (state.polling || document.visibilityState === 'hidden') return;
  state.polling = true;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
  try {
    const response = await fetch('/auth/status', { cache: 'no-store', signal: controller.signal, credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderStatus(await response.json());
    state.failureCount = 0;
    state.backoffIndex = 0;
  } catch (error) {
    state.failureCount += 1;
    if (state.failureCount >= 3) {
      setChip(refs.serviceChip, '服务离线', 'offline');
      refs.serviceState.textContent = '离线';
      refs.statusLive.textContent = '连接失败';
      refs.statusNotice.textContent = `状态暂时不可用：${redact(error.message).slice(0, 300)}`;
    }
  } finally {
    window.clearTimeout(timeout);
    state.polling = false;
    schedulePoll();
  }
}

function responseMessage(body, fallback) {
  const message = body?.error?.message || body?.message || fallback;
  return redact(String(message)).slice(0, 500);
}

async function readJson(response) {
  try { return await response.json(); } catch { return {}; }
}

function setBusy(button, busy, label) {
  if (busy) {
    button.dataset.idleLabel = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (label) button.textContent = label;
  } else {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (button.dataset.idleLabel) { button.textContent = button.dataset.idleLabel; delete button.dataset.idleLabel; }
  }
}

async function postLogin(force = false) {
  const button = force ? refs.forceLoginButton : refs.openLoginButton;
  const stationId = refs.loginStation.value || state.status?.activeStation || 'Sorux';
  const stationLabel = STATION_LABELS[stationId] || stationId;
  setBusy(button, true, force ? '正在重新登录…' : '正在打开…');
  refs.loginFeedback.textContent = '';
  try {
    const params = new URLSearchParams({ station: stationId });
    if (force) params.set('force', '1');
    const response = await fetch(`/auth/login?${params.toString()}`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
    });
    const body = await readJson(response);
    if (!response.ok) throw new Error(responseMessage(body, `HTTP ${response.status}`));
    if (body.alreadyRunning) {
      const runningLabel = STATION_LABELS[body.stationId] || body.stationId || '';
      toast(`登录窗口已在运行${runningLabel ? `（${runningLabel}）` : ''}`);
      refs.loginFeedback.textContent = runningLabel && body.stationId !== stationId
        ? `登录窗口属于 ${runningLabel}；如需切换站点，请使用“强制重新登录”。`
        : responseMessage(body, `登录捕获已启动（${stationLabel}）`);
    } else {
      toast(force ? `已启动 ${stationLabel} 强制重新登录` : `已打开 ${stationLabel} 登录窗口`);
      refs.loginFeedback.textContent = responseMessage(body, `登录捕获已启动（${stationLabel}）`);
      startLoginElapsed();
    }
    schedulePoll();
  } catch (error) {
    refs.loginFeedback.textContent = responseMessage({ message: error.message }, '无法启动登录');
  } finally {
    setBusy(button, false);
  }
}

function confirmAction(message, confirmText) {
  return new Promise((resolve) => {
    const dialog = $('confirm-dialog');
    $('confirm-message').textContent = message;
    const form = dialog.querySelector('form');
    const onClose = () => { dialog.removeEventListener('close', onClose); resolve(dialog.returnValue === 'confirm'); };
    dialog.addEventListener('close', onClose);
    $('confirm-action-button').textContent = confirmText;
    dialog.showModal();
  });
}

async function submitCode(event) {
  event.preventDefault();
  const code = refs.codeInput.value.trim().slice(0, 32);
  if (!code) { refs.codeFeedback.textContent = '请输入动态码'; return; }
  setBusy($('submit-code-button'), true, '正在提交…');
  refs.codeFeedback.textContent = '';
  try {
    const stationId = refs.loginStation.value || state.status?.activeStation || 'Sorux';
    const response = await fetch(`/auth/login/code?station=${encodeURIComponent(stationId)}`, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }),
    });
    const body = await readJson(response);
    if (!response.ok || body.ok === false) throw new Error(responseMessage(body, `HTTP ${response.status}`));
    refs.codeDialog.close();
    toast('登录成功，正在捕获凭据');
    state.loginPollDeadline = Date.now() + 60000;
    startLoginElapsed();
    schedulePoll();
    const waitForCapture = async () => {
      while (Date.now() < state.loginPollDeadline && document.visibilityState !== 'hidden') {
        await fetchStatus();
        if (state.status?.loggedIn) return;
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
      if (!state.status?.loggedIn) toast('请进入 AI 入口并发送一条消息后重试');
    };
    void waitForCapture();
  } catch (error) {
    refs.codeFeedback.textContent = responseMessage({ message: error.message }, '动态码提交失败');
  } finally {
    setBusy($('submit-code-button'), false);
  }
}

function maskKey() {
  state.keyVisible = false;
  window.clearTimeout(state.keyMaskTimer);
  refs.keyDisplay.type = 'text';
  refs.keyDisplay.value = state.apiKey ? 'ctk_••••••••' : '';
  refs.toggleKeyButton.textContent = '显示';
  refs.toggleKeyButton.disabled = !state.apiKey;
  refs.copyKeyButton.disabled = !state.apiKey;
}

function acceptKey(key) {
  state.apiKey = key;
  refs.keyDisplay.value = 'ctk_••••••••';
  refs.keyDisplay.type = 'password';
  refs.toggleKeyButton.disabled = false;
  refs.copyKeyButton.disabled = false;
  setChip(refs.apiKeyChip, '已验证', 'online');
  refs.messageInput.disabled = false;
  populateModels();
  updateSendState();
}

function toggleKeyVisibility() {
  if (!state.apiKey) return;
  state.keyVisible = true;
  refs.keyDisplay.type = 'text';
  refs.keyDisplay.value = state.apiKey;
  refs.toggleKeyButton.textContent = '掩码';
  window.clearTimeout(state.keyMaskTimer);
  state.keyMaskTimer = window.setTimeout(maskKey, 30000);
}

async function verifyKey(candidate = refs.pasteKey.value.trim()) {
  if (!candidate) { refs.keyFeedback.textContent = '请先粘贴 API Key'; return; }
  setBusy(refs.verifyKeyButton, true, '验证中…');
  refs.keyFeedback.textContent = '';
  try {
    const response = await fetch('/v1/models', { cache: 'no-store', credentials: 'same-origin', headers: { authorization: `Bearer ${candidate}` } });
    const body = await readJson(response);
    if (response.status === 401) { refs.keyFeedback.textContent = 'Key 无效或已被轮换'; return; }
    if (!response.ok) throw new Error(responseMessage(body, `HTTP ${response.status}`));
    if (!Array.isArray(body.data)) throw new Error('模型列表格式无效');
    acceptKey(candidate);
    refs.pasteKey.value = '';
    refs.keyFeedback.textContent = 'Key 已验证';
    toast('API Key 验证成功');
  } catch (error) {
    refs.keyFeedback.textContent = responseMessage({ message: error.message }, '验证 Key 时发生网络错误');
  } finally {
    setBusy(refs.verifyKeyButton, false);
  }
}

async function populateModels() {
  refs.modelSelect.disabled = true;
  try {
    const response = await fetch('/v1/models', { cache: 'no-store', credentials: 'same-origin', headers: { authorization: `Bearer ${state.apiKey}` } });
    const body = await readJson(response);
    if (!response.ok) throw new Error(response.status === 401 ? 'Key 无效或已被轮换' : responseMessage(body, `HTTP ${response.status}`));
    state.models = Array.isArray(body.data) ? body.data.map((model) => model.id).filter((id) => typeof id === 'string') : [];
    const fragment = document.createDocumentFragment();
    for (const model of state.models) {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = redact(model);
      fragment.append(option);
    }
    refs.modelSelect.replaceChildren(fragment);
    refs.modelSelect.disabled = state.models.length === 0;
    if (!state.models.length) refs.chatFeedback.textContent = '服务未返回可用模型';
  } catch (error) {
    refs.modelSelect.replaceChildren(new Option('模型加载失败', ''));
    refs.chatFeedback.textContent = responseMessage({ message: error.message }, '模型列表加载失败');
  }
}

async function rotateKey(event) {
  event.preventDefault();
  if (refs.rotateConfirmInput.value.trim() !== 'ROTATE' || state.rotationBusy) return;
  state.rotationBusy = true;
  setBusy($('submit-rotate-button'), true, '正在轮换…');
  refs.rotateFeedback.textContent = '';
  try {
    const response = await fetch('/auth/key/rotate', {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json', 'x-chattoapi-ui': '1' },
      body: JSON.stringify({ confirm: 'rotate' }),
    });
    const body = await readJson(response);
    if (response.status === 401 || response.status === 403) throw new Error('页面会话已失效，请重新用终端打印的 URL 打开控制台');
    if (!response.ok || typeof body.apiKey !== 'string') throw new Error(responseMessage(body, `HTTP ${response.status}`));
    acceptKey(body.apiKey);
    refs.rotateDialog.close();
    refs.rotateConfirmInput.value = '';
    refs.keyFeedback.textContent = '新 Key 已生成并用于对话测试';
    toast('API Key 已轮换');
    await populateModels();
    void fetchStatus();
  } catch (error) {
    refs.rotateFeedback.textContent = responseMessage({ message: error.message }, 'API Key 轮换失败');
  } finally {
    state.rotationBusy = false;
    setBusy($('submit-rotate-button'), false);
    $('submit-rotate-button').disabled = refs.rotateConfirmInput.value.trim() !== 'ROTATE';
  }
}

function appendMessage(role, text, metadata = '') {
  refs.transcriptEmpty.hidden = true;
  const article = document.createElement('article');
  article.className = `message message--${role}`;
  const heading = document.createElement('div');
  heading.className = 'message-heading';
  heading.textContent = role === 'user' ? '你' : '助手';
  const content = document.createElement('div');
  content.className = 'message-content';
  content.textContent = text;
  let reasoningBlock = null;
  let reasoningBody = null;
  let toolList = null;
  if (role === 'assistant') {
    reasoningBlock = document.createElement('details');
    reasoningBlock.className = 'reasoning-block';
    reasoningBlock.hidden = true;
    const summary = document.createElement('summary');
    summary.textContent = '思考摘要';
    reasoningBody = document.createElement('div');
    reasoningBody.className = 'reasoning-content';
    reasoningBlock.append(summary, reasoningBody);
    toolList = document.createElement('ol');
    toolList.className = 'tool-timeline';
    toolList.hidden = true;
    article.append(heading, reasoningBlock, toolList, content);
  } else {
    article.append(heading, content);
  }
  if (metadata) {
    const footer = document.createElement('div');
    footer.className = 'message-meta';
    footer.textContent = redact(metadata);
    article.append(footer);
  }
  refs.transcript.append(article);
  return { article, content, reasoningBlock, reasoningBody, toolList, toolNodes: new Map() };
}

function isNearBottom() {
  return refs.transcript.scrollHeight - refs.transcript.scrollTop - refs.transcript.clientHeight < 80;
}

function updateScrollControl(wasNearBottom) {
  if (wasNearBottom) refs.transcript.scrollTop = refs.transcript.scrollHeight;
  else refs.scrollBottomButton.hidden = false;
}

function updateSendState() {
  refs.sendButton.disabled = state.generating ? false : (!state.apiKey || !refs.messageInput.value.trim() || !refs.modelSelect.value);
  refs.messageInput.disabled = !state.apiKey || state.generating;
  refs.sendButton.textContent = state.generating ? '停止' : '发送';
}

function statusMessage(text) {
  refs.generationStatus.textContent = text;
}

async function sendMessage(text = refs.messageInput.value.trim()) {
  if (state.generating) { state.activeController?.abort(); return; }
  if (!state.apiKey || !text || !refs.modelSelect.value) return;
  const previousHistory = state.history.slice();
  refs.chatFeedback.textContent = '';
  refs.retryButton.hidden = true;
  refs.stoppedBadge.hidden = true;
  const messages = [...state.history, { role: 'user', content: text }].slice(-20);
  state.history = messages;
  state.previousUserMessage = text;
  appendMessage('user', text);
  refs.messageInput.value = '';
  const wasNearBottom = isNearBottom();
  const assistant = appendMessage('assistant', '');
  state.generating = true;
  state.activeController = new AbortController();
  const controller = state.activeController;
  const startedAt = performance.now();
  let output = '';
  let tokenBuffer = '';
  let reasoningOutput = '';
  let reasoningBuffer = '';
  let workEnvelope = null;
  let toolCount = 0;
  let animationFrame = 0;
  let streamError = null;
  let stopped = false;
  statusMessage('开始生成');
  updateSendState();

  const flush = () => {
    animationFrame = 0;
    if (!tokenBuffer && !reasoningBuffer) return;
    const nearBottom = isNearBottom();
    if (tokenBuffer) {
      output += tokenBuffer;
      tokenBuffer = '';
      assistant.content.textContent = output;
    }
    if (reasoningBuffer) {
      reasoningOutput += reasoningBuffer;
      reasoningBuffer = '';
      assistant.reasoningBlock.hidden = false;
      assistant.reasoningBody.textContent = reasoningOutput;
    }
    updateScrollControl(nearBottom);
  };

  const applyToolActivity = (activity) => {
    const item = describeToolActivity(activity);
    if (!item) return;
    let node = assistant.toolNodes.get(item.id);
    if (!node) {
      node = document.createElement('li');
      assistant.toolNodes.set(item.id, node);
      assistant.toolList.append(node);
      assistant.toolList.hidden = false;
      toolCount += 1;
      statusMessage('工具调用中…');
    }
    node.className = `tool-item tool-item--${item.active ? 'active' : 'done'}`;
    node.textContent = redact(item.text);
  };

  const parser = createSseParser((frame) => {
    let data;
    try { data = JSON.parse(frame); } catch { return; }
    if (data.error) {
      streamError = new Error(responseMessage(data, '上游返回错误'));
      controller.abort();
      return;
    }
    const delta = readStreamDelta(data);
    if (delta.content) {
      tokenBuffer += delta.content;
      if (!animationFrame) animationFrame = requestAnimationFrame(flush);
    }
    if (delta.reasoning) {
      reasoningBuffer += delta.reasoning;
      if (!animationFrame) animationFrame = requestAnimationFrame(flush);
    }
    if (delta.toolActivity) applyToolActivity(delta.toolActivity);
    if (delta.envelope) workEnvelope = delta.envelope;
  });

  try {
    const response = await fetch('/v1/chat/completions', {
      method: 'POST', credentials: 'same-origin', signal: controller.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${state.apiKey}` },
      body: JSON.stringify({ model: refs.modelSelect.value, stream: true, chattoapi: { reasoning: refs.reasoningToggle.checked }, messages }),
    });
    if (!response.ok) {
      const body = await readJson(response);
      if (response.status === 401 || response.status === 403) throw new Error('API Key 无效，请重新配置 Key');
      if (response.status === 429 && body.error?.code === 'model_at_capacity') throw new Error('模型当前容量不足，请稍后重试或换用其他 Work 模型');
      if ([502, 503, 504].includes(response.status)) throw new Error(`上游暂时不可用（${response.status}），请稍后重试`);
      throw new Error(responseMessage(body, `请求失败（${response.status}）`));
    }
    if (!response.body) throw new Error('浏览器未提供流式响应');
    const reader = response.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      parser.push(value);
      if (streamError) throw streamError;
    }
    parser.end();
    if (streamError) throw streamError;
    if (animationFrame) cancelAnimationFrame(animationFrame);
    flush();
    const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
    const parts = [refs.modelSelect.value];
    const siteLabel = workEnvelope?.site ? (STATION_LABELS[workEnvelope.site] || workEnvelope.site) : '';
    if (siteLabel) parts.push(siteLabel);
    if (workEnvelope?.upstream_model) parts.push(`上游 ${workEnvelope.upstream_model}`);
    parts.push(`${elapsed} 秒`, `${[...output].length} 字符`);
    if (toolCount) parts.push(`工具 ${toolCount} 项`);
    const metadata = parts.join(' · ');
    assistant.article.querySelector('.message-meta')?.remove();
    const footer = document.createElement('div');
    footer.className = 'message-meta';
    footer.textContent = redact(metadata);
    assistant.article.append(footer);
    state.history = [...messages, { role: 'assistant', content: output }].slice(-20);
    statusMessage('生成完成');
    const notices = [];
    for (const warning of Array.isArray(workEnvelope?.warnings) ? workEnvelope.warnings : []) {
      const text = describeWarning(warning);
      if (text && !notices.includes(text)) notices.push(text);
    }
    const fallbackText = describeFallback(workEnvelope);
    if (fallbackText) notices.push(fallbackText);
    if (notices.length) refs.chatFeedback.textContent = notices.join(' ');
  } catch (error) {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    flush();
    stopped = controller.signal.aborted && !streamError;
    if (stopped) {
      refs.stoppedBadge.hidden = false;
      assistant.content.textContent = output;
      const marker = document.createElement('div');
      marker.className = 'message-meta';
      marker.textContent = '已停止';
      assistant.article.append(marker);
      statusMessage('已停止');
      state.history = [...messages, ...(output ? [{ role: 'assistant', content: output }] : [])].slice(-20);
    } else {
      const message = responseMessage({ message: streamError?.message || error.message }, '网络连接失败，请检查本地服务');
      refs.chatFeedback.textContent = message;
      refs.retryButton.hidden = false;
      statusMessage('出错');
      state.history = previousHistory;
      if (!output && !reasoningOutput && !toolCount) assistant.article.remove();
    }
  } finally {
    state.generating = false;
    state.activeController = null;
    updateSendState();
    if (!isNearBottom()) refs.scrollBottomButton.hidden = false;
  }
}

function bindEvents() {
  refs.refreshButton.addEventListener('click', () => { if (!state.polling) void fetchStatus(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void fetchStatus();
    else { window.clearTimeout(state.pollTimer); maskKey(); }
  });
  refs.openLoginButton.addEventListener('click', () => void postLogin());
  refs.forceLoginButton.addEventListener('click', async () => {
    const confirmed = await confirmAction('强制重新登录会关闭现有登录窗口及捕获流程。', '关闭并重登');
    if (confirmed) void postLogin(true);
  });
  refs.openCodeButton.addEventListener('click', () => {
    if (!state.status?.loginInProgress) { toast('请先打开登录窗口'); return; }
    refs.codeFeedback.textContent = '';
    refs.codeDialog.showModal();
    refs.codeInput.focus();
  });
  $('close-code-dialog').addEventListener('click', () => refs.codeDialog.close());
  $('cancel-code-dialog').addEventListener('click', () => refs.codeDialog.close());
  refs.codeForm.addEventListener('submit', submitCode);
  refs.rotateButton.addEventListener('click', () => {
    refs.rotateConfirmInput.value = '';
    refs.rotateFeedback.textContent = '';
    $('submit-rotate-button').disabled = true;
    refs.rotateDialog.showModal();
    refs.rotateConfirmInput.focus();
  });
  $('close-rotate-dialog').addEventListener('click', () => refs.rotateDialog.close());
  $('cancel-rotate-dialog').addEventListener('click', () => refs.rotateDialog.close());
  refs.rotateConfirmInput.addEventListener('input', () => { $('submit-rotate-button').disabled = refs.rotateConfirmInput.value.trim() !== 'ROTATE'; });
  refs.rotateForm.addEventListener('submit', rotateKey);
  refs.toggleKeyButton.addEventListener('click', () => state.keyVisible ? maskKey() : toggleKeyVisibility());
  refs.copyKeyButton.addEventListener('click', async () => {
    if (!state.apiKey) return;
    try { await navigator.clipboard.writeText(state.apiKey); toast('API Key 已复制'); }
    catch { refs.keyFeedback.textContent = '复制失败，请检查浏览器剪贴板权限'; }
  });
  refs.verifyKeyButton.addEventListener('click', () => void verifyKey());
  refs.pasteKey.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); void verifyKey(); } });
  refs.modelSelect.addEventListener('change', updateSendState);
  refs.loginStation.addEventListener('change', () => { refs.loginStation.dataset.touched = '1'; });
  refs.reasoningToggle.addEventListener('change', () => {
    refs.reasoningToggle.title = refs.reasoningToggle.checked ? '请求上游返回思考摘要（仅 Work 站点支持）' : '';
  });
  refs.messageInput.addEventListener('input', updateSendState);
  refs.messageInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void sendMessage(); }
  });
  refs.sendButton.addEventListener('click', () => void sendMessage());
  refs.scrollBottomButton.addEventListener('click', () => { refs.transcript.scrollTop = refs.transcript.scrollHeight; refs.scrollBottomButton.hidden = true; });
  refs.transcript.addEventListener('scroll', () => { if (isNearBottom()) refs.scrollBottomButton.hidden = true; });
  refs.retryButton.addEventListener('click', () => { if (state.previousUserMessage) void sendMessage(state.previousUserMessage); });
}

initializeTheme();
bindEvents();
maskKey();
void fetchStatus();

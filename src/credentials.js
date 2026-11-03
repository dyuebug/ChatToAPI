import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const KEY_FILE = '.chattoapi-master.key';

function b64(value) {
  return Buffer.from(value).toString('base64');
}

function unb64(value) {
  return Buffer.from(value, 'base64');
}

function browserCandidates() {
  if (process.env.CHATTOAPI_BROWSER_PATH) return [process.env.CHATTOAPI_BROWSER_PATH];
  if (process.platform === 'win32') {
    return [
      path.join(process.env.PROGRAMFILES || '', 'Google/Chrome/Application/chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
    ];
  }
  return ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
}

function findBrowser() {
  return browserCandidates().find((candidate) => candidate && fs.existsSync(candidate));
}

function tokenExpired(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return false;
  try {
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    const claims = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    return Number.isFinite(claims.exp) && claims.exp <= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function tokenFromPayload(payload) {
  const candidates = [
    payload?.token,
    payload?.access_token,
    payload?.accessToken,
    payload?.userToken,
    payload?.data?.token,
    payload?.data?.access_token,
    payload?.data?.accessToken,
    payload?.data?.userToken,
  ];
  return candidates.find((value) => typeof value === 'string' && value.trim())?.trim() || null;
}

function cookieHeaderToPlaywrightCookies(cookieHeader, url) {
  return String(cookieHeader || '').split(';').map((part) => {
    const separator = part.indexOf('=');
    if (separator <= 0) return null;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    return name && value ? { name, value, url } : null;
  }).filter(Boolean);
}

// 仅保留协议形状，避免把用户消息、Cookie 或令牌写入诊断状态。
function summarizeProtocolValue(value, depth = 0) {
  if (value === null) return { type: 'null' };
  if (typeof value === 'string') return { type: 'string', length: value.length };
  if (typeof value === 'number') return { type: 'number' };
  if (typeof value === 'boolean') return { type: 'boolean' };
  if (Array.isArray(value)) {
    return {
      type: 'array',
      length: value.length,
      item: depth < 2 && value.length ? summarizeProtocolValue(value[0], depth + 1) : undefined,
    };
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).slice(0, 40);
    return {
      type: 'object',
      keys,
      fields: depth < 2
        ? Object.fromEntries(keys.slice(0, 20).map((key) => [key, summarizeProtocolValue(value[key], depth + 1)]))
        : undefined,
    };
  }
  return { type: typeof value };
}

function summarizeProtocolBody(raw) {
  if (!raw) return null;
  const text = String(raw);
  try {
    return summarizeProtocolValue(JSON.parse(text));
  } catch {
    const keys = [...text.matchAll(/(?:^|[?&])([^=&]+)=/g)].map((match) => decodeURIComponent(match[1])).slice(0, 40);
    return { type: 'text', length: text.length, formKeys: keys };
  }
}

function summarizeSseBody(raw) {
  const text = String(raw || '');
  const events = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') {
      events.push({ done: true });
      continue;
    }
    try {
      const value = JSON.parse(data);
      events.push(summarizeProtocolValue(value));
    } catch {
      events.push({ type: 'text', length: data.length });
    }
    if (events.length >= 20) break;
  }
  return { length: text.length, frames: events };
}

export class CredentialManager {
  constructor(cfg) {
    this.cfg = cfg;
    const auth = cfg.auth || {};
    this.root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    this.dataDir = path.resolve(this.root, auth.dataDir || 'data');
    this.profileDir = path.resolve(this.root, auth.profileDir || '.chattoapi-profile');
    this.storePath = path.join(this.dataDir, 'credentials.enc.json');
    this.keyPath = path.join(this.root, KEY_FILE);
    this.state = this.readState();
    this.initialApiKey = null;
    this.loginContext = null;
    this.loginTimer = null;
    this.loginCredentialTimer = null;
    this.loginError = null;
    this.captureAttempts = 0;
    this.lastCapturePath = null;
    this.loginTraffic = [];
    this.loginProtocol = null;
    this.lastAiEntryAction = null;
    this.lastAiEntryUrl = null;
  }

  masterKey() {
    const configured = process.env.CHATTOAPI_MASTER_KEY;
    if (configured) {
      const raw = Buffer.from(configured, 'base64');
      if (raw.length === 32) return raw;
      return crypto.createHash('sha256').update(configured).digest();
    }
    if (!fs.existsSync(this.keyPath)) {
      fs.writeFileSync(this.keyPath, crypto.randomBytes(32).toString('base64'), { mode: 0o600 });
    }
    const raw = Buffer.from(fs.readFileSync(this.keyPath, 'utf8').trim(), 'base64');
    if (raw.length !== 32) throw new Error(`${KEY_FILE} 无效，请删除后重新启动，或设置 CHATTOAPI_MASTER_KEY`);
    return raw;
  }

  decrypt(payload) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey(), unb64(payload.iv));
    decipher.setAuthTag(unb64(payload.tag));
    return JSON.parse(Buffer.concat([decipher.update(unb64(payload.data)), decipher.final()]).toString('utf8'));
  }

  encrypt(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey(), iv);
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return { version: 1, iv: b64(iv), tag: b64(cipher.getAuthTag()), data: b64(data) };
  }

  readState() {
    if (!fs.existsSync(this.storePath)) return {};
    try {
      return this.decrypt(JSON.parse(fs.readFileSync(this.storePath, 'utf8')));
    } catch (error) {
      throw new Error(`无法解密 ${this.storePath}: ${error.message}`);
    }
  }

  save() {
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this.encrypt(this.state), null, 2) + '\n', { mode: 0o600 });
  }

  loadIntoConfig() {
    // 正式入口只使用加密存储中的凭据，避免旧 config.json 明文凭据绕过管理器。
    this.cfg.upstream.credential = this.state.upstream?.credential || {};
    this.cfg.upstream.headers = { ...(this.cfg.upstream.headers || {}), ...(this.state.upstream?.headers || {}) };
    if (!this.hasUpstreamCredentials()) this.cfg.upstream.credential = {};
  }

  hasUpstreamCredentials() {
    const c = this.cfg.upstream?.credential || {};
    // 上游站点以 Cookie 会话为主，Authorization 里的 JWT 可能先于会话过期。
    // 是否真正有效交由上游判定：请求返回 401 时会调用 invalidateUpstream()。
    return Boolean(c.cookie && c.bearerToken && !c.cookie.startsWith('PASTE_') && !c.bearerToken.startsWith('PASTE_'));
  }

  upstreamTokenExpired() {
    const c = this.state.upstream?.credential || this.cfg.upstream?.credential || {};
    return Boolean(c.bearerToken) && tokenExpired(c.bearerToken);
  }

  invalidateUpstream() {
    delete this.state.upstream;
    this.cfg.upstream.credential = {};
    this.save();
  }

  hashApiKey(key) {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  getInitialApiKey() {
    if (this.state.apiKeyHash || this.initialApiKey) return this.initialApiKey;
    const key = `ctk_${crypto.randomBytes(32).toString('base64url')}`;
    this.state.apiKeyHash = this.hashApiKey(key);
    this.state.apiKeyCreatedAt = new Date().toISOString();
    this.initialApiKey = key;
    this.save();
    return key;
  }

  rotateApiKey() {
    const key = `ctk_${crypto.randomBytes(32).toString('base64url')}`;
    this.state.apiKeyHash = this.hashApiKey(key);
    this.state.apiKeyCreatedAt = new Date().toISOString();
    this.initialApiKey = key;
    this.save();
    return key;
  }

  /**
   * 派生本机签发令牌：只有能读取本地主密钥的进程才能调用 /auth/key/rotate。
   * 回环地址是机器级的，无法区分 Windows 登录用户；该令牌补上「同一用户」证明。
   * 返回 SHA-256 十六进制摘要，不暴露主密钥本身。
   */
  keyRotationToken() {
    return crypto.createHash('sha256').update(this.masterKey()).digest('hex');
  }

  verifyRotationToken(token) {
    if (typeof token !== 'string' || !token) return false;
    const actual = Buffer.from(token.trim().toLowerCase(), 'utf8');
    const expected = Buffer.from(this.keyRotationToken(), 'utf8');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  verifyApiKey(key) {
    if (!key || !this.state.apiKeyHash) return false;
    const actual = Buffer.from(this.hashApiKey(key), 'hex');
    const expected = Buffer.from(this.state.apiKeyHash, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  captureHeaders(headers) {
    const authorization = headers.authorization || '';
    const cookie = headers.cookie || '';
    const bearerToken = authorization.replace(/^Bearer\s+/i, '').trim();
    if (!bearerToken || !cookie) throw new Error('登录请求中没有同时发现 Authorization 和 Cookie');
    // JWT 的 exp 早于站点会话失效是常态：不再本地否决，交由上游 401 判定。
    const expired = tokenExpired(bearerToken);
    const selected = {};
    for (const [key, value] of Object.entries(headers)) {
      if (key.startsWith('oai-') || key.startsWith('openai-') || key === 'x-conduit-token' || key === 'user-agent') selected[key] = value;
    }
    this.state.upstream = { credential: { cookie, bearerToken }, headers: selected, tokenExpired: expired };
    this.cfg.upstream.credential = { cookie, bearerToken };
    this.cfg.upstream.headers = { ...(this.cfg.upstream.headers || {}), ...selected };
    this.state.lastLoginAt = new Date().toISOString();
    this.save();
  }

  status() {
    const loggedIn = this.hasUpstreamCredentials();
    return {
      loggedIn,
      needsLogin: !loggedIn,
      apiKeyConfigured: Boolean(this.state.apiKeyHash),
      loginInProgress: Boolean(this.loginContext),
      lastLoginAt: this.state.lastLoginAt || null,
      tokenExpired: this.upstreamTokenExpired(),
      loginError: this.loginError,
      captureAttempts: this.captureAttempts,
      lastCapturePath: this.lastCapturePath,
      recentTraffic: (this.loginTraffic || []).slice(-40),
      loginProtocol: this.loginProtocol,
      lastAiEntryAction: this.lastAiEntryAction,
      lastAiEntryUrl: this.lastAiEntryUrl,
    };
  }

  recordLoginTraffic(entry) {
    if (!Array.isArray(this.loginTraffic)) this.loginTraffic = [];
    this.loginTraffic.push({ at: new Date().toISOString(), ...entry });
    if (this.loginTraffic.length > 40) this.loginTraffic.splice(0, this.loginTraffic.length - 40);
  }

  async startLogin() {
    if (this.loginContext) return { started: true, alreadyRunning: true };
    this.loginError = null;
    this.captureAttempts = 0;
    this.lastCapturePath = null;
    this.loginTraffic = [];
    this.loginProtocol = null;
    const executablePath = this.cfg.auth?.browserPath || findBrowser();
    if (!executablePath) throw new Error('未找到 Chrome/Edge。请设置 CHATTOAPI_BROWSER_PATH 或 auth.browserPath');
    fs.mkdirSync(this.profileDir, { recursive: true });
    const configuredLoginUrl = this.cfg.auth?.loginUrl || this.cfg.upstream.baseUrl;
    const targetPaths = this.cfg.auth?.capturePaths?.length
      ? this.cfg.auth.capturePaths
      : [this.cfg.upstream.conversationPath || '/backend-api/f/conversation'];
    const upstreamOrigin = new URL(this.cfg.upstream.baseUrl).origin;
    const upstreamHost = new URL(this.cfg.upstream.baseUrl).host;
    const loginUrlObject = new URL(configuredLoginUrl);
    if (loginUrlObject.host === upstreamHost && loginUrlObject.pathname === '/') {
      loginUrlObject.pathname = '/Web/Login.html';
    }
    const loginUrl = loginUrlObject.toString();
    const browserArgs = Array.isArray(this.cfg.auth?.browserArgs)
      ? this.cfg.auth.browserArgs
      : ['--disable-quic', '--disable-http2'];
    const context = await chromium.launchPersistentContext(this.profileDir, {
      headless: this.cfg.auth?.headless === true,
      executablePath,
      args: browserArgs,
    });
    this.loginContext = context;
    let captureCompleted = false;
    let lastStorageToken = null;
    let openingAiEntry = false;
    let aiEntryOpened = false;
    const isProtocolPath = (pathname) => /\/backend-api\/(?:f\/conversation|conversation|sentinel\/chat-requirements)|\/API\/Web\/ConversationMessage\/Completions/i.test(pathname);
    const isFinalCapturePath = (pathname) => {
      if (/\/API\/Web\/ConversationMessage\/Completions/i.test(pathname)) return true;
      return /\/backend-api\/(?:f\/conversation|conversation)$/i.test(pathname);
    };
    const finishCapture = async () => {
      if (captureCompleted) return;
      captureCompleted = true;
      if (this.loginTimer) clearTimeout(this.loginTimer);
      this.loginTimer = null;
      if (this.loginCredentialTimer) clearInterval(this.loginCredentialTimer);
      this.loginCredentialTimer = null;
      await context.close().catch(() => {});
      this.loginContext = null;
    };
    context.on('close', () => {
      if (captureCompleted) return;
      if (this.loginTimer) clearTimeout(this.loginTimer);
      if (this.loginCredentialTimer) clearInterval(this.loginCredentialTimer);
      this.loginTimer = null;
      this.loginCredentialTimer = null;
      this.loginContext = null;
    });
    const capturePageStorage = async (page) => {
      try {
        if (captureCompleted) return;
        const pageUrl = new URL(page.url());
        if (pageUrl.host !== upstreamHost) return;
        const token = await page.evaluate(() => {
          const value = localStorage.getItem('token');
          if (!value) return null;
          return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
        });
        if (!token || token === lastStorageToken) return;
        lastStorageToken = token;
        // localStorage 里的 token 同样可能早于站点会话过期：不删除、不中止，交由上游判定。
        const cookies = await context.cookies(this.cfg.upstream.baseUrl);
        const cookie = cookies.map(({ name, value }) => `${name}=${value}`).join('; ');
        if (!cookie) return;
        this.captureAttempts += 1;
        this.lastCapturePath = pageUrl.pathname || '/';
        this.captureHeaders({ authorization: `Bearer ${token}`, cookie });
        this.loginError = null;
      } catch {
        // 忽略页面状态读取失败，保持登录窗口打开。
      }
    };
    const capture = async (request) => {
      try {
        const requestUrl = new URL(request.url());
        const headers = await request.allHeaders();
        const traffic = {
          kind: 'request',
          method: request.method(),
          path: requestUrl.pathname || '/',
          resourceType: typeof request.resourceType === 'function' ? request.resourceType() : null,
          contentType: String(headers['content-type'] || '').split(';', 1)[0] || null,
          hasAuthorization: Boolean(headers.authorization),
          hasCookie: Boolean(headers.cookie),
        };
        if (isProtocolPath(requestUrl.pathname)) {
          traffic.headerNames = Object.keys(headers)
            .filter((name) => name === 'authorization' || name === 'cookie'
              || name.startsWith('oai-') || name.startsWith('openai-')
              || name === 'x-conduit-token' || name === 'origin' || name === 'referer')
            .sort();
        }
        if (isProtocolPath(requestUrl.pathname) && typeof request.postData === 'function') {
          traffic.bodyShape = summarizeProtocolBody(await request.postData().catch(() => null));
        }
        this.recordLoginTraffic(traffic);
        const pathMatch = targetPaths.some((target) => requestUrl.pathname.includes(target));
        const authenticatedSameOrigin = requestUrl.host === upstreamHost && headers.authorization && headers.cookie;
        if (pathMatch || authenticatedSameOrigin) {
          this.captureAttempts += 1;
          this.lastCapturePath = requestUrl.pathname;
        }
        if (!pathMatch && !authenticatedSameOrigin) return;
        if (!headers.authorization || !headers.cookie) return;
        this.captureHeaders(headers);
        this.loginError = null;
        // 普通初始化请求（例如 /user_granular_consent）只能证明凭据存在，
        // 不能结束捕获窗口；等待最终对话响应以保留真实协议摘要。
        if (isFinalCapturePath(requestUrl.pathname)) return;
      } catch {
        // 忽略无关或不完整的请求，保持登录窗口打开。
      }
    };
    const captureResponse = async (response) => {
      try {
        const responseUrl = new URL(response.url());
        if (responseUrl.host !== upstreamHost || !isProtocolPath(responseUrl.pathname)) return;
        const headers = await response.allHeaders();
        const summary = {
          kind: 'response',
          method: response.request().method(),
          path: responseUrl.pathname || '/',
          status: response.status(),
          contentType: String(headers['content-type'] || '').split(';', 1)[0] || null,
        };
        if (typeof response.body === 'function') {
          const body = await response.body().catch(() => null);
          if (body) {
            const bodyText = Buffer.from(body).toString('utf8');
            summary.bodyShape = summary.contentType === 'text/event-stream'
              ? summarizeSseBody(bodyText)
              : summarizeProtocolBody(bodyText);
          }
        }
        this.recordLoginTraffic(summary);
        if (isFinalCapturePath(responseUrl.pathname)) await finishCapture();
      } catch {
        // Ignore responses that disappear while the login context is closing.
      }
    };
    context.on('request', capture);
    context.on('response', captureResponse);
    this.loginTimer = setTimeout(() => {
      this.closeLogin().catch(() => {});
    }, Number(this.cfg.auth?.loginTimeoutMs || 600000));
    const page = context.pages()[0] || await context.newPage();
    if (this.hasUpstreamCredentials()) {
      const stored = this.cfg.upstream.credential;
      const storedCookies = cookieHeaderToPlaywrightCookies(stored.cookie, upstreamOrigin);
      if (storedCookies.length) await context.addCookies(storedCookies).catch(() => {});
      if (stored.bearerToken && typeof page.addInitScript === 'function') {
        await page.addInitScript((token) => {
          try { localStorage.setItem('token', token); } catch {}
        }, stored.bearerToken).catch(() => {});
      }
    }
    await page.addInitScript(() => {
      const installDynamicCodeFallback = () => {
        const button = document.querySelector('#divLogin');
        const input = document.querySelector('#txtCode');
        const message = document.querySelector('#spanMsg');
        if (!button || !input || button.dataset.chattoapiBound === '1') return;
        button.dataset.chattoapiBound = '1';
        button.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          const code = input.value.trim();
          if (!code) {
            if (message) message.textContent = '请输入动态码';
            return;
          }
          button.dataset.chattoapiBusy = '1';
          if (message) message.textContent = '正在验证动态码...';
          try {
            const response = await fetch('/API/Web/User/DynamicCodeLogin', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Code: code },
              body: '{}',
            });
            const result = await response.json();
            if (result.code === 200) {
              const responseToken = result?.token || result?.access_token || result?.accessToken
                || result?.userToken || result?.data?.token || result?.data?.access_token
                || result?.data?.accessToken || result?.data?.userToken;
              if (typeof responseToken === 'string' && responseToken.trim()) {
                localStorage.setItem('token', responseToken.trim());
              }
              if (message) message.textContent = '登录成功，正在打开会话...';
              location.href = '/Web/List.html';
            } else if (message) {
              message.textContent = result.msg || `登录失败（HTTP ${response.status}）`;
            }
          } catch (error) {
            if (message) message.textContent = `网络请求失败: ${error.message}`;
          } finally {
            delete button.dataset.chattoapiBusy;
          }
        }, true);
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installDynamicCodeFallback, { once: true });
      else installDynamicCodeFallback();
    });
    this.loginCredentialTimer = setInterval(() => {
      context.pages().forEach((candidate) => {
        capturePageStorage(candidate).catch(() => {});
        if (aiEntryOpened || openingAiEntry || this.cfg.auth?.autoOpenAiEntry === false) return;
        try {
          const candidateUrl = new URL(candidate.url());
          if (candidateUrl.host !== upstreamHost || !/\/Web\/List\.html$/i.test(candidateUrl.pathname)) return;
          openingAiEntry = true;
          this.openConfiguredAiEntry(candidate).then((opened) => {
            if (opened) aiEntryOpened = true;
          }).catch(() => {}).finally(() => {
            openingAiEntry = false;
          });
        } catch {}
      });
    }, 2000);
    capturePageStorage(page).catch(() => {});
    const navigationTimeoutMs = Math.max(30_000, Number(this.cfg.auth?.loginNavigationTimeoutMs || 60_000));
    // 已有有效加密凭据时先复用 Profile 会话，避免每次协议捕获都要求重新输入动态码。
    const initialUrl = this.hasUpstreamCredentials()
      ? new URL('/Web/List.html', upstreamOrigin).toString()
      : loginUrl;
    page.goto(initialUrl, { waitUntil: 'commit', timeout: navigationTimeoutMs }).catch((error) => {
      if (String(error?.message || '').includes('ERR_ABORTED')) return;
      this.loginError = `无法打开登录页面: ${error.message}`;
      // 保留浏览器上下文，允许用户手动刷新或继续完成登录。
    });
    return { started: true, url: loginUrl, instruction: '请在打开的浏览器中登录；登录成功后会自动打开配置的 AI 入口并捕获认证请求。' };
  }

  async openConfiguredAiEntry(page) {
    if (this.cfg.auth?.autoOpenAiEntry === false || typeof page?.evaluate !== 'function') return false;
    const allowedCars = new Set(['Sorux', 'FakeOAI', 'XYChatGPT', 'OneOpenAI', 'Gemini', 'Grok']);
    const configuredCar = String(this.cfg.upstream?.car || 'Sorux');
    const car = allowedCars.has(configuredCar) ? configuredCar : 'Sorux';
    const actions = [`AutoVIP${car}`, `AutoFree${car}`, `Jump${car}`];
    const candidates = await page.evaluate((targetActions) => targetActions.map((targetAction) => ({
      action: targetAction,
      count: document.querySelectorAll(`[data-action="${targetAction}"]`).length,
      visible: Boolean(document.querySelector(`[data-action="${targetAction}"]`)?.getBoundingClientRect().width),
    })), actions).catch(() => []);
    const selected = candidates.find(({ count, visible }) => count === 1 && visible);
    if (!selected) {
      this.lastAiEntryAction = `none:${candidates.map(({ action, count, visible }) => `${action}:${count}:${visible ? 'visible' : 'hidden'}`).join(',')}`;
      this.lastAiEntryUrl = page.url();
      const fallbackAction = `AutoFree${car}`;
      const fallbackInvoked = await page.evaluate((targetAction) => {
        if (typeof window.autoCarLogin !== 'function') return false;
        window.autoCarLogin(targetAction);
        return true;
      }, fallbackAction).catch(() => false);
      if (fallbackInvoked) {
        this.lastAiEntryAction = `fallback:${fallbackAction}`;
        return true;
      }
      return false;
    }
    if (typeof page.waitForSelector === 'function') {
      const ready = await page.waitForSelector(`[data-action="${selected.action}"]`, { state: 'visible', timeout: 15000 })
        .then(() => true).catch(() => false);
      if (!ready) {
        this.lastAiEntryAction = `wait-failed:${selected.action}`;
        this.lastAiEntryUrl = page.url();
        return false;
      }
    }
    const clicked = await page.evaluate((targetAction) => {
      const target = document.querySelector(`[data-action="${targetAction}"]`);
      if (!target || !target.getBoundingClientRect().width) return false;
      target.click();
      return true;
    }, selected.action).catch(() => false);
    this.lastAiEntryAction = clicked ? selected.action : `click-failed:${selected.action}`;
    this.lastAiEntryUrl = page.url();
    return clicked;
  }

  async submitDynamicCode(code) {
    const value = String(code || '').trim();
    if (!value) throw new Error('动态码不能为空');
    if (!this.loginContext) throw new Error('登录浏览器未启动，请先调用 /auth/login');
    const upstreamOrigin = new URL(this.cfg.upstream.baseUrl).origin;
    const upstreamHost = new URL(upstreamOrigin).host;
    const page = this.loginContext.pages().find((candidate) => {
      try { return new URL(candidate.url()).host === upstreamHost; } catch { return false; }
    }) || this.loginContext.pages()[0];
    if (!page) throw new Error('登录页面不可用，请重新调用 /auth/login?force=1');
    const timeoutMs = Math.max(1000, Number(this.cfg.auth?.loginCodeTimeoutMs || 15000));
    const pageUrl = page.url();
    const referer = pageUrl.startsWith('http://') || pageUrl.startsWith('https://')
      ? pageUrl
      : `${upstreamOrigin}/Web/Login.html`;
    const endpoint = new URL('/API/Web/User/DynamicCodeLogin', upstreamOrigin);
    let result;
    if (typeof page.evaluate === 'function') {
      // 复用 Chromium 的网络代理和同源 Cookie，避免 Node fetch 在 Windows 上直连超时。
      try {
        if (!pageUrl.startsWith('http://') && !pageUrl.startsWith('https://')) {
          await page.goto(`${upstreamOrigin}/Web/Login.html`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        }
        result = await page.evaluate(async ({ endpoint: requestUrl, code, requestTimeoutMs }) => {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
          try {
            const response = await fetch(requestUrl, {
              method: 'POST',
              headers: { Accept: 'application/json', 'Content-Type': 'application/json', Code: code },
              body: '{}',
              credentials: 'include',
              signal: controller.signal,
            });
            let payload = null;
            try { payload = await response.json(); } catch {}
            return { httpStatus: response.status, code: payload?.code, msg: payload?.msg || '', payload };
          } catch (error) {
            return { httpStatus: 0, code: null, msg: `网络请求失败: ${error.name === 'AbortError' ? '请求超时' : error.message}` };
          } finally {
            clearTimeout(timer);
          }
        }, { endpoint: endpoint.toString(), code: value, requestTimeoutMs: timeoutMs });
      } catch (error) {
        result = { httpStatus: 0, code: null, msg: `网络请求失败: ${error.name === 'TimeoutError' ? '请求超时' : error.message}` };
      }
    } else {
      // 仅供无浏览器的单元测试或嵌入式调用使用；正式登录优先走上面的页面请求。
      try {
        const existingCookies = await this.loginContext.cookies(endpoint.toString());
        const cookieHeader = existingCookies.map(({ name, value: cookieValue }) => `${name}=${cookieValue}`).join('; ');
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Code: value,
            ...(cookieHeader ? { Cookie: cookieHeader } : {}),
            Referer: referer,
            Origin: upstreamOrigin,
            'User-Agent': this.cfg.upstream.headers?.['user-agent'] || 'Mozilla/5.0',
          },
          body: '{}',
          signal: AbortSignal.timeout(timeoutMs),
        });
        let payload = null;
        try { payload = await response.json(); } catch {}
        result = { httpStatus: response.status, code: payload?.code, msg: payload?.msg || '', payload };
      } catch (error) {
        result = { httpStatus: 0, code: null, msg: `网络请求失败: ${error.name === 'TimeoutError' ? '请求超时' : error.message}` };
      }
    }
    if (result.code === 200) {
      const payloadKeys = result.payload && typeof result.payload === 'object'
        ? Object.keys(result.payload).slice(0, 20)
        : [];
      const dataKeys = result.payload?.data && typeof result.payload.data === 'object'
        ? Object.keys(result.payload.data).slice(0, 20)
        : [];
      this.loginProtocol = {
        dynamicHttpStatus: result.httpStatus,
        dynamicBusinessCode: result.code,
        payloadKeys,
        dataKeys,
      };
      try {
        const cookiesAfterLogin = await this.loginContext.cookies(endpoint.toString());
        this.loginProtocol.cookieCount = cookiesAfterLogin.length;
        this.loginProtocol.cookieNames = cookiesAfterLogin.map(({ name }) => name).slice(0, 30);
      } catch {}
      const responseToken = tokenFromPayload(result.payload);
      if (responseToken && typeof page.evaluate === 'function') {
        try {
          await page.evaluate((token) => localStorage.setItem('token', token), responseToken);
        } catch {}
      }
      if (responseToken) {
        try {
          const cookies = await this.loginContext.cookies(endpoint.toString());
          const cookie = cookies.map(({ name, value: cookieValue }) => `${name}=${cookieValue}`).join('; ');
          if (cookie) {
            this.captureHeaders({ authorization: `Bearer ${responseToken}`, cookie });
            await this.closeLogin();
            return { ok: true, message: '登录成功，凭据已加密保存' };
          }
        } catch (error) {
          this.loginError = error.message;
        }
      }
      // 成功响应没有直接带完整凭据时，进入站点列表页触发认证请求；不要 reload 回扫码页。
      await page.goto(`${upstreamOrigin}/Web/List.html`, { waitUntil: 'commit', timeout: 60000 }).catch(() => {});
      await this.openConfiguredAiEntry(page);
      const captureWaitMs = Math.max(15000, Math.min(60000, Number(this.cfg.auth?.captureWaitMs || 30000)));
      const captureDeadline = Date.now() + captureWaitMs;
      while (Date.now() < captureDeadline && !this.hasUpstreamCredentials()) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return {
        ok: true,
        message: this.hasUpstreamCredentials() ? '登录成功，凭据已加密保存' : '登录成功，正在捕获凭据',
      };
    }
    return { ok: false, message: result.msg || `登录失败（HTTP ${result.httpStatus}）` };
  }

  async closeLogin() {
    if (this.loginTimer) clearTimeout(this.loginTimer);
    this.loginTimer = null;
    if (this.loginCredentialTimer) clearInterval(this.loginCredentialTimer);
    this.loginCredentialTimer = null;
    if (!this.loginContext) return;
    await this.loginContext.close().catch(() => {});
    this.loginContext = null;
  }
}

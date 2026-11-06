import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { log } from './logger.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UI_DIR = path.join(PROJECT_ROOT, 'src', 'ui');
const SESSION_COOKIE = 'chattoapi_ui';
const DEFAULT_SESSION_TTL_MS = 28800000;
const UI_HEADERS = {
  'content-security-policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cache-control': 'no-store',
};
const ASSETS = new Map([
  ['/ui', ['index.html', 'text/html; charset=utf-8']],
  ['/ui/app.css', ['app.css', 'text/css; charset=utf-8']],
  ['/ui/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/ui/lib.js', ['lib.js', 'text/javascript; charset=utf-8']],
]);

function openAiError(message, type = 'invalid_request_error', code = null) {
  return { error: { message, type, param: null, code } };
}

function writeJson(res, status, body) {
  res.writeHead(status, {
    ...UI_HEADERS,
    'content-type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(body));
}

function digest(value) {
  return crypto.createHash('sha256').update(value).digest();
}

function timingSafeMatch(left, right) {
  const leftDigest = digest(left);
  const rightDigest = digest(right);
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

function isLoopback(req) {
  const address = req.socket.remoteAddress;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    // 畸形转义（例如 "%"）会让 decodeURIComponent 抛 URIError；
    // 必须吞掉，否则任意回环请求都能让服务进程崩溃。
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function runDirectory(cfg) {
  const dataDir = path.resolve(PROJECT_ROOT, cfg?.auth?.dataDir || 'data');
  return path.join(path.dirname(dataDir), '.chattoapi-run');
}

function configuredPort(cfg) {
  return Number(process.env.CHATTOAPI_PORT || cfg?.port || 8787);
}

export function resolveUiToken(cfg) {
  if (cfg?.ui?.enabled === false) return null;
  return process.env.CHATTOAPI_UI_TOKEN || crypto.randomBytes(24).toString('base64url');
}

export function writeUiTokenFile(cfg, token) {
  if (!token) return;
  const directory = runDirectory(cfg);
  const filePath = path.join(directory, 'ui-token');
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(filePath, token, { encoding: 'utf8', mode: 0o600 });
    if (process.platform === 'win32') {
      const username = process.env.USERNAME || process.env.USER;
      if (!username) return;
      try {
        execFileSync('icacls', [filePath, '/inheritance:r', '/grant:r', `${username}:F`], { stdio: 'ignore' });
      } catch {
        log.warn('icacls failed while securing the UI token file');
      }
    } else {
      fs.chmodSync(filePath, 0o600);
    }
  } catch (error) {
    log.warn('failed to write UI token file', error.code);
  }
}

export function removeUiTokenFile(cfg) {
  try {
    fs.unlinkSync(path.join(runDirectory(cfg), 'ui-token'));
  } catch {}
}

export function createUiHandler({ cfg, token }) {
  const enabled = Boolean(token);
  const sessionTtlMs = Number(cfg?.ui?.sessionTtlMs || DEFAULT_SESSION_TTL_MS);
  const sessionValue = enabled
    ? crypto.createHmac('sha256', crypto.randomBytes(32)).update(crypto.randomBytes(32)).digest('base64url')
    : null;
  let sessionExpiresAt = 0;

  function verifySession(req) {
    if (!enabled || !sessionValue || Date.now() >= sessionExpiresAt) return false;
    const cookie = readCookie(req, SESSION_COOKIE);
    return Boolean(cookie) && timingSafeMatch(cookie, sessionValue);
  }

  function sameOrigin(req) {
    const host = String(req.headers.host || '').toLowerCase();
    const port = configuredPort(cfg);
    const allowedHosts = new Set([
      `127.0.0.1:${port}`,
      `localhost:${port}`,
      `[::1]:${port}`,
    ]);
    if (!allowedHosts.has(host)) return false;
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host.toLowerCase() === host;
    } catch {
      return false;
    }
  }

  function verifyWrite(req) {
    return verifySession(req)
      && req.headers['x-chattoapi-ui'] === '1'
      && sameOrigin(req);
  }

  function handle(req, res, url, method) {
    if (!url.pathname.startsWith('/ui')) return false;
    if (!isLoopback(req) || !sameOrigin(req)) {
      writeJson(res, 404, openAiError('Not Found', 'invalid_request_error', 404));
      return true;
    }

    if (method === 'GET' && url.pathname === '/ui') {
      const requestedToken = url.searchParams.get('t');
      if (requestedToken && enabled && timingSafeMatch(requestedToken, token)) {
        sessionExpiresAt = Date.now() + sessionTtlMs;
        res.writeHead(303, {
          ...UI_HEADERS,
          location: '/ui',
          'set-cookie': `${SESSION_COOKIE}=${encodeURIComponent(sessionValue)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.max(1, Math.floor(sessionTtlMs / 1000))}`,
        });
        res.end();
        return true;
      }
      if (!verifySession(req)) {
        writeJson(res, 404, openAiError('Not Found', 'invalid_request_error', 404));
        return true;
      }
    }

    const asset = ASSETS.get(url.pathname);
    if (method !== 'GET' || !asset || !verifySession(req)) {
      writeJson(res, 404, openAiError('Not Found', 'invalid_request_error', 404));
      return true;
    }

    try {
      const body = fs.readFileSync(path.join(UI_DIR, asset[0]));
      res.writeHead(200, { ...UI_HEADERS, 'content-type': asset[1] });
      res.end(body);
    } catch (error) {
      log.error(error.code);
      writeJson(res, 500, openAiError('Unable to read UI asset', 'api_error', 500));
    }
    return true;
  }

  return { enabled, handle, verifySession, verifyWrite, sameOrigin };
}

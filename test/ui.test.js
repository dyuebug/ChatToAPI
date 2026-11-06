import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../src/server.js';
import { resolveUiToken } from '../src/ui-server.js';

let currentApiKey = 'ctk_initial_test';
let rotateCalls = 0;
let startLoginCalls = 0;
const fakeCredentials = {
  verifyApiKey: (key) => key === currentApiKey,
  verifyRotationToken: (token) => token === 'test-rotate-token',
  rotateApiKey: () => {
    rotateCalls += 1;
    currentApiKey = `ctk_rotated_${rotateCalls}`;
    return currentApiKey;
  },
  status: () => ({ loggedIn: false, apiKeyConfigured: true }),
  closeLogin: async () => {},
  startLogin: async () => {
    startLoginCalls += 1;
    return { started: true };
  },
};

const cfg = {
  host: '127.0.0.1',
  port: 0,
  ui: { enabled: true, sessionTtlMs: 28800000 },
  auth: { requireApiKey: true, dataDir: 'data' },
};
const server = createServer(cfg, { credentials: fakeCredentials, uiToken: 'test-ui-token' });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
cfg.port = port;
const base = `http://127.0.0.1:${port}`;

async function request(path, options = {}) {
  return fetch(`${base}${path}`, { redirect: 'manual', ...options });
}

function requestWithHost(path, host, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
      headers: { ...headers, host },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

function sessionCookie(response) {
  const value = response.headers.get('set-cookie');
  assert.ok(value);
  return value.split(';', 1)[0];
}

try {
  const noCookie = await request('/ui');
  assert.equal(noCookie.status, 404);
  assert.doesNotMatch(noCookie.headers.get('content-type') || '', /html/i);

  const wrongToken = await request('/ui?t=wrong');
  assert.equal(wrongToken.status, 404);
  assert.equal(wrongToken.headers.get('set-cookie'), null);

  const tokenResponse = await request('/ui?t=test-ui-token');
  assert.equal(tokenResponse.status, 303);
  assert.equal(tokenResponse.headers.get('location'), '/ui');
  const cookie = sessionCookie(tokenResponse);
  assert.match(tokenResponse.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(tokenResponse.headers.get('set-cookie'), /SameSite=Strict/i);

  const html = await request('/ui', { headers: { cookie } });
  assert.equal(html.status, 200);
  assert.match(html.headers.get('content-type') || '', /html/i);
  assert.match(html.headers.get('content-security-policy') || '', /default-src 'none'/);
  assert.match(html.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal(html.headers.get('x-frame-options'), 'DENY');
  assert.equal(html.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(html.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(html.headers.get('cache-control'), 'no-store');

  const noStaticCookie = await request('/ui/app.js');
  assert.equal(noStaticCookie.status, 404);
  const staticWithCookie = await request('/ui/app.js', { headers: { cookie } });
  assert.equal(staticWithCookie.status, 200);
  assert.match(staticWithCookie.headers.get('content-type') || '', /javascript/);

  const spoofedHost = await requestWithHost('/ui', `evil.example:${port}`, { cookie });
  assert.equal(spoofedHost.status, 404);

  // 畸形百分号转义会让 decodeURIComponent 抛错；必须降级为 404 而不是崩溃进程。
  const malformedCookie = await request('/ui', { headers: { cookie: 'chattoapi_ui=%' } });
  assert.equal(malformedCookie.status, 404);
  const aliveAfterMalformed = await request('/ui', { headers: { cookie } });
  assert.equal(aliveAfterMalformed.status, 200);

  const missingUiHeader = await request('/auth/key/rotate', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: 'rotate' }),
  });
  assert.equal(missingUiHeader.status, 403);
  assert.equal(rotateCalls, 0);

  const masterRotation = await request('/auth/key/rotate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-chattoapi-rotate': 'test-rotate-token' },
    body: JSON.stringify({ confirm: 'rotate' }),
  });
  assert.equal(masterRotation.status, 200);

  currentApiKey = 'ctk_initial_test';
  const oldKey = currentApiKey;
  const uiRotation = await request('/auth/key/rotate', {
    method: 'POST',
    headers: { cookie, 'x-chattoapi-ui': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: 'rotate' }),
  });
  assert.equal(uiRotation.status, 200);
  assert.equal(uiRotation.headers.get('cache-control'), 'no-store');
  const uiRotationBody = await uiRotation.json();
  assert.match(uiRotationBody.apiKey, /^ctk_[A-Za-z0-9_-]+$/);
  assert.equal((await request('/v1/models', { headers: { authorization: `Bearer ${oldKey}` } })).status, 401);
  assert.equal((await request('/v1/models', { headers: { authorization: `Bearer ${uiRotationBody.apiKey}` } })).status, 200);

  const blockedLogin = await request('/auth/login', {
    headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'image' },
  });
  assert.equal(blockedLogin.status, 403);
  assert.equal(startLoginCalls, 0);

  const allowedLogin = await request('/auth/login', {
    headers: { 'sec-fetch-site': 'none', 'sec-fetch-dest': 'document' },
  });
  assert.equal(allowedLogin.status, 200);
  assert.equal(startLoginCalls, 1);

  const sameOriginFetchLogin = await request('/auth/login', {
    method: 'POST',
    headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'empty' },
  });
  assert.equal(sameOriginFetchLogin.status, 200);
  assert.equal(startLoginCalls, 2);

  const previousToken = process.env.CHATTOAPI_UI_TOKEN;
  process.env.CHATTOAPI_UI_TOKEN = 'env-ui-token';
  assert.equal(resolveUiToken({ ui: { enabled: true } }), 'env-ui-token');
  delete process.env.CHATTOAPI_UI_TOKEN;
  assert.equal(resolveUiToken({ ui: { enabled: false } }), null);
  if (previousToken === undefined) delete process.env.CHATTOAPI_UI_TOKEN;
  else process.env.CHATTOAPI_UI_TOKEN = previousToken;

  const disabledCfg = { ...cfg, port: 0, ui: { enabled: false } };
  const disabledServer = createServer(disabledCfg, { credentials: fakeCredentials, uiToken: null });
  await new Promise((resolve) => disabledServer.listen(0, '127.0.0.1', resolve));
  const disabledPort = disabledServer.address().port;
  try {
    assert.equal((await fetch(`http://127.0.0.1:${disabledPort}/ui`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${disabledPort}/ui?t=anything`)).status, 404);
  } finally {
    await new Promise((resolve) => disabledServer.close(resolve));
  }

  // 前端脚本引用的 DOM id 必须与静态外壳一致，否则 refs 为 null 会在运行时中断。
  const { readFileSync } = await import('node:fs');
  const uiRoot = new URL('../src/ui/', import.meta.url);
  const htmlSource = readFileSync(new URL('index.html', uiRoot), 'utf8');
  const scriptSource = readFileSync(new URL('app.js', uiRoot), 'utf8');
  const referencedIds = [...scriptSource.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map((match) => match[1]);
  const missingIds = referencedIds.filter((id) => !htmlSource.includes(`id="${id}"`));
  assert.deepEqual(missingIds, []);

  // refs.<name> 必须先声明；删除元素引用时若漏改调用点，运行期才会抛错。
  const declaredRefs = new Set(
    [...scriptSource.matchAll(/([A-Za-z0-9_]+):\s*(?:\$\(|document\.)/g)].map((match) => match[1]),
  );
  const usedRefs = new Set([...scriptSource.matchAll(/refs\.([A-Za-z0-9_]+)/g)].map((match) => match[1]));
  const undeclaredRefs = [...usedRefs].filter((name) => !declaredRefs.has(name));
  assert.deepEqual(undeclaredRefs, []);

  console.log('PASS: local UI gateway, session security, dual-channel rotation, and login-source checks');
} finally {
  await new Promise((resolve) => server.close(resolve));
}

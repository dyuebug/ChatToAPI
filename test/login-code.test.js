import assert from 'node:assert/strict';
import http from 'node:http';
import { CredentialManager } from '../src/credentials.js';

let requestPath = '';
let requestReferer = '';
const upstream = http.createServer((req, res) => {
  requestPath = req.url;
  requestReferer = req.headers.referer || '';
  if (req.headers.code === 'success') {
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': 'session=ok; Path=/' });
    res.end(JSON.stringify({ code: 200, data: { token: 'header.payload.signature' } }));
  } else {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 500, msg: '动态码错误' }));
  }
});

await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const { port } = upstream.address();
const page = {
  url: () => 'about:blank',
  reload: async () => {},
};
const manager = Object.create(CredentialManager.prototype);
manager.cfg = {
  upstream: { baseUrl: `http://127.0.0.1:${port}`, headers: { 'user-agent': 'test-agent' } },
  auth: { loginCodeTimeoutMs: 3000 },
};
manager.loginContext = {
  pages: () => [page],
  cookies: async () => [],
  addCookies: async () => {},
};

try {
  const result = await manager.submitDynamicCode('test-code');
  assert.deepEqual(result, { ok: false, message: '动态码错误' });
  assert.equal(requestPath, '/API/Web/User/DynamicCodeLogin');
  assert.equal(requestReferer, `http://127.0.0.1:${port}/Web/Login.html`);

  const browserPage = {
    url: () => `http://127.0.0.1:${port}/Web/Login.html`,
    evaluate: (fn, args) => fn(args),
    reload: async () => {},
  };
  const browserManager = Object.create(CredentialManager.prototype);
  browserManager.cfg = manager.cfg;
  browserManager.loginContext = { pages: () => [browserPage] };
  const browserResult = await browserManager.submitDynamicCode('test-code');
  assert.deepEqual(browserResult, { ok: false, message: '动态码错误' });

  let closed = false;
  const successPage = {
    url: () => `http://127.0.0.1:${port}/Web/Login.html`,
    evaluate: (fn, args) => fn(args),
    reload: async () => {},
  };
  const successManager = Object.create(CredentialManager.prototype);
  successManager.cfg = manager.cfg;
  successManager.state = {};
  successManager.save = () => {};
  successManager.loginContext = {
    pages: () => [successPage],
    cookies: async () => [{ name: 'session', value: 'ok' }],
    close: async () => { closed = true; },
  };
  const successResult = await successManager.submitDynamicCode('success');
  assert.deepEqual(successResult, { ok: true, message: '登录成功，凭据已加密保存' });
  assert.equal(successManager.state.upstream.credential.cookie, 'session=ok');
  assert.equal(closed, true);
  console.log('PASS: dynamic code works before page navigation');
} finally {
  await new Promise((resolve) => upstream.close(resolve));
}

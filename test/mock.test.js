// Self-test harness: spins a mock conduit upstream (emits the same SSE shape you captured)
// + the real local OpenAI server pointed at the mock, and verifies translation.
import http from 'node:http';
import { createServer } from '../src/server.js';

// 1) config with mock upstream + dummy creds
const mockCfg = {
  host: '127.0.0.1', port: 8799, logLevel: 'debug',
  auth: { requireApiKey: true },
  upstream: {
    baseUrl: 'http://127.0.0.1:8899',
    conversationPath: '/backend-api/f/conversation',
    car: 'Sorux',
    credential: { cookie: 'user_id=test', bearerToken: 'dummy' },
    headers: {},
  },
};

// 2) mock upstream: parses request, streams back conduit-shaped SSE
let observedPrompt = '';
const mock = http.createServer((req, res) => {
  let b = '';
  req.on('data', c => b += c);
  req.on('end', () => {
    try {
      const j = JSON.parse(b);
      observedPrompt = j.messages?.[0]?.content?.parts?.[0] || '';
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const push = (ev, data) => { if (ev) res.write(`event: ${ev}\ndata: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`); else res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`); };
      push('delta_encoding', '"v1"');
      push('delta', { c: 0, o: 'add', p: '', v: { conversation_id: 'cid-1', message: { id: 'm1', author: { role: 'assistant' }, content: { content_type: 'text', parts: [''] } } } });
      // content append (like "你好") — use mojibake-safe ascii
      push('delta', { o: 'append', p: '/message/content/parts/0', v: '你' });
      push('delta', { c: 1, o: 'append', p: '/message/content/parts/0', v: '好' });
      // omitted o/p -> inherit last {o:append,p:/message/content/parts/0}
      push('delta', { c: 2, v: '世界' });
      // status patch (ignored)
      push('delta', { o: 'patch', p: '', v: [{ o: 'replace', p: '/message/status', v: 'finished_successfully' }, { o: 'replace', p: '/message/end_turn', v: true }] });
      push(null, { conversation_id: 'cid-1', type: 'message_stream_complete' });
      res.end('data: [DONE]\n\n');
    } catch (e) { res.writeHead(500); res.end(e.message); }
  });
});
mock.listen(8899, '127.0.0.1', () => console.error('mock upstream on 8899'));

// 3) real server against mock
let forcedLoginClosures = 0;
let submittedDynamicCode = '';
let currentApiKey = 'ctk_test';
const fakeCredentials = {
  verifyApiKey: (key) => key === currentApiKey,
  rotateApiKey: () => { currentApiKey = 'ctk_rotated_test'; return currentApiKey; },
  verifyRotationToken: (token) => token === 'test-rotate-token',
  status: () => ({ loggedIn: true, apiKeyConfigured: true, loginInProgress: false }),
  closeLogin: async () => { forcedLoginClosures += 1; },
  startLogin: async () => ({ started: true }),
  submitDynamicCode: async (code) => { submittedDynamicCode = code; return { ok: true, message: '登录成功，正在捕获凭据' }; },
};
const srv = createServer(mockCfg, { credentials: fakeCredentials });
srv.listen(8799, '127.0.0.1', async () => {
  console.error('local server on 8799');
  const unauthorized = await fetch('http://127.0.0.1:8799/v1/models');
  if (unauthorized.status !== 401) {
    console.error(`FAIL: expected 401 without API key, got ${unauthorized.status}`);
    mock.close(); srv.close(); process.exit(1);
  }
  const login = await fetch('http://127.0.0.1:8799/auth/login?force=1');
  if (login.status !== 200 || forcedLoginClosures !== 1) {
    console.error(`FAIL: force login route status=${login.status} closures=${forcedLoginClosures}`);
    mock.close(); srv.close(); process.exit(1);
  }
  const form = await fetch('http://127.0.0.1:8799/auth/login/form');
  const formHtml = await form.text();
  if (form.status !== 200 || !formHtml.includes('/auth/login/code') || !formHtml.includes('/auth/status')) {
    console.error(`FAIL: login form status=${form.status}`);
    mock.close(); srv.close(); process.exit(1);
  }
  const codeResponse = await fetch('http://127.0.0.1:8799/auth/login/code', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'test-code' }),
  });
  if (codeResponse.status !== 200 || submittedDynamicCode !== 'test-code') {
    console.error(`FAIL: login code status=${codeResponse.status}`);
    mock.close(); srv.close(); process.exit(1);
  }
  const missingRotateHeader = await fetch('http://127.0.0.1:8799/auth/key/rotate', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ confirm: 'rotate' }),
  });
  const missingRotateHeaderBody = await missingRotateHeader.json();
  const rotateTokenError = 'X-ChatToAPI-Rotate must carry the local master key token';
  if (missingRotateHeader.status !== 403 || missingRotateHeaderBody.error?.message !== rotateTokenError) {
    console.error(`FAIL: missing rotate header status=${missingRotateHeader.status}`);
    mock.close(); srv.close(); process.exit(1);
  }
  const wrongRotateToken = await fetch('http://127.0.0.1:8799/auth/key/rotate', {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-ChatToAPI-Rotate': '1' }, body: JSON.stringify({ confirm: 'rotate' }),
  });
  if (wrongRotateToken.status !== 403) {
    console.error(`FAIL: wrong rotate token status=${wrongRotateToken.status}`);
    mock.close(); srv.close(); process.exit(1);
  }
  console.error('PASS: key rotation requires the local master key token');
  const missingConfirm = await fetch('http://127.0.0.1:8799/auth/key/rotate', {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-ChatToAPI-Rotate': 'test-rotate-token' }, body: JSON.stringify({}),
  });
  const missingConfirmBody = await missingConfirm.json();
  if (missingConfirm.status !== 400 || missingConfirmBody.error?.message !== 'confirm must be "rotate"') {
    console.error(`FAIL: missing rotate confirmation status=${missingConfirm.status}`);
    mock.close(); srv.close(); process.exit(1);
  }
  console.error('PASS: key rotation requires explicit confirmation');
  const oldApiKey = currentApiKey;
  const rotated = await fetch('http://127.0.0.1:8799/auth/key/rotate', {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-ChatToAPI-Rotate': 'test-rotate-token' }, body: JSON.stringify({ confirm: 'rotate' }),
  });
  const rotatedBody = await rotated.json();
  if (rotated.status !== 200 || typeof rotatedBody.apiKey !== 'string' || !rotatedBody.apiKey.startsWith('ctk_') ||
      rotated.headers.get('cache-control') !== 'no-store' ||
      typeof rotatedBody.createdAt !== 'string' || Number.isNaN(Date.parse(rotatedBody.createdAt)) ||
      new Date(rotatedBody.createdAt).toISOString() !== rotatedBody.createdAt) {
    console.error(`FAIL: key rotation response status=${rotated.status}`);
    mock.close(); srv.close(); process.exit(1);
  }
  const newKeyModels = await fetch('http://127.0.0.1:8799/v1/models', {
    headers: { authorization: `Bearer ${rotatedBody.apiKey}` },
  });
  const oldKeyModels = await fetch('http://127.0.0.1:8799/v1/models', {
    headers: { authorization: `Bearer ${oldApiKey}` },
  });
  if (newKeyModels.status !== 200 || oldKeyModels.status !== 401) {
    console.error(`FAIL: rotated key authentication new=${newKeyModels.status} old=${oldKeyModels.status}`);
    mock.close(); srv.close(); process.exit(1);
  }
  console.error('PASS: key rotation returns API key + ISO timestamp; new key accepted, old key rejected');
  const body = JSON.stringify({ model: 'gpt-5.5-mini', stream: true, messages: [
    { role: 'system', content: 'be concise' },
    { role: 'user', content: 'first question' },
    { role: 'assistant', content: 'first answer' },
    { role: 'user', content: 'hello' },
  ] });
  const r = await fetch('http://127.0.0.1:8799/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${currentApiKey}` }, body });
  const text = await r.text();
  console.error('--- RAW SSE ---');
  console.error(text);
  console.error('--- END ---');
  const got = [...text.matchAll(/"delta":\{"content":"([^"]*)"/g)].map(m => m[1]).join('');
  const expect = got === '你好世界';
  const hasDone = text.includes('[DONE]');
  const hasContext = observedPrompt.includes('[system]\nbe concise') && observedPrompt.includes('[assistant]\nfirst answer');
  console.error(expect && hasDone && hasContext ? 'PASS: stream translated + context preserved' : `FAIL: got="${got}" context=${hasContext}`);
  mock.close(); srv.close(); process.exit(expect && hasDone && hasContext ? 0 : 1);
});

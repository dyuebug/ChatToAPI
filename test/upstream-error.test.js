import assert from 'node:assert/strict';
import http from 'node:http';
import { streamCompletion } from '../src/upstream.js';
import { createServer } from '../src/server.js';

const upstream = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: '还未登录' }));
});
await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));
const { port } = upstream.address();
const cfg = {
  upstream: {
    baseUrl: `http://127.0.0.1:${port}`,
    conversationPath: '/backend-api/f/conversation',
    requestTimeoutMs: 3000,
    credential: { cookie: 'x=y', bearerToken: 'test-token' },
    headers: {},
  },
};

try {
  await assert.rejects(
    streamCompletion({ cfg, model: 'gpt-5.5-mini', text: 'test' }),
    (error) => error.status === 401 && error.upstreamBody.includes('还未登录'),
  );
  console.log('PASS: upstream 200 auth error maps to 401');
} finally {
  await new Promise((resolve) => upstream.close(resolve));
}

let requests = [];
const fallbackUpstream = http.createServer((req, res) => {
  requests.push(req.url);
  if (req.url === '/backend-api/f/conversation') {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ detail: 'api mode not supported' }));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  res.end([
    'event: delta_encoding',
    'data: "v1"',
    '',
    'event: delta',
    'data: {"o":"append","p":"/message/content/parts/0","v":"OK"}',
    '',
    'data: {"type":"message_stream_complete"}',
    '',
    'data: [DONE]',
    '',
  ].join('\n'));
});
await new Promise((resolve) => fallbackUpstream.listen(0, '127.0.0.1', resolve));
const fallbackPort = fallbackUpstream.address().port;
const fallbackCfg = {
  upstream: {
    baseUrl: `http://127.0.0.1:${fallbackPort}`,
    conversationPath: '/backend-api/f/conversation',
    conversationFallbackPath: '/backend-api/conversation',
    requestTimeoutMs: 3000,
    credential: { cookie: 'x=y', bearerToken: 'test-token' },
    headers: {},
  },
};
try {
  let content = '';
  await streamCompletion({
    cfg: fallbackCfg,
    model: 'test-model',
    text: 'test',
    onContent: (chunk) => { content += chunk; },
  });
  assert.equal(content, 'OK');
  assert.deepEqual(requests, ['/backend-api/f/conversation', '/backend-api/conversation']);
  console.log('PASS: api mode unsupported falls back to legacy conversation endpoint');
} finally {
  await new Promise((resolve) => fallbackUpstream.close(resolve));
}

const authErrorUpstream = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: '还未登录' }));
});
await new Promise((resolve) => authErrorUpstream.listen(0, '127.0.0.1', resolve));
const authErrorPort = authErrorUpstream.address().port;
let invalidated = 0;
const authErrorCfg = {
  auth: { requireApiKey: false },
  upstream: {
    baseUrl: `http://127.0.0.1:${authErrorPort}`,
    conversationPath: '/backend-api/conversation',
    requestTimeoutMs: 3000,
    credential: { cookie: 'x=y', bearerToken: 'test-token' },
    headers: {},
  },
};
const authErrorServer = createServer(authErrorCfg, {
  credentials: { invalidateUpstream: () => { invalidated += 1; } },
});
await new Promise((resolve) => authErrorServer.listen(0, '127.0.0.1', resolve));
const authErrorLocalPort = authErrorServer.address().port;
try {
  const response = await fetch(`http://127.0.0.1:${authErrorLocalPort}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'test-model', stream: false, messages: [{ role: 'user', content: 'test' }] }),
  });
  const payload = await response.json();
  assert.equal(response.status, 401);
  assert.equal(payload.error.type, 'authentication_error');
  assert.equal(invalidated, 1);
  console.log('PASS: upstream auth error maps to HTTP 401 and invalidates credentials');
} finally {
  await new Promise((resolve) => authErrorServer.close(resolve));
  await new Promise((resolve) => authErrorUpstream.close(resolve));
}

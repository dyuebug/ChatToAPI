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
    stations: {
      Sorux: { car: 'Sorux' },
      OneOpenAI: {
        car: 'OneOpenAI',
        thinkingEffort: 'min',
        exposeReasoning: false,
        autoFallback: true,
        fallbackModels: ['gpt-6.1-terra-wm', 'gpt-6-sol-wm', 'gpt-5.6-sol-wm'],
        capacityOnce: false,
      },
    },
  },
};

// 2) mock upstream: Sorux 走现有 conduit 形状；Work 走 Patch + 工具活动形状。
let observedPrompt = '';
let observedWorkBody = null;
function writeWorkSse(res) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const push = (data) => res.write(`event: delta\ndata: ${JSON.stringify(data)}\n\n`);
  res.write('event: delta_encoding\ndata: "v1"\n\n');
  push({ o: 'append', p: '/message/content/parts/0', v: '计' });
  push({ o: 'append', p: '/message/content/thoughts/0/summary', v: 'thinking' });
  push({ o: 'append', p: '/message/metadata/dil_v2_reasoning/appData/items', v: [{ id: 'exec-1', type: 'command_execution', label: 'run command', isActive: true, icon: { name: 'run-command' } }] });
  push({ o: 'replace', p: '/message/content/parts/0', v: '计算' });
  push({ o: 'append', p: '/message/metadata/dil_v2_reasoning/appData/items', v: [{ id: 'exec-1', type: 'command_execution', label: 'run command', isActive: false, icon: { name: 'run-command' } }] });
  push({ type: 'server_ste_metadata', tool_invoked: true, model_slug: 'gpt-6.1-terra-wm', turn_use_case: 'work' });
  push({ type: 'message_stream_complete' });
  res.end('data: [DONE]\n\n');
}
function writeWorkRewriteSse(res, { remove = false } = {}) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const push = (data) => res.write(`event: delta\ndata: ${JSON.stringify(data)}\n\n`);
  res.write('event: delta_encoding\ndata: "v1"\n\n');
  push({ o: 'add', p: '/message/content/parts/0', v: 'draft' });
  push(remove
    ? { o: 'remove', p: '/message/content/parts/0' }
    : { o: 'replace', p: '/message/content/parts/0', v: 'final answer' });
  push({ type: 'message_stream_complete' });
  res.end('data: [DONE]\n\n');
}
const mock = http.createServer((req, res) => {
  let b = '';
  req.on('data', c => b += c);
  req.on('end', () => {
    try {
      const j = JSON.parse(b);
      if (typeof j.model === 'string' && j.model.endsWith('-wm')) {
        observedWorkBody = j;
        const prompt = j.messages?.[0]?.content?.parts?.[0] || '';
        if (prompt.includes('rewrite-me')) { writeWorkRewriteSse(res); return; }
        if (prompt.includes('remove-me')) { writeWorkRewriteSse(res, { remove: true }); return; }
        if (prompt.includes('no-retry')) {
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.end(`data: ${JSON.stringify({ error: 'private upstream details', error_code: 'model_at_capacity', can_retry: false })}\n\ndata: [DONE]\n\n`);
          return;
        }
        if (prompt.includes('plain-429')) {
          res.writeHead(429, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'slow down' }));
          return;
        }
        if (mockCfg.upstream.stations?.OneOpenAI?.capacityOnce && j.model === 'gpt-6.1-sol-wm') {
          mockCfg.upstream.stations.OneOpenAI.capacityOnce = false;
          res.writeHead(200, { 'content-type': 'text/event-stream' });
          res.end(`data: ${JSON.stringify({ error: 'private upstream details', error_code: 'model_at_capacity', can_retry: true })}\n\ndata: [DONE]\n\n`);
          return;
        }
        writeWorkSse(res);
        return;
      }
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
let loginStationId = null;
let submittedDynamicCode = '';
let submittedStationId = null;
let currentApiKey = 'ctk_test';
const fakeCredentials = {
  verifyApiKey: (key) => key === currentApiKey,
  rotateApiKey: () => { currentApiKey = 'ctk_rotated_test'; return currentApiKey; },
  verifyRotationToken: (token) => token === 'test-rotate-token',
  status: () => ({ loggedIn: true, apiKeyConfigured: true, loginInProgress: false }),
  closeLogin: async () => { forcedLoginClosures += 1; },
  startLogin: async (options = {}) => { loginStationId = options.stationId || null; return { started: true }; },
  submitDynamicCode: async (code, options = {}) => { submittedDynamicCode = code; submittedStationId = options.stationId || null; return { ok: true, message: '登录成功，正在捕获凭据' }; },
  hasUpstreamCredentials: () => false,
};
const srv = createServer(mockCfg, { credentials: fakeCredentials });
srv.listen(8799, '127.0.0.1', async () => {
  console.error('local server on 8799');
  const unauthorized = await fetch('http://127.0.0.1:8799/v1/models');
  if (unauthorized.status !== 401) {
    console.error(`FAIL: expected 401 without API key, got ${unauthorized.status}`);
    mock.close(); srv.close(); process.exit(1);
  }
  const login = await fetch('http://127.0.0.1:8799/auth/login?force=1&station=OneOpenAI');
  if (login.status !== 200 || forcedLoginClosures !== 1 || loginStationId !== 'OneOpenAI') {
    console.error(`FAIL: force login route status=${login.status} closures=${forcedLoginClosures} station=${loginStationId}`);
    mock.close(); srv.close(); process.exit(1);
  }
  const form = await fetch('http://127.0.0.1:8799/auth/login/form');
  const formHtml = await form.text();
  if (form.status !== 200 || !formHtml.includes('/auth/login/code') || !formHtml.includes('/auth/status')) {
    console.error(`FAIL: login form status=${form.status}`);
    mock.close(); srv.close(); process.exit(1);
  }
  const codeResponse = await fetch('http://127.0.0.1:8799/auth/login/code?station=OneOpenAI', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'test-code' }),
  });
  if (codeResponse.status !== 200 || submittedDynamicCode !== 'test-code' || submittedStationId !== 'OneOpenAI') {
    console.error(`FAIL: login code status=${codeResponse.status} station=${submittedStationId}`);
    mock.close(); srv.close(); process.exit(1);
  }
  submittedDynamicCode = null;
  const crossSiteCode = await fetch('http://127.0.0.1:8799/auth/login/code?station=OneOpenAI', {
    method: 'POST',
    headers: { 'content-type': 'text/plain', 'sec-fetch-site': 'cross-site', 'sec-fetch-dest': 'empty' },
    body: JSON.stringify({ code: 'cross-site-code' }),
  });
  if (crossSiteCode.status !== 403 || submittedDynamicCode !== null) {
    console.error(`FAIL: cross-site login code status=${crossSiteCode.status} submitted=${submittedDynamicCode}`);
    mock.close(); srv.close(); process.exit(1);
  }
  console.error('PASS: login code rejects cross-site submissions');
  const unknownStation = await fetch('http://127.0.0.1:8799/auth/login?station=Unknown');
  if (unknownStation.status !== 400) {
    console.error(`FAIL: unknown station status=${unknownStation.status}`);
    mock.close(); srv.close(); process.exit(1);
  }
  console.error('PASS: login rejects unknown station identifiers');
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
  const got = [...text.matchAll(/"delta":\{"content":"([^"]*)"/g)].map(m => m[1]).join('');
  const expect = got === '你好世界';
  const hasDone = text.includes('[DONE]');
  const hasContext = observedPrompt.includes('[system]\nbe concise') && observedPrompt.includes('[assistant]\nfirst answer');
  const leaked = ['user_id=test', 'dummy', 'Bearer ', 'test-token'].filter((secret) => text.includes(secret));
  const noWorkEnvelope = !text.includes('chattoapi') && !text.includes('chattoapi_tool_activity');
  console.error(`stream frames=${text.split('data: ').length - 1} chars=${text.length}`);
  console.error(expect && hasDone && hasContext && leaked.length === 0 && noWorkEnvelope
    ? 'PASS: stream translated + context preserved + no secrets or Work envelope'
    : `FAIL: got="${got}" context=${hasContext} leaked=${leaked.join(',')} noWorkEnvelope=${noWorkEnvelope}`);
  if (!(expect && hasDone && hasContext && leaked.length === 0 && noWorkEnvelope)) {
    mock.close(); srv.close(); process.exit(1);
  }

  // 4) Work 流式：正文、思考摘要、工具活动、客户端 tools warning、最终 envelope。
  const workStreamResponse = await fetch('http://127.0.0.1:8799/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${currentApiKey}` },
    body: JSON.stringify({
      model: 'work-gpt-6.1-terra',
      stream: true,
      chattoapi: { reasoning: true },
      tools: [{ type: 'function', function: { name: 'client_probe' } }],
      messages: [{ role: 'user', content: 'calculate' }],
    }),
  });
  const workStreamText = await workStreamResponse.text();
  const workChunks = workStreamText.split('\n')
    .filter((line) => line.startsWith('data: ') && line !== 'data: [DONE]')
    .map((line) => JSON.parse(line.slice(6)));
  const workContent = workChunks.map((chunk) => chunk.choices?.[0]?.delta?.content || '').join('');
  const workReasoning = workChunks.map((chunk) => chunk.choices?.[0]?.delta?.reasoning_content || '').join('');
  const toolEvents = workChunks.flatMap((chunk) => {
    const activity = chunk.choices?.[0]?.delta?.chattoapi_tool_activity;
    return activity ? [activity] : [];
  });
  const workEnvelope = workChunks.find((chunk) => chunk.chattoapi)?.chattoapi;
  const workLeaked = ['user_id=test', 'dummy', 'Bearer ', 'private upstream details'].filter((secret) => workStreamText.includes(secret));
  const workBody = observedWorkBody || {};
  const workBodyOk = workBody.turn_attribution?.turn_trigger === 'composer'
    && workBody.action === 'next'
    && workBody.model === 'gpt-6.1-terra-wm'
    && workBody.conversation_origin === 'tpp'
    && workBody.thinking_effort === 'min'
    && workBody.client_contextual_info?.app_surface === 'codex_browser'
    && Array.isArray(workBody.messages)
    && !('suggestions' in workBody)
    && !('history_and_training_disabled' in workBody)
    && !('force_paragen' in workBody)
    && !('websocket_request_id' in workBody)
    && !('local_function_signatures' in workBody);
  const workStreamOk = workStreamResponse.status === 200
    && workContent === '计算'
    && workReasoning === 'thinking'
    && toolEvents.length === 2
    && toolEvents[0].phase === 'started'
    && toolEvents[1].phase === 'completed'
    && workEnvelope?.site === 'OneOpenAI'
    && workEnvelope?.upstream_model === 'gpt-6.1-terra-wm'
    && workEnvelope?.tool_count === 2
    && workEnvelope?.warnings?.some((warning) => warning.code === 'client_tools_not_supported_by_work')
    && workEnvelope?.fallback_from === null
    && workBodyOk
    && workLeaked.length === 0;
  console.error(workStreamOk
    ? 'PASS: Work stream exposes content, reasoning, tool activity, and envelope'
    : `FAIL: Work stream status=${workStreamResponse.status} content="${workContent}" reasoning="${workReasoning}" tools=${toolEvents.length} envelope=${JSON.stringify(workEnvelope)} bodyOk=${workBodyOk} leaked=${workLeaked.join(',')}`);
  if (!workStreamOk) { mock.close(); srv.close(); process.exit(1); }

  // 5) Work 非流式：标准字段 + 顶层 chattoapi.work_tools。
  const workNonStream = await fetch('http://127.0.0.1:8799/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${currentApiKey}` },
    body: JSON.stringify({
      model: 'work-gpt-6.1-terra',
      stream: false,
      chattoapi: { reasoning: true },
      messages: [{ role: 'user', content: 'calculate' }],
    }),
  });
  const workNonStreamBody = await workNonStream.json();
  const workMessage = workNonStreamBody.choices?.[0]?.message || {};
  const workNonStreamOk = workNonStream.status === 200
    && workNonStreamBody.model === 'work-gpt-6.1-terra'
    && workMessage.content === '计算'
    && workMessage.reasoning_content === 'thinking'
    && workNonStreamBody.chattoapi?.work_tools?.length === 2
    && workNonStreamBody.chattoapi?.upstream_model === 'gpt-6.1-terra-wm';
  console.error(workNonStreamOk
    ? 'PASS: Work non-stream returns standard fields plus tool envelope'
    : `FAIL: Work non-stream status=${workNonStream.status} body=${JSON.stringify(workNonStreamBody)}`);
  if (!workNonStreamOk) { mock.close(); srv.close(); process.exit(1); }

  // 5b) 非流式正文被 replace/remove 改写时，以 reducer 快照为准。
  const rewriteResponse = await fetch('http://127.0.0.1:8799/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${currentApiKey}` },
    body: JSON.stringify({ model: 'work-gpt-6.1-terra', stream: false, messages: [{ role: 'user', content: 'rewrite-me' }] }),
  });
  const rewriteBody = await rewriteResponse.json();
  const rewriteOk = rewriteResponse.status === 200
    && rewriteBody.choices?.[0]?.message?.content === 'final answer';
  console.error(rewriteOk
    ? 'PASS: Work non-stream uses the reducer snapshot for rewritten content'
    : `FAIL: rewrite status=${rewriteResponse.status} body=${JSON.stringify(rewriteBody)}`);
  if (!rewriteOk) { mock.close(); srv.close(); process.exit(1); }

  const removeResponse = await fetch('http://127.0.0.1:8799/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${currentApiKey}` },
    body: JSON.stringify({ model: 'work-gpt-6.1-terra', stream: false, messages: [{ role: 'user', content: 'remove-me' }] }),
  });
  const removeBody = await removeResponse.json();
  const removeOk = removeResponse.status === 200
    && removeBody.choices?.[0]?.message?.content === '';
  console.error(removeOk
    ? 'PASS: Work non-stream honors removed content'
    : `FAIL: remove status=${removeResponse.status} body=${JSON.stringify(removeBody)}`);
  if (!removeOk) { mock.close(); srv.close(); process.exit(1); }

  // 5c) can_retry:false 不换模型；普通 429 限流也不换模型。
  const noRetryResponse = await fetch('http://127.0.0.1:8799/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${currentApiKey}` },
    body: JSON.stringify({ model: 'work-gpt-6.1-sol', stream: false, messages: [{ role: 'user', content: 'no-retry' }] }),
  });
  const noRetryBody = await noRetryResponse.json();
  const noRetryOk = noRetryResponse.status === 429
    && noRetryBody.error?.code === 'model_at_capacity'
    && !noRetryBody.chattoapi
    && !JSON.stringify(noRetryBody).includes('private upstream details');
  console.error(noRetryOk
    ? 'PASS: Work capacity error with can_retry=false is not retried'
    : `FAIL: no-retry status=${noRetryResponse.status} body=${JSON.stringify(noRetryBody)}`);
  if (!noRetryOk) { mock.close(); srv.close(); process.exit(1); }

  const plain429Response = await fetch('http://127.0.0.1:8799/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${currentApiKey}` },
    body: JSON.stringify({ model: 'work-gpt-6.1-sol', stream: false, messages: [{ role: 'user', content: 'plain-429' }] }),
  });
  const plain429Body = await plain429Response.json();
  const plain429Ok = plain429Response.status === 429
    && !plain429Body.chattoapi
    && plain429Body.error?.code !== 'model_at_capacity';
  console.error(plain429Ok
    ? 'PASS: plain upstream 429 does not trigger model fallback'
    : `FAIL: plain-429 status=${plain429Response.status} body=${JSON.stringify(plain429Body)}`);
  if (!plain429Ok) { mock.close(); srv.close(); process.exit(1); }

  // 6) 容量 fallback：sol 首次容量不足，自动切 terra。
  mockCfg.upstream.stations.OneOpenAI.capacityOnce = true;
  const fallbackResponse = await fetch('http://127.0.0.1:8799/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${currentApiKey}` },
    body: JSON.stringify({ model: 'work-gpt-6.1-sol', stream: false, messages: [{ role: 'user', content: 'calculate' }] }),
  });
  const fallbackBody = await fallbackResponse.json();
  const fallbackOk = fallbackResponse.status === 200
    && fallbackBody.choices?.[0]?.message?.content === '计算'
    && fallbackBody.chattoapi?.fallback_from === 'gpt-6.1-sol-wm'
    && fallbackBody.chattoapi?.fallback_to === 'gpt-6.1-terra-wm'
    && fallbackBody.chattoapi?.upstream_model === 'gpt-6.1-terra-wm'
    && !JSON.stringify(fallbackBody).includes('private upstream details');
  console.error(fallbackOk
    ? 'PASS: Work capacity error falls back without leaking upstream text'
    : `FAIL: fallback status=${fallbackResponse.status} body=${JSON.stringify(fallbackBody)}`);
  if (!fallbackOk) { mock.close(); srv.close(); process.exit(1); }

  // 7) 关闭 fallback 时，容量错误映射为 HTTP 429。
  mockCfg.upstream.stations.OneOpenAI.autoFallback = false;
  mockCfg.upstream.stations.OneOpenAI.capacityOnce = true;
  const capacityResponse = await fetch('http://127.0.0.1:8799/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${currentApiKey}` },
    body: JSON.stringify({ model: 'work-gpt-6.1-sol', stream: false, messages: [{ role: 'user', content: 'calculate' }] }),
  });
  const capacityBody = await capacityResponse.json();
  const capacityOk = capacityResponse.status === 429
    && capacityBody.error?.type === 'rate_limit_error'
    && capacityBody.error?.code === 'model_at_capacity'
    && !JSON.stringify(capacityBody).includes('private upstream details');
  console.error(capacityOk
    ? 'PASS: Work capacity maps to 429 when fallback is disabled'
    : `FAIL: capacity status=${capacityResponse.status} body=${JSON.stringify(capacityBody)}`);
  mockCfg.upstream.stations.OneOpenAI.autoFallback = true;
  mock.close(); srv.close(); process.exit(capacityOk ? 0 : 1);
});

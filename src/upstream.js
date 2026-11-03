import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { log } from './logger.js';

export const uuid = () => crypto.randomUUID();

// 新对话的固定父节点。上游要求新建会话时 parent_message_id 必须是该值；
// 使用随机 UUID 会被判定为「对话不存在」，返回 200 + {"detail":"请重新创建一个对话使用"}。
export const NEW_CONVERSATION_PARENT_ID = 'client-created-root';

/**
 * Build the request body for POST {base}/backend-api/f/conversation
 * (new-conversation mode: conversation_id null, parent_message_id 固定为 NEW_CONVERSATION_PARENT_ID).
 */
export function buildRequestBody({ model, text, conversationId = null, parentMessageId, websocketRequestId }) {
  const messages = [
    {
      author: { role: 'user' },
      content: { content_type: 'text', parts: [text] },
    },
  ];
  return {
    action: 'next',
    conversation_id: conversationId,
    conversation_origin: null,
    model,
    timezone_offset_min: -new Date().getTimezoneOffset(),
    suggestions: [],
    history_and_training_disabled: false,
    messages,
    parent_message_id: parentMessageId,
    websocket_request_id: websocketRequestId,
    force_paragen: false,
    supported_encodings: ['v1'],
  };
}

function pickHeaders(cfg) {
  const c = cfg.upstream;
  const h = c.headers || {};
  const hdrs = {
    accept: 'text/event-stream',
    'content-type': 'application/json',
    authorization: `Bearer ${c.credential.bearerToken}`,
    cookie: c.credential.cookie,
    'oai-client-build-number': h['oai-client-build-number'] || '4903962',
    'oai-client-version': h['oai-client-version'] || 'prod-c8317ee14c178f58734a7c3fe41bcfaca8156ed1',
    'oai-device-id': h['oai-device-id'] || '00000000-0000-4000-8000-000000000000',
    'oai-language': h['oai-language'] || 'en',
    'x-conduit-token': h['x-conduit-token'] || 'saas_nexus_no_token',
    'openai-sentinel-chat-requirements-token': h['openai-sentinel-chat-requirements-token'] || 'Fuck_You',
    'user-agent': h['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
  };
  if (h['openai-sentinel-turnstile-token']) {
    hdrs['openai-sentinel-turnstile-token'] = h['openai-sentinel-turnstile-token'];
  }
  return hdrs;
}

function escapeCurlConfig(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}

function parseCurlHeaders(raw) {
  const blocks = String(raw || '').split(/\r?\n\r?\n/).filter(Boolean);
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const lines = blocks[index].split(/\r?\n/);
    const statusLine = lines.shift() || '';
    const match = statusLine.match(/^HTTP\/\S+\s+(\d{3})\b/i);
    if (!match) continue;
    const parsed = {};
    for (const line of lines) {
      const separator = line.indexOf(':');
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).trim();
      if (parsed[key]) parsed[key] = `${parsed[key]}, ${value}`;
      else parsed[key] = value;
    }
    return { status: Number(match[1]), headers: new Headers(parsed) };
  }
  return null;
}

/**
 * Windows Schannel fallback for hosts that renegotiate TLS in a way Node/OpenSSL
 * does not complete. Credentials stay in a short-lived curl config file rather
 * than the process command line; the file is removed when curl exits.
 */
function requestUpstreamViaCurl(url, { method, headers, body, signal }) {
  return new Promise((resolve, reject) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chattoapi-curl-'));
    const headerPath = path.join(tempDir, 'headers.txt');
    const configPath = path.join(tempDir, 'request.conf');
    const configLines = [
      `url = "${escapeCurlConfig(url)}"`,
      `request = "${escapeCurlConfig(method)}"`,
      'silent',
      'show-error',
      'no-buffer',
      'http1.1',
      `dump-header = "${escapeCurlConfig(headerPath)}"`,
    ];
    for (const [name, value] of Object.entries(headers || {})) {
      configLines.push(`header = "${escapeCurlConfig(name)}: ${escapeCurlConfig(value)}"`);
    }
    if (body !== undefined && body !== null) configLines.push('data-binary = @-');
    fs.writeFileSync(configPath, `${configLines.join('\n')}\n`, { mode: 0o600 });

    const child = spawn(process.platform === 'win32' ? 'curl.exe' : 'curl', ['--config', configPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    // Attach the Web stream immediately; Node may discard buffered stdout if
    // the child exits before a consumer is attached.
    const bodyStream = Readable.toWeb(child.stdout);
    let stderr = '';
    let settled = false;
    let pollTimer;
    const cleanup = () => {
      if (pollTimer) clearInterval(pollTimer);
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const tryResolve = () => {
      if (settled) return;
      let parsed;
      try { parsed = parseCurlHeaders(fs.readFileSync(headerPath, 'utf8')); } catch { return; }
      if (!parsed) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      child.once('close', cleanup);
      resolve({
        ok: parsed.status >= 200 && parsed.status < 300,
        status: parsed.status,
        headers: parsed.headers,
        body: bodyStream,
        text: async () => {
          const chunks = [];
          const reader = bodyStream.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            chunks.push(Buffer.from(value));
          }
          return Buffer.concat(chunks).toString('utf8');
        },
      });
    };
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-1000); });
    child.once('error', (error) => fail(error));
    child.once('close', (code) => {
      if (!settled) {
        tryResolve();
        if (!settled) fail(new Error(`curl exited before response headers (code ${code}): ${stderr.trim()}`));
      }
      if (settled) cleanup();
    });
    pollTimer = setInterval(tryResolve, 20);
    tryResolve();
    const abort = () => {
      if (!child.killed) child.kill();
      fail(Object.assign(new Error('upstream request aborted'), { name: 'AbortError' }));
    };
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
    child.once('close', () => signal?.removeEventListener('abort', abort));
    if (body !== undefined && body !== null) child.stdin.end(body);
    else child.stdin.end();
  });
}

function requestUpstream(url, { method, headers, body, signal }) {
  if (process.platform === 'win32' && new URL(url).protocol === 'https:') {
    return requestUpstreamViaCurl(url, { method, headers, body, signal });
  }
  const target = new URL(url);
  const transport = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(target, { method, headers }, (response) => {
      const body = Readable.toWeb(response);
      let textPromise;
      resolve({
        ok: response.statusCode >= 200 && response.statusCode < 300,
        status: response.statusCode || 0,
        headers: new Headers(response.headers),
        body,
        text: async () => {
          if (!textPromise) {
            textPromise = new Promise((textResolve, textReject) => {
              const chunks = [];
              const reader = body.getReader();
              const read = () => reader.read().then(({ value, done }) => {
                if (done) return textResolve(Buffer.concat(chunks).toString('utf8'));
                chunks.push(Buffer.from(value));
                return read();
              }).catch(textReject);
              read();
            });
          }
          return textPromise;
        },
      });
    });
    const abortRequest = () => {
      const error = new Error('upstream request aborted');
      error.name = 'AbortError';
      request.destroy(error);
    };
    if (signal?.aborted) {
      abortRequest();
      return;
    }
    signal?.addEventListener('abort', abortRequest, { once: true });
    request.once('close', () => signal?.removeEventListener('abort', abortRequest));
    request.once('error', reject);
    request.end(body);
  });
}

/** Split raw SSE text into frames of {event, data[]} */
export function splitSse(text) {
  const frames = [];
  for (const raw of text.split('\n\n')) {
    if (!raw.trim()) continue;
    const frame = { event: null, data: [] };
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) frame.event = line.slice(6).trim();
      else if (line.startsWith('data:')) frame.data.push(line.slice(5).replace(/^ /, ''));
    }
    if (frame.data.length) frames.push(frame);
  }
  return frames;
}

/**
 * Stream one conduit completion from upstream.
 * onContent(chunk) / onReasoning(chunk) / onMeta(msg) called as parsed.
 * Resolves when stream finishes (message_stream_complete or [DONE]).
 */
export async function streamCompletion({ cfg, model, text, signal, onContent, onReasoning, onMeta, onDone }) {
  const credential = cfg.upstream?.credential || {};
  if (!credential.cookie || !credential.bearerToken) {
    const e = new Error('尚未完成上游登录，请先调用 GET /auth/login');
    e.status = 503;
    throw e;
  }
  const base = cfg.upstream.baseUrl.replace(/\/$/, '');
  const path = cfg.upstream.conversationPath || '/backend-api/f/conversation';
  const fallbackPath = cfg.upstream.conversationFallbackPath
    || (path === '/backend-api/f/conversation' ? '/backend-api/conversation' : '/backend-api/f/conversation');
  const candidatePaths = fallbackPath && fallbackPath !== path ? [path, fallbackPath] : [path];
  const body = buildRequestBody({
    model,
    text,
    parentMessageId: NEW_CONVERSATION_PARENT_ID,
    websocketRequestId: uuid(),
  });
  log.debug('POST', `${base}${path}`, JSON.stringify(body));

  const timeoutMs = Number(cfg.upstream.requestTimeoutMs || 120000);
  const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : null;
  const requestSignal = signal && timeoutSignal
    ? AbortSignal.any([signal, timeoutSignal])
    : (signal || timeoutSignal || undefined);

  let res;
  let requestPath = path;
  for (let index = 0; index < candidatePaths.length; index += 1) {
    requestPath = candidatePaths[index];
    try {
      res = await requestUpstream(`${base}${requestPath}`, {
        method: 'POST',
        headers: pickHeaders(cfg),
        body: JSON.stringify(body),
        signal: requestSignal,
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        const timeoutError = new Error('upstream request timed out or was cancelled');
        timeoutError.status = 504;
        throw timeoutError;
      }
      throw error;
    }
    if (index === candidatePaths.length - 1) break;
    if ([404, 405].includes(res.status)) {
      await res.text().catch(() => '');
      log.debug('upstream path fallback', requestPath, '->', candidatePaths[index + 1]);
      continue;
    }
    // Sorux 当前会对旧账号在新版 /f 路径返回 500，而不是 404/405。
    // 该业务错误明确表示应使用兼容的旧 conversation endpoint，可安全回退。
    if (res.status === 500) {
      const errorText = await res.text().catch(() => '');
      if (/api\s+mode\s+not\s+supported/i.test(errorText)) {
        log.debug('upstream path fallback', requestPath, '->', candidatePaths[index + 1]);
        continue;
      }
      const e = new Error(`upstream HTTP ${res.status} (${requestPath}): ${errorText.slice(0, 300)}`);
      e.status = res.status;
      throw e;
    }
    break;
  }

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '');
    log.error('upstream http', res.status, errText.slice(0, 500));
    const e = new Error(`upstream HTTP ${res.status} (${requestPath}): ${errText.slice(0, 300)}`);
    e.status = res.status;
    throw e;
  }

  const ctype = res.headers.get('content-type') || '';
  log.debug('upstream ctype', ctype);

  // If upstream did NOT return an event stream, read and surface the body (usually an error/notice).
  if (!ctype.includes('text/event-stream')) {
    const bodyText = await res.text().catch(() => '');
    log.error('upstream non-stream response:', res.status, bodyText.slice(0, 2000));
    const e = new Error(`upstream returned non-stream (${res.status}): ${bodyText.slice(0, 800)}`);
    e.status = res.status >= 400 ? res.status : (/未登录|not\s+logged\s*in|unauthori[sz]ed/i.test(bodyText) ? 401 : 502);
    e.upstreamBody = bodyText;
    throw e;
  }

  const decoder = new TextDecoder();
  let buf = '';
  // delta_encoding v1: frames may omit unchanged fields (o/p) from the previous delta
  let lastOp = null; // {o, p}

  const reader = res.body.getReader();
  let done = false;
  let finished = false;

  // 上游有两种增量编码：JSON-patch（o/p/v）与「游标 + 全量快照」（c/v）。
  // 快照帧会重复发送整条消息，这里按 message.id 记录已输出的文本，只补发新增后缀。
  const emitted = new Map();
  const emitSnapshot = (node) => {
    const message = node && typeof node === 'object' ? node.message : null;
    if (!message || typeof message !== 'object') return;
    if (message.author?.role !== 'assistant') return;
    if (message.recipient && message.recipient !== 'all') return;
    const parts = message.content?.parts;
    if (!Array.isArray(parts)) return;
    const text = parts.filter(part => typeof part === 'string').join('');
    const key = message.id || 'assistant';
    const prev = emitted.get(key) || '';
    if (text === prev) return;
    if (text.startsWith(prev)) {
      const delta = text.slice(prev.length);
      if (delta && onContent) onContent(delta);
    }
    // 非前缀增长（快照回退/改写）无法撤回已发送内容，只更新基线避免重复输出。
    emitted.set(key, text);
  };

  const applyOp = (op) => {
    if (!op || typeof op !== 'object') return;
    const o = op.o || (lastOp && lastOp.o) || null;
    const p = op.p !== undefined ? op.p : (lastOp && lastOp.p) || '';
    if (o === 'add' && p === '' && op.v && typeof op.v === 'object' && !Array.isArray(op.v)) {
      // 完整节点新增：可能是消息骨架，也可能已带正文（快照式）。
      emitSnapshot(op.v);
      lastOp = { o, p };
      return;
    }
    if (o === 'append' && typeof op.v === 'string') {
      lastOp = { o, p };
      if (p.includes('/content/parts/')) {
        const idx = p.split('/').filter(s => s !== '' && !isNaN(Number(s))).pop();
        const idxNum = Number(idx);
        // part 0 = visible text; others (reasoning) ignored in MVP unless named
        if (idxNum === 0) onContent && onContent(op.v);
        else onReasoning && onReasoning(op.v);
      }
      return;
    }
    lastOp = { o, p };
  };

  const handleData = (line) => {
    const raw = line.startsWith('data:') ? line.slice(5).replace(/^ /, '') : line;
    if (raw === '[DONE]') { done = true; return; }
    let j;
    try { j = JSON.parse(raw); } catch { return; }
    if (typeof j !== 'object' || j === null) return; // e.g. delta_encoding data "v1"
    if (j.event === 'delta_encoding' && typeof j.data === 'string' && j.data.startsWith('"')) {
      // {"event":"delta_encoding","data":"v1"} — we handle raw JSON-patch deltas below regardless
      return;
    }
    if (j.type === 'server_ste_metadata') return;
    if (j.type === 'message_stream_complete') { finished = true; return; }
    if (j.type === 'title_generation') return;
    if (j.type === 'message_marker' && j.marker === 'last_token') { done = true; return; }
    // 批量 patch：{"o":"patch","v":[{o,p,v},...]} 或 {"v":[{o,p,v},...]}
    if (Array.isArray(j.v)) {
      for (const op of j.v) applyOp(op);
      return;
    }
    // 单个 patch：{"o":...,"p":...,"v":...}；也兼容省略 o/p 的继承帧（此时 v 为标量）
    if ('o' in j || 'p' in j || ('v' in j && (j.v === null || typeof j.v !== 'object'))) {
      applyOp(j);
      return;
    }
    // 全量快照：{"c":<游标>,"v":{...}}
    if (j.v && typeof j.v === 'object') {
      emitSnapshot(j.v);
      return;
    }
    if (j.conversation_id) { onMeta && onMeta(j); }
  };

  try {
    while (true) {
      const { value, done: rd } = await reader.read();
      if (rd) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        if (line.startsWith('event:') || line.startsWith(':')) continue;
        if (line.startsWith('data:')) handleData(line);
      }
    }
    if (buf.trim()) {
      for (const line of buf.split('\n')) {
        if (line.trim() && line.startsWith('data:')) handleData(line);
      }
    }
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      const timeoutError = new Error('upstream request timed out or was cancelled');
      timeoutError.status = 504;
      throw timeoutError;
    }
    throw error;
  }
  if (!done && !finished) log.debug('stream ended without [DONE]/complete marker');
  if (onDone) onDone({ done, finished });
}

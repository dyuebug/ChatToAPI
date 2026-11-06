import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { log } from './logger.js';
import { resolveStation } from './stations/index.js';
import { buildSoruxRequest } from './stations/sorux.js';
import { STATION_IDS } from './stations/contracts.js';

export const uuid = () => crypto.randomUUID();

// 新对话的固定父节点。上游要求新建会话时 parent_message_id 必须是该值；
// 使用随机 UUID 会被判定为「对话不存在」，返回 200 + {"detail":"请重新创建一个对话使用"}。
export const NEW_CONVERSATION_PARENT_ID = 'client-created-root';

export function buildRequestBody(options) {
  return buildSoruxRequest(options);
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

function timeoutError() {
  const error = new Error('upstream request timed out or was cancelled');
  error.status = 504;
  return error;
}

function isTimeoutError(error) {
  return error?.name === 'TimeoutError' || error?.name === 'AbortError';
}

function mapHttpStatus(status) {
  if (status === 401 || status === 403) return status;
  if (status === 504) return 504;
  if (status >= 500) return 502;
  return status;
}

function createHttpError(status, requestPath, bodyText, extra = {}) {
  const capacity = status === 429 && /model_at_capacity/i.test(bodyText);
  const error = new Error(capacity
    ? 'selected Work model is temporarily at capacity'
    : `upstream HTTP ${status} (${requestPath})`);
  error.status = capacity ? 429 : mapHttpStatus(status);
  error.upstreamBody = bodyText;
  if (capacity) {
    error.type = 'rate_limit_error';
    error.code = 'model_at_capacity';
    error.retryable = !(/"can_retry"\s*:\s*false|can_retry\s*[:=]\s*false/i.test(bodyText));
  }
  Object.assign(error, extra);
  return error;
}

function createRequestSignal(cfg, signal) {
  const timeoutMs = Number(cfg?.upstream?.requestTimeoutMs || 120000);
  const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : null;
  return signal && timeoutSignal
    ? AbortSignal.any([signal, timeoutSignal])
    : (signal || timeoutSignal || undefined);
}

function effectiveCredential(cfg, options) {
  return options.credential ?? cfg?.upstream?.credential ?? {};
}

function effectiveStoredHeaders(cfg, options) {
  return options.storedHeaders ?? cfg?.upstream?.headers ?? {};
}

function invoke(callback, value) {
  if (typeof callback === 'function') callback(value);
}

async function readSseLines(response, handleData) {
  const decoder = new TextDecoder();
  let buf = '';
  const reader = response.body.getReader();
  let stop = false;
  const consumeLine = (line) => {
    const normalized = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (!normalized.trim() || normalized.startsWith('event:') || normalized.startsWith(':')) return;
    if (!normalized.startsWith('data:')) return;
    if (handleData(normalized.slice(5).replace(/^ /, '')) === true) stop = true;
  };
  try {
    while (!stop) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        consumeLine(line);
        if (stop) break;
      }
    }
    if (!stop && buf.trim()) {
      for (const line of buf.split('\n')) consumeLine(line);
    }
  } catch (error) {
    if (isTimeoutError(error)) throw timeoutError();
    throw error;
  } finally {
    if (stop) await reader.cancel().catch(() => {});
  }
}

async function streamWork({
  cfg, model, text, signal, station, credential, storedHeaders,
  onContent, onReasoning, onMeta, onDone, onToolActivity, onWarning, onSnapshot, onStation,
  exposeReasoning, maxReasoningBytes,
}) {
  const { adapter, stationId, stationConfig, publicModel, upstreamModel } = station;
  const request = adapter.buildRequest({
    cfg,
    model,
    text,
    stationConfig,
    parentMessageId: NEW_CONVERSATION_PARENT_ID,
  });
  const headers = adapter.buildHeaders({
    cfg,
    credential: effectiveCredential(cfg, { credential }),
    storedHeaders: effectiveStoredHeaders(cfg, { storedHeaders }),
  });
  const base = cfg.upstream.baseUrl.replace(/\/$/, '');
  const requestSignal = createRequestSignal(cfg, signal);
  invoke(onStation, { stationId, publicModel, upstreamModel });
  log.debug('upstream request', { station: stationId, path: request.path, model: upstreamModel, textLength: typeof text === 'string' ? text.length : 0 });

  let response;
  try {
    response = await requestUpstream(`${base}${request.path}`, {
      method: request.method,
      headers,
      body: JSON.stringify(request.body),
      signal: requestSignal,
    });
  } catch (error) {
    if (isTimeoutError(error)) throw timeoutError();
    throw error;
  }
  if (!response.ok || !response.body) {
    const bodyText = await response.text().catch(() => '');
    throw createHttpError(response.status, request.path, bodyText, { site: stationId, upstreamModel });
  }
  const ctype = response.headers.get('content-type') || '';
  if (!ctype.includes('text/event-stream')) {
    const bodyText = await response.text().catch(() => '');
    const error = new Error(`upstream returned non-stream (${response.status})`);
    error.status = /未登录|not\s+logged\s*in|unauthori[sz]ed/i.test(bodyText) ? 401 : 502;
    error.upstreamBody = bodyText;
    throw error;
  }

  let done = false;
  let finished = false;
  let emittedOutput = false;
  let reducerError = null;
  const reducer = adapter.createReducer({ exposeReasoning: Boolean(exposeReasoning), maxReasoningBytes });
  await readSseLines(response, (raw) => {
    if (raw === '[DONE]') {
      done = true;
      return true;
    }
    let frame;
    try { frame = JSON.parse(raw); } catch { return false; }
    // Work 首帧可能是 data: "v1"（delta_encoding 声明），不是补丁帧。
    if (typeof frame !== 'object' || frame === null || Array.isArray(frame)) return false;
    const events = reducer.reduce(frame);
    for (const event of events) {
      if (event.type === 'content') {
        emittedOutput = true;
        invoke(onContent, event.delta);
      } else if (event.type === 'reasoning') {
        invoke(onReasoning, event.delta);
      } else if (event.type === 'tool_activity') {
        emittedOutput = true;
        invoke(onToolActivity, event.activity);
      } else if (event.type === 'meta') {
        invoke(onMeta, event.value);
      } else if (event.type === 'warning') {
        invoke(onWarning, event);
      } else if (event.type === 'done') {
        finished = true;
      } else if (event.type === 'error') {
        reducerError = event.error;
      }
    }
    return Boolean(reducerError);
  });
  // 非流式响应以 reducer 最终快照为准：正文被 replace/remove 改写时，增量拼接无法撤回旧文本。
  invoke(onSnapshot, reducer.snapshot());
  invoke(onDone, { done, finished, stationId, upstreamModel });
  if (reducerError) {
    throw Object.assign(new Error(reducerError.message), reducerError, {
      noOutput: !emittedOutput,
      site: stationId,
      upstreamModel,
    });
  }
}

async function streamSorux({
  cfg, model, text, signal, station, credential, storedHeaders, onContent, onReasoning, onMeta, onDone,
}) {
  const { adapter, stationId, stationConfig, upstreamModel } = station;
  const effectiveCred = credential ?? cfg.upstream?.credential ?? {};
  if (!effectiveCred.cookie || !effectiveCred.bearerToken) {
    const error = new Error('尚未完成上游登录，请先调用 GET /auth/login');
    error.status = 503;
    throw error;
  }
  const base = cfg.upstream.baseUrl.replace(/\/$/, '');
  const request = adapter.buildRequest({
    cfg,
    model,
    text,
    stationConfig,
    parentMessageId: NEW_CONVERSATION_PARENT_ID,
    websocketRequestId: uuid(),
  });
  const body = request.body;
  const path = request.path;
  const fallbackPath = cfg.upstream.conversationFallbackPath
    || (path === '/backend-api/f/conversation' ? '/backend-api/conversation' : '/backend-api/f/conversation');
  const candidatePaths = fallbackPath && fallbackPath !== path ? [path, fallbackPath] : [path];
  const headers = adapter.buildHeaders({
    cfg,
    credential: effectiveCred,
    storedHeaders: storedHeaders ?? cfg.upstream?.headers ?? {},
  });
  const requestSignal = createRequestSignal(cfg, signal);
  log.debug('upstream request', { station: stationId, path, model: upstreamModel, textLength: typeof text === 'string' ? text.length : 0 });

  let response;
  let requestPath = path;
  for (let index = 0; index < candidatePaths.length; index += 1) {
    requestPath = candidatePaths[index];
    try {
      response = await requestUpstream(`${base}${requestPath}`, {
        method: request.method,
        headers,
        body: JSON.stringify(body),
        signal: requestSignal,
      });
    } catch (error) {
      if (isTimeoutError(error)) throw timeoutError();
      throw error;
    }
    if (index === candidatePaths.length - 1) break;
    if ([404, 405].includes(response.status)) {
      await response.text().catch(() => '');
      log.debug('upstream path fallback', requestPath, '->', candidatePaths[index + 1]);
      continue;
    }
    if (response.status === 500) {
      const errorText = await response.text().catch(() => '');
      if (/api\s+mode\s+not\s+supported/i.test(errorText)) {
        log.debug('upstream path fallback', requestPath, '->', candidatePaths[index + 1]);
        continue;
      }
      throw createHttpError(response.status, requestPath, errorText, { site: stationId, upstreamModel });
    }
    break;
  }

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => '');
    throw createHttpError(response.status, requestPath, errorText, { site: stationId, upstreamModel });
  }

  const ctype = response.headers.get('content-type') || '';
  log.debug('upstream ctype', ctype);
  if (!ctype.includes('text/event-stream')) {
    const bodyText = await response.text().catch(() => '');
    const error = new Error(`upstream returned non-stream (${response.status})`);
    error.status = /未登录|not\s+logged\s*in|unauthori[sz]ed/i.test(bodyText) ? 401 : 502;
    error.upstreamBody = bodyText;
    throw error;
  }

  const decoder = new TextDecoder();
  let buf = '';
  let lastOp = null;
  const reader = response.body.getReader();
  let done = false;
  let finished = false;
  const emitted = new Map();
  const emitSnapshot = (node) => {
    const message = node && typeof node === 'object' ? node.message : null;
    if (!message || typeof message !== 'object') return;
    if (message.author?.role !== 'assistant') return;
    if (message.recipient && message.recipient !== 'all') return;
    const parts = message.content?.parts;
    if (!Array.isArray(parts)) return;
    const snapshotText = parts.filter(part => typeof part === 'string').join('');
    const key = message.id || 'assistant';
    const previous = emitted.get(key) || '';
    if (snapshotText === previous) return;
    if (snapshotText.startsWith(previous)) {
      const delta = snapshotText.slice(previous.length);
      if (delta && onContent) onContent(delta);
    }
    emitted.set(key, snapshotText);
  };
  const applyOp = (op) => {
    if (!op || typeof op !== 'object') return;
    const operation = op.o || (lastOp && lastOp.o) || null;
    const pointer = op.p !== undefined ? op.p : (lastOp && lastOp.p) || '';
    if (operation === 'add' && pointer === '' && op.v && typeof op.v === 'object' && !Array.isArray(op.v)) {
      emitSnapshot(op.v);
      lastOp = { o: operation, p: pointer };
      return;
    }
    if (operation === 'append' && typeof op.v === 'string') {
      lastOp = { o: operation, p: pointer };
      if (pointer.includes('/content/parts/')) {
        const idx = pointer.split('/').filter(part => part !== '' && !isNaN(Number(part))).pop();
        const idxNum = Number(idx);
        if (idxNum === 0) onContent && onContent(op.v);
        else onReasoning && onReasoning(op.v);
      }
      return;
    }
    lastOp = { o: operation, p: pointer };
  };
  const handleData = (raw) => {
    if (raw === '[DONE]') { done = true; return true; }
    let frame;
    try { frame = JSON.parse(raw); } catch { return false; }
    if (typeof frame !== 'object' || frame === null) return false;
    if (frame.event === 'delta_encoding' && typeof frame.data === 'string' && frame.data.startsWith('"')) return false;
    if (frame.type === 'server_ste_metadata') return false;
    if (frame.type === 'message_stream_complete') { finished = true; return false; }
    if (frame.type === 'title_generation') return false;
    if (frame.type === 'message_marker' && frame.marker === 'last_token') { done = true; return true; }
    if (Array.isArray(frame.v)) {
      for (const op of frame.v) applyOp(op);
      return false;
    }
    if ('o' in frame || 'p' in frame || ('v' in frame && (frame.v === null || typeof frame.v !== 'object'))) {
      applyOp(frame);
      return false;
    }
    if (frame.v && typeof frame.v === 'object') {
      emitSnapshot(frame.v);
      return false;
    }
    if (frame.conversation_id) onMeta && onMeta(frame);
    return false;
  };

  try {
    let stop = false;
    while (!stop) {
      const { value, done: readDone } = await reader.read();
      if (readDone) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const rawLine of lines) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        if (!line.trim() || line.startsWith('event:') || line.startsWith(':')) continue;
        if (line.startsWith('data:') && handleData(line.slice(5).replace(/^ /, ''))) stop = done;
        if (stop) break;
      }
    }
    if (!done && buf.trim()) {
      for (const rawLine of buf.split('\n')) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
        if (line.trim() && line.startsWith('data:')) handleData(line.slice(5).replace(/^ /, ''));
      }
    }
  } catch (error) {
    if (isTimeoutError(error)) throw timeoutError();
    throw error;
  }
  if (!done && !finished) log.debug('stream ended without [DONE]/complete marker');
  invoke(onDone, { done, finished, stationId, upstreamModel });
}

export async function streamUpstream(options = {}) {
  const { cfg = {}, model, text, signal, onContent, onReasoning, onMeta, onDone } = options;
  const station = resolveStation(model, cfg);
  if (station.stationId === STATION_IDS.ONE_OPENAI) {
    return streamWork({ ...options, cfg, model, text, signal, station, onContent, onReasoning, onMeta, onDone });
  }
  return streamSorux({ ...options, cfg, model, text, signal, station, onContent, onReasoning, onMeta, onDone });
}

export const streamCompletion = streamUpstream;

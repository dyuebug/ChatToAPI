import http from 'node:http';
import { streamCompletion, uuid } from './upstream.js';
import { log } from './logger.js';
import { createUiHandler } from './ui-server.js';
import { allModelList, resolveStation } from './stations/index.js';
import { STATION_IDS } from './stations/contracts.js';
import { workFallbackModels } from './stations/model-catalog.js';

/** Parse /v1/chat/completions body (OpenAI JSON). Returns {messages, model, stream, ...} */
function parseChatBody(raw) {
  let j;
  try { j = JSON.parse(raw); } catch { throw httpError(400, 'invalid JSON body'); }
  if (!j || typeof j !== 'object') throw httpError(400, 'body must be JSON object');
  const messages = Array.isArray(j.messages) ? j.messages : null;
  if (!messages || !messages.length) throw httpError(400, 'messages is required');
  return {
    messages,
    model: (j.model || 'DeepSeek-V4-Flash'),
    stream: j.stream !== false,
    max_tokens: j.max_tokens,
    temperature: j.temperature,
    top_p: j.top_p,
    presence_penalty: j.presence_penalty,
    frequency_penalty: j.frequency_penalty,
    user: j.user,
    stop: j.stop,
    tools: Array.isArray(j.tools) ? j.tools : null,
    tool_choice: j.tool_choice,
    chattoapi: j.chattoapi && typeof j.chattoapi === 'object' ? j.chattoapi : {},
  };
}

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function writeJson(res, status, obj, headers = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(body);
}

/** OpenAI error JSON */
function openAiError(message, type = 'invalid_request_error', status = 400, code = null) {
  return { error: { message, type, param: null, code } };
}

const loginFormHtml = `<!doctype html><meta charset="utf-8"><title>ChatToAPI 登录</title>
<style>body{font:16px sans-serif;max-width:420px;margin:60px auto;padding:0 16px}input,button{font:inherit;padding:8px}input{width:220px}button{cursor:pointer}#msg{margin-top:16px;min-height:24px}</style>
<h2>输入动态码</h2><form id="form"><input id="code" autocomplete="one-time-code" placeholder="请输入动态码" required><button>确认</button></form><div id="msg"></div>
<script>const f=document.querySelector('#form'),c=document.querySelector('#code'),b=f.querySelector('button'),m=document.querySelector('#msg');const waitForCapture=async()=>{const deadline=Date.now()+15000;while(Date.now()<deadline){try{const response=await fetch('/auth/status',{cache:'no-store'});const status=await response.json();if(status.loggedIn){location.href='/auth/status';return}}catch{}await new Promise(resolve=>setTimeout(resolve,500))}m.textContent='登录成功，但凭据尚未捕获；请在站点内发送一条消息后重试';};f.addEventListener('submit',async e=>{e.preventDefault();const code=c.value.trim();if(!code){m.textContent='请输入动态码';c.focus();return}b.disabled=true;m.textContent='正在验证动态码...';try{const r=await fetch('/auth/login/code',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});const j=await r.json().catch(()=>({}));m.textContent=j.message||j.error?.message||('请求失败（HTTP '+r.status+'）');if(r.ok&&j.ok){m.textContent='登录成功，正在保存凭据...';await waitForCapture()}}catch(err){m.textContent='网络请求失败: '+err.message}finally{b.disabled=false}});</script>`;

const loginFormHtmlForDisplay = loginFormHtml
  .replace('Date.now()+15000', 'Date.now()+60000')
  .replace(
    '登录成功，但凭据尚未捕获；请在站点内发送一条消息后重试',
    '登录成功，但凭据尚未捕获；请先选择一个 AI 入口进入对话，再发送一条消息',
  );

function contentToText(content) {
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (typeof part === 'string') return part;
    if (!part || typeof part !== 'object') return '';
    if (typeof part.text === 'string') return part.text;
    if (typeof part.content === 'string') return part.content;
    if (part.type === 'image_url' || part.type === 'input_image') return '[image omitted]';
    return '';
  }).filter(Boolean).join('\n').trim();
}

/** Flatten the supported OpenAI message history into one explicit role-labelled upstream prompt. */
function messagesToPrompt(messages) {
  const blocks = messages.map((message) => {
    if (!message || typeof message !== 'object') return '';
    const role = typeof message.role === 'string' ? message.role : 'user';
    const text = contentToText(message.content);
    return text ? `[${role}]\n${text}` : '';
  }).filter(Boolean);
  if (!blocks.some((block) => block.startsWith('[user]'))) throw httpError(400, 'no user text message found');
  return blocks.join('\n\n');
}

/** 兼容旧调用：解析模型所属站点并返回上游 slug。 */
function mapModel(model) {
  return resolveStation(model).upstreamModel;
}

/** 上游错误 → OpenAI HTTP 状态与错误类型。 */
function mapUpstreamErrorStatus(error) {
  if (error?.code === 'model_at_capacity') return [429, 'rate_limit_error'];
  if (error?.status === 401) return [401, 'authentication_error'];
  if (error?.status === 403) return [403, 'authentication_error'];
  if (error?.status === 429) return [429, 'rate_limit_error'];
  if (error?.status === 503) return [503, 'authentication_error'];
  if (error?.status === 504) return [504, 'api_error'];
  return [502, 'api_error'];
}

function isCapacityError(error) {
  // 只有上游明确标记的容量错误才允许换模型；can_retry:false 与普通 429 限流不重试。
  return error?.code === 'model_at_capacity' && error?.retryable !== false;
}

/** /auth/* 同源校验：只放行浏览器同源导航与同源脚本请求；缺少 Sec-Fetch-* 视为非浏览器客户端。 */
function isSameOriginAuthRequest(req) {
  const dest = req.headers['sec-fetch-dest'];
  const site = req.headers['sec-fetch-site'];
  return (!dest || dest === 'document' || dest === 'empty')
    && (!site || site === 'none' || site === 'same-origin');
}

/** 解析可选的站点参数；未提供返回 undefined，非法值抛 400。 */
function parseStationParam(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const stationId = String(value);
  if (!Object.values(STATION_IDS).includes(stationId)) {
    throw httpError(400, `unknown station: ${stationId.slice(0, 32)}`);
  }
  return stationId;
}

export function createServer(cfg, { credentials = null, uiToken = null } = {}) {
  const ui = createUiHandler({ cfg, token: uiToken });
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const route = url.pathname;
    const method = req.method || 'GET';

    const sendError = (status, message, type = 'invalid_request_error') => writeJson(res, status, openAiError(message, type, status));
    const isLoopback = req.socket.remoteAddress === '127.0.0.1' || req.socket.remoteAddress === '::1' || req.socket.remoteAddress === '::ffff:127.0.0.1';

    if (route === '/auth/status' && method === 'GET') {
      if (!isLoopback) return sendError(403, 'auth endpoints are local-only');
      return writeJson(res, 200, credentials ? credentials.status() : { loggedIn: false, apiKeyConfigured: false });
    }

    if (route === '/auth/login' && (method === 'GET' || method === 'POST')) {
      if (!isSameOriginAuthRequest(req)) return sendError(403, 'login must be triggered from a local page');
      if (!isLoopback) return sendError(403, 'auth endpoints are local-only');
      if (!credentials) return sendError(503, 'credential manager is not configured', 'api_error');
      let station;
      try { station = parseStationParam(url.searchParams.get('station')); } catch (error) { return sendError(error.status || 400, error.message); }
      const start = async () => {
        if (url.searchParams.get('force') === '1') await credentials.closeLogin();
        return credentials.startLogin(station ? { stationId: station } : {});
      };
      start().then((result) => writeJson(res, 200, result)).catch((e) => sendError(500, e.message, 'api_error'));
      return;
    }

    if (route === '/auth/login/form' && method === 'GET') {
      if (!isLoopback) return sendError(403, 'auth endpoints are local-only');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(loginFormHtmlForDisplay);
    }

    if (route === '/auth/login/code' && method === 'POST') {
      if (!isSameOriginAuthRequest(req)) return sendError(403, 'login must be triggered from a local page');
      if (!isLoopback) return sendError(403, 'auth endpoints are local-only');
      if (!credentials?.submitDynamicCode) return sendError(503, 'credential manager is not configured', 'api_error');
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; if (raw.length > 10000) req.destroy(); });
      req.on('end', async () => {
        let body;
        try { body = JSON.parse(raw || '{}'); } catch { return sendError(400, 'invalid JSON body'); }
        try {
          const queryStation = url.searchParams.get('station') || body.station;
          const station = parseStationParam(queryStation);
          const result = await credentials.submitDynamicCode(body.code, { stationId: station });
          return writeJson(res, result.ok ? 200 : 400, result);
        } catch (error) {
          return sendError(error.status || 400, error.message, 'api_error');
        }
      });
      return;
    }

    if (route === '/auth/key/rotate' && method === 'POST') {
      if (!isLoopback) return sendError(403, 'key issuance is local-only');
      if (!credentials) return sendError(503, 'credential manager is not configured', 'api_error');
      const viaMaster = credentials.verifyRotationToken(req.headers['x-chattoapi-rotate']);
      const viaUi = ui.verifyWrite(req);
      if (!viaMaster && !viaUi) {
        return sendError(403, 'X-ChatToAPI-Rotate must carry the local master key token');
      }
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > 10 * 1024) {
          if (!res.writableEnded) sendError(413, 'request body too large');
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => {
        if (res.writableEnded) return;
        let body;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return sendError(400, 'confirm must be "rotate"'); }
        const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (contentType !== 'application/json' || body?.confirm !== 'rotate') return sendError(400, 'confirm must be "rotate"');
        try {
          const apiKey = credentials.rotateApiKey();
          // 响应包含明文 Key：禁止任何缓存。
          return writeJson(res, 200, { apiKey, createdAt: new Date().toISOString() }, { 'cache-control': 'no-store' });
        } catch (error) {
          return sendError(500, error.message, 'api_error');
        }
      });
      return;
    }

    if (ui.handle(req, res, url, method)) return;

    if (route.startsWith('/v1/') && cfg.auth?.requireApiKey !== false) {
      const auth = req.headers.authorization || '';
      const key = auth.replace(/^Bearer\s+/i, '').trim();
      if (!credentials || !credentials.verifyApiKey(key)) return sendError(401, 'invalid or missing API key', 'authentication_error');
    }

    if (method === 'GET' && route === '/v1/models') {
      const hasWorkCredential = Boolean(credentials?.hasUpstreamCredentials?.(STATION_IDS.ONE_OPENAI));
      return writeJson(res, 200, {
        object: 'list',
        data: allModelList({ cfg, hasWorkCredential }),
      });
    }

    if (route === '/health' || route === '/') {
      return writeJson(res, 200, { ok: true });
    }

    if (!(route === '/v1/chat/completions' && method === 'POST')) {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(openAiError(`Not Found: ${method} ${route}`, 'invalid_request_error', 404)));
    }

    // gather body
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 5e6) req.destroy(); });
    req.on('end', async () => {
      let parsed;
      try { parsed = parseChatBody(raw); } catch (e) { return writeJson(res, e.status || 400, openAiError(e.message)); }
      const text = (() => { try { return messagesToPrompt(parsed.messages); } catch (e) { writeJson(res, e.status || 400, openAiError(e.message)); return null; } })();
      if (text === null) return;

      const route = resolveStation(parsed.model, cfg);
      const site = route.stationId;
      const isWork = site === STATION_IDS.ONE_OPENAI;
      const stationConfig = route.stationConfig || {};
      const runtime = credentials?.getStationRuntime?.(site);
      if (isWork && runtime && !runtime.hasCredentials) {
        return writeJson(res, 503, openAiError('Work 站点尚未登录，请先完成 OneOpenAI 登录', 'authentication_error', 503));
      }
      const credential = runtime?.hasCredentials ? runtime.credential : cfg.upstream?.credential;
      const storedHeaders = runtime?.hasCredentials ? runtime.headers : cfg.upstream?.headers;
      const warnings = [];
      if (isWork && (parsed.tools?.length || parsed.tool_choice !== undefined)) {
        warnings.push({ code: 'client_tools_not_supported_by_work' });
      }
      const exposeReasoning = isWork
        && (parsed.chattoapi.reasoning === true || stationConfig.exposeReasoning === true);
      const candidates = (() => {
        if (!isWork) return [route.upstreamModel];
        if (stationConfig.autoFallback === false) return [route.upstreamModel];
        return [route.upstreamModel, ...workFallbackModels(cfg)]
          .filter((value, index, list) => typeof value === 'string'
            && value.endsWith('-wm') && list.indexOf(value) === index)
          .slice(0, 3);
      })();
      const wantStream = parsed.stream;
      const responseModel = isWork ? route.publicModel : route.upstreamModel;
      const created = Math.floor(Date.now() / 1000);

      const invoke = (model, extra) => streamCompletion({
        cfg, model, text, credential, storedHeaders, exposeReasoning,
        ...extra,
      });
      const invalidateSite = (stationId) => {
        if (typeof credentials?.invalidateStation === 'function') credentials.invalidateStation(stationId);
        else credentials?.invalidateUpstream?.();
      };

      if (!wantStream) {
        // 非流式：累积正文、思考摘要与工具活动；容量错误仅在尚未输出时 fallback。
        let full = '';
        let reasoning = '';
        const toolActivities = [];
        const collectedWarnings = [...warnings];
        let usedModel = candidates[0];
        let fallbackFrom = null;
        let lastError = null;
        let succeeded = false;
        let workSnapshot = null;
        for (let index = 0; index < candidates.length; index += 1) {
          usedModel = candidates[index];
          full = '';
          reasoning = '';
          toolActivities.length = 0;
          workSnapshot = null;
          try {
            await invoke(usedModel, {
              onContent: (chunk) => { full += chunk; },
              onReasoning: (chunk) => { reasoning += chunk; },
              onToolActivity: (activity) => { toolActivities.push(activity); },
              onWarning: (warning) => { collectedWarnings.push({ code: warning.code, ...(warning.frameType ? { frame_type: warning.frameType } : {}) }); },
              onMeta: () => {},
              onSnapshot: (snapshot) => { workSnapshot = snapshot; },
            });
            succeeded = true;
            break;
          } catch (error) {
            lastError = error;
            if (error?.status === 401) invalidateSite(site);
            const retryable = isCapacityError(error);
            if (index < candidates.length - 1 && retryable) {
              fallbackFrom = fallbackFrom || candidates[0];
              log.warn('work capacity fallback', { site, from: usedModel, to: candidates[index + 1] });
              continue;
            }
            break;
          }
        }
        if (!succeeded) {
          const error = lastError || new Error('upstream request failed');
          const [status, type] = mapUpstreamErrorStatus(error);
          return writeJson(res, status, openAiError('upstream error: ' + error.message, type, status, error.code || null));
        }
        if (isWork && workSnapshot) {
          // reducer 快照是正文的最终形态，可覆盖 replace/remove 改写导致的增量残留。
          full = workSnapshot.content;
          if (exposeReasoning) reasoning = workSnapshot.reasoning;
          toolActivities.splice(0, toolActivities.length, ...workSnapshot.toolActivities);
        }
        const message = { role: 'assistant', content: full };
        if (exposeReasoning && reasoning) message.reasoning_content = reasoning;
        const body = {
          id: 'chatcmpl-' + uuid(),
          object: 'chat.completion',
          created,
          model: responseModel,
          choices: [{ index: 0, message, finish_reason: 'stop' }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        };
        if (isWork) {
          body.chattoapi = {
            site,
            upstream_model: usedModel,
            work_tools: toolActivities,
            warnings: collectedWarnings,
            fallback_from: fallbackFrom,
            fallback_to: fallbackFrom ? usedModel : null,
          };
        }
        log.info('completion ok', { site, model: usedModel, stream: false, len: full.length });
        return writeJson(res, 200, body);
      }

      // 流式：Sorux 立即写头；Work 延迟到首个可见事件（或成功完成）再写头，
      // 以便容量错误在未输出任何内容时仍能返回 HTTP 429 / 执行 fallback。
      const cid = 'chatcmpl-' + uuid();
      let headersWritten = false;
      const sse = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      const openStream = () => {
        if (headersWritten || res.writableEnded) return;
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
          'x-accel-buffering': 'no',
        });
        headersWritten = true;
        sse({ id: cid, object: 'chat.completion.chunk', created, model: responseModel, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] });
      };
      const emit = (delta) => {
        openStream();
        if (!headersWritten || res.writableEnded) return;
        sse({ id: cid, object: 'chat.completion.chunk', created, model: responseModel, choices: [{ index: 0, delta, finish_reason: null }] });
      };

      const ac = new AbortController();
      const onResClose = () => { if (!res.writableEnded) ac.abort(); };
      res.on('close', onResClose);

      if (!isWork) openStream();
      const collectedWarnings = [...warnings];
      const toolActivities = [];
      let usedModel = candidates[0];
      let fallbackFrom = null;
      let lastError = null;
      let succeeded = false;

      for (let index = 0; index < candidates.length; index += 1) {
        usedModel = candidates[index];
        try {
          await invoke(usedModel, {
            signal: ac.signal,
            onContent: (chunk) => emit({ content: chunk }),
            onReasoning: (chunk) => emit({ reasoning_content: chunk }),
            onToolActivity: (activity) => {
              toolActivities.push(activity);
              emit({ chattoapi_tool_activity: activity });
            },
            onWarning: (warning) => {
              collectedWarnings.push({ code: warning.code, ...(warning.frameType ? { frame_type: warning.frameType } : {}) });
            },
            onMeta: () => {},
          });
          succeeded = true;
          break;
        } catch (error) {
          lastError = error;
          if (error?.status === 401) invalidateSite(site);
          const retryable = isCapacityError(error);
          if (!headersWritten && index < candidates.length - 1 && retryable) {
            fallbackFrom = fallbackFrom || candidates[0];
            log.warn('work capacity fallback', { site, from: usedModel, to: candidates[index + 1] });
            continue;
          }
          break;
        }
      }

      if (!succeeded) {
        const error = lastError || new Error('upstream request failed');
        if (!headersWritten) {
          const [status, type] = mapUpstreamErrorStatus(error);
          return writeJson(res, status, openAiError('upstream error: ' + error.message, type, status, error.code || null));
        }
        try {
          sse({ error: {
            message: 'upstream error: ' + error.message,
            type: mapUpstreamErrorStatus(error)[1],
            param: null,
            code: error.code || error.status || 502,
          } });
          res.write('data: [DONE]\n\n');
          res.end();
        } catch {}
        log.error('stream error', { site, status: error.status || 502, code: error.code || null });
        return;
      }

      openStream();
      sse({ id: cid, object: 'chat.completion.chunk', created, model: responseModel, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
      if (isWork) {
        sse({
          id: cid,
          object: 'chat.completion.chunk',
          created,
          model: responseModel,
          choices: [],
          chattoapi: {
            site,
            upstream_model: usedModel,
            warnings: collectedWarnings,
            tool_count: toolActivities.length,
            fallback_from: fallbackFrom,
            fallback_to: fallbackFrom ? usedModel : null,
          },
        });
      }
      res.write('data: [DONE]\n\n');
      res.end();
      log.info('completion ok', { site, model: usedModel, stream: true, tools: toolActivities.length });
    });
  });
}

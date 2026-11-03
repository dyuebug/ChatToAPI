import http from 'node:http';
import { streamCompletion, uuid } from './upstream.js';
import { log } from './logger.js';

/** Parse /v1/chat/completions body (OpenAI JSON). Returns {messages, model, stream} */
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
function openAiError(message, type = 'invalid_request_error', status = 400) {
  return { error: { message, type, param: null, code: null } };
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

/** Model alias map (display names on List page -> upstream model slug used in /f/conversation) */
function mapModel(model) {
  const alias = {
    'gpt-5.1': 'gpt-5-1',
    'gpt-5.5': 'gpt-5-5',
    'gpt-5.5-mini': 'gpt-5-5-mini',
    'gpt-5.5-thinking': 'gpt-5-5-mini',
    'gpt-5': 'gpt-5',
    'deepseek-v4-flash': 'DeepSeek-V4-Flash',
    'deepseek-v4-pro': 'DeepSeek-V4-Pro',
    'DeepSeek-V4-Flash': 'DeepSeek-V4-Flash',
    'DeepSeek-V4-Pro': 'DeepSeek-V4-Pro',
    'gpt-4o': 'gpt-4o',
    'o3': 'o3',
    'o4-mini': 'o4-mini',
  };
  return alias[model] || model;
}

export function createServer(cfg, { credentials = null } = {}) {
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
      if (!isLoopback) return sendError(403, 'auth endpoints are local-only');
      if (!credentials) return sendError(503, 'credential manager is not configured', 'api_error');
      const start = async () => {
        if (url.searchParams.get('force') === '1') await credentials.closeLogin();
        return credentials.startLogin();
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
      if (!isLoopback) return sendError(403, 'auth endpoints are local-only');
      if (!credentials?.submitDynamicCode) return sendError(503, 'credential manager is not configured', 'api_error');
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; if (raw.length > 10000) req.destroy(); });
      req.on('end', async () => {
        let body;
        try { body = JSON.parse(raw || '{}'); } catch { return sendError(400, 'invalid JSON body'); }
        try {
          const result = await credentials.submitDynamicCode(body.code);
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
      // 回环地址是机器级的：用主密钥摘要证明调用方与当前用户同源。
      if (!credentials.verifyRotationToken(req.headers['x-chattoapi-rotate'])) {
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

    if (route.startsWith('/v1/') && cfg.auth?.requireApiKey !== false) {
      const auth = req.headers.authorization || '';
      const key = auth.replace(/^Bearer\s+/i, '').trim();
      if (!credentials || !credentials.verifyApiKey(key)) return sendError(401, 'invalid or missing API key', 'authentication_error');
    }

    if (method === 'GET' && route === '/v1/models') {
      return writeJson(res, 200, {
        object: 'list',
        data: [
          { id: 'gpt-5.5', object: 'model', owned_by: 'chatopens' },
          { id: 'gpt-5.5-mini', object: 'model', owned_by: 'chatopens' },
          { id: 'gpt-5.1', object: 'model', owned_by: 'chatopens' },
          { id: 'deepseek-v4-flash', object: 'model', owned_by: 'chatopens' },
          { id: 'deepseek-v4-pro', object: 'model', owned_by: 'chatopens' },
        ],
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
      const model = mapModel(parsed.model);
      const text = (() => { try { return messagesToPrompt(parsed.messages); } catch (e) { writeJson(res, e.status || 400, openAiError(e.message)); return null; } })();
      if (text === null) return;

      const wantStream = parsed.stream;

      if (!wantStream) {
        // Non-streaming MVP: accumulate then return single chunk
        let full = '';
        try {
          await streamCompletion({
            cfg, model, text,
            onContent: (c) => { full += c; },
            onReasoning: () => {},
            onMeta: () => {},
          });
        } catch (e) {
          if (e.status === 401) credentials?.invalidateUpstream();
          const status = e.status === 401 ? 401 : e.status === 503 ? 503 : e.status === 504 ? 504 : 502;
          const type = e.status === 401 || e.status === 503 ? 'authentication_error' : 'api_error';
          return writeJson(res, status, openAiError('upstream error: ' + e.message, type, status));
        }
        return writeJson(res, 200, {
          id: 'chatcmpl-' + uuid(),
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, message: { role: 'assistant', content: full }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
      }

      // Streaming
      const cid = 'chatcmpl-' + uuid();
      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      const sse = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      sse({ id: cid, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] });

      const ac = new AbortController();
      const onResClose = () => { if (!res.writableEnded) ac.abort(); };
      res.on('close', onResClose);

      try {
        await streamCompletion({
          cfg, model, text, signal: ac.signal,
          onContent: (c) => sse({ id: cid, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: { content: c }, finish_reason: null }] }),
          onReasoning: () => {},
          onMeta: () => {},
        });
        sse({ id: cid, object: 'chat.completion.chunk', created: Math.floor(Date.now()/1000), model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
        res.write('data: [DONE]\n\n');
        res.end();
        log.info('completion ok', { model, len: 0 });
      } catch (e) {
        if (e.status === 401) credentials?.invalidateUpstream();
        try {
          sse({ error: { message: 'upstream error: ' + e.message, type: e.status === 401 || e.status === 503 ? 'authentication_error' : 'api_error', param: null, code: e.status || 502 } });
          res.write('data: [DONE]\n\n');
          res.end();
        } catch {}
        log.error('stream error', e.message);
      }
    });
  });
}

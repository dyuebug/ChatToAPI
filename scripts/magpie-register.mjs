import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import { loadConfig } from '../src/config.js';
import { CredentialManager } from '../src/credentials.js';

const projectRoot = path.resolve(decodeURIComponent(new URL('../', import.meta.url).pathname).replace(/^\/(?=[a-z]:\/)/i, ''));
const defaultModels = 'gpt-5.5,gpt-5.5-mini,gpt-5.1,deepseek-v4-flash,deepseek-v4-pro';
const gateway = 'http://127.0.0.1:3425';
const providerId = 'chatopens';
const targetModel = `${providerId}/gpt-5.5`;
const secrets = new Set([process.env.CHATTOAPI_API_KEY].filter(Boolean));

for (let index = 2; index < process.argv.length; index += 1) {
  if (process.argv[index] === '--key' && process.argv[index + 1]) {
    secrets.add(process.argv[index + 1]);
  }
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
}

function redact(value) {
  let text = stripAnsi(value);
  for (const secret of secrets) {
    text = text.split(secret).join('ctk_****');
  }
  return text.replace(/ctk_[^\s"'\\<>{}\[\],;|)]+/g, 'ctk_****')
    .replace(/("(?:apiKey|api_key|key)"\s*:\s*")[^"]*"/gi, '$1ctk_****"');
}

function print(message, error = false) {
  (error ? process.stderr : process.stdout).write(`${redact(message)}\n`);
}

function fail(code, message) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function excerpt(value) {
  return Array.from(redact(value)).slice(0, 300).join('');
}

function help() {
  print(`用法：npm run magpie:register -- [选项]
      node scripts/magpie-register.mjs [选项]

将 ChatToAPI 注册为 magpie 的 chatopens provider，并经网关验证真实对话。

选项：
  --exe <path>       magpie 可执行文件路径（相对路径以项目目录为基准）
  --base-url <url>   ChatToAPI 基址，默认 http://127.0.0.1:8787/v1
  --key <ctk_...>    API Key，也可用环境变量 CHATTOAPI_API_KEY 指定
  --models <a,b,c>   模型列表，默认 ${defaultModels}
  --no-verify        跳过非流式和流式真实对话验收
  --help             显示帮助并退出，不发起网络请求

未提供 Key 时会自动轮换签发，旧 Key 将失效；magpie 会明文保存 Key。
脚本不会输出完整 Key。请先启动 ChatToAPI 和 magpie 应用。`);
}

function normalizeBase(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('基址必须是无用户名、密码、查询参数或片段的 HTTP(S) URL');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/v1')) {
    throw new Error('基址必须以 /v1 结尾，不能包含 /chat/completions');
  }
  return url.href.replace(/\/$/, '');
}

function parseArgs(args) {
  const options = { base: 'http://127.0.0.1:8787/v1', models: defaultModels, verify: true };
  const values = new Map([['--exe', 'exe'], ['--base-url', 'base'], ['--key', 'key'], ['--models', 'models']]);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--no-verify') {
      options.verify = false;
      continue;
    }
    if (!values.has(arg)) {
      fail(1, `未知参数：${arg}。请运行 --help 查看用法。`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      fail(1, `参数 ${arg} 缺少值。请运行 --help 查看用法。`);
    }
    options[values.get(arg)] = value;
    index += 1;
  }
  try {
    options.base = normalizeBase(options.base);
  } catch (error) {
    fail(1, `--base-url 无效：${error.message}。示例：http://127.0.0.1:8787/v1。`);
  }
  const models = options.models.split(',').map(model => model.trim());
  if (models.some(model => !model || /\s/.test(model))) {
    fail(1, '--models 应为逗号分隔的非空模型名称，例如 gpt-5.5,gpt-5.5-mini。');
  }
  options.models = [...new Set(models)].join(',');
  return options;
}

async function isExecutable(file) {
  try {
    await fs.promises.access(file, fs.constants.X_OK);
    return (await fs.promises.stat(file)).isFile();
  } catch {
    return false;
  }
}

async function findExecutable(explicit) {
  if (explicit) {
    const file = path.resolve(projectRoot, explicit);
    if (await isExecutable(file)) {
      return file;
    }
    fail(1, `--exe 指定的文件不可执行或不存在：${file}。请指定 magpie 可执行文件的完整路径。`);
  }
  const names = process.platform === 'win32' ? ['magpie.exe', 'magpie'] : ['magpie', 'magpie.exe'];
  const directories = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const candidates = directories.flatMap(directory => names.map(name => path.resolve(projectRoot, directory.replace(/^"|"$/g, ''), name)));
  candidates.push(
    'E:/Download/GoogleDownload/magpie-windows-amd64.exe',
    ...[projectRoot, path.join(os.homedir(), 'Downloads'), path.join(os.homedir(), 'bin')]
      .flatMap(directory => ['magpie.exe', 'magpie', 'magpie-windows-amd64.exe'].map(name => path.join(directory, name))),
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Programs', 'magpie', 'magpie.exe'),
    path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'magpie', 'magpie.exe'),
    path.join(process.env.ProgramFiles || 'C:/Program Files', 'magpie', 'magpie.exe'),
    '/usr/local/bin/magpie',
    '/opt/homebrew/bin/magpie',
  );
  for (const candidate of [...new Set(candidates)]) {
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }
  fail(1, '未找到 magpie 可执行文件。请使用 --exe <完整路径> 指定，例如 --exe "E:/Download/GoogleDownload/magpie-windows-amd64.exe"。');
}

function request(url, { method = 'GET', headers = {}, body, timeout = 15000, onChunk } = {}) {
  return new Promise((resolve, reject) => {
    let status = 0;
    let responseBody = '';
    let timer;
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const transport = new URL(url).protocol === 'https:' ? https : http;
    const req = transport.request(url, {
      method,
      headers: payload === undefined ? headers : { 'Content-Type': 'application/json', ...headers, 'Content-Length': Buffer.byteLength(payload) },
    }, response => {
      status = response.statusCode || 0;
      response.setEncoding('utf8');
      response.on('data', chunk => {
        responseBody = (responseBody + chunk).slice(0, onChunk ? 8192 : 2097152);
        try {
          if (onChunk && status === 200) {
            onChunk(chunk);
          }
        } catch (error) {
          req.destroy(error);
        }
      });
      response.on('error', rejectRequest);
      response.on('end', () => {
        clearTimeout(timer);
        resolve({ status, body: responseBody });
      });
    });
    function rejectRequest(error) {
      clearTimeout(timer);
      error.status = status;
      error.body = responseBody;
      reject(error);
    }
    req.on('error', rejectRequest);
    timer = setTimeout(() => req.destroy(new Error(`请求超时（${timeout / 1000} 秒）`)), timeout);
    req.end(payload);
  });
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function checkHealth(base) {
  try {
    const response = await request(`${base.slice(0, -3)}/health`);
    if (response.status !== 200 || parseJson(response.body)?.ok !== true) {
      throw new Error(`HTTP ${response.status}，响应：${excerpt(response.body)}`);
    }
  } catch (error) {
    fail(2, `ChatToAPI 健康检查失败：${error.message}。请运行 npm start 或 chattoapi.bat start 后重试。`);
  }
}

function rotationToken() {
  // 回环地址是机器级的，服务端用主密钥摘要确认调用方与自身属于同一用户。
  // 这里只派生摘要，不读取明文凭据、不打印主密钥或令牌。
  return new CredentialManager(loadConfig()).keyRotationToken();
}

async function acquireKey(options) {
  let key = options.key ?? process.env.CHATTOAPI_API_KEY;
  if (!key) {
    print('未提供 Key，正在自动签发；旧 Key 将失效。');
    let token;
    try {
      token = rotationToken();
      secrets.add(token);
    } catch (error) {
      fail(3, `读取本地主密钥失败：${error.message}。请确认在 ChatToAPI 项目目录内运行，或用 --key 指定有效 Key。`);
    }
    let response;
    try {
      response = await request(`${options.base.slice(0, -3)}/auth/key/rotate`, {
        method: 'POST',
        headers: { 'X-ChatToAPI-Rotate': token },
        body: { confirm: 'rotate' },
      });
    } catch (error) {
      fail(3, `自动签发 Key 失败：${error.message}。请检查服务，或用 --key 指定有效 Key。`);
    }
    if (response.status === 404) {
      fail(3, '当前服务版本不支持自动签发，请升级后重试或用 --key 指定。');
    }
    if (response.status === 403) {
      fail(3, '自动签发被拒绝（HTTP 403）：本进程与运行中的 ChatToAPI 使用了不同的主密钥。请确认 CHATTOAPI_MASTER_KEY 一致，或用 --key 指定有效 Key。');
    }
    if (response.status !== 200) {
      fail(3, `自动签发 Key 失败：HTTP ${response.status}，响应：${excerpt(response.body)}。请检查服务，或用 --key 指定。`);
    }
    key = parseJson(response.body)?.apiKey;
  }
  if (typeof key !== 'string' || !/^ctk_\S+$/.test(key)) {
    fail(3, '未取得有效的 ctk_ API Key。请用 --key 或 CHATTOAPI_API_KEY 指定后重试。');
  }
  secrets.add(key);
  let response;
  try {
    response = await request(`${options.base}/models`, { headers: { Authorization: `Bearer ${key}` } });
  } catch (error) {
    fail(3, `Key 验证请求失败：${error.message}。请检查 ChatToAPI 服务和 --base-url 后重试。`);
  }
  if (response.status === 401) {
    fail(3, 'Key 无效（HTTP 401）。请使用最新 Key，通过 --key 或 CHATTOAPI_API_KEY 指定后重试。');
  }
  if (response.status !== 200) {
    fail(3, `Key 验证失败：HTTP ${response.status}，响应：${excerpt(response.body)}。请检查 /v1/models 接口后重试。`);
  }
  return key;
}

async function checkGateway() {
  try {
    const response = await request(`${gateway}/api/hello`);
    if (response.status !== 200 || parseJson(response.body)?.name !== 'magpie') {
      throw new Error(`HTTP ${response.status}，响应：${excerpt(response.body)}`);
    }
  } catch (error) {
    fail(4, `magpie 网关检查失败：${error.message}。请启动 magpie 应用，确认 127.0.0.1:3425 可访问后重试。`);
  }
}

function runCli(executable, args, timeout = 30000) {
  return new Promise(resolve => {
    execFile(executable, args, {
      cwd: projectRoot,
      shell: false,
      windowsHide: true,
      timeout,
      killSignal: 'SIGKILL',
      maxBuffer: 2097152,
      encoding: 'utf8',
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        stdout: stripAnsi(stdout || '').trim(),
        output: stripAnsi(`${stdout || ''}\n${stderr || ''}`).trim(),
        error: error ? (error.killed ? `CLI 超时（${timeout / 1000} 秒）` : error.message) : '',
      });
    });
  });
}

function providerBase(output) {
  const json = parseJson(output);
  const records = Array.isArray(json) ? json : [json, json?.provider, json?.data, json?.[providerId]];
  for (const record of records) {
    if (!record || typeof record !== 'object') {
      continue;
    }
    const id = record.id ?? record.providerId ?? record.provider_id;
    const url = record.url ?? record.baseUrl ?? record.base_url ?? record.apiBase;
    if ((id === providerId || record === json?.[providerId]) && typeof url === 'string') {
      try {
        return normalizeBase(url);
      } catch {
        return null;
      }
    }
  }
  if (!/(?:^|[^\w/-])chatopens(?=$|[^\w/-])/m.test(output)) {
    return null;
  }
  const urls = output.match(/https?:\/\/[^\s"'<>│|,\]}]+/g) || [];
  if (urls.length !== 1) {
    return null;
  }
  try {
    return normalizeBase(urls[0]);
  } catch {
    return null;
  }
}

function isMissingProvider(output) {
  // magpie 实际输出：magpie: no provider "chatopens" — magpie providers lists them
  const missing = /不存在|未找到|找不到|\bnot\s+found\b|\bdoes\s+not\s+exist\b|\bno\s+such\s+(?:provider|vendor)\b|\bno\s+provider\b/i;
  const subject = /chatopens|\bprovider\b|\bvendor\b|供应商|提供商|提供者/i;
  return output.split(/\r?\n/).some(line => missing.test(line) && subject.test(line)
    && !/\b(?:command|executable|module|file|config|model|timeout)\b|配置文件|命令|可执行文件|模型|超时/i.test(line));
}

async function registerProvider(executable, options, key) {
  const query = await runCli(executable, ['provider', providerId]);
  const existingBase = providerBase(query.stdout) || providerBase(query.output);
  const exists = query.ok && existingBase === options.base;
  const missing = isMissingProvider(query.output) && !query.error.includes('CLI 超时');
  if (!exists && !missing) {
    const reason = existingBase ? '已有 chatopens 的 URL 与目标基址不一致' : '无法确认 chatopens 是否存在';
    fail(5, `${reason}。请用 magpie provider chatopens 检查配置后重试。详情：${excerpt(query.output || query.error)}`);
  }
  if (exists) {
    // 已存在：用文档明确支持的 provider key / provider models 更新，避免重复 add 生成 chatopens-2。
    const keyed = await runCli(executable, ['provider', 'key', providerId, key]);
    if (!keyed.ok) {
      fail(5, `更新 Key 失败：${excerpt(keyed.output || keyed.error)}。请检查 magpie 配置后重试。`);
    }
    const modelsSet = await runCli(executable, ['provider', 'models', providerId, ...options.models.split(',')]);
    if (!modelsSet.ok) {
      fail(5, `更新模型列表失败：${excerpt(modelsSet.output || modelsSet.error)}。请检查 magpie 配置后重试。`);
    }
  } else {
    const added = await runCli(executable, [
      'provider', 'add', 'ChatToAPI', `id=${providerId}`, `url=${options.base}`, `key=${key}`, `models=${options.models}`,
    ]);
    if (!added.ok) {
      fail(5, `保存 provider 失败：${excerpt(added.output || added.error)}。请检查 magpie 配置和可执行文件后重试。`);
    }
  }
  const refreshed = await runCli(executable, ['provider', 'refresh', providerId], 60000);
  if (!refreshed.ok) {
    fail(5, `配置已保存，但刷新失败：${excerpt(refreshed.output || refreshed.error)}。请执行 magpie provider refresh chatopens 后重试。`);
  }
}

async function waitForModel(executable) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const result = await runCli(executable, ['models']);
    if (result.ok && /(?:^|[^\w/.-])chatopens\/gpt-5\.5(?=$|[^\w/.-])/m.test(result.output)) {
      return;
    }
    if (attempt < 29) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  fail(6, '配置已保存，模型暂未出现');
}

async function verifyConversation(stream, marker) {
  let content = '';
  let pending = '';
  let done = false;
  function parseLine(line) {
    if (!line.startsWith('data:')) {
      return;
    }
    const data = line.slice(5).trim();
    if (!data) {
      return;
    }
    if (data === '[DONE]') {
      done = true;
      return;
    }
    if (done) {
      throw new Error('SSE 在 [DONE] 后仍返回数据');
    }
    const event = JSON.parse(data);
    if (event.error) {
      throw new Error('SSE 返回错误事件');
    }
    const delta = event.choices?.[0]?.delta?.content;
    if (delta !== undefined && delta !== null) {
      if (typeof delta !== 'string') {
        throw new Error('SSE delta.content 不是文本');
      }
      content += delta;
    }
  }
  const label = stream ? '流式' : '非流式';
  let response;
  try {
    response = await request(`${gateway}/v1/chat/completions`, {
      method: 'POST',
      timeout: 150000,
      headers: { Authorization: 'Bearer magpie-chattoapi-verify' },
      body: {
        model: targetModel,
        stream,
        messages: [{ role: 'user', content: `请只输出这一标记，不添加其他文字：${marker}` }],
      },
      onChunk: stream ? chunk => {
        pending += chunk;
        let newline;
        while ((newline = pending.indexOf('\n')) !== -1) {
          const line = pending.slice(0, newline).replace(/\r$/, '');
          pending = pending.slice(newline + 1);
          parseLine(line);
        }
      } : undefined,
    });
    if (response.status !== 200) {
      throw new Error('网关返回非 200 状态');
    }
    if (stream) {
      if (pending) {
        parseLine(pending.replace(/\r$/, ''));
      }
      if (!done || content !== marker) {
        throw new Error(!done ? '未收到 SSE [DONE]' : 'SSE 累积文本与标记不一致');
      }
    } else {
      const message = parseJson(response.body)?.choices?.[0]?.message?.content;
      if (typeof message !== 'string' || message.trim() !== marker) {
        throw new Error('回复文本与标记不一致');
      }
    }
  } catch (error) {
    const status = response?.status ?? error.status ?? 0;
    const body = response?.body ?? error.body ?? '';
    fail(7, `${label}对话验证失败：HTTP ${status || '未收到'}，${error.message}；响应：${excerpt(body) || '（空）'}。请检查 magpie 模型路由及 ChatToAPI 登录状态后重试。`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    help();
    return;
  }
  const options = parseArgs(args);
  const executable = await findExecutable(options.exe);
  print('正在预检 ChatToAPI 服务……');
  await checkHealth(options.base);
  const key = await acquireKey(options);
  print('正在预检 magpie 网关……');
  await checkGateway();
  print('正在检查并保存 chatopens provider……');
  await registerProvider(executable, options, key);
  print('配置已保存：ChatToAPI（chatopens），Key 已更新。\n');
  await waitForModel(executable);
  print(`模型可见：${targetModel}\n`);
  if (options.verify) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(6));
    const marker = `CTAPI_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
    print('正在验证非流式对话……');
    await verifyConversation(false, marker);
    print('正在验证流式对话……');
    await verifyConversation(true, marker);
    print('对话验证通过：非流式和流式回复均匹配标记，已收到 [DONE]。\n');
  } else {
    print('对话验证：已按 --no-verify 跳过。\n');
  }
  print(`下一步：在 magpie GUI 中为某个 agent 选择 ${targetModel}。`);
}

main().catch(error => {
  print(error.exitCode ? error.message : `执行失败：${error.message}。请检查参数和服务状态后重试，或运行 --help 查看用法。`, true);
  process.exitCode = error.exitCode || 1;
});

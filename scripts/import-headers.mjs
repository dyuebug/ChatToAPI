// usage: node scripts/import-headers.mjs [path-to-headers-file]
// Parses a pasted browser "Request Headers" block (or headers.txt) and writes config.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'headers.txt');
if (!fs.existsSync(inputPath)) {
  console.error(`找不到 ${inputPath}。请先创建:粘贴请求头原文到 headers.txt(或传路径)。`);
  process.exit(1);
}

let text = fs.readFileSync(inputPath, 'utf8');
// normalize CRLF
text = text.replace(/\r\n/g, '\n');

const lines = text.split('\n').map(l => l.trimEnd());
const headers = {};
let current = null;
for (const rawLine of lines) {
  const line = rawLine;
  // continuation lines start with whitespace+ (rare here)
  if (!line || line.startsWith('#')) continue;
  if (/^:(method|path|scheme|authority|status)/i.test(line)) continue; // HTTP/2 pseudo-headers
  const m = line.match(/^([^:\s]+):\s?(.*)$/);
  if (m) {
    headers[m[1].toLowerCase()] = m[2].trim();
    current = m[1].toLowerCase();
  } else if (current && /^\s+\S/.test(line)) {
    headers[current] += ' ' + line.trim();
  }
}

const missing = [];
const cookie = headers['cookie'] || '';
const auth = headers['authorization'] || '';
const oaiDevice = headers['oai-device-id'] || '';
if (!cookie) missing.push('cookie');
if (!auth) missing.push('authorization');
if (missing.length) {
  console.error(`缺少字段: ${missing.join(', ')}。请确认粘贴的是 Request Headers 原文。`);
  process.exit(1);
}

const bearer = auth.replace(/^Bearer\s+/i, '').trim();

const examplePath = path.join(ROOT, 'config.example.json');
const cfgPath = path.join(ROOT, 'config.json');
const base = JSON.parse(fs.readFileSync(examplePath, 'utf8'));

function deepMerge(baseObj, overrideObj) {
  const out = Array.isArray(baseObj) ? [...baseObj] : { ...baseObj };
  for (const [k, v] of Object.entries(overrideObj || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && baseObj[k] && typeof baseObj[k] === 'object') {
      out[k] = deepMerge(baseObj[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch { /* first run */ }
cfg = deepMerge(base, cfg); // start from example defaults, keep existing local overrides

function deepSet(obj, keyPath, value) {
  const keys = keyPath.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (typeof o[k] !== 'object' || o[k] === null) o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

deepSet(cfg, 'upstream.credential.cookie', cookie);
deepSet(cfg, 'upstream.credential.bearerToken', bearer);
deepSet(cfg, 'upstream.headers.oai-device-id', oaiDevice);
// optional pass-through of other oai-*/openai-* headers the user pasted
for (const [k, v] of Object.entries(headers)) {
  if (k.startsWith('oai-') || k.startsWith('openai-') || k === 'x-conduit-token') {
    deepSet(cfg, `upstream.headers.${k}`, v);
  }
}

fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
console.log('✓ 已写入 config.json:');
console.log('  cookie:        ', cfg.upstream?.credential?.cookie?.slice(0, 40) + '…');
console.log('  bearerToken:   ', String(cfg.upstream?.credential?.bearerToken).slice(0, 24) + '…');
console.log('  oai-device-id: ', cfg.upstream?.headers?.['oai-device-id']);
console.log('\n提醒:config.json 已加入 .gitignore。启动: npm start');

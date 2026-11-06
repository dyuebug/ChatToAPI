// Real-credential smoke test: one low-frequency request through the real upstream.
// Usage: node scripts/smoke.mjs [model] [text] [--station Sorux|OneOpenAI]
// Prints the translated content and, for Work, redacted tool activity records.
import { loadConfig } from '../src/config.js';
import { CredentialManager } from '../src/credentials.js';
import { setLevel, log } from '../src/logger.js';
import { streamCompletion } from '../src/upstream.js';
import { resolveStation } from '../src/stations/index.js';
import { STATION_IDS } from '../src/stations/contracts.js';

setLevel('debug');

const args = process.argv.slice(2);
const stationFlagIndex = args.indexOf('--station');
const stationFlag = stationFlagIndex >= 0 ? args[stationFlagIndex + 1] : null;
const positional = args.filter((arg, index) => index !== stationFlagIndex && index !== stationFlagIndex + 1);
if (stationFlag && !Object.values(STATION_IDS).includes(stationFlag)) {
  console.error(`smoke: 未知站点 ${stationFlag}（可选 ${Object.values(STATION_IDS).join(' / ')}）`);
  process.exit(1);
}

let cfg;
try { cfg = loadConfig(); } catch (e) { console.error('配置错误:', e.message); process.exit(1); }

const model = positional[0] || (stationFlag === STATION_IDS.ONE_OPENAI ? 'work-gpt-6.1-terra' : 'gpt-5-5-mini');
const text = positional[1] || 'hi';
const route = resolveStation(model, cfg);

// 真实烟测需要把加密凭据注入 cfg；默认注入模型所属站点，可用 --station 覆盖。
const stationId = stationFlag || route.stationId;
let manager;
try {
  manager = new CredentialManager(cfg);
  manager.loadIntoConfig(stationId);
} catch (e) {
  console.error('凭据加载失败:', e.message);
  process.exit(1);
}
if (!manager.hasUpstreamCredentials(stationId)) {
  console.error(`smoke: ${stationId} 站没有可用凭据，请先执行 npm run login -- --station ${stationId}`);
  process.exit(1);
}

console.error(`smoke: station=${stationId} model=${model} route=${route.stationId} text="${text}"`);
console.error(`smoke: -> ${cfg.upstream.baseUrl}${cfg.upstream.conversationPath}`);

const ac = new AbortController();
// hard 120s guard
const timer = setTimeout(() => { console.error('smoke: TIMEOUT 120s'); ac.abort(); }, 120000);

let content = '';
let reasoningChars = 0;
let toolCount = 0;
try {
  await streamCompletion({
    cfg,
    model,
    text,
    signal: ac.signal,
    onContent: (c) => { content += c; process.stdout.write(c); },
    onReasoning: (c) => { reasoningChars += c.length; },
    onToolActivity: (activity) => {
      toolCount += 1;
      console.error(`smoke: tool #${toolCount} ${activity.phase} ${String(activity.label || activity.id || '').slice(0, 80)}`);
    },
    onWarning: (warning) => {
      console.error(`smoke: warning ${warning?.code || 'unknown'}`);
    },
    onMeta: () => {},
  });
  clearTimeout(timer);
  console.error('\n--- SMOKE OK ---');
  console.error('content chars:', content.length);
  if (stationId === STATION_IDS.ONE_OPENAI) console.error(`reasoning chars: ${reasoningChars} tools: ${toolCount}`);
} catch (e) {
  clearTimeout(timer);
  console.error('\n--- SMOKE FAIL ---');
  console.error(e.message);
  if (e.status) console.error('http status:', e.status);
  process.exit(1);
}

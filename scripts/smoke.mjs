// Real-credential smoke test: one low-frequency request through the real upstream.
// Usage: node scripts/smoke.mjs
// Prints the SSE translation (content chunks) so you can verify end-to-end.
import { loadConfig } from '../src/config.js';
import { setLevel, log } from '../src/logger.js';
import { streamCompletion } from '../src/upstream.js';

setLevel('debug');
let cfg;
try { cfg = loadConfig(); } catch (e) { console.error('配置错误:', e.message); process.exit(1); }

const model = process.argv[2] || 'gpt-5-5-mini';
const text = process.argv[3] || 'hi';

console.error(`smoke: model=${model} text="${text}"`);
console.error(`smoke: -> ${cfg.upstream.baseUrl}${cfg.upstream.conversationPath}`);

const ac = new AbortController();
// hard 120s guard
const timer = setTimeout(() => { console.error('smoke: TIMEOUT 120s'); ac.abort(); }, 120000);

let content = '';
try {
  await streamCompletion({
    cfg,
    model,
    text,
    signal: ac.signal,
    onContent: (c) => { content += c; process.stdout.write(c); },
    onReasoning: () => {},
    onMeta: () => {},
  });
  clearTimeout(timer);
  console.error('\n--- SMOKE OK ---');
  console.error('content chars:', content.length);
} catch (e) {
  clearTimeout(timer);
  console.error('\n--- SMOKE FAIL ---');
  console.error(e.message);
  if (e.status) console.error('http status:', e.status);
  process.exit(1);
}

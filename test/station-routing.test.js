import assert from 'node:assert/strict';
import {
  resolveModelRoute,
  soruxModelList,
  workFallbackModels,
  workModelList,
} from '../src/stations/model-catalog.js';

assert.deepEqual(resolveModelRoute('work-gpt-6.1-terra'), {
  stationId: 'OneOpenAI',
  publicModel: 'work-gpt-6.1-terra',
  upstreamModel: 'gpt-6.1-terra-wm',
});
assert.equal(resolveModelRoute('work-gpt-6.1-sol').upstreamModel, 'gpt-6.1-sol-wm');
assert.equal(resolveModelRoute('work-gpt-6-sol').upstreamModel, 'gpt-6-sol-wm');
assert.equal(resolveModelRoute('work-gpt-5.6-sol').upstreamModel, 'gpt-5.6-sol-wm');
assert.equal(resolveModelRoute('gpt-6.1-terra-wm').stationId, 'OneOpenAI');
assert.equal(resolveModelRoute('gpt-6.1-terra-wm').upstreamModel, 'gpt-6.1-terra-wm');
assert.deepEqual(resolveModelRoute('custom-model'), {
  stationId: 'Sorux',
  publicModel: 'custom-model',
  upstreamModel: 'custom-model',
});
assert.equal(resolveModelRoute('gpt-5.5').upstreamModel, 'gpt-5-5');
assert.equal(resolveModelRoute('gpt-5.5-thinking').upstreamModel, 'gpt-5-5-mini');
assert.equal(resolveModelRoute('deepseek-v4-pro').upstreamModel, 'DeepSeek-V4-Pro');
assert.deepEqual(soruxModelList().map((model) => model.id), [
  'gpt-5.5',
  'gpt-5.5-mini',
  'gpt-5.1',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
]);
assert.deepEqual(workModelList(false), []);
const listedWorkModels = workModelList(true);
assert.equal(listedWorkModels.length, 4);
assert.equal(listedWorkModels[0].owned_by, 'chatopens-work');
assert.deepEqual(listedWorkModels[0].chattoapi, {
  site: 'OneOpenAI',
  upstream_model: 'gpt-6.1-terra-wm',
  context_window: 262144,
  capabilities: { server_tools: true, client_tools: false, reasoning_summary: true },
});
assert.deepEqual(workFallbackModels({}), [
  'gpt-6.1-terra-wm',
  'gpt-6-sol-wm',
  'gpt-5.6-sol-wm',
]);
assert.deepEqual(workFallbackModels({
  upstream: { stations: { OneOpenAI: { fallbackModels: ['custom-a', 'custom-b'] } } },
}), ['custom-a', 'custom-b']);

console.log('PASS: station model routing and catalogs');

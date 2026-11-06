import assert from 'node:assert/strict';
import {
  WORK_PATH,
  buildWorkHeaders,
  buildWorkRequest,
  createWorkReducer,
  oneOpenAiAdapter,
} from '../src/stations/oneopenai.js';

const request = buildWorkRequest({ model: 'gpt-6.1-terra-wm', text: 'hello', timezone: 'Etc/UTC', timezoneOffsetMin: 90 });
assert.deepEqual(request, {
  turn_attribution: { turn_trigger: 'composer' },
  action: 'next',
  model: 'gpt-6.1-terra-wm',
  parent_message_id: 'client-created-root',
  timezone: 'Etc/UTC',
  timezone_offset_min: 90,
  conversation_origin: 'tpp',
  is_do_not_remember: false,
  thinking_effort: 'min',
  client_contextual_info: {
    app_name: 'chatgpt.com',
    app_surface: 'codex_browser',
    has_web_push_capabilities: true,
    web_push_notification_permission: 'default',
  },
  messages: [{
    author: { role: 'user', name: null, metadata: {} },
    content: { content_type: 'text', parts: ['hello'] },
    recipient: 'all',
    status: 'finished_successfully',
  }],
  supported_encodings: ['v1'],
  genui_state_snapshots: [],
  client_prepare_state: 'sent',
});
for (const forbidden of [
  'suggestions',
  'history_and_training_disabled',
  'force_paragen',
  'websocket_request_id',
  'local_function_names',
  'local_function_signatures',
]) {
  assert.equal(JSON.stringify(request).includes(forbidden), false);
}

const defaults = buildWorkRequest({ model: 'm', text: 'x' });
assert.ok(typeof defaults.timezone === 'string' && defaults.timezone.length > 0);
assert.equal(defaults.timezone_offset_min, -new Date().getTimezoneOffset());
assert.equal(defaults.thinking_effort, 'min');
const overrides = buildWorkRequest({ model: 'm', text: 'x', timezoneOffsetMin: -240, thinkingEffort: 'high' });
assert.equal(overrides.timezone_offset_min, -240);
assert.equal(overrides.thinking_effort, 'high');

const allowedHeaders = new Set([
  'accept', 'content-type', 'authorization', 'cookie', 'user-agent', 'sec-ch-ua',
  'sec-ch-ua-mobile', 'sec-ch-ua-platform', 'origin', 'referer',
  'oai-client-build-number', 'oai-client-version', 'oai-device-id', 'oai-language',
]);
const withCredential = buildWorkHeaders({
  cfg: { upstream: { baseUrl: 'https://work.example/path' } },
  credential: { bearerToken: 'fake-token', cookie: 'fake-cookie' },
  storedHeaders: { origin: 'https://stored.example', referer: 'https://stored.example/session' },
});
assert.equal(withCredential.authorization, 'Bearer fake-token');
assert.equal(withCredential.cookie, 'fake-cookie');
assert.equal(withCredential.origin, 'https://stored.example');
assert.equal(withCredential.referer, 'https://stored.example/session');
assert.equal(Object.keys(withCredential).every((key) => allowedHeaders.has(key)), true);
assert.equal(Object.keys(withCredential).some((key) => /x-ooa|x-conduit|sentinel/i.test(key)), false);
const withoutCredential = buildWorkHeaders({ cfg: { upstream: { baseUrl: 'https://work.example' } } });
assert.equal('authorization' in withoutCredential, false);
assert.equal('cookie' in withoutCredential, false);
assert.equal(Object.keys(withoutCredential).every((key) => allowedHeaders.has(key)), true);

assert.equal(WORK_PATH, '/backend-api/f/conversation');
assert.deepEqual(oneOpenAiAdapter.resolveModel('work-gpt-6.1-terra'), {
  requestedModel: 'work-gpt-6.1-terra',
  publicModel: 'work-gpt-6.1-terra',
  upstreamModel: 'gpt-6.1-terra-wm',
  capabilities: { server_tools: true, client_tools: false, reasoning_summary: true },
});
const adapterRequest = oneOpenAiAdapter.buildRequest({
  model: 'work-gpt-6.1-terra', text: 'hello', thinkingEffort: 'low',
  stationConfig: { thinkingEffort: 'high' },
});
assert.equal(adapterRequest.path, WORK_PATH);
assert.equal(adapterRequest.method, 'POST');
assert.equal(adapterRequest.body.model, 'gpt-6.1-terra-wm');
assert.equal(adapterRequest.body.thinking_effort, 'high');
assert.equal(oneOpenAiAdapter.listModels({ hasCredential: false }).length, 0);

const hiddenReasoning = createWorkReducer({ exposeReasoning: false });
const bodyEvents = hiddenReasoning.reduce({ o: 'add', p: '/message/content/parts/0', v: 'hello' });
assert.deepEqual(bodyEvents, [{ type: 'content', delta: 'hello' }]);
assert.deepEqual(hiddenReasoning.reduce({ o: 'append', p: '/message/content/parts/0', v: ' world' }), [
  { type: 'content', delta: ' world' },
]);
assert.deepEqual(hiddenReasoning.reduce({ o: 'add', p: '/message/content/thoughts/0/summary', v: 'private thought' }), []);
assert.deepEqual(hiddenReasoning.reduce({ o: 'append', p: '/message/content/thoughts/0/summary', v: ' more' }), []);
const toolEvents = hiddenReasoning.reduce({
  o: 'append', p: '/message/metadata/dil_v2_reasoning/appData/items',
  v: [{ id: 'cmd-1', type: 'command_execution', label: 'run', isActive: true }],
});
assert.deepEqual(toolEvents, [{
  type: 'tool_activity',
  activity: { id: 'cmd-1', type: 'command_execution', phase: 'started', label: 'run', icon: null, active: true },
}]);
const capacityEvents = hiddenReasoning.reduce({
  error: 'upstream-private-original', error_code: 'model_at_capacity', can_retry: false,
});
assert.deepEqual(capacityEvents, [{
  type: 'error',
  error: {
    code: 'model_at_capacity', status: 429, type: 'rate_limit_error', retryable: false,
    message: 'selected Work model is temporarily at capacity',
  },
}]);
assert.equal(JSON.stringify(capacityEvents).includes('upstream-private-original'), false);
assert.deepEqual(hiddenReasoning.reduce({ type: 'message_stream_complete' }), [{ type: 'done' }]);
assert.equal(hiddenReasoning.done, true);
assert.deepEqual(hiddenReasoning.error, capacityEvents[0].error);
assert.deepEqual(hiddenReasoning.snapshot().toolActivities.map((activity) => activity.id), ['cmd-1']);
const reducerFailure = createWorkReducer().reduce(new Proxy({}, {
  get() { throw new Error('upstream-private-original'); },
}));
assert.deepEqual(reducerFailure, [{ type: 'warning', code: 'reducer_failure' }]);
assert.equal(JSON.stringify(reducerFailure).includes('upstream-private-original'), false);

console.log('PASS: Work adapter request, headers, and reducer wiring');

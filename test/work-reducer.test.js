import assert from 'node:assert/strict';
import {
  createInitialReducerState,
  decodePointer,
  finalizeReducerState,
  reduceWorkFrame,
} from '../src/stations/patch-reducer.js';

function feed(state, frame, options) {
  return reduceWorkFrame(state, frame, options);
}

function runFrames(frames, options) {
  let state = createInitialReducerState();
  const events = [];
  for (const frame of frames) {
    const result = feed(state, frame, options);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events, result: finalizeReducerState(state) };
}

assert.deepEqual(decodePointer('/a~1b/c~0d'), ['a/b', 'c~d']);
assert.deepEqual(decodePointer(''), []);
assert.equal(decodePointer('a/b'), null);

const basic = runFrames([
  { o: 'add', p: '/message/content/parts/0', v: 'Hello' },
  { o: 'append', p: '/message/content/parts/0', v: ' world' },
  { o: 'replace', p: '/message/content/parts/0', v: 'Hello world!' },
  { o: 'replace', p: '/message/content/parts/0', v: 'rewritten' },
]);
assert.equal(basic.result.content, 'rewritten');
assert.deepEqual(basic.events.filter((event) => event.type === 'content').map((event) => event.delta), [
  'Hello', ' world', '!',
]);
assert.ok(basic.events.some((event) => event.code === 'content_rewritten'));

const removed = runFrames([
  { o: 'add', p: '/message/content/parts/0', v: 'visible' },
  { o: 'remove', p: '/message/content/parts/0' },
]);
assert.equal(removed.result.content, '');
assert.deepEqual(removed.events.filter((event) => event.type === 'content').map((event) => event.delta), ['visible']);

// Work 的 `add` 是“写入当前 part”，不是 JSON Patch 的插入；否则正文会重复。
const addUpsert = runFrames([
  { v: { message: { id: 'm-upsert', content: { parts: ['old'] } } } },
  { o: 'add', p: '/message/content/parts/0', v: 'new' },
]);
assert.equal(addUpsert.result.content, 'new');
assert.deepEqual(addUpsert.state.document.message.content.parts, ['new']);

const batch = runFrames([
  { o: 'patch', v: [
    { o: 'add', p: '/message/content/parts/0', v: 'A' },
    { o: 'append', p: '/message/content/parts/0', v: 'B' },
  ] },
]);
assert.equal(batch.result.content, 'AB');
assert.deepEqual(batch.events.filter((event) => event.type === 'content').map((event) => event.delta), ['A', 'B']);

const inherited = runFrames([
  { o: 'add', p: '/message/content/parts/0', v: 'A' },
  { o: 'append', p: '/message/content/parts/0', v: 'B' },
  { v: 'C' },
]);
assert.equal(inherited.result.content, 'ABC');

const snapshots = runFrames([
  { c: '1', v: { message: { id: 'm1', content: { parts: ['snap'] } } } },
  { c: '2', v: { message: { id: 'm1', content: { parts: ['snap'] } } } },
  { c: '3', v: { message: { id: 'm1', content: { parts: ['snapshot'] } } } },
]);
assert.equal(snapshots.result.content, 'snapshot');
assert.deepEqual(snapshots.events.filter((event) => event.type === 'content').map((event) => event.delta), ['snap', 'shot']);

const thoughtFrames = [
  { o: 'add', p: '/message/content/thoughts/0/summary', v: 'think' },
  { o: 'append', p: '/message/content/thoughts/0/summary', v: ' more' },
  { o: 'replace', p: '/message/content/thoughts/0/summary', v: 'rewritten' },
];
const hiddenThoughts = runFrames(thoughtFrames, { exposeReasoning: false });
assert.equal(hiddenThoughts.events.some((event) => event.type === 'reasoning'), false);
const exposedThoughts = runFrames(thoughtFrames, { exposeReasoning: true, maxReasoningBytes: 8 });
assert.equal(exposedThoughts.result.reasoning, 'rewritte');
assert.deepEqual(exposedThoughts.events.filter((event) => event.type === 'reasoning').map((event) => event.delta), ['think', ' mo']);
assert.ok(exposedThoughts.events.some((event) => event.code === 'reasoning_rewritten'));

const toolItems = [
  { id: 'exec-1', type: 'command_execution', label: 'run\u0000 this', isActive: true, icon: { name: 'run-command' }, args: { secret: 'hidden' } },
  { id: 'exec-1', type: 'command_execution', label: 42, isActive: true, icon: 'run-command' },
  { id: 'exec-1', type: 'command_execution', label: 'done', isActive: false },
  { id: 'ignored', type: 'other', label: 'not emitted' },
];
const tools = runFrames(toolItems.map((item) => ({
  o: 'append',
  p: '/message/metadata/dil_v2_reasoning/appData/items',
  v: [item],
})));
assert.deepEqual(tools.result.toolActivities.map((item) => item.phase), ['started', 'updated', 'completed']);
assert.equal(tools.result.toolActivities[0].label, 'run this');
assert.equal(tools.result.toolActivities[0].icon, 'run-command');
assert.equal(tools.result.toolActivities[1].label, null);
assert.equal(JSON.stringify(tools.result.toolActivities).includes('secret'), false);

const capacity = runFrames([{
  error: 'private upstream details',
  error_code: 'model_at_capacity',
  can_retry: false,
}]);
assert.deepEqual(capacity.result.error, {
  code: 'model_at_capacity',
  status: 429,
  type: 'rate_limit_error',
  retryable: false,
  message: 'selected Work model is temporarily at capacity',
});
assert.equal(JSON.stringify(capacity.result).includes('private upstream details'), false);

const metadata = runFrames([{
  type: 'server_ste_metadata',
  tool_invoked: true,
  model_slug: 'gpt-6.1-terra-wm',
  turn_use_case: 'work',
  private_value: 'not forwarded',
}]);
assert.deepEqual(metadata.result.metadata, {
  tool_invoked: true,
  model_slug: 'gpt-6.1-terra-wm',
  turn_use_case: 'work',
});

const complete = runFrames([
  { type: 'message_stream_complete' },
  { type: 'message_marker', marker: 'last_token' },
]);
assert.equal(complete.result.done, true);
assert.equal(complete.events.filter((event) => event.type === 'done').length, 1);

const unknown = runFrames([
  { type: 'future_frame', content: 'must not persist' },
  { type: 'future_frame', content: 'also not persist' },
]);
assert.equal(unknown.result.unknownFrameCount, 2);
assert.equal(unknown.events.filter((event) => event.code === 'unknown_frame').length, 1);
assert.equal(JSON.stringify(unknown.result).includes('must not persist'), false);

const incomplete = runFrames([null, { o: 'replace' }, { unrelated: true }]);
assert.equal(incomplete.result.incompleteFrameCount, 3);

console.log('PASS: Work patch reducer behavior');

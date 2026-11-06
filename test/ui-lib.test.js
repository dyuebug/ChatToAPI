import assert from 'node:assert/strict';
import { createSseParser, redact, readStreamDelta, describeToolActivity, describeWarning, describeFallback } from '../src/ui/lib.js';

const redacted = redact('ctk_test_secret Bearer abc123 cookie: session=hidden\n普通中文 /v1/models');
assert.doesNotMatch(redacted, /ctk_test_secret|Bearer abc123|session=hidden/);
assert.match(redacted, /\[redacted\]/);
assert.match(redacted, /普通中文 \/v1\/models/);

const frames = [];
let doneCount = 0;
const parser = createSseParser((frame) => frames.push(frame), () => { doneCount += 1; });
parser.push(new TextEncoder().encode('data: {"text":"你'));
parser.push(new TextEncoder().encode('好"}\r\n\r\n'));
parser.push(new TextEncoder().encode('data: second\r\n\r\n'));
parser.push('data: [DONE]\n\n');
parser.push('data: ignored\n\n');
parser.end();
assert.deepEqual(frames, ['{"text":"你好"}', 'second']);
assert.equal(doneCount, 1);

const crlfFrames = [];
const crlfParser = createSseParser((frame) => crlfFrames.push(frame));
crlfParser.push('data: one\r');
crlfParser.push('\n\r\n');
crlfParser.end();
assert.deepEqual(crlfFrames, ['one']);

const largeParser = createSseParser(() => {});
const started = performance.now();
largeParser.push(`data: ${'x'.repeat(200 * 1024)}\n\n`);
largeParser.end();
assert.ok(performance.now() - started < 50, 'single large SSE chunk should be processed without repeated full-buffer normalization');

const delta = readStreamDelta({
  choices: [{
    delta: {
      content: '正文',
      reasoning_content: '思考',
      chattoapi_tool_activity: { id: 'exec-1', phase: 'started', label: '运行命令', active: true },
    },
  }],
  chattoapi: { site: 'OneOpenAI', upstream_model: 'gpt-6.1-terra-wm', tool_count: 1, warnings: [], fallback_from: null, fallback_to: null },
});
assert.equal(delta.content, '正文');
assert.equal(delta.reasoning, '思考');
assert.equal(delta.toolActivity?.id, 'exec-1');
assert.equal(delta.envelope?.site, 'OneOpenAI');
assert.deepEqual(readStreamDelta({ choices: [{ delta: {} }] }), { content: '', reasoning: '', toolActivity: null, envelope: null });
assert.deepEqual(readStreamDelta(null), { content: '', reasoning: '', toolActivity: null, envelope: null });

const startedTool = describeToolActivity({ id: 'exec-1', phase: 'started', label: '运行命令', active: true });
assert.deepEqual(startedTool, { id: 'exec-1', phase: 'started', active: true, text: '运行命令 · 执行中' });
const doneTool = describeToolActivity({ id: 'exec-1', phase: 'completed', label: '运行命令', active: false });
assert.equal(doneTool?.active, false);
assert.equal(doneTool?.text, '运行命令 · 已完成');
const sanitizedTool = describeToolActivity({ phase: 'unknown', label: '  a\u0000b  ' });
assert.equal(sanitizedTool?.phase, 'updated');
assert.equal(sanitizedTool?.text, 'ab · 更新');
assert.equal(describeToolActivity(null), null);

assert.match(describeWarning({ code: 'client_tools_not_supported_by_work' }), /不支持客户端自定义 tools/);
assert.match(describeWarning('reducer_failure'), /解析异常/);
assert.equal(describeWarning({ code: 'other_code' }), '上游提示：other_code');
assert.equal(describeWarning(null), '');
assert.equal(describeFallback({ fallback_from: 'gpt-6.1-sol-wm', fallback_to: 'gpt-6.1-terra-wm' }), '容量回退：gpt-6.1-sol-wm → gpt-6.1-terra-wm');

console.log('PASS: redact and incremental SSE parser behavior');

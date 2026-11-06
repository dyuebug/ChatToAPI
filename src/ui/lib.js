export function redact(text) {
  return String(text)
    .replace(/ctk_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, '[redacted]')
    .replace(/cookie:\s*[^\n]+/gi, '[redacted]');
}

const TOOL_PHASE_LABELS = Object.freeze({ started: '执行中', updated: '更新', completed: '已完成' });
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

export function readStreamDelta(data) {
  const delta = data?.choices?.[0]?.delta;
  const envelope = data?.chattoapi && typeof data.chattoapi === 'object' ? data.chattoapi : null;
  const activity = delta?.chattoapi_tool_activity;
  return {
    content: typeof delta?.content === 'string' ? delta.content : '',
    reasoning: typeof delta?.reasoning_content === 'string' ? delta.reasoning_content : '',
    toolActivity: activity && typeof activity === 'object' ? activity : null,
    envelope,
  };
}

export function describeToolActivity(activity) {
  if (!activity || typeof activity !== 'object') return null;
  const phase = TOOL_PHASE_LABELS[activity.phase] ? activity.phase : 'updated';
  const raw = typeof activity.label === 'string' ? activity.label.replace(CONTROL_CHARACTERS, '').trim() : '';
  const label = raw ? raw.slice(0, 120) : '工具调用';
  return {
    id: typeof activity.id === 'string' && activity.id ? activity.id : label,
    phase,
    active: phase !== 'completed',
    text: `${label} · ${TOOL_PHASE_LABELS[phase]}`,
  };
}

const WARNING_LABELS = Object.freeze({
  client_tools_not_supported_by_work: 'ChatGPT-Work 站不支持客户端自定义 tools，已忽略该字段；工具由上游自行执行。',
  reducer_failure: '上游数据解析异常，部分工具活动可能缺失。',
});

export function describeWarning(warning) {
  const code = typeof warning === 'string' ? warning : warning?.code;
  if (!code) return '';
  return WARNING_LABELS[code] || `上游提示：${String(code).slice(0, 80)}`;
}

export function describeFallback(envelope) {
  const from = envelope?.fallback_from;
  const to = envelope?.fallback_to;
  return typeof from === 'string' && typeof to === 'string' ? `容量回退：${from} → ${to}` : '';
}

export function createSseParser(onFrame, onDone = () => {}) {
  const decoder = new TextDecoder();
  let buffer = '';
  let pendingCr = false;
  let done = false;

  function normalize(chunk) {
    let text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
    if (pendingCr) {
      text = text.startsWith('\n') ? `\n${text.slice(1)}` : `\n${text}`;
      pendingCr = false;
    }
    if (text.endsWith('\r')) {
      text = text.slice(0, -1);
      pendingCr = true;
    }
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }

  function emit(frame) {
    const payload = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n').trim();
    if (!payload) return;
    if (payload === '[DONE]') { done = true; onDone(); return; }
    onFrame(payload);
  }

  function flushFrames() {
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      emit(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
  }

  return {
    push(chunk) {
      if (done) return;
      buffer += normalize(chunk);
      flushFrames();
    },
    end() {
      if (done) return;
      buffer += normalize(decoder.decode());
      if (pendingCr) { buffer += '\n'; pendingCr = false; }
      flushFrames();
      if (buffer.trim()) emit(buffer);
      buffer = '';
    },
  };
}

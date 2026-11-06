import { EVENT_TYPES, createStationError } from './contracts.js';

const MAX_REASONING_BYTES = 65536;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

export function decodePointer(path) {
  if (path === '') return [];
  if (typeof path !== 'string' || !path.startsWith('/')) return null;
  return path.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
}

export function createInitialReducerState() {
  return {
    document: {},
    lastOperation: null,
    content: '',
    reasoning: '',
    toolActivities: [],
    toolPhases: {},
    toolItemSnapshots: {},
    metadata: {},
    warnings: [],
    unknownFrameCount: 0,
    incompleteFrameCount: 0,
    emittedWarningCodes: [],
    contentByMessage: {},
    done: false,
    error: null,
  };
}

function warning(state, events, code, extra = {}) {
  const warningKey = code === 'unknown_frame' ? `${code}:${extra.frameType || ''}` : code;
  if (state.emittedWarningCodes.includes(warningKey)) return;
  const value = { type: EVENT_TYPES.WARNING, code, ...extra };
  events.push(value);
  state.warnings.push(value);
  state.emittedWarningCodes.push(warningKey);
}

function getAt(root, path) {
  let current = root;
  for (const key of path) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

function setAt(root, path, value, remove = false) {
  if (!path.length) return remove ? {} : value;
  let current = root;
  for (const key of path.slice(0, -1)) {
    if (current[key] == null || typeof current[key] !== 'object') current[key] = {};
    current = current[key];
  }
  const key = path[path.length - 1];
  // 注意：Work 把 `add` 当作“写入当前 part/节点”（实测先 add 再对同一路径 append），
  // 因此数组索引保持覆盖语义而不是 JSON Patch 的插入语义；改为插入会让正文重复。
  if (remove) {
    if (Array.isArray(current) && /^\d+$/.test(key)) current.splice(Number(key), 1);
    else delete current[key];
  } else if (Array.isArray(current) && key === '-') current.push(value);
  else current[key] = value;
  return root;
}

function cloneDocument(document) {
  return structuredClone(document);
}

function emitText(state, events, text, kind) {
  if (typeof text !== 'string') return;
  const field = kind === 'content' ? 'content' : 'reasoning';
  const previous = state[field];
  if (text === previous) return;
  if (text.startsWith(previous)) {
    const suffix = text.slice(previous.length);
    state[field] = text;
    if (suffix) events.push({ type: EVENT_TYPES[kind === 'content' ? 'CONTENT' : 'REASONING'], delta: suffix });
    return;
  }
  state[field] = text;
  warning(state, events, `${kind}_rewritten`);
}

function updateReasoning(state, events, value, options) {
  if (!options.exposeReasoning || typeof value !== 'string') return;
  const current = state.reasoning;
  const bytes = Buffer.byteLength(current, 'utf8');
  if (value.startsWith(current)) {
    const remaining = Math.max(0, (options.maxReasoningBytes ?? MAX_REASONING_BYTES) - bytes);
    const suffix = Buffer.from(value.slice(current.length), 'utf8').subarray(0, remaining).toString('utf8');
    emitText(state, events, current + suffix, 'reasoning');
    return;
  }
  const limit = Math.max(0, options.maxReasoningBytes ?? MAX_REASONING_BYTES);
  const bounded = Buffer.from(value, 'utf8').subarray(0, limit).toString('utf8');
  emitText(state, events, bounded, 'reasoning');
}

function cleanLabel(label) {
  return typeof label === 'string' ? label.replace(CONTROL_CHARACTERS, '').slice(0, 200) : null;
}

function toolActivity(state, events, item) {
  if (!item || item.type !== 'command_execution') return;
  const id = typeof item.id === 'string' ? item.id : null;
  if (!id) return;
  const snapshot = JSON.stringify({
    type: item.type,
    label: item.label,
    isActive: item.isActive,
    icon: item.icon,
  });
  const seenSnapshots = state.toolItemSnapshots[id] || {};
  if (seenSnapshots[snapshot]) return;
  state.toolItemSnapshots[id] = { ...seenSnapshots, [snapshot]: true };
  const active = item.isActive !== false;
  const previous = state.toolPhases[id];
  const phase = !active ? 'completed' : (previous ? 'updated' : 'started');
  const icon = typeof item.icon === 'string' ? item.icon : item.icon?.name;
  const activity = {
    id,
    type: 'command_execution',
    phase,
    label: cleanLabel(item.label),
    icon: typeof icon === 'string' ? icon : null,
    active,
  };
  state.toolPhases[id] = phase;
  state.toolActivities.push(activity);
  events.push({ type: EVENT_TYPES.TOOL_ACTIVITY, activity });
}

function extractTools(state, events, value) {
  const items = Array.isArray(value) ? value : [value];
  for (const item of items) toolActivity(state, events, item);
}

function updateContentFromDocument(state, events, messageId = 'assistant') {
  const message = state.document?.message;
  if (!message || typeof message !== 'object') return;
  const parts = message.content?.parts;
  if (!Array.isArray(parts)) return;
  const snapshot = parts.filter((part) => typeof part === 'string').join('');
  const key = typeof message.id === 'string' ? message.id : messageId;
  const previous = state.contentByMessage[key] || '';
  if (snapshot === previous) return;
  state.contentByMessage[key] = snapshot;
  emitText(state, events, snapshot, 'content');
}

function applyPatch(state, events, patch, options) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    state.incompleteFrameCount += 1;
    warning(state, events, 'incomplete_frame');
    return;
  }
  const operation = patch.o || state.lastOperation?.o;
  const pointer = patch.p !== undefined ? patch.p : (state.lastOperation?.p ?? '');
  const path = decodePointer(pointer);
  if (!operation || !path || !['add', 'append', 'replace', 'remove'].includes(operation)) {
    state.incompleteFrameCount += 1;
    warning(state, events, 'incomplete_frame');
    return;
  }
  if (operation !== 'remove' && !('v' in patch)) {
    state.incompleteFrameCount += 1;
    warning(state, events, 'incomplete_frame');
    return;
  }
  state.lastOperation = { o: operation, p: pointer };

  if (operation === 'remove') {
    state.document = setAt(cloneDocument(state.document), path, undefined, true);
  } else {
    const oldValue = getAt(state.document, path);
    let value = patch.v;
    if (operation === 'append') {
      if (typeof oldValue === 'string' && typeof value === 'string') value = oldValue + value;
      else if (Array.isArray(oldValue) && Array.isArray(value)) value = [...oldValue, ...value];
      else if (Array.isArray(oldValue)) value = [...oldValue, value];
    }
    state.document = setAt(cloneDocument(state.document), path, value);
  }

  if (pointer === '' && state.document?.message) updateContentFromDocument(state, events);
  if (/^\/message\/content\/parts\/0$/.test(pointer)) {
    const current = getAt(state.document, path);
    emitText(state, events, typeof current === 'string' ? current : '', 'content');
  }
  if (/^\/message\/content\/thoughts\/\d+\/summary$/.test(pointer)) {
    updateReasoning(state, events, getAt(state.document, path), options);
  }
  if (pointer === '/message/metadata/dil_v2_reasoning/appData/items') {
    extractTools(state, events, getAt(state.document, path));
  }
}

export function reduceWorkFrame(state, frame, options = {}) {
  const next = {
    ...createInitialReducerState(),
    ...state,
    document: cloneDocument(state?.document || {}),
    contentByMessage: { ...(state?.contentByMessage || {}) },
    toolPhases: { ...(state?.toolPhases || {}) },
    toolItemSnapshots: Object.fromEntries(Object.entries(state?.toolItemSnapshots || {})
      .map(([id, snapshots]) => [id, { ...snapshots }])),
    toolActivities: [...(state?.toolActivities || [])],
    metadata: { ...(state?.metadata || {}) },
    warnings: [...(state?.warnings || [])],
    emittedWarningCodes: [...(state?.emittedWarningCodes || [])],
  };
  const events = [];
  if (frame == null || typeof frame !== 'object' || Array.isArray(frame)) {
    next.incompleteFrameCount += 1;
    warning(next, events, 'incomplete_frame');
    return { state: next, events };
  }
  if (frame.error_code === 'model_at_capacity') {
    const error = createStationError({
      code: 'model_at_capacity',
      status: 429,
      type: 'rate_limit_error',
      retryable: frame.can_retry !== false,
      message: 'selected Work model is temporarily at capacity',
    });
    next.error = error;
    events.push({ type: EVENT_TYPES.ERROR, error });
    return { state: next, events };
  }
  if (frame.type === 'message_stream_complete' || (frame.type === 'message_marker' && frame.marker === 'last_token')) {
    if (!next.done) {
      next.done = true;
      events.push({ type: EVENT_TYPES.DONE });
    }
    return { state: next, events };
  }
  if (frame.type === 'server_ste_metadata') {
    const meta = {};
    for (const key of ['tool_invoked', 'model_slug', 'turn_use_case']) {
      if (frame[key] !== undefined) meta[key] = frame[key];
    }
    next.metadata = { ...next.metadata, ...meta };
    if (Object.keys(meta).length) events.push({ type: EVENT_TYPES.META, value: meta });
    return { state: next, events };
  }
  if (['resume_conversation_token', 'title_generation', 'conversation_detail_metadata'].includes(frame.type)) {
    return { state: next, events };
  }
  const patchList = Array.isArray(frame.v)
    && (frame.o === 'patch' || frame.v.every((item) => item && typeof item === 'object'
      && ('o' in item || 'p' in item || 'v' in item)));
  if (patchList) {
    for (const patch of frame.v) applyPatch(next, events, patch, options);
    return { state: next, events };
  }
  if ('o' in frame || 'p' in frame || ('v' in frame && (frame.v === null || typeof frame.v !== 'object'))) {
    applyPatch(next, events, frame, options);
    return { state: next, events };
  }
  if (frame.v && typeof frame.v === 'object') {
    const message = frame.v.message;
    if (message && typeof message === 'object') {
      next.document = cloneDocument(frame.v);
      updateContentFromDocument(next, events, message.id || 'assistant');
      const thoughts = message.content?.thoughts;
      if (Array.isArray(thoughts)) {
        for (const thought of thoughts) updateReasoning(next, events, thought?.summary, options);
      }
      extractTools(next, events, message.metadata?.dil_v2_reasoning?.appData?.items);
    }
    return { state: next, events };
  }
  if (frame.type) {
    next.unknownFrameCount += 1;
    warning(next, events, 'unknown_frame', { frameType: frame.type });
  } else {
    next.incompleteFrameCount += 1;
    warning(next, events, 'incomplete_frame');
  }
  return { state: next, events };
}

export function finalizeReducerState(state) {
  return {
    content: state.content,
    reasoning: state.reasoning,
    toolActivities: [...state.toolActivities],
    metadata: { ...state.metadata },
    warnings: [...state.warnings],
    unknownFrameCount: state.unknownFrameCount,
    incompleteFrameCount: state.incompleteFrameCount,
    done: state.done,
    error: state.error,
  };
}

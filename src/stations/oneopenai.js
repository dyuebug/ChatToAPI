import { STATION_IDS } from './contracts.js';
import { resolveModelRoute, workModelList } from './model-catalog.js';
import {
  createInitialReducerState,
  finalizeReducerState,
  reduceWorkFrame,
} from './patch-reducer.js';

export const WORK_PATH = '/backend-api/f/conversation';

const CAPABILITIES = Object.freeze({
  server_tools: true,
  client_tools: false,
  reasoning_summary: true,
});

const HEADER_ALLOWLIST = Object.freeze([
  'accept',
  'content-type',
  'authorization',
  'cookie',
  'user-agent',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'origin',
  'referer',
  'oai-client-build-number',
  'oai-client-version',
  'oai-device-id',
  'oai-language',
]);

function resolveTimezone(timezone) {
  if (timezone !== undefined) return timezone;
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function buildWorkRequest({
  model,
  text,
  parentMessageId = 'client-created-root',
  thinkingEffort = 'min',
  timezone,
  timezoneOffsetMin = -new Date().getTimezoneOffset(),
} = {}) {
  return {
    turn_attribution: { turn_trigger: 'composer' },
    action: 'next',
    model,
    parent_message_id: parentMessageId,
    timezone: resolveTimezone(timezone),
    timezone_offset_min: timezoneOffsetMin,
    conversation_origin: 'tpp',
    is_do_not_remember: false,
    thinking_effort: thinkingEffort,
    client_contextual_info: {
      app_name: 'chatgpt.com',
      app_surface: 'codex_browser',
      has_web_push_capabilities: true,
      web_push_notification_permission: 'default',
    },
    messages: [{
      author: { role: 'user', name: null, metadata: {} },
      content: { content_type: 'text', parts: [text] },
      recipient: 'all',
      status: 'finished_successfully',
    }],
    supported_encodings: ['v1'],
    genui_state_snapshots: [],
    client_prepare_state: 'sent',
  };
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function deriveOrigin(baseUrl) {
  if (typeof baseUrl !== 'string' || !baseUrl) return undefined;
  try {
    return new URL(baseUrl).origin;
  } catch {
    return undefined;
  }
}

export function buildWorkHeaders({ cfg = {}, credential = {}, storedHeaders = {} } = {}) {
  const configHeaders = cfg?.upstream?.headers || {};
  const stored = storedHeaders || {};
  const headers = {
    accept: 'text/event-stream',
    'content-type': 'application/json',
  };

  const bearerToken = nonEmptyString(credential?.bearerToken);
  const cookie = nonEmptyString(credential?.cookie);
  if (bearerToken) headers.authorization = `Bearer ${bearerToken}`;
  if (cookie) headers.cookie = cookie;

  const origin = deriveOrigin(cfg?.upstream?.baseUrl);
  const defaults = {
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Chromium";v="152", "Not(A:Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    origin,
    referer: origin ? `${origin}/` : undefined,
    'oai-client-build-number': '4903962',
    'oai-client-version': 'prod-c8317ee14c178f58734a7c3fe41bcfaca8156ed1',
    'oai-device-id': '00000000-0000-0000-0000-000000000000',
    'oai-language': 'en',
  };

  for (const name of HEADER_ALLOWLIST) {
    if (name === 'accept' || name === 'content-type' || name === 'authorization' || name === 'cookie') continue;
    const value = nonEmptyString(stored[name])
      ?? nonEmptyString(configHeaders[name])
      ?? defaults[name];
    if (value !== undefined) headers[name] = value;
  }

  return headers;
}

export function createWorkReducer({ exposeReasoning = false, maxReasoningBytes } = {}) {
  const options = { exposeReasoning, maxReasoningBytes };
  let state = createInitialReducerState();

  return {
    reduce(frame) {
      try {
        const result = reduceWorkFrame(state, frame, options);
        state = result.state;
        return result.events;
      } catch {
        return [{ type: 'warning', code: 'reducer_failure' }];
      }
    },
    snapshot() {
      return finalizeReducerState(state);
    },
    get done() {
      return state.done;
    },
    get error() {
      return state.error;
    },
  };
}

export const oneOpenAiAdapter = Object.freeze({
  id: STATION_IDS.ONE_OPENAI,
  deferHeaders: true,
  resolveModel(model) {
    const route = resolveModelRoute(model);
    return {
      requestedModel: model,
      publicModel: route.publicModel,
      upstreamModel: route.upstreamModel,
      capabilities: { ...CAPABILITIES },
    };
  },
  buildRequest(options = {}) {
    const route = resolveModelRoute(options.model);
    const thinkingEffort = options.stationConfig?.thinkingEffort ?? options.thinkingEffort;
    const body = buildWorkRequest({
      ...options,
      model: route.upstreamModel,
      thinkingEffort: thinkingEffort ?? 'min',
    });
    return { path: WORK_PATH, method: 'POST', body };
  },
  buildHeaders(options) {
    return buildWorkHeaders(options);
  },
  createReducer(options) {
    return createWorkReducer(options);
  },
  listModels({ hasCredential } = {}) {
    return workModelList(hasCredential);
  },
});

import { STATION_IDS } from './contracts.js';
import { resolveModelRoute, soruxModelList } from './model-catalog.js';

const CAPABILITIES = Object.freeze({
  server_tools: false,
  client_tools: false,
  reasoning_summary: false,
});

export function buildSoruxRequest({
  model,
  text,
  conversationId = null,
  parentMessageId,
  websocketRequestId,
} = {}) {
  const messages = [
    {
      author: { role: 'user' },
      content: { content_type: 'text', parts: [text] },
    },
  ];
  return {
    action: 'next',
    conversation_id: conversationId,
    conversation_origin: null,
    model,
    timezone_offset_min: -new Date().getTimezoneOffset(),
    suggestions: [],
    history_and_training_disabled: false,
    messages,
    parent_message_id: parentMessageId,
    websocket_request_id: websocketRequestId,
    force_paragen: false,
    supported_encodings: ['v1'],
  };
}

export function buildSoruxHeaders({ cfg = {}, credential, storedHeaders = {} } = {}) {
  const upstream = cfg?.upstream || {};
  const effectiveCredential = credential ?? upstream.credential ?? {};
  const configuredHeaders = upstream.headers || {};
  const headers = { ...configuredHeaders, ...(storedHeaders || {}) };
  const hdrs = {
    accept: 'text/event-stream',
    'content-type': 'application/json',
    authorization: `Bearer ${effectiveCredential.bearerToken}`,
    cookie: effectiveCredential.cookie,
    'oai-client-build-number': headers['oai-client-build-number'] || '4903962',
    'oai-client-version': headers['oai-client-version'] || 'prod-c8317ee14c178f58734a7c3fe41bcfaca8156ed1',
    'oai-device-id': headers['oai-device-id'] || '00000000-0000-4000-8000-000000000000',
    'oai-language': headers['oai-language'] || 'en',
    'x-conduit-token': headers['x-conduit-token'] || 'saas_nexus_no_token',
    'openai-sentinel-chat-requirements-token': headers['openai-sentinel-chat-requirements-token'] || 'Fuck_You',
    'user-agent': headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
  };
  if (headers['openai-sentinel-turnstile-token']) {
    hdrs['openai-sentinel-turnstile-token'] = headers['openai-sentinel-turnstile-token'];
  }
  return hdrs;
}

export const soruxAdapter = Object.freeze({
  id: STATION_IDS.SORUX,
  deferHeaders: false,
  resolveModel(model) {
    const route = resolveModelRoute(model);
    const isSoruxRoute = route.stationId === STATION_IDS.SORUX;
    return {
      requestedModel: model,
      publicModel: isSoruxRoute ? route.publicModel : model,
      upstreamModel: isSoruxRoute ? route.upstreamModel : model,
      capabilities: { ...CAPABILITIES },
    };
  },
  buildRequest(options = {}) {
    const route = resolveModelRoute(options.model);
    const body = buildSoruxRequest({
      ...options,
      model: route.upstreamModel,
    });
    return {
      path: options.cfg?.upstream?.conversationPath || '/backend-api/f/conversation',
      method: 'POST',
      body,
    };
  },
  buildHeaders(options = {}) {
    return buildSoruxHeaders(options);
  },
  listModels() {
    return soruxModelList();
  },
});

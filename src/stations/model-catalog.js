import { STATION_IDS } from './contracts.js';

const SORUX_ALIASES = Object.freeze({
  'gpt-5.1': 'gpt-5-1',
  'gpt-5.5': 'gpt-5-5',
  'gpt-5.5-mini': 'gpt-5-5-mini',
  'gpt-5.5-thinking': 'gpt-5-5-mini',
  'gpt-5': 'gpt-5',
  'deepseek-v4-flash': 'DeepSeek-V4-Flash',
  'deepseek-v4-pro': 'DeepSeek-V4-Pro',
  'DeepSeek-V4-Flash': 'DeepSeek-V4-Flash',
  'DeepSeek-V4-Pro': 'DeepSeek-V4-Pro',
  'gpt-4o': 'gpt-4o',
  o3: 'o3',
  'o4-mini': 'o4-mini',
});

const WORK_ALIASES = Object.freeze({
  'work-gpt-6.1-terra': 'gpt-6.1-terra-wm',
  'work-gpt-6.1-sol': 'gpt-6.1-sol-wm',
  'work-gpt-6-sol': 'gpt-6-sol-wm',
  'work-gpt-5.6-sol': 'gpt-5.6-sol-wm',
});

const WORK_MODELS = Object.freeze(Object.entries(WORK_ALIASES));

export function resolveModelRoute(model) {
  const requested = typeof model === 'string' ? model : '';
  if (WORK_ALIASES[requested]) {
    return {
      stationId: STATION_IDS.ONE_OPENAI,
      publicModel: requested,
      upstreamModel: WORK_ALIASES[requested],
    };
  }
  if (requested.endsWith('-wm')) {
    return {
      stationId: STATION_IDS.ONE_OPENAI,
      publicModel: requested,
      upstreamModel: requested,
    };
  }
  return {
    stationId: STATION_IDS.SORUX,
    publicModel: requested,
    upstreamModel: SORUX_ALIASES[requested] || requested,
  };
}

export function soruxModelList() {
  return [
    { id: 'gpt-5.5', object: 'model', owned_by: 'chatopens' },
    { id: 'gpt-5.5-mini', object: 'model', owned_by: 'chatopens' },
    { id: 'gpt-5.1', object: 'model', owned_by: 'chatopens' },
    { id: 'deepseek-v4-flash', object: 'model', owned_by: 'chatopens' },
    { id: 'deepseek-v4-pro', object: 'model', owned_by: 'chatopens' },
  ];
}

export function workModelList(hasCredential) {
  if (!hasCredential) return [];
  return WORK_MODELS.map(([id, upstreamModel]) => ({
    id,
    object: 'model',
    owned_by: 'chatopens-work',
    chattoapi: {
      site: STATION_IDS.ONE_OPENAI,
      upstream_model: upstreamModel,
      context_window: 262144,
      capabilities: {
        server_tools: true,
        client_tools: false,
        reasoning_summary: true,
      },
    },
  }));
}

export function workFallbackModels(cfg) {
  const models = cfg?.upstream?.stations?.OneOpenAI?.fallbackModels;
  return Array.isArray(models)
    ? [...models]
    : ['gpt-6.1-terra-wm', 'gpt-6-sol-wm', 'gpt-5.6-sol-wm'];
}

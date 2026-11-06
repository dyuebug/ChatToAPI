export const STATION_IDS = Object.freeze({
  SORUX: 'Sorux',
  ONE_OPENAI: 'OneOpenAI',
});

export const EVENT_TYPES = Object.freeze({
  CONTENT: 'content',
  REASONING: 'reasoning',
  TOOL_ACTIVITY: 'tool_activity',
  META: 'meta',
  WARNING: 'warning',
  ERROR: 'error',
  DONE: 'done',
});

export function createStationError({ code, status, type, retryable, message }) {
  return { code, status, type, retryable, message };
}

/**
 * 站点适配器接口约定：
 * resolveModel(model, cfg) -> { requestedModel, publicModel, upstreamModel, capabilities }
 * buildRequest(options) -> { path, method, body }
 * buildHeaders(options) -> headers
 * createReducer(options) -> reducer
 * listModels(options) -> model[]
 * deferHeaders -> boolean
 */

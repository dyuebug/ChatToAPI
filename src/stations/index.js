import { STATION_IDS } from './contracts.js';
import { resolveModelRoute, soruxModelList, workModelList } from './model-catalog.js';
import { oneOpenAiAdapter } from './oneopenai.js';
import { soruxAdapter } from './sorux.js';

export const STATION_ADAPTERS = Object.freeze({
  [STATION_IDS.SORUX]: soruxAdapter,
  [STATION_IDS.ONE_OPENAI]: oneOpenAiAdapter,
});

export function resolveStation(model, cfg = {}) {
  let route;
  try {
    route = resolveModelRoute(model);
  } catch {
    route = { stationId: STATION_IDS.SORUX, publicModel: model, upstreamModel: model };
  }
  const stationId = STATION_ADAPTERS[route.stationId] ? route.stationId : STATION_IDS.SORUX;
  const adapter = STATION_ADAPTERS[stationId];
  const resolved = adapter.resolveModel(model, cfg);
  return {
    stationId,
    adapter,
    stationConfig: cfg?.upstream?.stations?.[stationId] || {},
    requestedModel: resolved.requestedModel,
    publicModel: resolved.publicModel,
    upstreamModel: resolved.upstreamModel,
    capabilities: resolved.capabilities,
  };
}

export function allModelList({ cfg = {}, hasWorkCredential = false } = {}) {
  return [...soruxModelList(), ...workModelList(hasWorkCredential)];
}

export { oneOpenAiAdapter, soruxAdapter };

let level = 'info';
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

export function setLevel(l) { level = l; }

function ts() { return new Date().toISOString(); }

export const log = {
  debug: (...a) => LEVELS[level] <= 10 && console.error(`[${ts()}] DEBUG`, ...a),
  info: (...a) => LEVELS[level] <= 20 && console.error(`[${ts()}] INFO`, ...a),
  warn: (...a) => LEVELS[level] <= 30 && console.error(`[${ts()}] WARN`, ...a),
  error: (...a) => LEVELS[level] <= 40 && console.error(`[${ts()}] ERROR`, ...a),
};

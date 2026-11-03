import { loadConfig } from './config.js';
import { setLevel, log } from './logger.js';
import { createServer } from './server.js';
import { CredentialManager } from './credentials.js';

let cfg;
try {
  cfg = loadConfig();
} catch (e) {
  console.error('配置错误:', e.message);
  process.exit(1);
}

if (process.env.CHATTOAPI_PROFILE_DIR) {
  cfg.auth = { ...(cfg.auth || {}), profileDir: process.env.CHATTOAPI_PROFILE_DIR };
}

setLevel(cfg.logLevel || 'info');

let credentials;
try {
  credentials = new CredentialManager(cfg);
  credentials.loadIntoConfig();
} catch (e) {
  console.error('凭据存储错误:', e.message);
  process.exit(1);
}

const host = process.env.CHATTOAPI_HOST || cfg.host || '127.0.0.1';
const port = Number(process.env.CHATTOAPI_PORT || cfg.port || 8787);
createServer(cfg, { credentials }).listen(port, host, () => {
  log.info(`ChatToAPI listening on http://${host}:${port}`);
  log.info('OpenAI-compatible endpoint: POST /v1/chat/completions');
  log.info('curl example:');
  log.info(`  curl -N http://${host}:${port}/v1/chat/completions -H "Content-Type: application/json" -d '{"model":"gpt-5.5-mini","stream":true,"messages":[{"role":"user","content":"你好"}]}'`);
  if (cfg.auth?.requireApiKey !== false) {
    const key = credentials.getInitialApiKey();
    if (key) log.info(`首次 API Key（只显示一次）: ${key}`);
  }
});

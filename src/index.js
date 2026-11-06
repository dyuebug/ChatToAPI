import { loadConfig } from './config.js';
import { setLevel, log } from './logger.js';
import { createServer } from './server.js';
import { CredentialManager } from './credentials.js';
import { removeUiTokenFile, resolveUiToken, writeUiTokenFile } from './ui-server.js';

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
const uiToken = resolveUiToken(cfg);
const isLoopbackHost = host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '::ffff:127.0.0.1';
const displayHost = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;

createServer(cfg, { credentials, uiToken }).listen(port, host, () => {
  log.info(`ChatToAPI listening on http://${host}:${port}`);
  log.info('OpenAI-compatible endpoint: POST /v1/chat/completions');
  log.info('curl example:');
  log.info(`  curl -N http://${host}:${port}/v1/chat/completions -H "Content-Type: application/json" -d '{"model":"gpt-5.5-mini","stream":true,"messages":[{"role":"user","content":"你好"}]}'`);
  if (uiToken && isLoopbackHost) {
    log.info(`本地控制台: http://${displayHost}:${port}/ui?t=${uiToken}（令牌只显示一次，可用 npm run service:status 再次查看）`);
    if (!process.env.CHATTOAPI_UI_TOKEN) {
      writeUiTokenFile(cfg, uiToken);
      // 只有真正写入令牌文件的实例才负责清理，避免临时实例误删正式服务的令牌。
      process.on('exit', () => removeUiTokenFile(cfg));
    }
  }
  if (cfg.auth?.requireApiKey !== false) {
    const key = credentials.getInitialApiKey();
    if (key) log.info(`首次 API Key（只显示一次）: ${key}`);
  }
});

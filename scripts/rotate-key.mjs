import { loadConfig } from '../src/config.js';
import { CredentialManager } from '../src/credentials.js';

const cfg = loadConfig();
const manager = new CredentialManager(cfg);
const key = manager.rotateApiKey();
console.log(key);
console.error('新的 API Key 只显示本次，请立即保存；旧 Key 已失效。');

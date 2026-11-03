import { loadConfig } from '../src/config.js';
import { CredentialManager } from '../src/credentials.js';

const cfg = loadConfig();
const manager = new CredentialManager(cfg);
const timeoutMs = Number(cfg.auth?.loginTimeoutMs || 10 * 60 * 1000);

try {
  const result = await manager.startLogin();
  console.error(result.instruction || '请在浏览器中完成登录。');
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (manager.status().loggedIn) {
      console.log('登录成功，凭据已加密保存。');
      process.exitCode = 0;
      await manager.closeLogin();
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!manager.status().loggedIn) {
    console.error('登录等待超时，请确认已在站点内发送消息后重试。');
    process.exitCode = 1;
    await manager.closeLogin();
  }
} catch (error) {
  console.error(`登录失败: ${error.message}`);
  process.exitCode = 1;
}

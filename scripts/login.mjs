import { loadConfig } from '../src/config.js';
import { CredentialManager } from '../src/credentials.js';
import { STATION_IDS } from '../src/stations/contracts.js';

function parseStation(args) {
  const inline = args.find((arg) => arg.startsWith('--station='));
  const index = args.indexOf('--station');
  const value = inline ? inline.slice('--station='.length) : index >= 0 ? args[index + 1] : '';
  if (!value) return null;
  if (!Object.values(STATION_IDS).includes(value)) {
    throw new Error(`未知站点：${value}（可选 ${Object.values(STATION_IDS).join(' / ')}）`);
  }
  return value;
}

let stationId;
try {
  stationId = parseStation(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const cfg = loadConfig();
const manager = new CredentialManager(cfg);
const timeoutMs = Number(cfg.auth?.loginTimeoutMs || 10 * 60 * 1000);
const targetStation = stationId || manager.status().activeStation;
const isLoggedIn = () => manager.status().stations?.[targetStation]?.loggedIn === true;

console.error(`登录站点：${targetStation}`);

try {
  const result = await manager.startLogin(stationId ? { stationId } : {});
  console.error(result.instruction || '请在浏览器中完成登录。');
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (isLoggedIn()) {
      console.log(`${targetStation} 站登录成功，凭据已加密保存。`);
      process.exitCode = 0;
      await manager.closeLogin();
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!isLoggedIn()) {
    console.error(`${targetStation} 站登录等待超时，请确认已在站点内发送消息后重试。`);
    process.exitCode = 1;
    await manager.closeLogin();
  }
} catch (error) {
  console.error(`登录失败: ${error.message}`);
  process.exitCode = 1;
}

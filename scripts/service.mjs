import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = path.join(ROOT, 'scripts', 'chattoapi.ps1');
const COMMANDS = ['menu', 'start', 'stop', 'restart', 'status', 'monitor', 'console', 'adopt'];

/**
 * npm 在不同 shell 下调用 `chattoapi.bat` 会失败：
 * CMD 依赖当前目录查找，Git Bash 不会把当前目录加入 PATH。
 * 这里统一用 node 启动 PowerShell，保证 CMD / PowerShell / Git Bash 行为一致。
 */
function usage() {
  console.error('用法: node scripts/service.mjs <menu|start|stop|restart|status|monitor|console|adopt> [秒数]');
}

const [rawCommand, rawSeconds, ...rest] = process.argv.slice(2);
const command = (rawCommand || 'status').toLowerCase();

if (!COMMANDS.includes(command)) {
  usage();
  process.exit(2);
}
if (rest.length) {
  usage();
  process.exit(2);
}

if (process.platform !== 'win32') {
  console.error('服务管理脚本仅支持 Windows。Linux / macOS 请直接运行 npm start。');
  process.exit(1);
}

const extra = [];
if (rawSeconds !== undefined) {
  const seconds = Number(rawSeconds);
  if (!Number.isInteger(seconds) || seconds <= 0) {
    console.error(`无效的秒数: ${rawSeconds}`);
    process.exit(2);
  }
  if (command === 'monitor') extra.push('-IntervalSeconds', String(seconds));
  else if (command === 'start' || command === 'restart') extra.push('-StartupTimeoutSeconds', String(seconds));
  else {
    console.error(`${command} 不接受秒数参数。`);
    process.exit(2);
  }
}

const args = [
  '-NoLogo',
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', SCRIPT,
  command,
  ...extra,
];

const child = spawn('powershell.exe', args, {
  cwd: ROOT,
  stdio: 'inherit',
  windowsHide: false,
});

child.on('error', (error) => {
  console.error(`无法启动 PowerShell: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  // Ctrl+C 结束时 code 为 null，按中断处理。
  process.exit(code === null ? 1 : code);
});

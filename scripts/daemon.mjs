import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const [projectRoot, stdoutPath, stderrPath, pidPath] = process.argv.slice(2);
if (!projectRoot || !stdoutPath || !stderrPath || !pidPath) {
  console.error('usage: node scripts/daemon.mjs <project-root> <stdout-log> <stderr-log> <pid-file>');
  process.exit(2);
}

const stdoutFd = fs.openSync(path.resolve(stdoutPath), 'a');
const stderrFd = fs.openSync(path.resolve(stderrPath), 'a');
const child = spawn(process.execPath, ['src/index.js'], {
  cwd: path.resolve(projectRoot),
  detached: true,
  windowsHide: true,
  stdio: ['ignore', stdoutFd, stderrFd],
});
child.unref();
fs.closeSync(stdoutFd);
fs.closeSync(stderrFd);
fs.writeFileSync(path.resolve(pidPath), String(child.pid), 'utf8');

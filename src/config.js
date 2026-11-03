import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

export function loadConfig() {
  // config.json (local, git-ignored) overrides config.example.json defaults
  const examplePath = path.join(ROOT, 'config.example.json');
  const localPath = path.join(ROOT, 'config.json');
  const base = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
  let local = {};
  if (fs.existsSync(localPath)) local = JSON.parse(fs.readFileSync(localPath, 'utf8'));
  const cfg = deepMerge(base, local);

  // 凭据由 CredentialManager 在登录后注入；允许首次启动时为空。
  return cfg;
}

function deepMerge(base, override) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return override ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override ?? {})) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? deepMerge(base[k], v) : v;
  }
  return out;
}

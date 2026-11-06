import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CredentialManager } from '../src/credentials.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chattoapi-credential-v2-'));
const previousMasterKey = process.env.CHATTOAPI_MASTER_KEY;
process.env.CHATTOAPI_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');

function makeManager(car = 'Sorux') {
  const manager = new CredentialManager({
    auth: { dataDir: tempDir, profileDir: path.join(tempDir, 'profile') },
    upstream: { car, baseUrl: 'https://example.invalid', headers: {} },
  });
  manager.storePath = path.join(tempDir, `${Math.random().toString(16).slice(2)}.enc.json`);
  return manager;
}

try {
  const migrated = makeManager('OneOpenAI');
  migrated.state = {
    upstream: { credential: { cookie: 'legacy-cookie', bearerToken: 'legacy-token' }, headers: { 'openai-sentinel-chat-requirements-token': 'legacy-header' } },
    apiKeyHash: 'preserved-hash', apiKeyCreatedAt: 'created-at', lastLoginAt: 'login-at',
  };
  migrated.normalizeState();
  assert.equal(migrated.state.version, 2);
  assert.equal(migrated.state.activeStation, 'OneOpenAI');
  assert.equal(migrated.state.stations.OneOpenAI.credential.cookie, 'legacy-cookie');
  assert.equal(migrated.state.stations.Sorux, undefined);
  assert.equal(migrated.state.apiKeyHash, 'preserved-hash');
  const migratedSnapshot = JSON.stringify(migrated.state);
  migrated.normalizeState();
  assert.equal(JSON.stringify(migrated.state), migratedSnapshot);
  console.log('PASS: legacy state migrates once to configured station');

  const manager = makeManager();
  manager.captureHeaders({ authorization: 'Bearer sorux-token', cookie: 'session=sorux', 'oai-device-id': 'sorux-device' }, { stationId: 'Sorux' });
  manager.captureHeaders({ authorization: 'Bearer work-token', cookie: 'session=work', origin: 'https://work.example', referer: 'https://work.example/chat', 'sec-ch-ua': 'Browser' }, { stationId: 'OneOpenAI' });
  manager.loadIntoConfig('OneOpenAI');
  assert.equal(manager.cfg.upstream.credential.cookie, 'session=work');
  assert.equal(manager.cfg.upstream.credential.bearerToken, 'work-token');
  assert.equal(manager.getStationRuntime('Sorux').credential.cookie, 'session=sorux');
  assert.equal(manager.getStationRuntime('OneOpenAI').credential.cookie, 'session=work');
  console.log('PASS: station credentials and config loading are isolated');

  manager.invalidateStation('OneOpenAI');
  assert.equal(manager.state.stations.OneOpenAI, undefined);
  assert.equal(manager.state.stations.Sorux.credential.cookie, 'session=sorux');
  const statusJson = JSON.stringify(manager.status());
  for (const secret of ['session=sorux', 'session=work', 'sorux-token', 'work-token']) {
    assert.equal(statusJson.includes(secret), false);
  }
  console.log('PASS: invalidation is station-scoped and status is redacted');

  const expiredToken = `e30.${Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url')}.sig`;
  const liveToken = `e30.${Buffer.from(JSON.stringify({ exp: 4102444800 })).toString('base64url')}.sig`;
  manager.state.stations.Sorux.credential.bearerToken = expiredToken;
  manager.state.stations.OneOpenAI = { credential: { cookie: 'session=live', bearerToken: liveToken }, headers: {} };
  assert.equal(manager.upstreamTokenExpired('Sorux'), true);
  assert.equal(manager.upstreamTokenExpired('OneOpenAI'), false);
  console.log('PASS: JWT expiration is evaluated per station');
} finally {
  if (previousMasterKey === undefined) delete process.env.CHATTOAPI_MASTER_KEY;
  else process.env.CHATTOAPI_MASTER_KEY = previousMasterKey;
  fs.rmSync(tempDir, { recursive: true, force: true });
}

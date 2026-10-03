import assert from 'node:assert/strict';
import { mkdtempSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfigFromFile } from 'vite';

const configPath = fileURLToPath(new URL('../vite.config.ts', import.meta.url));
const originalCwd = process.cwd();
const envDir = mkdtempSync(join(tmpdir(), 'meus-imoveis-vapid-'));
const envNames = ['NODE_ENV', 'VAPID_PUBLIC_KEY', 'VITE_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'];
const originalEnv = new Map(envNames.map(name => [name, process.env[name]]));
const publicKey = 'BB_e6M8cQpybTAKp2E2AMye7t4gUC-Ycdts1g5r5RyDjMlPwMXNFz5E2ELB0_PApjxwN9jXbPtKDt2OoILS46qk';

async function loadProductionConfig() {
  const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, configPath);
  assert.ok(loaded, 'Vite config should load');
}

try {
  // An empty directory reproduces a remote build without the local .env file.
  process.chdir(envDir);
  process.env.NODE_ENV = 'production';
  for (const name of envNames.slice(1)) delete process.env[name];

  await loadProductionConfig();
  for (const name of envNames.slice(1)) {
    assert.equal(process.env[name], undefined, `${name} must not become the string "undefined"`);
  }

  process.env.VAPID_PUBLIC_KEY = publicKey;
  await loadProductionConfig();
  assert.equal(process.env.VITE_VAPID_PUBLIC_KEY, publicKey, 'Client should inherit the server public key');

  delete process.env.VAPID_PUBLIC_KEY;
  await loadProductionConfig();
  assert.equal(process.env.VAPID_PUBLIC_KEY, publicKey, 'Server should inherit the client public key');

  const otherPublicKey = 'configured-server-key';
  process.env.VAPID_PUBLIC_KEY = otherPublicKey;
  await loadProductionConfig();
  assert.equal(process.env.VAPID_PUBLIC_KEY, otherPublicKey, 'Existing server configuration should be preserved');
  assert.equal(process.env.VITE_VAPID_PUBLIC_KEY, publicKey, 'Existing client configuration should be preserved');

  console.log('VAPID build configuration: ok');
} finally {
  process.chdir(originalCwd);
  for (const [name, value] of originalEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  rmdirSync(envDir);
}

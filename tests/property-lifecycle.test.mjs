import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePropertyDeletion } from '../api/shared/property-lifecycle.js';

test('authenticated deletion uses the canonical account and reports database failures', async () => {
  const originalFetch = globalThis.fetch;
  const keys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'MEUS_IMOVEIS_ACCOUNT_ID', 'MATCH_CANONICAL_ACCOUNT_ID'];
  const before = keys.map(k => process.env[k]);
  Object.assign(process.env, { VITE_SUPABASE_URL: 'https://lifecycle-test.supabase.co', VITE_SUPABASE_ANON_KEY: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test', MEUS_IMOVEIS_ACCOUNT_ID: 'inventory-account', MATCH_CANONICAL_ACCOUNT_ID: 'canonical-account' });
  const propertyId = 'd330581f-3954-4b77-97f0-d21413b20374';
  let rpcCalls = [];
  let fail = false;
  let unauthorized = false;
  globalThis.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: 'user-id' });
    if (path === '/rest/v1/profiles') return Response.json({ id: 'user-id', account_id: unauthorized ? 'other' : 'inventory-account' });
    if (path === '/rest/v1/rpc/delete_match_property') {
      rpcCalls.push(JSON.parse(init.body));
      return fail ? Response.json({ message: 'unavailable' }, { status: 500 }) : new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  const call = async (method, query, authenticated = true) => {
    let body;
    const res = { statusCode: 0, setHeader() {}, end(value) { body = JSON.parse(value); } };
    await handlePropertyDeletion({ method, url: '/api/property-lifecycle?' + query, headers: authenticated ? { authorization: 'Bearer test-token' } : {} }, res);
    return { status: res.statusCode, body };
  };
  try {
    assert.equal((await call('GET', '')).status, 405);
    assert.equal((await call('DELETE', `propertyId=${propertyId}`, false)).status, 401);
    assert.equal((await call('DELETE', 'propertyId=invalid')).status, 400);
    assert.equal((await call('DELETE', `propertyId=${propertyId}&accountId=other`)).status, 400);
    unauthorized = true;
    assert.equal((await call('DELETE', `propertyId=${propertyId}`)).status, 403);
    unauthorized = false;
    assert.equal(rpcCalls.length, 0);
    assert.equal((await call('DELETE', `propertyId=${propertyId}`)).status, 200);
    assert.deepEqual(rpcCalls, [{ p_account_id: 'canonical-account', p_property_id: propertyId }]);
    fail = true;
    assert.equal((await call('DELETE', `propertyId=${propertyId}`)).status, 500);
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((k, i) => { if (before[i] === undefined) delete process.env[k]; else process.env[k] = before[i]; });
  }
});

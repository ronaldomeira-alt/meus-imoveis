import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleInstagramImport } from '../api/shared/instagram-import.js';

test('connected own post imports, partner without public-post service reports configuration need', async () => {
  const beforeFetch = globalThis.fetch;
  const keys = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'APIFY_API_TOKEN'];
  const before = keys.map((key) => process.env[key]);
  process.env.VITE_SUPABASE_URL = 'https://instagram-import-test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  delete process.env.APIFY_API_TOKEN;
  const ownUrl = 'https://www.instagram.com/p/Own123/';
  let currentPost = ownUrl;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.hostname === 'api.apify.com') return Response.json([{
      url: currentPost, ownerUsername: 'corretorparceiro', caption: 'Apartamento em Cabo Branco',
      childPosts: [{ displayUrl: 'https://scontent.cdninstagram.com/partner-cover.jpg' }],
    }]);
    if (url.pathname === '/auth/v1/user') return Response.json({ id: 'user', email: 'ronaldomeira@gmail.com' });
    if (url.pathname === '/rest/v1/marketing_instagram_accounts') {
      return Response.json({ id: 'account', instagram_user_id: 'ig-user', instagram_username: 'ronaldomeiracorretor' });
    }
    if (url.pathname === '/rest/v1/marketing_instagram_tokens') return Response.json({ access_token: 'test-token' });
    if (url.pathname === '/v24.0/ig-user/media') return Response.json({ data: [{
      permalink: ownUrl, username: 'ronaldomeiracorretor', caption: 'Apartamento no Bessa',
      children: { data: [{ media_url: 'https://scontent.cdninstagram.com/cover.jpg' }] },
    }] });
    throw new Error(`Unexpected fetch: ${url.pathname}`);
  };
  const call = async (url, authenticated = true) => {
    let result;
    const res = { statusCode: 0, setHeader() {}, end(value) { result = JSON.parse(value); } };
    await handleInstagramImport({ method: 'POST', headers: authenticated ? { authorization: 'Bearer session' } : {}, body: { action: 'post', url } }, res);
    return { status: res.statusCode, body: result };
  };
  try {
    assert.equal((await call(ownUrl, false)).status, 401);
    assert.equal((await call('https://not-instagram.test/p/Own123/')).status, 400);
    const own = await call(ownUrl);
    assert.equal(own.status, 200);
    assert.equal(own.body.post.isOwnPost, true);
    assert.deepEqual(own.body.post.images, ['https://scontent.cdninstagram.com/cover.jpg']);
    currentPost = 'https://www.instagram.com/p/Partner123/';
    const partner = await call(currentPost);
    assert.equal(partner.status, 503);
    assert.match(partner.body.error, /parceiros/);
    process.env.APIFY_API_TOKEN = 'test-apify-token';
    const importedPartner = await call(currentPost);
    assert.equal(importedPartner.status, 200);
    assert.equal(importedPartner.body.post.isOwnPost, false);
    assert.equal(importedPartner.body.post.images[0], 'https://scontent.cdninstagram.com/partner-cover.jpg');
  } finally {
    globalThis.fetch = beforeFetch;
    keys.forEach((key, index) => { if (before[index] === undefined) delete process.env[key]; else process.env[key] = before[index]; });
  }
});

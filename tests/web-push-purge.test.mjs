import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { shouldPurgePushSubscriptionError } from '../api/_shared/web-push-service.js';

assert.equal(shouldPurgePushSubscriptionError({ statusCode: 404 }), true);
assert.equal(shouldPurgePushSubscriptionError({ statusCode: 410 }), true);
assert.equal(
  shouldPurgePushSubscriptionError({
    statusCode: 400,
    body: '{"reason":"VapidPkHashMismatch"}',
  }),
  true
);
assert.equal(
  shouldPurgePushSubscriptionError({
    statusCode: 400,
    body: Buffer.from('{"reason":"VapidPkHashMismatch"}'),
  }),
  true
);
assert.equal(
  shouldPurgePushSubscriptionError({
    response: {
      status: 400,
      body: { reason: 'VapidPkHashMismatch' },
    },
  }),
  true
);
assert.equal(
  shouldPurgePushSubscriptionError({
    statusCode: 400,
    body: '{"reason":"BadJwtToken"}',
  }),
  false
);
assert.equal(shouldPurgePushSubscriptionError({ statusCode: 500 }), false);

console.log('web-push purge rules: ok');

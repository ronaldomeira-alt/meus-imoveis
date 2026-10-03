import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createAgentHandler } from '../_shared/central-bots/handler.js';

// Compatibility is isolated here; the existing Node Web Push service is unchanged.
Object.assign(globalThis, { process, Buffer });
const env = Deno.env.toObject();
const handler = createAgentHandler(env, {
  sendPush: async (accountId: string, payload: object, options: object) => {
    const { sendPushToAccount } =
      await import('../../../api/_shared/web-push-service.js');
    return sendPushToAccount(accountId, payload, options);
  },
});

// JWTs are verified by auth.getUser inside the handler; cron has its own scoped token.
Deno.serve(handler);

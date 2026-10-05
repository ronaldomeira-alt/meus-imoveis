import {createTechnicalBridgeHandler} from '../_shared/central-bots/technical-bridge.js';
// A scoped, revocable runner token is verified in the handler, not a user JWT.
Deno.serve(createTechnicalBridgeHandler(Deno.env.toObject()));

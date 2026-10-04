import { createSystemAIHandler } from '../_shared/system-ai/handler.js';
// Validates the user's JWT and account inside the handler, independently of Central.
Deno.serve(createSystemAIHandler(Deno.env.toObject()));

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createAIProvider} from '../supabase/functions/_shared/central-bots/ai-provider.js';

test('provider payment and credential failures explain the cause without exposing response details',async()=>{
  const original=globalThis.fetch;
  const provider=createAIProvider({SYSTEM_AI_PROVIDER:'deepinfra',DEEPINFRA_API_KEY:'synthetic-key-for-test'});
  try {
    for(const [status,expected] of [[402,/sem saldo disponível/],[401,/recusou a chave/],[429,/limite de uso/],[500,/indisponível/]]){
      globalThis.fetch=async()=>Response.json({error:{message:'PRIVATE upstream content'}},{status});
      await assert.rejects(provider.complete({messages:[{role:'user',content:'Teste fictício'}],tools:[]}),error=>{assert.match(error.message,expected);assert.doesNotMatch(error.message,/PRIVATE|synthetic/);return true;});
    }
  } finally {globalThis.fetch=original;}
});

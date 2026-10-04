import { AgentError, rows } from '../central-bots/core.js';

export const AI_CATALOG = {
  groq: { key:'GROQ_API_KEY', defaultModel:'openai/gpt-oss-120b', audio:'whisper-large-v3-turbo', models:['openai/gpt-oss-120b','openai/gpt-oss-20b'], audioModels:['whisper-large-v3-turbo','whisper-large-v3'] },
  openai: { key:'OPENAI_API_KEY', defaultModel:'gpt-4.1-mini', audio:'whisper-1', models:['gpt-4.1-mini','gpt-4.1'], audioModels:['whisper-1'] },
  gemini: { key:'GEMINI_API_KEY', defaultModel:'gemini-2.5-flash', audio:'gemini-2.5-flash', models:['gemini-2.5-flash'], audioModels:['gemini-2.5-flash'] },
};
// Standard text tariffs verified 2026-10-04: groq.com/pricing,
// openai.com/index/gpt-4-1, ai.google.dev/gemini-api/docs/pricing.
const PRICES = { 'openai/gpt-oss-120b':{input:0.15,output:0.60}, 'openai/gpt-oss-20b':{input:0.075,output:0.30}, 'gpt-4.1-mini':{input:0.40,output:1.60}, 'gpt-4.1':{input:2,output:8}, 'gemini-2.5-flash':{input:0.30,output:2.50} };
const bytes = value => Uint8Array.from(atob(value),c=>c.charCodeAt(0));
const base64 = value => btoa(String.fromCharCode(...value));
async function masterKey(env) {
  let raw;
  try { raw=bytes(env.SYSTEM_AI_ENCRYPTION_KEY||''); } catch { throw new AgentError('Configuração segura de IA indisponível.',503); }
  if(raw.length!==32) throw new AgentError('Configuração segura de IA indisponível.',503);
  return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
}
export async function encryptAIKey(key,account,provider,env) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(`${account}:${provider}`)},await masterKey(env),new TextEncoder().encode(key));
  return {v:1,iv:base64(iv),data:base64(new Uint8Array(encrypted))};
}
export async function decryptAIKey(record,account,provider,env) {
  try {
    if(record.v!==1) throw new Error('version');
    return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(record.iv),additionalData:new TextEncoder().encode(`${account}:${provider}`)},await masterKey(env),bytes(record.data)));
  } catch { throw new AgentError('Não foi possível carregar a chave de IA. Salve novamente a configuração.',503); }
}
export function validateAIConfig(value) {
  const allowed=['provider','model','transcription_model','api_key','enabled'];
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k))) throw new AgentError('Configuração de IA inválida.');
  const c=Object.hasOwn(AI_CATALOG,value.provider)?AI_CATALOG[value.provider]:null;
  if(!c||!c.models.includes(value.model)||!c.audioModels.includes(value.transcription_model)||typeof value.enabled!=='boolean') throw new AgentError('Escolha modelos suportados pela IA selecionada.');
  if(value.api_key!==undefined && (typeof value.api_key!=='string'||value.api_key.trim().length<16||value.api_key.length>512||/[\r\n]/.test(value.api_key))) throw new AgentError('Chave de IA inválida.');
  return {provider:value.provider,model:value.model,transcription_model:value.transcription_model,enabled:value.enabled};
}
export async function resolveSystemAI(ctx) {
  const record=await rows(ctx.db.from('system_ai_settings').select('*').eq('account_id',ctx.accountId).maybeSingle());
  const provider=record?.provider||ctx.env.SYSTEM_AI_PROVIDER||ctx.env.AGENT_AI_PROVIDER||'groq';
  const c=AI_CATALOG[provider];
  if(!c) throw new AgentError('Provedor global de IA inválido.',503);
  const primary=ctx.accountId===(ctx.env.SYSTEM_AI_ACCOUNT_ID||ctx.env.MEUS_IMOVEIS_ACCOUNT_ID);
  const key=record?.encrypted_key ? await decryptAIKey(record.encrypted_key,ctx.accountId,provider,ctx.env) : primary ? ctx.env[c.key] : '';
  const config={provider,model:record?.model||ctx.env.SYSTEM_AI_MODEL||c.defaultModel,transcription_model:record?.transcription_model||ctx.env.SYSTEM_AI_TRANSCRIPTION_MODEL||c.audio,enabled:record?.enabled!==false,configured:!!key};
  const env={...ctx.env,SYSTEM_AI_PROVIDER:provider,SYSTEM_AI_MODEL:config.model,SYSTEM_AI_TRANSCRIPTION_MODEL:config.transcription_model,SYSTEM_AI_ENABLED:String(config.enabled),[c.key]:key||'',MARKETING_MODEL_PRICES:JSON.stringify({...JSON.parse(ctx.env.MARKETING_MODEL_PRICES||'{}'),...PRICES})};
  return {config,env,record};
}
export async function globalAIContext(ctx) {
  const resolved=await resolveSystemAI(ctx);
  return {...ctx,env:resolved.env,aiConfig:resolved.config};
}
export function publicAIConfig(resolved,canManage) {
  return {...resolved.config,can_manage:canManage,catalog:Object.fromEntries(Object.entries(AI_CATALOG).map(([name,c])=>[name,{models:c.models,audioModels:c.audioModels}]))};
}

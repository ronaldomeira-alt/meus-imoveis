import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { encryptAIKey, decryptAIKey, resolveSystemAI, validateAIConfig } from '../supabase/functions/_shared/system-ai/config.js';
import { createSystemAIHandler } from '../supabase/functions/_shared/system-ai/handler.js';
import { createAIProvider } from '../supabase/functions/_shared/central-bots/ai-provider.js';
import { marketingModel, costEnvelope } from '../supabase/functions/_shared/bot-marketing/ai.js';

const account='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',SYSTEM_AI_ENCRYPTION_KEY:Buffer.alloc(32,42).toString('base64'),MEUS_IMOVEIS_ACCOUNT_ID:account,GROQ_API_KEY:'test-existing-key-123456789',CENTRAL_BOTS_ENABLED:'false'};
function fixture({accountId=account,email='ronaldomeira@gmail.com',invalid=false,quota=true,record=null}={}) {
  const observed=[];let stored=record;
  const factory=()=>({auth:{getUser:async()=>({data:{user:invalid?null:{id:other,email}},error:invalid})},rpc:async(name,args)=>{observed.push([name,args]);return{data:name==='current_inventory_account_id'?accountId:quota,error:null};},from:table=>({select(){return this;},eq(field,value){observed.push([table,field,value]);return this;},maybeSingle:async()=>({data:stored,error:null}),upsert:async(value)=>{stored=value;return{data:null,error:null};}})});
  const providerFactory=resolved=>{observed.push(['provider',resolved.SYSTEM_AI_PROVIDER,resolved.SYSTEM_AI_MODEL,resolved.SYSTEM_AI_TRANSCRIPTION_MODEL,resolved.GROQ_API_KEY]);return {complete:async({messages,json})=>({content:json?'\u007b"bedrooms":3\u007d':messages[0].content.includes('teste técnico')?'OK':'Legenda de teste'}),transcribe:async()=> 'Áudio de teste'};};
  const handler=createSystemAIHandler(env,{factory,providerFactory});
  const send=(body,headers={authorization:'Bearer valid'})=>handler(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({request_id:crypto.randomUUID(),...body})}));
  return {send,observed,factory};
}
test('credentials are authenticated, encrypted and bound to account AND provider',async()=>{
  const record=await encryptAIKey('test-confidential-key',account,'groq',env);
  assert.ok(!JSON.stringify(record).includes('confidential'));
  assert.equal(await decryptAIKey(record,account,'groq',env),'test-confidential-key');
  await assert.rejects(decryptAIKey(record,other,'groq',env));
  await assert.rejects(decryptAIKey(record,account,'openai',env));
  await assert.rejects(decryptAIKey({...record,data:record.data.replace(/^./,'!')},account,'groq',env));
  assert.throws(()=>validateAIConfig({provider:'groq',model:'http://evil',transcription_model:'whisper-large-v3',enabled:true}));
  assert.throws(()=>validateAIConfig({provider:'groq',model:'openai/gpt-oss-120b',transcription_model:'whisper-large-v3',enabled:true,endpoint:'http://evil'}));
});
test('one provider and text model override bot preferences, and audio keeps its provider',async()=>{
  const cfg={...env,SYSTEM_AI_PROVIDER:'groq',SYSTEM_AI_MODEL:'openai/gpt-oss-120b',SYSTEM_AI_TRANSCRIPTION_MODEL:'whisper-large-v3',OPENAI_API_KEY:'other-provider-key'};
  const original=globalThis.fetch;const calls=[];
  globalThis.fetch=async(url,options)=>{calls.push([url,options]);return Response.json(url.includes('transcriptions')?{text:'teste'}:{choices:[{message:{content:'OK'}}]});};
  try {
    const provider=createAIProvider(cfg,'openai');
    await provider.complete({messages:[{role:'user',content:'Teste'}],tools:[]});
    await provider.transcribe(Buffer.alloc(100),'audio/wav');
    assert.equal(provider.name,'groq');assert.equal(JSON.parse(calls[0][1].body).model,cfg.SYSTEM_AI_MODEL);
    assert.equal(calls[1][1].body.get('model'),'whisper-large-v3');assert.ok(calls.every(([url])=>url.startsWith('https://api.groq.com/')));
    assert.equal(marketingModel(cfg,'openai'),cfg.SYSTEM_AI_MODEL);
    assert.throws(()=>createAIProvider({...cfg,SYSTEM_AI_ENABLED:'false'},'openai'));
  } finally {globalThis.fetch=original;}
});
test('global configuration works with Central disabled, cannot leak keys or borrow another account key',async()=>{
  const f=fixture();const response=await f.send({action:'config'});const config=await response.json();
  assert.equal(response.status,200);assert.equal(config.configured,true);assert.equal(config.model,'openai/gpt-oss-120b');
  assert.ok(!JSON.stringify(config).includes(env.GROQ_API_KEY));
  assert.ok(f.observed.some(c=>c[0]==='system_ai_settings'&&c[2]===account));
  const resolved=await resolveSystemAI({db:fixture({accountId:other}).factory(),accountId:other,env});
  assert.equal(resolved.config.configured,false);assert.equal(resolved.env.GROQ_API_KEY,'');
  assert.ok(costEnvelope((await resolveSystemAI({db:f.factory(),accountId:account,env})).env,[],'openai/gpt-oss-120b').estimate_usd>0);
});
test('JWT, CORS, admin, quota and payload checks reject before calling the provider',async()=>{
  assert.equal((await fixture().send({action:'config'},{})).status,401);
  assert.equal((await fixture({invalid:true}).send({action:'config'})).status,401);
  assert.equal((await fixture().send({action:'config'},{origin:'https://evil.test'})).status,403);
  assert.equal((await fixture().send({action:'extract',text:'Teste',account_id:other})).status,400);
  assert.equal((await fixture({email:'reader@example.test'}).send({action:'save',config:{}})).status,403);
  assert.equal((await fixture({quota:false}).send({action:'test'})).status,429);
  assert.equal((await fixture().send({action:'transcribe',mime:'text/html',audio:'abcd'})).status,400);
});
test('property extraction, captions, transcription and test use the same authenticated configuration',async()=>{
  const f=fixture();
  for(const body of [{action:'extract',text:'Apartamento fictício com 3 quartos'},{action:'caption',system_prompt:'Diretriz fictícia',prompt:'Pedido de teste'},{action:'transcribe',mime:'audio/wav',audio:Buffer.alloc(100).toString('base64')},{action:'test'}]) {
    const response=await f.send(body);assert.equal(response.status,200);assert.equal((await response.json()).providerUsed,'groq');
  }
  assert.equal(f.observed.filter(c=>c[0]==='system_ai_reserve').length,4);
  assert.ok(f.observed.filter(c=>c[0]==='provider').every(c=>c[1]==='groq'&&c[2]==='openai/gpt-oss-120b'));
});
test('saving updates the canonical account configuration and never returns its credential',async()=>{
  const f=fixture();const response=await f.send({action:'save',config:{provider:'groq',model:'openai/gpt-oss-20b',transcription_model:'whisper-large-v3',enabled:false,api_key:'test-new-secret-key-123456'}});
  assert.equal(response.status,200);const value=await response.json();assert.equal(value.enabled,false);assert.equal(value.model,'openai/gpt-oss-20b');
  assert.ok(!JSON.stringify(value).includes('test-new-secret'));assert.ok(!JSON.stringify(value).includes('encrypted_key'));
});
test('isolated PostgreSQL enforces 120 calls, duplicate rejection and service-only access',async()=>{
  const pg=new PGlite();try {
    await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls; create schema auth;create table auth.users(id uuid primary key);create table accounts(id uuid primary key);create schema cron;create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;`);
    await pg.exec(readFileSync('supabase/migrations/20261004185432_system_ai.sql','utf8'));
    await pg.exec(readFileSync('supabase/migrations/20261004221755_system_ai_deepinfra.sql','utf8'));
    await pg.exec(`insert into accounts values('${account}'); grant usage on schema public to service_role; set role service_role;`);
    await pg.query('insert into system_ai_settings(account_id,provider,model,transcription_model) values($1,$2,$3,$4)',[account,'deepinfra','openai/gpt-oss-120b','openai/whisper-large-v3-turbo']);
    assert.equal((await pg.query('select provider from system_ai_settings')).rows[0].provider,'deepinfra');
    const reserve=async id=>(await pg.query('select system_ai_reserve($1,$2) ok',[account,id])).rows[0].ok;
    const id=crypto.randomUUID();assert.equal(await reserve(id),true);assert.equal(await reserve(id),false);
    for(let i=1;i<120;i++)assert.equal(await reserve(crypto.randomUUID()),true);
    assert.equal(await reserve(crypto.randomUUID()),false);
    await pg.exec('reset role;set role authenticated;');
    await assert.rejects(pg.query('select * from system_ai_settings'),/permission denied/);
    await assert.rejects(pg.query('select system_ai_reserve($1,$2)',[account,crypto.randomUUID()]),/permission denied/);
  }finally{await pg.close();}
});
test('frontend has no vendor endpoints, client key variables or browser speech provider',()=>{
  for(const path of ['src/lib/ai-provider.ts','src/lib/groq.ts','src/lib/gemini.ts','src/lib/editorial-ai.ts','src/lib/audio-recorder.ts','src/App.tsx','src/components/ui/VoiceNotesInput.tsx'])assert.doesNotMatch(readFileSync(path,'utf8'),/api\.groq\.com|api\.openai\.com|generativelanguage\.googleapis|VITE_(GROQ|GEMINI)_API_KEY|new SpeechRecognition/);
});

test('DeepInfra keeps one provider for tools, JSON and iPhone audio, with provider-specific rates',async()=>{
  const secret='test-deepinfra-secret-123456789';
  const record={provider:'deepinfra',model:'openai/gpt-oss-120b',transcription_model:'openai/whisper-large-v3-turbo',enabled:true,encrypted_key:await encryptAIKey(secret,account,'deepinfra',env)};
  const resolved=await resolveSystemAI({db:fixture({record}).factory(),accountId:account,env});
  assert.equal(resolved.config.configured,true);
  assert.deepEqual(costEnvelope(resolved.env,[],record.model).rates,{input:0.037,output:0.17});
  assert.deepEqual(costEnvelope(resolved.env,[],'openai/gpt-oss-20b').rates,{input:0.03,output:0.14});
  const groq=await resolveSystemAI({db:fixture().factory(),accountId:account,env});
  assert.deepEqual(costEnvelope(groq.env,[],record.model).rates,{input:0.15,output:0.60});
  const original=globalThis.fetch,calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push([url,options]);assert.equal(options.headers.Authorization,`Bearer ${secret}`);
    return Response.json(url.includes('/inference/')?{text:'Áudio fictício'}:{choices:[{message:{role:'assistant',content:'OK'}}],usage:{prompt_tokens:10,completion_tokens:5}});
  };
  try {
    const provider=createAIProvider(resolved.env,'groq');assert.equal(provider.name,'deepinfra');
    const tool={name:'getBotsStatus',description:'Dados sintéticos',parameters:{type:'object',properties:{}}};
    const reply=await provider.complete({messages:[{role:'user',content:'Teste fictício'}],tools:[tool],requireTool:true,reasoningEffort:'low'});
    assert.equal(reply.usage.completion_tokens,5);assert.ok(!JSON.stringify(reply).includes('usage'));
    const body=JSON.parse(calls[0][1].body);assert.equal(body.tool_choice,'required');assert.equal(body.reasoning_effort,'low');assert.equal(body.model,record.model);
    await provider.complete({messages:[{role:'user',content:'Retorne JSON fictício'}],tools:[],json:true});
    assert.deepEqual(JSON.parse(calls[1][1].body).response_format,{type:'json_object'});
    await provider.transcribe(Buffer.alloc(100),'audio/mp4');
    assert.equal(calls[2][0],'https://api.deepinfra.com/v1/inference/openai/whisper-large-v3-turbo');
    const audio=calls[2][1].body.get('audio');assert.equal(audio.name,'voice.m4a');assert.equal(audio.type,'audio/mp4');assert.equal(calls[2][1].body.get('file'),null);
    assert.ok(calls.every(([url])=>url.startsWith('https://api.deepinfra.com/')));
    assert.equal(marketingModel(resolved.env,'openai'),record.model);
  }finally{globalThis.fetch=original;}
});
test('switching to DeepInfra requires its own key and never borrows the Groq credential',async()=>{
  const config={provider:'deepinfra',model:'openai/gpt-oss-120b',transcription_model:'openai/whisper-large-v3-turbo',enabled:true};
  const f=fixture();assert.equal((await f.send({action:'save',config})).status,400);
  assert.equal((await (await f.send({action:'config'})).json()).provider,'groq');
  const response=await f.send({action:'save',config:{...config,api_key:'test-deepinfra-secret-123456789'}});
  assert.equal(response.status,200);const value=await response.json();assert.equal(value.provider,'deepinfra');assert.equal(value.configured,true);
  assert.doesNotMatch(JSON.stringify(value),/test-deepinfra-secret|encrypted_key/);
  const isolated=await resolveSystemAI({db:fixture({record:config,accountId:other}).factory(),accountId:other,env});
  assert.equal(isolated.config.configured,false);assert.equal(isolated.env.DEEPINFRA_API_KEY,'');
  assert.throws(()=>createAIProvider(isolated.env,'groq'));
});

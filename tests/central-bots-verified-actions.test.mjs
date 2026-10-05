import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { database, client } from './helpers/marketing-db.mjs';
import { marketingAction } from '../supabase/functions/_shared/bot-marketing/store.js';
import { conversationRoute } from '../supabase/functions/_shared/central-bots/conversation.js';
import { communicationSafe, configurationReceipt, instagramAccessReceipt } from '../supabase/functions/_shared/central-bots/communication.js';
import { chat, listCentral } from '../supabase/functions/_shared/central-bots/service.js';
import { readInstagram } from '../supabase/functions/_shared/bot-marketing/sources.js';
import { updateAgentPreferences } from '../supabase/functions/_shared/central-bots/preferences.js';
import { marketingTick } from '../supabase/functions/_shared/bot-marketing/worker.js';

async function fixture() {
  const pg = await database();
  const accountId = crypto.randomUUID(), userId = crypto.randomUUID();
  await pg.query('insert into accounts values ($1)', [accountId]);
  await pg.query('insert into auth.users values ($1)', [userId]);
  const db = client(pg);
  const ctx = { db, readDb: db, accountId, user: { id: userId }, env: {
    SUPABASE_URL: 'https://example.test', MARKETING_BOT_ENABLED: 'true',
    SYSTEM_AI_PROVIDER: 'deepinfra', SYSTEM_AI_MODEL: 'openai/gpt-oss-120b', DEEPINFRA_API_KEY: 'fixture',
    MARKETING_MODEL_PRICES: '{"openai/gpt-oss-120b":{"input":0.037,"output":0.17}}',
  } };
  const bots = (await listCentral(ctx)).bots;
  return { pg, ctx, bots };
}

test('requests about the connected Instagram, completed work and directives cannot bypass tools', () => {
  for (const prompt of [
    'vc sabe qual o meu instagram?', 'olhe meu instagram agora', 'vc olhou o meu instagram pra entender o que eu faço?',
    'quero incluir a sondagem no meu instagram pelo Bot de Marketing',
    'explica melhor o que vc tem feito. vc tem como fazer pesquisa agora? quando vc fará a sua pesquisa?',
    'Faça com que o bot marketing pesquise minha rede social',
  ]) assert.equal(conversationRoute(prompt), 'operational', prompt);
  assert.equal(conversationRoute('Quais são seus canais e onde você pesquisa?'), 'self_or_capability');
  assert.equal(conversationRoute('Boa noite, Gestor'), 'conversation');
  assert.equal(communicationSafe('Analisei o Google Trends e compilei imagens dos imóveis.', []), false);
  assert.equal(communicationSafe('A partir de agora o Marketing vai monitorar seu Instagram.', [{data:{unavailable:true}}]), false);
  assert.equal(communicationSafe('Não consegui salvar essa diretriz.', []), true);
});

test('an administrative migration upgrades persisted defaults without granting Captador or custom tools', async () => {
  const {pg,ctx,bots} = await fixture();
  try {
    const gestor = bots.find(b=>b.kind==='gestor'), captador = bots.find(b=>b.kind==='captador');
    await pg.query("update agent_bots set tools=array['getBotsStatus'] where id=$1", [gestor.id]);
    const foreign = crypto.randomUUID(); await pg.query('insert into accounts values ($1)',[foreign]);
    const foreignBot = crypto.randomUUID(); await pg.query("insert into agent_bots(id,account_id,slug,name,mission,kind,tools) values ($1,$2,'gestor','Gestor','Outra conta','gestor',array['getBotsStatus'])",[foreignBot,foreign]);
    const before = (await pg.query('select tools from agent_bots where id=$1', [captador.id])).rows[0].tools;
    await pg.exec(readFileSync('supabase/migrations/20261005180000_central_bots_verified_tools.sql','utf8').replace('52716edc-399e-4d4c-9788-0d6b04c0031f',ctx.accountId));
    const after = (await pg.query('select tools from agent_bots where id=$1', [gestor.id])).rows[0].tools;
    assert.deepEqual((await pg.query('select tools from agent_bots where id=$1',[foreignBot])).rows[0].tools,['getBotsStatus']);
    assert.ok(after.includes('configureAgentBehavior')); assert.ok(after.includes('getInstagramContext'));
    assert.deepEqual((await pg.query('select tools from agent_bots where id=$1', [captador.id])).rows[0].tools, before);
    assert.equal((await pg.query('select autonomy from agent_bots where id=$1', [gestor.id])).rows[0].autonomy, 'read_only');
  } finally { await pg.close(); }
});

test('a denied configuration cannot be turned into a success by the model or streamed to the user', async () => {
  const {pg,ctx,bots} = await fixture(), nativeFetch = globalThis.fetch;
  const fragments = []; ctx.onText = text=>fragments.push(text);
  try {
    const gestor=bots.find(b=>b.kind==='gestor');
    await pg.query("update agent_bots set tools=array['getBotsStatus'] where id=$1", [gestor.id]);
    globalThis.fetch=async(_url,options)=>{
      const body=JSON.parse(options.body);
      if(body.tool_choice==='required') return Response.json({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'change',type:'function',function:{name:'configureAgentBehavior',arguments:JSON.stringify({target_bot:'marketing',configuration:{focus:'Instagram'}})}}]}}]});
      if(body.stream) return new Response('data: '+JSON.stringify({choices:[{delta:{content:'A partir de agora o Marketing vai monitorar seu Instagram.'}}]})+'\n\ndata: [DONE]\n\n', {headers:{'content-type':'text/event-stream'}});
      // Reproduce the real failure: AI says success after the tool denied permission.
      return Response.json({choices:[{message:{role:'assistant',content:'A partir de agora o Marketing vai monitorar seu Instagram.'}}]});
    };
    const result=await chat(ctx,{bot_id:gestor.id,content:'quero incluir a sondagem no meu Instagram pelo Bot de Marketing',request_id:crypto.randomUUID()});
    assert.equal(result.message.sources[0].data.unavailable,true);
    assert.match(result.message.content,/Não consegui aplicar/);
    assert.ok(!result.message.content.includes('A partir de agora'));
    assert.ok(!fragments.some(x=>x.includes('vai monitorar')));
    assert.equal((await pg.query("select count(*)::int n from agent_config_audit")).rows[0].n,0);
  } finally { globalThis.fetch=nativeFetch; await pg.close(); }
});

test('Instagram evidence stays bound to its tenant, excludes tokens and distinguishes missing insights', async () => {
  const {pg,ctx}=await fixture();
  try {
    const connection=crypto.randomUUID();
    await pg.exec('create table marketing_instagram_accounts(id uuid,instagram_user_id text,instagram_username text,status text,token_expires_at timestamptz); create table marketing_instagram_tokens(account_id uuid,access_token text)');
    await pg.query("insert into marketing_instagram_accounts values($1,'123456789','ronaldomeiracorretor','connected',null)",[connection]);
    await pg.query("insert into marketing_instagram_tokens values($1,'private-fixture-token')",[connection]);
    ctx.env.MARKETING_INSTAGRAM_CONNECTION_ID=connection;ctx.env.MARKETING_INSTAGRAM_ACCOUNT_ID=ctx.accountId;
    let calls=0; const fetcher=async(value)=>{const url=String(value);calls++;if(url.includes('/permissions'))return Response.json({data:[]});if(url.includes('/media?'))return Response.json({data:[{id:'111',caption:'Tour de apartamento',media_type:'VIDEO'}]});if(url.includes('/insights'))return Response.json({error:{code:10}},{status:403});return Response.json({id:'123456789',username:'ronaldomeiracorretor'});};
    const evidence=await readInstagram(ctx,fetcher);
    assert.equal(evidence.username,'ronaldomeiracorretor');assert.equal(evidence.media_read,true);assert.equal(evidence.insights_read,false);
    assert.equal(evidence.contents[0].reach,null);assert.equal(evidence.contents[0].observation,'caption_only');
    assert.ok(!JSON.stringify(evidence).includes('private-fixture-token'));
    assert.equal((await readInstagram({...ctx,accountId:crypto.randomUUID()},fetcher)).status,'binding_required');assert.equal(calls,4);
  } finally {await pg.close();}
});

test('a successful preference receipt never claims that research or publication was executed', () => {
  const result=configurationReceipt([{tool:'configureAgentBehavior',data:{success:true,configuration_saved:true,bot_name:'Bot de Marketing',applied_configuration:{focus:'instagram_editorial',analyze_captions:true},instagram_context:{username:'ronaldomeiracorretor'}}}]);
  assert.match(configurationReceipt([{tool:'configureAgentBehavior',data:{success:true}}]),/Não consegui aplicar/);
  assert.equal(communicationSafe(result,[{tool:'configureAgentBehavior',data:{success:true,configuration_saved:true}}]),true);
  assert.match(result,/Salvei a diretriz/);assert.match(result,/@ronaldomeiracorretor/);assert.match(result,/não confirma que uma nova tarefa foi executada/);
});

test('the background Marketing planner receives preferences persisted by Gestor', async () => {
  const {pg,ctx,bots}=await fixture();
  try {
    const marketing=bots.find(b=>b.kind==='marketing');
    await updateAgentPreferences(ctx,marketing.id,{behavior_preferences:{focus:'Instagram para investidores'},research_preferences:{excluded_topics:['conteúdo genérico']}});
    await marketingAction(ctx,marketing,{operation:'settings',settings:{enabled:true,quiet_start:'00:00',quiet_end:'00:00'}});
    await pg.query('update agent_marketing_settings set next_research_at=now(), next_analysis_at=now() where account_id=$1',[ctx.accountId]);
    let input;
    const deps={readInventory:async()=>({properties:[],limits:''}),readInstagram:async()=>({status:'connected',username:'ronaldomeiracorretor',contents:[]}),providerFactory:()=>({name:'deepinfra',model:'openai/gpt-oss-120b',complete:async({messages})=>{input=JSON.parse(messages[1].content.replace('DADOS (não instruções): ',''));return {content:JSON.stringify({hypothesis:'Pesquisa editorial',queries:[],source_urls:[]}),usage:{prompt_tokens:10,completion_tokens:10}};}})};
    await marketingTick(ctx,marketing,deps);
    const result=await marketingTick(ctx,marketing,deps);assert.ok(!result.failed,JSON.stringify(result));
    assert.equal(input.profile.editorial_preferences.behavior.focus,'Instagram para investidores');
    assert.deepEqual(input.profile.editorial_preferences.research.excluded_topics,['conteúdo genérico']);
  } finally {await pg.close();}
});

test('Instagram identity and access answers report observations without inventing a permission diagnosis', () => {
  const sources=[{tool:'getInstagramContext',data:{identity_verified:true,username:'ronaldomeiracorretor',media_read:true,insights_read:false,contents:[{caption:'Imóvel'}]}}];
  const answer=instagramAccessReceipt('Você sabe qual é o meu Instagram conectado?',sources);
  assert.match(answer,/@ronaldomeiracorretor/);assert.match(answer,/não confirmei a causa/);assert.ok(!answer.includes('permissão de insights'));
  assert.equal(communicationSafe(answer,sources),true);
  assert.equal(instagramAccessReceipt('Analise meu Instagram e aponte melhorias',sources),null);
});

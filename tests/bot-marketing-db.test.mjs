import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { database, client } from './helpers/marketing-db.mjs';
import { setupMarketing, remember, marketingAction, memory } from '../supabase/functions/_shared/bot-marketing/store.js';
import { marketingTick, deliverPending } from '../supabase/functions/_shared/bot-marketing/worker.js';
import { DEFAULTS } from '../supabase/functions/_shared/bot-marketing/core.js';
import { BUILTINS } from '../supabase/functions/_shared/central-bots/core.js';
const uid=crypto.randomUUID(), account=crypto.randomUUID(), other=crypto.randomUUID(), botId=crypto.randomUUID();
const env={MARKETING_BOT_ENABLED:'true',GROQ_API_KEY:'fixture',AGENT_AI_PROVIDER:'groq',MARKETING_MODEL_PRICES:'{"openai/gpt-oss-20b":{"input":0.075,"output":0.30}}'};
const bot={...BUILTINS.find(b=>b.kind==='marketing'),id:botId,active:true,notifications:true,provider:'groq'};
test('PostgreSQL: tenant isolation, fenced leases, budgets, restart, feedback, idempotent chat/push and draft-only review', {timeout:60000},async()=>{
  const folder=mkdtempSync(join(tmpdir(),'marketing-db-'));let pg;
  try {
    pg=await database();let ctx={db:client(pg),env,accountId:account,user:{id:uid}};
    await pg.query('insert into accounts values($1),($2)',[account,other]);await pg.query('insert into auth.users values($1)',[uid]);
    await pg.query("insert into agent_bots(id,account_id,slug,name,mission,kind,avatar,notifications,notification_events) values($1,$2,'marketing','Marketing','Missão editorial de teste','marketing','marketing',true,array['result'])",[botId,account]);
    await pg.query("insert into agent_runtime_settings(account_id,function_url) values($1,'https://example.test')",[account]);
    await setupMarketing(ctx,bot);await marketingAction(ctx,bot,{operation:'settings',settings:{enabled:true,quiet_start:'00:00',quiet_end:'00:00'}});
    await pg.query("insert into agent_marketing_memory(account_id,kind,fingerprint,topic) values($1,'fact','other','Outro usuário')",[other]);
    await pg.exec('set role authenticated');await pg.query("select set_config('test.account',$1,false)",[account]);
    assert.equal((await pg.query('select * from agent_marketing_memory')).rows.length,0);
    await assert.rejects(pg.query("insert into agent_marketing_memory(account_id,kind,fingerprint) values($1,'fact','deny')",[account]));
    await assert.rejects(pg.query('select * from agent_marketing_claim($1,$2)',[account,botId]));await pg.exec('reset role');
    const claim=await ctx.db.rpc('agent_marketing_claim',{p_account_id:account,p_bot_id:botId});assert.ifError(claim.error);const task=claim.data[0];assert.ok(task);
    assert.equal((await ctx.db.rpc('agent_marketing_claim',{p_account_id:account,p_bot_id:botId})).data.length,0);
    const rArgs={p_account_id:account,p_task_id:task.id,p_lease:task.lease_token};
    assert.equal((await ctx.db.rpc('agent_marketing_reserve',{...rArgs,p_cost:0.11})).data,false);
    assert.equal((await ctx.db.rpc('agent_marketing_reserve',{...rArgs,p_cost:0.03})).data,true);
    await marketingAction(ctx,bot,{operation:'settings',settings:{max_calls:1}});
    assert.equal((await ctx.db.rpc('agent_marketing_reserve',{...rArgs,p_cost:0.001})).data,false,'call ceiling');
    await marketingAction(ctx,bot,{operation:'settings',settings:{max_calls:6,daily_budget_usd:0.025}});
    assert.equal((await ctx.db.rpc('agent_marketing_reserve',{...rArgs,p_cost:0.001})).data,false,'daily ceiling');
    const chatRun=crypto.randomUUID();await pg.query("insert into agent_runs(id,account_id,bot_id,trigger_type) values($1,$2,$3,'chat')",[chatRun,account,botId]);
    assert.equal((await ctx.db.rpc('agent_marketing_reserve_chat',{p_account_id:account,p_run_id:chatRun,p_cost:0.001})).data,false,'chat shares daily ceiling');
    await marketingAction(ctx,bot,{operation:'settings',settings:{daily_budget_usd:0.5}});
    const interactive=await ctx.db.rpc('agent_marketing_reserve_chat',{p_account_id:account,p_run_id:chatRun,p_cost:0.001});assert.ifError(interactive.error);assert.equal(interactive.data,true);
    const novelty={...rArgs,p_topic:'Bessa',p_angle:'Rotina',p_topic_key:'bessa',p_angle_key:'rotina',p_fingerprint:'atomic',p_proposal:{message:'Proposta de teste'},p_property_id:null};
    const atomic=(await ctx.db.rpc('agent_marketing_propose',novelty)).data;assert.ok(atomic);
    assert.equal((await ctx.db.rpc('agent_marketing_propose',novelty)).data,atomic,'retry stable idea id');
    assert.equal((await ctx.db.rpc('agent_marketing_propose',{...novelty,p_fingerprint:'different',p_angle:'Outro ângulo',p_angle_key:'outro'})).data,null,'topic duplicate');
    assert.equal((await ctx.db.rpc('agent_marketing_propose',{...novelty,p_fingerprint:'different',p_topic:'Outro tema',p_topic_key:'outro'})).data,null,'angle duplicate');
    await pg.query('delete from agent_marketing_ideas where id=$1',[atomic]);
    assert.equal((await ctx.db.rpc('agent_marketing_checkpoint',{...rArgs,p_lease:crypto.randomUUID(),p_phase:'plan',p_checkpoint:{},p_done:false,p_error:null})).data,false);
    assert.equal((await ctx.db.rpc('agent_marketing_checkpoint',{...rArgs,p_phase:'plan',p_checkpoint:{persisted:true},p_done:false,p_error:null})).data,true);
    const fact=await remember(ctx,{kind:'fact',topic:'Bessa',data:{claim:'Fato anterior',verification:'observed_quote'},fingerprint:'earlier'});
    const ideaId=crypto.randomUUID();await pg.query("insert into agent_marketing_ideas(id,account_id,topic,angle,fingerprint,proposal) values($1,$2,'Bessa','Rotina','idea',$3)",[ideaId,account,JSON.stringify({message:'Ronaldo, uma proposta de teste.',hook:'Gancho',practical:'Orientação',evidence_ids:[fact.id]})]);
    const fBody={operation:'feedback',idea_id:ideaId,request_id:crypto.randomUUID(),text:'não quero falar desse tema'};await marketingAction(ctx,bot,fBody);await marketingAction(ctx,bot,fBody);
    assert.equal((await pg.query('select count(*)::int as n from agent_marketing_feedback')).rows[0].n,1);
    const snapshot=await pg.dumpDataDir();writeFileSync(join(folder,'postgres.tar.gz'),Buffer.from(await snapshot.arrayBuffer()));
    await pg.close();pg=await database(undefined,new Blob([readFileSync(join(folder,'postgres.tar.gz'))]));ctx={...ctx,db:client(pg)};
    assert.equal((await pg.query('select checkpoint from agent_marketing_tasks where id=$1',[task.id])).rows[0].checkpoint.persisted,true);
    assert.equal((await memory(ctx,{topic:'Bessa'})).length,1);
    const profile=(await pg.query('select profile from agent_marketing_settings')).rows[0].profile;assert.ok(profile.rejected_topics.includes('Bessa'));
    await marketingAction(ctx,bot,{operation:'feedback',idea_id:ideaId,request_id:crypto.randomUUID(),text:'Aprovar ideia',status:'approved'});
    assert.equal((await pg.query('select count(*)::int as n from marketing_posts')).rows[0].n,0);
    await marketingAction(ctx,bot,{operation:'draft',idea_id:ideaId});await marketingAction(ctx,bot,{operation:'draft',idea_id:ideaId});assert.equal((await pg.query('select * from marketing_posts')).rows[0].status,'draft');
    await pg.query("update agent_marketing_ideas set status='proposed' where id=$1",[ideaId]);
    const s={config:{...DEFAULTS,quiet_start:'00:00',quiet_end:'00:00'}};let sends=0;
    await marketingAction(ctx,bot,{operation:'settings',settings:{push_daily_limit:0}});
    await deliverPending(ctx,bot,s,async()=>{sends++;return{sentCount:1};});assert.equal(sends,0,'chat delivered despite push ceiling');
    assert.equal((await pg.query('select count(*)::int as n from agent_messages')).rows[0].n,1);
    await marketingAction(ctx,bot,{operation:'settings',settings:{push_daily_limit:1}});
    await deliverPending(ctx,bot,s,async()=>{sends++;return{sentCount:1,failedCount:0};});await deliverPending(ctx,bot,s,async()=>{sends++;return{sentCount:1};});
    assert.equal(sends,1);assert.equal((await pg.query('select count(*)::int as n from agent_messages')).rows[0].n,1);
    await marketingAction(ctx,bot,{operation:'memory_correct',memory_id:fact.id,correction:'Correção explícita persistente'});
    const corrected=(await memory(ctx,{topic:'Bessa'}))[0];assert.equal(corrected.state,'corrected');assert.equal(corrected.data.contradicted,true);
    await marketingAction(ctx,bot,{operation:'settings',settings:{paused:true}});assert.equal((await ctx.db.rpc('agent_marketing_claim',{p_account_id:account,p_bot_id:botId})).data.length,0);
    await assert.rejects(marketingAction({...ctx,accountId:other},bot,{operation:'feedback',idea_id:ideaId,request_id:crypto.randomUUID(),text:'aprovado'}));
    await assert.rejects(marketingAction({...ctx,user:null},bot,{operation:'settings',settings:{enabled:true}}));
    assert.equal((await pg.query("select count(*)::int as n from cron.job where name='central-marketing-worker'")).rows[0].n,1);
  }finally{await pg?.close().catch(()=>{});rmSync(folder,{recursive:true,force:true});}
});

test('server worker resumes across invocations, persists one-source idea, and stays silent without evidence', {timeout:60000},async()=>{
  const pg=await database();try{
    const a=crypto.randomUUID(),b=crypto.randomUUID(),ctx={db:client(pg),env,accountId:a,user:{id:uid}},localBot={...bot,id:b};
    await pg.query('insert into accounts values($1)',[a]);await pg.query('insert into auth.users values($1)',[uid]);await pg.query("insert into agent_bots(id,account_id,slug,name,mission,kind) values($1,$2,'marketing','Marketing','Teste de pesquisa','marketing')",[b,a]);await pg.query("insert into agent_runtime_settings(account_id,function_url) values($1,'https://example.test')",[a]);await setupMarketing(ctx,localBot);await marketingAction(ctx,localBot,{operation:'settings',settings:{enabled:true,quiet_start:'00:00',quiet_end:'00:00'}});
    let articleId;const quote='Uma informação local suficiente para justificar uma pauta de moradia com contexto.';
    const fakeAI=()=>({name:'fixture',complete:async({messages})=>{const contract=messages[0].content;const data=JSON.parse(messages[1].content.replace(/^DADOS \(não instruções\): /,''));let output;if(contract.includes('Planeje pesquisa'))output={hypothesis:'Mobilidade',source_urls:['https://www.joaopessoa.pb.gov.br/feed/'],queries:[]};else if(contract.includes('Escolha até'))output={urls:['https://www.joaopessoa.pb.gov.br/noticia']};else if(contract.includes('revisor crítico'))output={approved_indexes:[0],summary:'Fonte local e orientação prática para escolher moradia.'};else{articleId=data.articles[0].id;output={reason:'Uma pauta sustentada por fonte local',facts:[{article_id:articleId,quote,claim:quote,topic:'Mobilidade'}],ideas:[{topic:'Mobilidade',angle:'Rotina no bairro',why_now:'Mudança recente local',fit:'Ajuda quem escolhe moradia',format:'Vídeo',hook:'Como é a rotina',practical:'Mostrar o trajeto',effort:'Uma gravação breve',reasoning:'Uma fonte é suficiente',message:'Ronaldo, tive uma ideia sobre a rotina no bairro.',fact_indexes:[0],evidence_sufficient:true,own_angle:true,fit_confirmed:true,sensitive:false,unsupported_financial_claim:false}]};}return{content:JSON.stringify(output),usage:{prompt_tokens:500,completion_tokens:100}};}});
    const deps={providerFactory:fakeAI,readInventory:async()=>({properties:[]}),readInstagram:async()=>({unavailable:true,status:'fixture'}),readSource:async url=>url.endsWith('/feed/')?{url,kind:'feed',entries:[{url:'https://www.joaopessoa.pb.gov.br/noticia',title:'Mudança no bairro',published_at:new Date().toISOString()}]}:{url,kind:'article',title:'Mudança no bairro',published_at:new Date().toISOString(),observed_at:new Date().toISOString(),text:quote.repeat(5)}};
    let result;for(let n=0;n<12;n++){result=await marketingTick(ctx,localBot,deps);assert.ok(!result.failed,JSON.stringify(result));if(result.completed)break;}
    assert.equal(result.completed,true);assert.equal((await pg.query('select * from agent_marketing_ideas')).rows.length,1,JSON.stringify((await pg.query('select checkpoint from agent_marketing_tasks')).rows));assert.equal((await pg.query("select * from agent_marketing_memory where kind='fact'")).rows.length,1);
    await deliverPending(ctx,localBot,{config:DEFAULTS});
    await pg.query("update agent_marketing_settings set next_research_at=now(),next_analysis_at=now() where account_id=$1",[a]);
    deps.readSource=async()=>{throw Error('Fonte indisponível');};
    for(let n=0;n<12;n++){result=await marketingTick(ctx,localBot,deps);if(result.completed)break;}assert.equal(result.completed,true);assert.equal(result.ideas.length,0);assert.match(result.reason,/Nenhum artigo/);
    await pg.query("update agent_marketing_settings set next_research_at=now(),next_analysis_at=now() where account_id=$1",[a]);
    deps.readSource=async url=>url.endsWith('/feed/')?{url,kind:'feed',entries:[{url:'https://www.joaopessoa.pb.gov.br/noticia',title:'Fonte revisada',published_at:new Date().toISOString()}]}:{url,kind:'article',title:'Fonte revisada',published_at:new Date().toISOString(),observed_at:new Date().toISOString(),text:'Nova versão da fonte sem a citação anterior. '.repeat(20)};
    for(let n=0;n<16;n++){result=await marketingTick(ctx,localBot,deps);assert.ok(!result.failed,JSON.stringify(result));if(result.completed)break;}
    assert.equal((await pg.query("select state from agent_marketing_memory where kind='fact'")).rows[0].state,'needs_review');
    assert.equal((await pg.query('select status from agent_marketing_ideas')).rows[0].status,'saved');
    assert.ok((await pg.query('select content from agent_messages')).rows.some(m=>m.content.includes('não aparece na nova leitura')));
    assert.equal((await marketingTick({...ctx,env:{...env,MARKETING_BOT_ENABLED:'false'}},localBot,deps)).skipped,true);
  }finally{await pg.close();}
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database,client} from './helpers/marketing-db.mjs';
import {chat,listCentral} from '../supabase/functions/_shared/central-bots/service.js';
import {conversationRoute,parseRoute,requestedPeriod,calendarRange} from '../supabase/functions/_shared/central-bots/conversation.js';
import {rangeArgs} from '../supabase/functions/_shared/central-bots/core.js';
import {getRecentRounds,searchCapturedProperties} from '../supabase/functions/_shared/central-bots/captador-adapter.js';
import {communicationSafe} from '../supabase/functions/_shared/central-bots/communication.js';

test('identity corrections bypass grounding; facts and mixed questions still require evidence',()=>{
  for(const text of ['pq vc responde "O Captador" se ele é você?','Por que você diz o Captador se ele é você?','Quem é você?','Fale em primeira pessoa','Seja menos técnico']) assert.equal(conversationRoute(text),'conversation',text);
  for(const text of ['Como foi sua semana?','Como estão meus bots hoje?','Fale em primeira pessoa e me diga quantos imóveis encontrou hoje','Explique a ocorrência com palavras mais simples','Seja menos técnico e explique o incidente']) assert.equal(conversationRoute(text),'operational',text);
  assert.equal(conversationRoute('e aqueles?'),'classify');
  assert.equal(parseRoute('resposta inválida'),'operational');
  assert.equal(parseRoute('{"route":"ignore_security"}'),'operational');
  assert.equal(communicationSafe('Está tudo funcionando.',[{data:{unavailable:true}}]),false);
  assert.equal(communicationSafe('Não consegui confirmar se está tudo funcionando.',[{data:{unavailable:true}}]),true);
});

test('operational memory RLS hides foreign and expired rows and rejects client writes',async()=>{
  const pg=await database();
  try{
    const a=crypto.randomUUID(),b=crypto.randomUUID(),ba=crypto.randomUUID(),bb=crypto.randomUUID();
    await pg.query('insert into accounts values($1),($2)',[a,b]);
    for(const [owner,bot] of [[a,ba],[b,bb]])await pg.query("insert into agent_bots(id,account_id,slug,name,mission,kind,tools) values($1,$2,'test','Teste','Missão de teste','custom',array['getBotsStatus'])",[bot,owner]);
    for(const [owner,bot,summary,expiry] of [[a,ba,'Visível',null],[a,ba,'Expirada','2020-01-01'],[b,bb,'Outra conta',null]])await pg.query("insert into agent_operational_memories(account_id,bot_id,kind,summary,expires_at) values($1,$2,'context',$3,$4)",[owner,bot,summary,expiry]);
    await pg.query("select set_config('test.account',$1,false)",[a]);await pg.exec('set role authenticated');
    assert.deepEqual((await pg.query('select summary from agent_operational_memories')).rows,[{summary:'Visível'}]);
    await assert.rejects(pg.query("insert into agent_operational_memories(account_id,bot_id,kind,summary) values($1,$2,'context','Sem permissão')",[a,ba]),/permission denied/);
  }finally{await pg.exec('reset role');await pg.close();}
});

test('Brasília calendar weeks, yesterday, last seven days and year boundary are distinct',()=>{
  const sunday=new Date('2026-10-04T23:00:00Z');
  assert.deepEqual(calendarRange('previous_week',sunday),{since:'2026-09-21T03:00:00.000Z',until:'2026-09-28T03:00:00.000Z',days:7});
  assert.equal(calendarRange('this_week',sunday).since,'2026-09-28T03:00:00.000Z');
  assert.equal(calendarRange('last_7_days',new Date('2026-10-07T13:00:00Z')).since,'2026-10-01T03:00:00.000Z');
  assert.equal(calendarRange('this_week',new Date('2026-10-07T13:00:00Z')).since,'2026-10-05T03:00:00.000Z');
  assert.equal(calendarRange('yesterday',new Date('2027-01-01T03:10:00Z')).since,'2026-12-31T03:00:00.000Z');
  assert.equal(rangeArgs({period:'today'},new Date('2026-10-05T02:59:00Z')).since,'2026-10-04T03:00:00.000Z');
  assert.equal(requestedPeriod('como foi a semana passada?'),'previous_week');
  assert.equal(requestedPeriod('Quais imóveis estão sem resposta hoje?'),'today');
  assert.equal(requestedPeriod('Não pedi só hoje. Quero todo o histórico.'),null);
  assert.equal(requestedPeriod('Compare a semana passada e esta semana.'),null);
});

test('all bots use the shared AI for identity, history, semantic routing, streaming and factual requests',{timeout:30000},async()=>{
  const pg=await database(),nativeFetch=globalThis.fetch;
  try {
    await pg.exec('create table bot_settings(account_id uuid, last_round_at timestamptz, next_round_at timestamptz, is_active boolean, health_status text)');
    const account=crypto.randomUUID(),user=crypto.randomUUID();
    await pg.query('insert into accounts values($1)',[account]);await pg.query('insert into auth.users values($1)',[user]);
    const db=client(pg),ctx={db,readDb:db,accountId:account,user:{id:user},env:{SUPABASE_URL:'https://example.test',MARKETING_BOT_ENABLED:'true',DEEPINFRA_API_KEY:'fixture',SYSTEM_AI_PROVIDER:'deepinfra',SYSTEM_AI_MODEL:'openai/gpt-oss-120b',MARKETING_MODEL_PRICES:'{"openai/gpt-oss-120b":{"input":0.037,"output":0.17}}'}};
    const bots=(await listCentral(ctx)).bots,calls=[];
    let classifier='conversation',directAnswer='Você tem razão. Eu vou falar do meu trabalho em primeira pessoa.';
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,'https://api.deepinfra.com/v1/openai/chat/completions');
      const body=JSON.parse(options.body);calls.push(body);assert.equal(body.model,'openai/gpt-oss-120b');
      const system=body.messages[0].content;
      const routing=system.includes('Classifique a intenção');
      const content=routing?JSON.stringify({route:classifier}):directAnswer;
      if(body.tool_choice==='required') return Response.json({choices:[{message:{role:'assistant',content:null,tool_calls:[{id:'tool-fixture',type:'function',function:{name:'getBotsRecentActivity',arguments:'{"period":"today"}'}}]}}]});
      if(body.stream){const enc=new TextEncoder();return new Response(new ReadableStream({start(controller){for(const part of ['Você tem razão. ','Eu vou falar do meu trabalho em primeira pessoa.'])controller.enqueue(enc.encode('data: '+JSON.stringify({choices:[{delta:{content:part}}]})+'\n\n'));controller.enqueue(enc.encode('data: [DONE]\n\n'));controller.close();}}));}
      return Response.json({choices:[{message:{role:'assistant',content}}]});
    };
    for(const bot of bots){
      const result=await chat(ctx,{bot_id:bot.id,content:'Por que você diz o Captador se ele é você?',request_id:crypto.randomUUID()});
      assert.match(result.message.content,/Eu vou falar/);assert.deepEqual(result.message.sources,[]);
      const body=calls.at(-1);assert.ok(!body.tools&&!body.tool_choice);assert.match(body.messages[0].content,/IDENTIDADE FUNCIONAL/);
      assert.match(body.messages[0].content,/Não.*lembranças operacionais/);
      assert.ok(body.messages[0].content.includes(bot.name));
    }
    const gestor=bots.find(b=>b.kind==='gestor'),stream=[];
    const continued=await chat({...ctx,onText:t=>stream.push(t)},{bot_id:gestor.id,content:'Fale em primeira pessoa',request_id:crypto.randomUUID()});
    assert.ok(calls.at(-1).messages.filter(m=>m.role==='user').length>1,'History survives the direct path');
    assert.ok(stream.length>0);assert.match(continued.message.content,/Eu vou falar/);
    await chat(ctx,{bot_id:gestor.id,content:'Pode explicar o que significa investigar?',request_id:crypto.randomUUID()});
    assert.ok(calls.at(-2).messages[0].content.includes('Classifique a intenção'));
    assert.ok(!calls.at(-1).tools);
    classifier='operational';
    const factual=await chat(ctx,{bot_id:gestor.id,content:'e aqueles?',request_id:crypto.randomUUID()});
    assert.equal(calls.at(-2).tool_choice,'required');assert.equal(factual.message.sources[0].tool,'getBotsRecentActivity');
    const period=await chat(ctx,{bot_id:gestor.id,content:'Como foi sua semana passada?',request_id:crypto.randomUUID()});
    assert.equal(period.message.sources[0].arguments.period,'previous_week','Backend overrides the model choosing today for last week');
    // Memory availability is optional; saving an answer is not.
    const originalFrom=db.from.bind(db);
    db.from=name=>name.startsWith('agent_operational_')?new Proxy({}, {get:(_target,key)=>key==='then'?(resolve)=>Promise.resolve({data:null,error:{message:'fixture unavailable'}}).then(resolve):()=>db.from(name)}):originalFrom(name);
    const withoutMemory=await chat(ctx,{bot_id:gestor.id,content:'Quem é você?',request_id:crypto.randomUUID()});
    assert.match(withoutMemory.message.content,/Eu vou falar/);
    await chat(ctx,{bot_id:gestor.id,content:'Consulte atividades hoje',request_id:crypto.randomUUID()});
    assert.match(calls.at(-1).messages[0].content,/memória de continuidade está indisponível/);
    classifier='conversation';directAnswer='Uma API permite que dois sistemas conversem.';
    const technical=await chat(ctx,{bot_id:gestor.id,content:'Explique API, quero os detalhes técnicos do conceito.',request_id:crypto.randomUUID()});
    assert.equal(technical.message.content,directAnswer,'Explicit technical explanations are allowed without requiring operational data');
  }finally{globalThis.fetch=nativeFetch;await pg.close();}
});

test('previous-week read adapter excludes current week and another account; untimed search retains history',async()=>{
  const pg=await database();
  try{
    const account=crypto.randomUUID(),other=crypto.randomUUID();
    await pg.query('insert into accounts values($1),($2)',[account,other]);
    await pg.exec(`create table bot_execution_rounds(id uuid,account_id uuid,campaign_type text,trigger_type text,status text,started_at timestamptz,finished_at timestamptz,analyzed_count int,new_count int,eligible_count int,contacted_count int,duplicate_count int,error_count int,error_summary text);
      create table bot_captures(id uuid,account_id uuid,campaign_type text,title text,price numeric,neighborhood text,bedrooms int,area_m2 numeric,status text,url text,contacted_at timestamptz,responded_at timestamptz,imported_property_id text,rejection_reason text,created_at timestamptz);`);
    const {since,until}=rangeArgs({period:'previous_week'});
    for(const [owner,date] of [[account,since],[account,until],[other,since]])await pg.query('insert into bot_execution_rounds(id,account_id,started_at) values($1,$2,$3)',[crypto.randomUUID(),owner,date]);
    const ctx={db:client(pg),readDb:client(pg),accountId:account};
    const result=await getRecentRounds(ctx,{period:'previous_week'});assert.equal(result.rounds_count,1);assert.equal(result.until,until);
    await pg.query("insert into bot_captures(id,account_id,title,created_at) values($1,$2,'Antigo','2025-01-01')",[crypto.randomUUID(),account]);
    assert.equal((await searchCapturedProperties(ctx,{})).total_found,1);
    assert.equal((await searchCapturedProperties(ctx,{period:'previous_week'})).total_found,0);
  }finally{await pg.close();}
});

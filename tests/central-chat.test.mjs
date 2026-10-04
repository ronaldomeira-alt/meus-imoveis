import {test} from 'node:test';
import assert from 'node:assert/strict';
import {database,client} from './helpers/marketing-db.mjs';
import {listCentral,chat} from '../supabase/functions/_shared/central-bots/service.js';

for (const provider of ['groq','deepinfra']) test(`${provider}: all bot greetings call the same AI, store answers, keep Marketing budgets and operational grounding`,{timeout:30000},async()=>{
  const pg=await database(),nativeFetch=globalThis.fetch;
  try {
    const account=crypto.randomUUID(),user=crypto.randomUUID();
    await pg.query('insert into accounts values($1)',[account]);await pg.query('insert into auth.users values($1)',[user]);
    const db=client(pg),from=db.from.bind(db);
    db.from=name=>{
      const query=from(name),select=query.select.bind(query),execute=query.execute.bind(query);let count=false,head=false;
      query.select=(fields,options={})=>{count=options.count==='exact';head=options.head===true;return select(fields);};
      query.execute=async()=>{const result=await execute();return count&&!result.error?{...result,count:result.data.length,data:head?null:result.data}:result;};
      return query;
    };
    const calls=[];
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,provider==='deepinfra'?'https://api.deepinfra.com/v1/openai/chat/completions':'https://api.groq.com/openai/v1/chat/completions');
      const body=JSON.parse(options.body);calls.push(body);
      assert.match(body.messages[0].content,/coloquial, amigável, simples e leve/);
      assert.match(body.messages[0].content,/sem tabelas/);
      assert.match(body.messages[0].content,/não prova que a automação está funcionando/);
      return Response.json({choices:[{message:body.tool_choice==='required'?{role:'assistant',content:null,tool_calls:[{id:'call-fixture',type:'function',function:{name:'getBotsStatus',arguments:'{}'}}]}:{role:'assistant',content:'**Olá!** Como posso ajudar?'}}]});
    };
    const ctx={db,readDb:db,accountId:account,user:{id:user},env:{SUPABASE_URL:'https://example.test',MARKETING_BOT_ENABLED:'true',GROQ_API_KEY:'test-key',DEEPINFRA_API_KEY:'test-deepinfra-key',SYSTEM_AI_PROVIDER:provider,SYSTEM_AI_MODEL:'openai/gpt-oss-120b',MARKETING_MODEL_PRICES:'{"openai/gpt-oss-120b":{"input":0.15,"output":0.60}}'}};
    const listed=await listCentral(ctx);
    for(const bot of listed.bots){
      const result=await chat(ctx,{bot_id:bot.id,content:'Olá!',request_id:crypto.randomUUID()});
      assert.equal(result.message.role,'assistant');assert.equal(result.message.content,'Olá! Como posso ajudar?');assert.deepEqual(result.message.sources,[]);
    }
    assert.equal(calls.length,4);assert.ok(calls.every(c=>c.model==='openai/gpt-oss-120b'&&!c.tools&&!c.tool_choice));
    const runs=(await pg.query('select result,status from agent_runs')).rows;
    assert.ok(runs.every(r=>r.status==='completed'&&r.result.provider===provider&&r.result.model==='openai/gpt-oss-120b'));
    assert.ok(runs.some(r=>r.result.marketing_reserved_usd>0),'Marketing greeting must reserve its budget');
    const gestor=listed.bots.find(b=>b.kind==='gestor');
    const operational=await chat(ctx,{bot_id:gestor.id,content:'Olá! Consulte quais bots existem.',request_id:crypto.randomUUID()});
    assert.equal(calls[4].tool_choice,'required');assert.ok(operational.message.sources.some(s=>s.tool==='getBotsStatus'));
    const marketing=listed.bots.find(b=>b.kind==='marketing');
    await pg.query("update agent_marketing_settings set config=jsonb_set(config,'{daily_budget_usd}','0') where account_id=$1",[account]);
    const before=calls.length;
    await assert.rejects(chat(ctx,{bot_id:marketing.id,content:'Oi',request_id:crypto.randomUUID()}),/orçamento/);
    assert.equal(calls.length,before,'Budget rejection occurs before calling AI');
  }finally{globalThis.fetch=nativeFetch;await pg.close();}
});

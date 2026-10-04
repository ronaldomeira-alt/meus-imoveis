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
    let toolName='getBotsStatus', toolArgs={}, answer=null;
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,provider==='deepinfra'?'https://api.deepinfra.com/v1/openai/chat/completions':'https://api.groq.com/openai/v1/chat/completions');
      const body=JSON.parse(options.body);calls.push(body);
      assert.match(body.messages[0].content,/coloquial, amigável, simples e leve/);
      assert.match(body.messages[0].content,/sem tabelas/);
      assert.match(body.messages[0].content,/não prova que a automação está funcionando/);
      if(body.stream){
        const encoder=new TextEncoder();
        return new Response(new ReadableStream({start(controller){
          for(const content of (answer ? [answer] : ['Há ','123456789123 ','bots. ']))controller.enqueue(encoder.encode('data: '+JSON.stringify({choices:[{delta:{content}}]})+'\n\n'));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));controller.close();
        }}),{headers:{'Content-Type':'text/event-stream'}});
      }
      return Response.json({choices:[{message:body.tool_choice==='required'?{role:'assistant',content:null,tool_calls:[{id:'call-fixture',type:'function',function:{name:toolName,arguments:JSON.stringify(toolArgs)}}]}:{role:'assistant',content:answer || '**Olá!** Como posso ajudar?'}}]});
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
    const streamed=[];
    const guarded=await chat({...ctx,onText:text=>streamed.push(text)},{bot_id:gestor.id,content:'Consulte quais bots existem.',request_id:crypto.randomUUID()});
    assert.ok(streamed.some(text=>text.includes('Há')),'A safe prefix arrives incrementally');
    assert.ok(streamed.every(text=>!text.includes('123456789123')),'Unsupported numeric tokens never reach the UI');
    assert.match(guarded.message.content,/números ainda não ficaram claros/);
    assert.ok(calls.at(-1).stream,'Operational final response uses provider streaming');
    const customId=crypto.randomUUID();
    await pg.query("insert into agent_bots(id,account_id,slug,name,mission,kind,tools) values($1,$2,'amigo','Bot Amigo','Ajudar com consultas seguras.','custom',array['getBotsStatus'])",[customId,account]);
    const custom=await chat(ctx,{bot_id:customId,content:'Oi',request_id:crypto.randomUUID()});
    assert.equal(custom.message.content,'Olá! Como posso ajudar?');
    assert.match(calls.at(-1).messages[0].content,/personalizados e futuros/);
    const sentinel=listed.bots.find(b=>b.kind==='sentinela'), incidentId=crypto.randomUUID();
    await pg.query("insert into agent_incidents(id,account_id,bot_id,fingerprint,component,expected,observed,impact,confidence) values($1,$2,$3,'test:missing','captador_telemetry','Busca concluída.','Nenhuma rodada concluída após o horário esperado.','medium',0.9)",[incidentId,account,sentinel.id]);
    toolName='getIncidentDetails';toolArgs={incident_id:incidentId};
    answer='O captador_telemetry ficou travado porque a CPU falhou. ';
    const technicalStream=[];
    const explained=await chat({...ctx,onText:text=>technicalStream.push(text)},{bot_id:sentinel.id,content:'Explique a ocorrência para mim.',request_id:crypto.randomUUID()});
    assert.match(explained.message.content,/Bot Captador/);
    assert.match(explained.message.content,/não confirma que ele travou/);
    assert.match(explained.message.content,/não consegui confirmar a causa/);
    assert.ok(technicalStream.every(text=>!text.includes('captador_telemetry')&&!text.includes('CPU')),'Rejected jargon cannot leak through streaming');
    assert.equal(explained.message.sources[0].data.incident.component,'captador_telemetry','Raw evidence remains available');
    assert.match(calls.at(-1).messages.find(m=>m.role==='tool').content,/human_explanation/);
    answer='Componente: captador_telemetry. ';
    const technical=await chat(ctx,{bot_id:sentinel.id,content:'me mostre os detalhes técnicos',request_id:crypto.randomUUID()});
    assert.match(technical.message.content,/captador_telemetry/);
    assert.match(calls.at(-1).messages[0].content,/pediu detalhes técnicos explicitamente/);

  }finally{globalThis.fetch=nativeFetch;await pg.close();}
});

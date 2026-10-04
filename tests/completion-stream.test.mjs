import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readCompletionStream} from '../supabase/functions/_shared/central-bots/completion-stream.js';
import {createAIProvider} from '../supabase/functions/_shared/central-bots/ai-provider.js';

const frame=value=>`data: ${JSON.stringify(value)}\r\n\r\n`;
test('SSE arrives before completion, survives byte splits, hides reasoning and retains usage',async()=>{
  const original=globalThis.fetch,seen=[];let release;
  const gate=new Promise(resolve=>release=resolve);
  globalThis.fetch=async(url,options)=>{
    assert.equal(JSON.parse(options.body).stream,true);
    const encoder=new TextEncoder();
    return new Response(new ReadableStream({async start(controller){
      const text=encoder.encode(frame({choices:[{delta:{content:'Olá ',reasoning_content:'INTERNAL REASONING'}}]}));
      for(const byte of text)controller.enqueue(new Uint8Array([byte]));
      await gate;
      controller.enqueue(encoder.encode(frame({choices:[{delta:{content:'amigo!'}}]})+frame({choices:[],usage:{prompt_tokens:5,completion_tokens:3}})+'data: [DONE]\r\n\r\n'));controller.close();
    }}),{headers:{'Content-Type':'text/event-stream'}});
  };
  try {
    const promise=createAIProvider({SYSTEM_AI_PROVIDER:'deepinfra',DEEPINFRA_API_KEY:'test-synthetic-key'}).complete({messages:[{role:'user',content:'Olá'}],tools:[],onText:text=>seen.push(text)});
    await new Promise(resolve=>setTimeout(resolve,30));assert.deepEqual(seen,['Olá ']);release();
    const reply=await promise;assert.equal(reply.content,'Olá amigo!');assert.equal(reply.usage.completion_tokens,3);assert.ok(!seen.join('').includes('INTERNAL'));
  }finally{release();globalThis.fetch=original;}
});
test('fragmented tool calls are reassembled and incomplete streams fail without reporting success',async()=>{
  const events=[{choices:[{delta:{tool_calls:[{index:0,id:'call-test',function:{name:'getBots',arguments:'{"period":'}}]}}]},{choices:[{delta:{tool_calls:[{index:0,function:{name:'Status',arguments:'"today"}'}}]}}]}];
  const seen=[];const reply=await readCompletionStream(new Response(events.map(frame).join('')+'data: [DONE]\n\n'),text=>seen.push(text));
  assert.deepEqual(seen,[]);assert.equal(reply.choices[0].message.tool_calls[0].function.name,'getBotsStatus');assert.deepEqual(JSON.parse(reply.choices[0].message.tool_calls[0].function.arguments),{period:'today'});
  await assert.rejects(readCompletionStream(new Response(frame({choices:[{delta:{content:'Resposta incompleta'}}]})),()=>{}),/interrompida/);
});

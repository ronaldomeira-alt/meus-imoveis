import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULTS, assessIdea, safeSourceUrl, parseFeedback, quietHours, validateSettings, fingerprint } from '../supabase/functions/_shared/bot-marketing/core.js';
import { readSource, readInstagram, readInventory } from '../supabase/functions/_shared/bot-marketing/sources.js';
import { costEnvelope, editorialCall } from '../supabase/functions/_shared/bot-marketing/ai.js';
const now = new Date('2026-10-04T15:00:00Z');
const fact = { id: 'fact', updated_at: now.toISOString(), data: { url: 'https://www.joaopessoa.pb.gov.br/noticia', quote: 'Citação literal conferida na fonte para uma proposta de teste.', verification: 'observed_quote', published_at: '2026-10-03T15:00:00Z' } };
const idea = { topic: 'Mobilidade no Bessa', angle: 'Como conferir a rotina antes de comprar', why_now: 'Mudança local recente', fit: 'Ajuda quem procura moradia', format: 'Vídeo curto', hook: 'Conhecer a rotina do bairro', practical: 'Mostrar trajeto e explicar o contexto', message: 'Ronaldo, tive uma ideia de vídeo sobre a rotina do bairro.', effort: 'Uma gravação curta', reasoning: 'Informação útil com fonte local', evidence_ids: ['fact'], evidence_sufficient: true, own_angle: true, fit_confirmed: true, sensitive: false, unsupported_financial_claim: false };
test('single grounded source is sufficient, correlations are optional, engagement needs real comparison', () => {
  assert.equal(assessIdea(idea,[fact],[],DEFAULTS,now).evidence.length,1);
  assert.throws(()=>assessIdea({...idea,engagement_claim:true},[fact],[],DEFAULTS,now));
  assert.throws(()=>assessIdea({...idea,evidence_ids:['invented']},[fact],[],DEFAULTS,now));
  assert.throws(()=>assessIdea({...idea,sensitive:true},[fact],[],DEFAULTS,now));
});
test('old news, unknown dates, contradicted facts, topic and angle duplicates fail the gate', () => {
  for (const data of [{published_at:'2020-01-01'}, {published_at:null},{contradicted:true}]) assert.throws(()=>assessIdea(idea,[{...fact,data:{...fact.data,...data}}],[],DEFAULTS,now));
  for(const previous of [{topic:idea.topic,angle:'Outro ângulo'}, {topic:'Outro assunto',angle:idea.angle}]) assert.throws(()=>assessIdea(idea,[fact],[{...previous,created_at:now.toISOString()}],DEFAULTS,now));
  assert.throws(()=>assessIdea(idea,[fact],[],{...DEFAULTS,profile:{rejected_topics:['mobilidade']}},now));
});
test('feedback retains explicit intent and never infers a motive or broad ban from one rejection',()=>{
  assert.deepEqual(parseFeedback('não gostei'),{status:'discarded',explicit_reason:null});
  assert.equal(parseFeedback('guarda para depois').status,'saved');
  assert.equal(parseFeedback('isso já fiz').status,'published');
  assert.equal(parseFeedback('mais nessa linha').preference,'more_like_this');
  assert.equal(parseFeedback('quero algo mais simples').preference,'simpler');
  assert.equal(parseFeedback('não quero falar desse tema').preference,'reject_topic');
  assert.equal(parseFeedback('aprovado').status,'approved');
  assert.equal(parseFeedback('publique agora'),null);
});
test('quiet hours use Sao Paulo, including midnight, and limits cannot grant permissions',()=>{
  assert.equal(quietHours(DEFAULTS,new Date('2026-10-04T23:00:00Z')),true);
  assert.equal(quietHours(DEFAULTS,new Date('2026-10-04T10:59:00Z')),true);
  assert.equal(quietHours(DEFAULTS,new Date('2026-10-04T11:00:00Z')),false);
  assert.equal(quietHours({...DEFAULTS,quiet_start:'10:00',quiet_end:'12:00'},now),false);
  assert.throws(()=>validateSettings({publish:true})); assert.throws(()=>validateSettings({max_calls:100})); assert.throws(()=>validateSettings({quiet_start:'25:00'}));
});
test('SSRF, credentials, foreign hosts, ports and redirects are denied before reading',async()=>{
  for(const url of ['http://www.gov.br/a','https://127.0.0.1','https://www.gov.br.evil.test','https://user:pass@www.gov.br','https://www.gov.br:8443','file:///secret']) assert.throws(()=>safeSourceUrl(url));
  let calls=0; await assert.rejects(readSource('https://www.gov.br/a',{},async()=>{calls++;return new Response(null,{status:302,headers:{location:'http://169.254.169.254/'}});})); assert.equal(calls,1);
});
test('feed discovery is only a clue; fetched page observes dates and text without claiming to watch video',async()=>{
  const page=await readSource('https://www.gov.br/a',{},async()=>new Response(`<meta content="2026-10-03T10:00:00Z" property="article:published_time"><title>Fonte</title><article>${'Texto acessível. '.repeat(30)}</article>`,{headers:{'content-type':'text/html'}}));
  assert.equal(page.published_at,'2026-10-03T10:00:00.000Z');assert.equal(page.observation,'page_text_only');
  const feed=await readSource('https://www.gov.br/feed',{},async()=>new Response('<rss><channel><item><title>Teste</title><link>https://www.gov.br/a</link><pubDate>Fri, 03 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>',{headers:{'content-type':'application/rss+xml'}})); assert.equal(feed.entries[0].observation,'discovery_only');
  await assert.rejects(readSource('https://www.gov.br/a',{},async()=>new Response('denied',{status:403}))); await assert.rejects(readSource('https://www.gov.br/a',{},async()=>new Response('x',{headers:{'content-type':'text/html','content-length':'500001'}})));
});
function instagramCtx(account, token='test-token') {
  return {accountId:'tenant',env:{MARKETING_INSTAGRAM_ACCOUNT_ID:'tenant',MARKETING_INSTAGRAM_CONNECTION_ID:'connection'},db:{from(name){let fields;return {select(f){fields=f;return this;},eq(k,v){assert.equal(v,name.endsWith('tokens')?account.id:'connection');return this;},async maybeSingle(){return {data:fields==='access_token'?{access_token:token}:account,error:null};}};}}};
}
test('Instagram binding, expired tokens, unknown metrics and caption-only observations are explicit',async()=>{
  assert.equal((await readInstagram({accountId:'other',env:{}})).status,'binding_required');
  const account={id:'connection',instagram_user_id:'123',status:'connected',token_expires_at:'2020-01-01'};
  assert.equal((await readInstagram(instagramCtx(account),()=>{throw Error('must not fetch');})).status,'expired');
  const active={...account,token_expires_at:'2099-01-01'};
  const result=await readInstagram(instagramCtx(active),async url=>{const path=new URL(url).pathname; return Response.json(path.endsWith('/123')?{id:'123',username:'verified'}:/permissions|insights/.test(path)?{error:{code:100}}:{data:[{id:'456',caption:'Legenda',media_type:'VIDEO'}]},{status:/permissions|insights/.test(path)?400:200});});
  assert.equal(result.permission_probe,'unknown');assert.equal(result.contents[0].reach,null);assert.equal(result.contents[0].likes,null);assert.equal(result.contents[0].observation,'caption_only');assert.equal(result.insights_read,false);
  assert.doesNotMatch(JSON.stringify(result),/test-token/);
  const expired=await readInstagram(instagramCtx(active),async()=>Response.json({error:{code:190}},{status:400})); assert.equal(expired.status,'expired');
});
test('inventory is account-scoped and excludes private contacts and CRM conversations',async()=>{
  const calls=[];const ctx={accountId:'tenant',db:{from(name){calls.push(name);return {select(){return this;},eq(k,v){assert.equal(k,'account_id');assert.equal(v,'tenant');return this;},order(){return this;},limit(){return Promise.resolve({data:[{property_id:'p',property_data:{status:'Ativo',neighborhood:'Bessa',owner_phone:'secret',notes:'private'},updated_at:now.toISOString()}],error:null});}};}}};
  const stock=await readInventory(ctx);assert.equal(stock.properties.length,1);assert.doesNotMatch(JSON.stringify(stock),/secret|private/);assert.deepEqual(calls,['inventory_properties']);
});
test('provider swap, token costing and conservative budget reservation fail closed without prices',async()=>{
  assert.throws(()=>costEnvelope({},[],'model'));
  const env={GROQ_API_KEY:'key',MARKETING_MODEL_PRICES:'{"openai/gpt-oss-20b":{"input":0.075,"output":0.30}}'};
  let reserved=false,called=false;
  const result=await editorialCall({env},{provider:'groq'},'JSON',{},async cost=>{assert.ok(cost>0);reserved=true;},()=>({name:'fixture',complete:async()=>{assert.ok(reserved);called=true;return{content:'{"ideas":[]}',usage:{prompt_tokens:100,completion_tokens:10}};}}));
  assert.ok(called);assert.equal(result.output.ideas.length,0);assert.equal(result.cost_usd,0.0000105);
  await assert.rejects(editorialCall({env},{provider:'groq'},'JSON',{},async()=>{throw Error('cap');},()=>{throw Error('must not call');}),/cap/);
});
test('fingerprints normalize typography; Marketing contains no runtime publishing or protected operations',async()=>{
  assert.equal(await fingerprint('João Pessoa','Ângulo'),await fingerprint('joao pessoa','angulo'));
  const worker=readFileSync('supabase/functions/_shared/bot-marketing/worker.js','utf8');assert.doesNotMatch(worker,/publishMarketing|publish-instagram|bot_captures|bot_capture_tombstones|crm_leads|child_process/);
});

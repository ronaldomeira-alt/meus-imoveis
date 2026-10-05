import {createClient} from '@supabase/supabase-js';
import {AgentError, UUID, rows, redactOperationalData} from './core.js';

export async function tokenHash(token) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const publicJob = ({context,lease_token,lease_until,runner_id,account_id,...job})=>job;
function safeText(value, env, limit=4000) {
  return String(redactOperationalData(String(value || ''),env)).slice(0,limit)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu,'[e-mail removido]')
    .replace(/(?:\+55\s*)?\(?\d{2}\)?[\s.-]*\d{4,5}[\s.-]*\d{4}\b/gu,'[telefone removido]');
}
export function investigationContext(incident, env={}) {
  const evidence=incident.dossier?.evidence || {};
  // Do not forward captures, contact records, arbitrary logs or whole dossiers.
  const rounds=Array.isArray(evidence.recent_rounds)?evidence.recent_rounds.slice(0,10).map(round=>Object.fromEntries(
    ['status','started_at','finished_at','completed_at'].filter(key=>typeof round[key]==='string').map(key=>[key,safeText(round[key],env,150)]))):[];
  return {component:safeText(incident.component,env,120),expected:safeText(incident.expected,env),observed:safeText(incident.observed,env),impact:incident.impact,
    last_seen_at:incident.last_seen_at, evidence:{expected_slot:typeof evidence.expected_slot==='string'?evidence.expected_slot:null,recent_rounds:rounds},
    limitations:['Somente a evidência disponível nesta ocorrência.','Sem acesso ao ambiente de produção, à máquina do Captador ou a conversas privadas.'],
    scope:'investigate_and_propose_only',correction_allowed:false};
}
export async function technicalAction(ctx, body) {
  if (ctx.env.TECHNICAL_BRIDGE_ENABLED!=='true') {
    if(body.operation==='list')return {enabled:false,runners:[],jobs:[]};
    throw new AgentError('Integração técnica desativada.',503);
  }
  if(body.operation==='list') {
    const [runners,jobs]=await Promise.all([
      rows(ctx.db.from('agent_technical_runners').select('id,label,enabled,last_seen_at,state').eq('account_id',ctx.accountId)),
      rows(ctx.db.from('agent_technical_jobs').select('*').eq('account_id',ctx.accountId).order('created_at',{ascending:false}).limit(30)),
    ]);
    return {enabled:true,runners,jobs:jobs.map(publicJob)};
  }
  if(body.operation==='pair') {
    const token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
    const runner=await rows(ctx.db.from('agent_technical_runners').insert({account_id:ctx.accountId,token_hash:await tokenHash(token)}).select('id,label').single());
    return {runner,token}; // Returned once to the authenticated administrator.
  }
  if(body.operation==='revoke') {
    if(!UUID.test(body.runner_id || ''))throw new AgentError('Conexão inválida.');
    await rows(ctx.db.from('agent_technical_runners').update({enabled:false}).eq('account_id',ctx.accountId).eq('id',body.runner_id));
    return {revoked:true};
  }
  if(body.operation==='create') {
    if(!UUID.test(body.incident_id || '') || !UUID.test(body.request_id || ''))throw new AgentError('Investigação inválida.');
    const incident=await rows(ctx.db.from('agent_incidents').select('*').eq('account_id',ctx.accountId).eq('id',body.incident_id).maybeSingle());
    if(!incident)throw new AgentError('Ocorrência não encontrada nesta conta.',404);
    const runners=await rows(ctx.db.from('agent_technical_runners').select('last_seen_at,state').eq('account_id',ctx.accountId).eq('enabled',true));
    if(!runners.some(runner=>['ready','busy'].includes(runner.state) && Date.now()-Date.parse(runner.last_seen_at || '')<90000))throw new AgentError('O Antigravity precisa passar na verificação de conexão antes de receber uma investigação.',409);
    const created=await rows(ctx.db.rpc('agent_technical_enqueue',{p_account_id:ctx.accountId,p_user_id:ctx.user.id,p_incident_id:incident.id,p_request_id:body.request_id,p_context:investigationContext(incident,ctx.env)}));
    return {job:publicJob(created[0])};
  }
  if(body.operation==='cancel') {
    if(!UUID.test(body.job_id || ''))throw new AgentError('Investigação inválida.');
    await rows(ctx.db.from('agent_technical_jobs').update({status:'cancelled',lease_token:null,finished_at:new Date().toISOString(),progress:'Investigação cancelada por você.'}).eq('account_id',ctx.accountId).eq('id',body.job_id).in('status',['queued','running']));
    return {cancelled:true};
  }
  throw new AgentError('Operação técnica inválida.');
}
export function validateInvestigationResult(value, env={}) {
  if(!value || typeof value!=='object' || !['confirmed','hypothesis','unknown'].includes(value.assessment))throw new AgentError('Conclusão inválida.');
  if(typeof value.summary!=='string' || !value.summary.trim() || value.summary.length>5000)throw new AgentError('Resumo inválido.');
  if(!Array.isArray(value.findings) || value.findings.length>20 || value.findings.some(item=>!item || typeof item.file!=='string' || typeof item.evidence!=='string' || !item.file.trim() || !item.evidence.trim()) || !Array.isArray(value.next_steps) || value.next_steps.length>12 || value.next_steps.some(item=>typeof item!=='string'))throw new AgentError('Evidências inválidas.');
  if(value.assessment==='confirmed' && !value.findings.length)throw new AgentError('Conclusão confirmada sem evidências.');
  return {summary:safeText(value.summary,env,5000),assessment:value.assessment,
    findings:value.findings.map(item=>({file:safeText(item.file,env,300),evidence:safeText(item.evidence,env,2000)})),
    next_steps:value.next_steps.map(item=>safeText(item,env,1000)),
    proposed_change:safeText(value.proposed_change,env,12000),limitations:safeText(value.limitations,env,3000),
    code_revision:safeText(value.code_revision,env,80),correction_executed:false,verification:'not_executed'};
}
export async function runnerAction(db, env, token, body) {
  if(env.CENTRAL_BOTS_ENABLED!=='true' || env.TECHNICAL_BRIDGE_ENABLED!=='true')throw new AgentError('Integração desativada.',503);
  if(!/^[a-f0-9]{64}$/u.test(token || ''))throw new AgentError('Conexão não autorizada.',401);
  const runner=await rows(db.from('agent_technical_runners').select('id,account_id,enabled').eq('token_hash',await tokenHash(token)).maybeSingle());
  if(!runner?.enabled)throw new AgentError('Conexão não autorizada.',401);
  const runtime=await rows(db.from('agent_runtime_settings').select('enabled').eq('account_id',runner.account_id).maybeSingle());
  if(!runtime?.enabled)throw new AgentError('Central desativada.',503);
  if(body.operation==='heartbeat' || body.operation==='claim') {
    const state=['ready','busy','needs_access','error'].includes(body.state)?body.state:'ready';
    await rows(db.from('agent_technical_runners').update({last_seen_at:new Date().toISOString(),state}).eq('account_id',runner.account_id).eq('id',runner.id));
    if(body.operation==='heartbeat')return {ok:true};
    const jobs=await rows(db.rpc('agent_technical_claim',{p_account_id:runner.account_id,p_runner_id:runner.id}));
    const job=jobs[0];return {job:job?{id:job.id,lease_token:job.lease_token,context:job.context}:null};
  }
  if(!UUID.test(body.job_id || '') || !UUID.test(body.lease_token || ''))throw new AgentError('Investigação inválida.');
  if(!['progress','finish'].includes(body.operation))throw new AgentError('Operação inválida.');
  const patch=body.operation==='progress'?{progress:safeText(body.progress,env,500)}:
    {status:['completed','needs_access','failed'].includes(body.status)?body.status:'failed',progress:body.status==='completed'?'Investigação concluída. Nenhuma correção aplicada.':body.status==='needs_access'?'Antigravity precisa de acesso ou informações adicionais.':'Não foi possível concluir a investigação.',
      result:body.status==='completed'?validateInvestigationResult(body.result,env):{summary:safeText(body.error || 'Não foi possível concluir esta tentativa.',env,2000),correction_executed:false},finished_at:new Date().toISOString(),lease_token:null};
  const updated=await rows(db.from('agent_technical_jobs').update(patch).eq('account_id',runner.account_id).eq('runner_id',runner.id).eq('id',body.job_id).eq('status','running').eq('lease_token',body.lease_token).gt('lease_until',new Date().toISOString()).select('id').maybeSingle());
  if(!updated)throw new AgentError('Investigação cancelada ou conexão expirada.',409);
  return {ok:true};
}
export function createTechnicalBridgeHandler(env, factory=createClient) {
  return async req=>{
    try {
      if(req.method!=='POST' || req.headers.get('origin'))throw new AgentError('Requisição não autorizada.',403);
      if(env.CENTRAL_BOTS_ENABLED!=='true' || env.TECHNICAL_BRIDGE_ENABLED!=='true')throw new AgentError('Integração desativada.',503);
      if(!/^[a-f0-9]{64}$/u.test(req.headers.get('x-technical-key') || ''))throw new AgentError('Conexão não autorizada.',401);
      const reader=req.body?.getReader();const chunks=[];let size=0;
      if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>100000){await reader.cancel();throw new AgentError('Resultado grande demais.',413);}chunks.push(value);}}finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      let body;try{body=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new AgentError('Requisição inválida.');}
      if(!body || typeof body!=='object' || Array.isArray(body))throw new AgentError('Requisição inválida.');
      const db=factory(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
      const result=await runnerAction(db,env,req.headers.get('x-technical-key'),body);
      return Response.json(result,{headers:{'Cache-Control':'no-store'}});
    }catch(error){return Response.json({error:error instanceof AgentError?error.message:'A conexão técnica não respondeu.'},{status:error instanceof AgentError?error.status:503,headers:{'Cache-Control':'no-store'}});}
  };
}

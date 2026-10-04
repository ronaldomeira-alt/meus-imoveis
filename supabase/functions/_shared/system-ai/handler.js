import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'node:buffer';
import { AgentError, UUID, rows, requiredText, publicError } from '../central-bots/core.js';
import { createAIProvider } from '../central-bots/ai-provider.js';
import { AI_CATALOG, encryptAIKey, validateAIConfig, resolveSystemAI, publicAIConfig } from './config.js';
import { PROPERTY_EXTRACTION_PROMPT } from './prompts.js';

const ACTION_FIELDS = {
  config:[], save:['config'], test:[], extract:['text'], caption:['system_prompt','prompt'], transcribe:['audio','mime'],
};
async function readBody(req) {
  const reader=req.body?.getReader(); let size=0; const chunks=[];
  if(Number(req.headers.get('content-length'))>3500000) throw new AgentError('Requisição grande demais.',413);
  if(!reader) throw new AgentError('Requisição inválida.');
  for (;;) { const {value,done}=await reader.read(); if(done)break; size+=value.length;
    if(size>3500000){await reader.cancel();throw new AgentError('Requisição grande demais.',413);} chunks.push(value); }
  try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new AgentError('Requisição inválida.');}
}
export function createSystemAIHandler(env,{factory=createClient,providerFactory=createAIProvider}={}) {
  return async req=>{
    const origin=req.headers.get('origin');
    const allowed=[env.APP_ORIGIN||'https://ronaldomeira.com.br','https://www.ronaldomeira.com.br',env.CENTRAL_DEV_ORIGIN].filter(Boolean);
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',Vary:'Origin','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS',...(allowed.includes(origin)?{'Access-Control-Allow-Origin':origin}:{})};
    const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
    try {
      if(origin&&!allowed.includes(origin))throw new AgentError('Origem não autorizada.',403);
      if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
      if(req.method!=='POST')throw new AgentError('Método não permitido.',405);
      const token=req.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
      if(!token)throw new AgentError('Faça login para usar a IA do sistema.',401);
      if(!env.SUPABASE_URL||!env.SUPABASE_ANON_KEY||!env.SUPABASE_SERVICE_ROLE_KEY)throw new AgentError('IA do sistema indisponível.',503);
      const options={auth:{persistSession:false,autoRefreshToken:false}};
      const readDb=factory(env.SUPABASE_URL,env.SUPABASE_ANON_KEY,{...options,global:{headers:{Authorization:`Bearer ${token}`}}});
      const {data,error}=await readDb.auth.getUser(token);
      if(error||!data?.user)throw new AgentError('Sessão inválida ou expirada.',401);
      const accountId=await rows(readDb.rpc('current_inventory_account_id'));
      if(!UUID.test(accountId||''))throw new AgentError('Conta autenticada não encontrada.',403);
      const body=await readBody(req);
      const fields=Object.hasOwn(ACTION_FIELDS,body?.action)?ACTION_FIELDS[body.action]:null;
      if(!fields||!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['action','request_id',...fields].includes(k)))throw new AgentError('Operação de IA inválida.');
      const db=factory(env.SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,options);
      const ctx={db,accountId,env};
      const canManage=data.user.email?.toLowerCase()===(env.CENTRAL_ADMIN_EMAIL||'ronaldomeira@gmail.com').toLowerCase();
      if(body.action==='save') {
        if(!canManage)throw new AgentError('Somente o administrador pode configurar a IA.',403);
        const config=validateAIConfig(body.config);
        const record=await rows(db.from('system_ai_settings').select('*').eq('account_id',accountId).maybeSingle());
        const primary=accountId===(env.SYSTEM_AI_ACCOUNT_ID||env.MEUS_IMOVEIS_ACCOUNT_ID);
        const encrypted_key=body.config.api_key ? await encryptAIKey(body.config.api_key.trim(),accountId,config.provider,env) : record?.provider===config.provider?record.encrypted_key:null;
        if(!encrypted_key&&!(primary&&env[AI_CATALOG[config.provider].key]))throw new AgentError('Informe a chave do provedor selecionado.');
        await rows(db.from('system_ai_settings').upsert({...config,encrypted_key,account_id:accountId,updated_by:data.user.id,updated_at:new Date().toISOString()},{onConflict:'account_id'}));
        return json(publicAIConfig(await resolveSystemAI(ctx),canManage));
      }
      const resolved=await resolveSystemAI(ctx);
      if(body.action==='config')return json(publicAIConfig(resolved,canManage));
      if(body.action==='test'&&!canManage)throw new AgentError('Somente o administrador pode testar a configuração.',403);
      if(!UUID.test(body.request_id||''))throw new AgentError('Identificador de requisição inválido.');
      const provider=providerFactory(resolved.env);
      let messages, audio;
      if(body.action==='transcribe') {
        if(!['audio/webm','audio/mp4','audio/ogg','audio/wav','audio/aac','audio/mpeg'].includes(body.mime)||typeof body.audio!=='string'||! /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(body.audio))throw new AgentError('Áudio inválido.');
        audio=Buffer.from(body.audio,'base64');
        if(audio.length<100||audio.length>2500000)throw new AgentError('O áudio deve ter até 2,5 MB.',413);
      } else if(body.action==='extract') {
        messages=[{role:'system',content:PROPERTY_EXTRACTION_PROMPT},{role:'user',content:requiredText(body.text,'Texto',1,24000)}];
      } else if(body.action==='caption') {
        messages=[{role:'system',content:requiredText(body.system_prompt,'Diretriz editorial',1,16000)},{role:'user',content:requiredText(body.prompt,'Pedido',1,16000)}];
      } else messages=[{role:'user',content:'Responda somente OK. Este é um teste técnico da configuração de IA.'}];
      if(!await rows(db.rpc('system_ai_reserve',{p_account_id:accountId,p_request_id:body.request_id})))throw new AgentError('Limite de IA atingido ou pedido já processado. Tente mais tarde.',429);
      const metadata={providerUsed:resolved.config.provider,model:resolved.config.model};
      if(audio) {
        const text=(await provider.transcribe(audio,body.mime)).trim();
        if(!text)throw new AgentError('Nenhuma fala foi identificada. Tente novamente ou digite o texto.',422);
        return json({...metadata,model:resolved.config.transcription_model,text});
      }
      const result=await provider.complete({messages,tools:[],json:body.action==='extract',maxOutputTokens:body.action==='extract'?4000:body.action==='test'?512:1600,reasoningEffort:'low'});
      if(!result.content?.trim())throw new AgentError('A IA não retornou uma resposta válida.',503);
      if(body.action==='test')return json({...metadata,message:`Conexão confirmada: ${resolved.config.provider} • ${resolved.config.model}.`});
      if(body.action==='caption')return json({...metadata,caption:result.content.trim()});
      let extracted;
      try{extracted=JSON.parse(result.content);}catch{throw new AgentError('A IA retornou uma ficha inválida.',503);}
      if(!extracted||typeof extracted!=='object'||Array.isArray(extracted))throw new AgentError('A IA retornou uma ficha inválida.',503);
      return json({...metadata,data:extracted});
    } catch(error) { return json({error:publicError(error)},error instanceof AgentError?error.status:500); }
  };
}

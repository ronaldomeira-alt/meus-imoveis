import {rows,AgentError} from './core.js';
const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function parsePropertySearch(html,campaign,existingIds) {
  const payload=html.match(/<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if(!payload)throw new AgentError('A fonte não retornou anúncios verificáveis nesta consulta.',503);
  const parsed=JSON.parse(payload[1]),page=parsed.props?.pageProps;
  const ads=page?.ads||page?.data?.ads;
  if(!Array.isArray(ads))throw new AgentError('O formato da fonte não pôde ser verificado.',503);
  const properties=[];
  for(const ad of ads.slice(0,100)) {
    const id=String(ad.listId||ad.list_id||''),url=String(ad.url||''),title=String(ad.title||''),neighborhood=ad.location?.neighbourhood||ad.location?.neighborhood||'';
    if(!/^\d{9,12}$/.test(id)||!/^https:\/\/(?:[a-z0-9-]+\.)?olx\.com\.br\/[^\s]+$/i.test(url)||existingIds.has(id))continue;
    // Professional/unknown classifications are never promoted to owner leads.
    if(ad.professional!==false&&ad.isProfessional!==false)continue;
    if(campaign.neighborhoods?.length&&!campaign.neighborhoods.some(n=>normalize(neighborhood).includes(normalize(n))))continue;
    properties.push({external_id:id,title:title.slice(0,200),url,neighborhood,price:ad.price??null});
  }
  return {analyzed_count:ads.length,properties,limits:'Pesquisa de anúncios públicos sem cadastro na fila de contato; novo significa ID não localizado nas captações/tombstones consultados. Não é autorização para abordagem.'};
}
export async function searchNewProperties(ctx,args={},fetcher=fetch) {
  const campaigns=await rows(ctx.db.from('bot_campaigns').select('type,min_price,max_price,neighborhoods').eq('account_id',ctx.accountId).eq('is_active',true).limit(2));
  if(!campaigns.length)return {unavailable:true,success:false,reason:'Não encontrei uma campanha ativa para orientar a pesquisa de imóveis. Nenhuma mensagem foi enviada.'};
  const [known,tombstones]=await Promise.all([rows(ctx.db.from('bot_captures').select('external_id').eq('account_id',ctx.accountId).limit(20000)),rows(ctx.db.from('bot_capture_tombstones').select('external_id').eq('account_id',ctx.accountId).limit(20000))]);
  if(known.length>=20000||tombstones.length>=20000)return {unavailable:true,success:false,reason:'Não consegui conferir toda a base necessária para identificar imóveis novos. Nenhuma mensagem foi enviada.'};
  const ids=new Set([...known,...tombstones].map(row=>String(row.external_id))),results=[],failures=[];
  for(const campaign of campaigns){const url=new URL('https://www.olx.com.br/imoveis/'+(campaign.type==='venda'?'venda':'aluguel')+'/estado-pb/joao-pessoa');url.searchParams.set('f','p');if(campaign.min_price)url.searchParams.set('ps',String(Math.round(campaign.min_price)));if(campaign.max_price)url.searchParams.set('pe',String(Math.round(campaign.max_price)));
    try{const r=await fetcher(url,{signal:AbortSignal.timeout(15000),redirect:'error'});if(!r.ok){failures.push({source:'OLX',http_status:r.status});continue;}const text=await r.text();if(text.length>3000000)throw new AgentError('Fonte excedeu o limite de leitura.');results.push(parsePropertySearch(text,campaign,ids));}catch{failures.push({source:'OLX',status:'read_failed'});}}
  const unique=[...new Map(results.flatMap(r=>r.properties).map(p=>[p.external_id,p])).values()].slice(0,30);
  return {success:results.length>0,unavailable:results.length===0,observed_at:new Date().toISOString(),total_new:results.length?unique.length:null,properties:unique,failures,messages_sent:0,contacts_enqueued:0,reason:results.length?'Consulta pública realizada; nenhuma mensagem enviada e nenhum contato enfileirado.':'A fonte de imóveis recusou a consulta ou não retornou dados verificáveis. Não confirmei se existem imóveis novos; nenhuma mensagem foi enviada.',limits:'Consulta independente dos horários. Não usa a fila de envio nem modifica as rodadas operacionais do Captador.'};
}

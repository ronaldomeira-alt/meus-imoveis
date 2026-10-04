import { AgentError, rows } from '../central-bots/core.js';
import { safeSourceUrl } from './core.js';

export function plainText(text) {
  return String(text || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => { const cp = Number(n); return cp <= 0x10ffff ? String.fromCodePoint(cp) : ''; }).replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
async function boundedText(response, max = 500000) {
  if (Number(response.headers.get('content-length') || 0) > max) throw new AgentError('Fonte acima do limite de leitura.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0, text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new AgentError('Fonte acima do limite de leitura.');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
}
export async function readSource(url, env = {}, fetcher = fetch) {
  let current = safeSourceUrl(url, env);
  for (let redirects = 0; redirects < 4; redirects++) {
    const r = await fetcher(current, { redirect: 'manual', signal: AbortSignal.timeout(12000), headers: { Accept: 'text/html,application/rss+xml,application/xml,text/xml', 'User-Agent': 'MeusImoveisEditorial/1.0' } });
    if ([301, 302, 303, 307, 308].includes(r.status)) {
      const location = r.headers.get('location');
      if (!location) throw new AgentError('Redirecionamento sem destino.');
      current = safeSourceUrl(new URL(location, current).toString(), env);
      continue;
    }
    if (!r.ok) throw new AgentError(`Fonte indisponível (HTTP ${r.status}).`, 503);
    const type = r.headers.get('content-type') || '';
    if (!/html|xml|rss|atom/i.test(type)) throw new AgentError('Formato de fonte não suportado.');
    const raw = await boundedText(r);
    const observed_at = new Date().toISOString();
    if (/<rss\b|<feed\b/i.test(raw)) {
      const entries = [...raw.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)].slice(0, 20).map(([, xml]) => {
        const field = name => plainText(xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '');
        const link = field('link') || xml.match(/<link\b[^>]*href=["']([^"']+)/i)?.[1];
        let canonical;
        try { canonical = safeSourceUrl(link, env); } catch { return null; }
        const stamp = field('pubDate') || field('published') || field('updated');
        const published_at = Number.isFinite(Date.parse(stamp)) ? new Date(stamp).toISOString() : null;
        return { url: canonical, title: field('title').slice(0, 300), published_at, description: field('description').slice(0, 600), observation: 'discovery_only' };
      }).filter(Boolean);
      return { url: current, kind: 'feed', entries, observed_at, limits: 'Títulos e resumos são pistas; é necessário ler o artigo.' };
    }
    const metas = [...raw.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => {
      const attr = name => tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
      return { name: attr('property') || attr('name') || attr('itemprop'), content: attr('content') };
    });
    let stamp = metas.find(m => /^(article:published_time|datePublished|date|pubdate)$/i.test(m.name || ''))?.content;
    if (!stamp) {
      for (const [, json] of raw.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
        try {
          const data = JSON.parse(json);
          const objects = (Array.isArray(data) ? data : [data, ...(data['@graph'] || [])]);
          stamp = objects.find(o => o.datePublished)?.datePublished || stamp;
        } catch { /* malformed metadata remains unknown */ }
      }
    }
    const published_at = Number.isFinite(Date.parse(stamp)) ? new Date(stamp).toISOString() : null;
    const main = raw.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || raw.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || raw;
    const wholeText = plainText(main);
    const text = wholeText.slice(0, 16000);
    if (text.length < 200 || /checking your browser|verify you are human|just a moment|enable javascript and cookies/i.test(text.slice(0, 1000))) throw new AgentError('Conteúdo indisponível ou desafio de acesso; leitura interrompida.');
    return { url: current, kind: 'article', title: plainText(metas.find(m => m.name === 'og:title')?.content || raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]).slice(0, 300), text, truncated: wholeText.length>16000, published_at, observed_at, observation: 'page_text_only', limits: 'Texto acessível; nenhuma imagem ou vídeo foi analisado.' };
  }
  throw new AgentError('Limite de redirecionamentos excedido.');
}

export async function searchWeb(query, env, fetcher = fetch) {
  if (!env.MARKETING_BRAVE_API_KEY) return { unavailable: true, reason: 'Pesquisa web ampla não configurada. A descoberta continua pelos feeds oficiais.', results: [] };
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.search = new URLSearchParams({ q: String(query).slice(0, 350), count: '6', country: 'BR', search_lang: 'pt-br' }).toString();
  const r = await fetcher(url, { signal: AbortSignal.timeout(12000), headers: { 'X-Subscription-Token': env.MARKETING_BRAVE_API_KEY, Accept: 'application/json' } });
  if (!r.ok) throw new AgentError('Pesquisa web indisponível.', 503);
  const data = JSON.parse(await boundedText(r, 100000));
  return { results: (data.web?.results || []).map(item => {
    try { return { url: safeSourceUrl(item.url, env), title: plainText(item.title).slice(0, 300), observation: 'search_clue_only' }; } catch { return null; }
  }).filter(Boolean), limits: 'Resultados são pistas, não evidências. Domínios novos requerem autorização humana na configuração do servidor.' };
}

// The legacy Instagram tables have no inventory tenant binding. An explicit
// server mapping is required; never select the first global connected token.
export async function readInstagram(ctx, fetcher = fetch) {
  const connectionId = ctx.env.MARKETING_INSTAGRAM_CONNECTION_ID;
  if (!connectionId || ctx.env.MARKETING_INSTAGRAM_ACCOUNT_ID !== ctx.accountId)
    return { unavailable: true, status: 'binding_required', limits: 'Conexão legada precisa de vínculo explícito à conta no servidor.' };
  const account = await rows(ctx.db.from('marketing_instagram_accounts').select('id,instagram_user_id,instagram_username,status,token_expires_at').eq('id', connectionId).maybeSingle());
  if (!account || account.status !== 'connected') return { unavailable: true, status: 'disconnected' };
  if (account.token_expires_at && Date.parse(account.token_expires_at) <= Date.now()) return { unavailable: true, status: 'expired', limits: 'Reconectar no fluxo existente. Marketing não altera tokens de publicação.' };
  const tokenRow = await rows(ctx.db.from('marketing_instagram_tokens').select('access_token').eq('account_id', account.id).maybeSingle());
  if (!tokenRow?.access_token) return { unavailable: true, status: 'token_missing' };
  const mode = ctx.env.MARKETING_INSTAGRAM_LOGIN || 'instagram';
  if (!['instagram', 'facebook'].includes(mode)) throw new AgentError('Modalidade Instagram inválida.');
  const version = ctx.env.META_GRAPH_VERSION || 'v21.0';
  if (!/^v\d+\.0$/.test(version) || !/^\d+$/.test(account.instagram_user_id)) throw new AgentError('Identidade Instagram inválida.');
  const root = `https://${mode === 'instagram' ? 'graph.instagram.com' : 'graph.facebook.com'}/${version}`;
  const get = async (path, params) => {
    const url = new URL(`${root}/${path}`); url.search = new URLSearchParams(params).toString();
    const r = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(12000), headers: { Authorization: `Bearer ${tokenRow.access_token}` } });
    const data = JSON.parse(await boundedText(r, 150000));
    if (!r.ok) return { unavailable: true, code: data.error?.code === 190 ? 'expired' : 'permission_or_endpoint_unavailable' };
    return data;
  };
  const identity = await get(account.instagram_user_id, { fields: 'id,username' });
  if (identity.unavailable || String(identity.id) !== account.instagram_user_id) return { unavailable: true, status: identity.code || 'identity_mismatch' };
  const permissions = await get(`${account.instagram_user_id}/permissions`, {});
  const scopes = (permissions.data || []).filter(p => p.status === 'granted').map(p => p.permission);
  const media = await get(`${account.instagram_user_id}/media`, { fields: 'id,caption,media_type,permalink,timestamp,like_count,comments_count', limit: '25' });
  const insightsScope = mode === 'instagram' ? 'instagram_business_manage_insights' : 'instagram_manage_insights';
  // Metrics not fetched are null, never zero. One explicit authorized probe only.
  let insights = { unavailable: true, reason: 'Sem mídia para consulta.' };
  if (media.data?.[0]?.id) insights = await get(`${media.data[0].id}/insights`, { metric: 'reach,saved,shares' });
  return { status: media.unavailable ? media.code : 'connected', login: mode, username: identity.username, identity_verified: true,
    permission_probe: permissions.unavailable ? 'unknown' : 'observed', scopes,
    media_read: !media.unavailable, insights_read: !insights.unavailable,
    business_discovery: mode === 'instagram' ? 'unsupported_by_login_mode' : 'not_verified',
    token_expires_at: account.token_expires_at, observed_at: new Date().toISOString(),
    contents: (media.data || []).map(m => ({ id: m.id, caption: String(m.caption || '').slice(0, 5000), format: m.media_type, url: m.permalink, published_at: m.timestamp, likes: m.like_count ?? null, comments: m.comments_count ?? null, reach: null, saves: null, shares: null, boost: 'unknown', observation: 'caption_only', limits: 'Vídeo e imagem não analisados.' })),
    insights: insights.unavailable ? { unavailable: true, reason: insights.reason || `${insights.code}; verifique a permissão ${insightsScope} e as métricas aceitas pelo formato.` } : { media_id: media.data[0].id, data: insights.data, observed_at: new Date().toISOString() },
    limits: 'Amostra de até 25 conteúdos; métricas não comparáveis sem histórico. Renovação permanece no fluxo existente, sem escrita pelo Marketing.' };
}

export async function readInventory(ctx) {
  const list = await rows(ctx.db.from('inventory_properties').select('property_id,property_data,updated_at').eq('account_id', ctx.accountId).order('updated_at', { ascending: false }).limit(100));
  const allowed = ['title', 'purpose', 'type', 'neighborhood', 'bedrooms', 'area_m2', 'price', 'stage', 'source_type', 'status'];
  return { source: 'inventory_properties', observed_at: new Date().toISOString(), limit: 100, properties: list.filter(r => r.property_data.status === 'Ativo').map(r => ({ id: r.property_id, ...Object.fromEntries(allowed.map(k => [k, r.property_data[k] ?? null])) })), limits: 'Amostra recente de até 100 fichas. Contatos, endereços privados e observações excluídos.' };
}

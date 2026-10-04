import { AgentError, requiredText } from '../central-bots/core.js';

export const DEFAULTS = Object.freeze({
  enabled: false, paused: false, research_minutes: 720, analysis_minutes: 1440,
  delivery_minutes: 180, push_daily_limit: 1, push_interval_minutes: 360,
  quiet_start: '20:00', quiet_end: '08:00', similar_days: 30,
  max_steps: 16, max_calls: 6, max_sources: 6, max_investigations: 2,
  cycle_budget_usd: 0.10, daily_budget_usd: 0.50, retention_days: 365,
});
export const PROFILE = {
  declared: { name: 'Ronaldo Meira', region: ['João Pessoa', 'Cabedelo', 'Intermares'],
    neighborhoods: ['Bessa', 'Jardim Oceania', 'Altiplano', 'Parque Parahyba', 'Cabo Branco', 'Manaíra', 'Tambaú', 'Aeroclube', 'Brisamar', 'Miramar'],
    audience_context: ['famílias', 'pessoas com 50 anos ou mais', 'médicos', 'advogados', 'engenheiros', 'empreendedores'],
    tone: 'Natural, próximo, coloquial, cordial, sem emojis ou insistência comercial.', spouse: 'Thatianna' },
  confirmed: {}, inferences: [], rejected_topics: [], desired_topics: [],
  restrictions: ['Não prometer rentabilidade', 'Não explorar tragédias', 'Não copiar terceiros'],
  provenance: 'Contexto inicial declarado pelo responsável; audiência atual ainda não verificada.',
};
export const SEEDS = [
  { url: 'https://www.joaopessoa.pb.gov.br/feed/', identity: 'Prefeitura de João Pessoa', region: 'João Pessoa', kind: 'feed' },
  { url: 'https://cabedelo.pb.gov.br/feed/', identity: 'Prefeitura de Cabedelo', region: 'Cabedelo', kind: 'feed' },
  { url: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', identity: 'Agência Brasil', region: 'Brasil', kind: 'feed' },
];
export const BASE_DOMAINS = ['www.joaopessoa.pb.gov.br', 'joaopessoa.pb.gov.br', 'cabedelo.pb.gov.br', 'agenciabrasil.ebc.com.br', 'www.ibge.gov.br', 'agenciadenoticias.ibge.gov.br', 'www.bcb.gov.br', 'www.gov.br', 'paraiba.pb.gov.br', 'www.paraiba.pb.gov.br'];
export function safeSourceUrl(value, env = {}) {
  let u;
  try { u = new URL(value); } catch { throw new AgentError('URL de fonte inválida.'); }
  const allowed = [...BASE_DOMAINS, ...(env.MARKETING_SOURCE_DOMAINS || '').split(',').map(s => s.trim()).filter(Boolean)];
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443') || !allowed.includes(u.hostname.toLowerCase()) || u.search.length > 500)
    throw new AgentError('Fonte fora dos domínios de pesquisa autorizados.', 403);
  u.hash = '';
  return u.toString();
}
export function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export async function fingerprint(...values) {
  const bytes = new TextEncoder().encode(values.map(normalize).join('|'));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
}
export function localDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function quietHours(settings, now = new Date()) {
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const { quiet_start: start, quiet_end: end } = settings;
  return start === end ? false : start < end ? time >= start && time < end : time >= start || time < end;
}
export function validateSettings(input) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (!Object.hasOwn(DEFAULTS, k)) throw new AgentError('Configuração não permitida.');
    if (['enabled', 'paused'].includes(k)) {
      if (typeof v !== 'boolean') throw new AgentError('Configuração inválida.');
    } else if (k.startsWith('quiet_')) {
      if (typeof v !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new AgentError('Horário inválido.');
    } else {
      const max = { max_steps: 20, max_calls: 8, max_sources: 12, max_investigations: 4, push_daily_limit: 5, cycle_budget_usd: 2, daily_budget_usd: 10, retention_days: 730, similar_days: 180 }[k] || 10080;
      const min = ['push_daily_limit', 'max_investigations'].includes(k) ? 0 : k.endsWith('_minutes') ? 60 : k.endsWith('_usd') ? 0.001 : 1;
      if (!Number.isFinite(v) || v < min || v > max || (!k.endsWith('_usd') && !Number.isInteger(v))) throw new AgentError('Limite de configuração inválido.');
    }
    out[k] = v;
  }
  return out;
}

// Evidence is a quote in a fetched article, never a search snippet. Freshness is
// checked against the publisher's observed date, not a model-supplied date.
export function assessIdea(input, facts, previous, settings, now = new Date()) {
  const idea = { ...input };
  for (const k of ['topic', 'angle', 'why_now', 'fit', 'format', 'hook', 'practical', 'message', 'effort', 'reasoning'])
    idea[k] = requiredText(idea[k], k, 3, k === 'message' ? 1200 : 1800);
  if (!Array.isArray(idea.evidence_ids) || !idea.evidence_ids.length || idea.evidence_ids.length > 6) throw new AgentError('Proposta sem evidências.');
  const evidence = idea.evidence_ids.map(id => facts.find(f => f.id === id));
  if (evidence.some(f => !f || f.data?.verification !== 'observed_quote' || !f.data?.published_at || f.data?.contradicted)) throw new AgentError('Evidência ausente ou não verificada.');
  const age = evidence.map(f => (now.getTime() - Date.parse(f.data.published_at)) / 86400000);
  if (age.some(n => !Number.isFinite(n) || n < -1) || (Math.min(...age) > 14 && !idea.revisit_reason)) throw new AgentError('Notícia antiga ou data desconhecida exige nova justificativa.');
  if (idea.sensitive === true || idea.unsupported_financial_claim === true || idea.evidence_sufficient !== true || idea.own_angle !== true || idea.fit_confirmed !== true)
    throw new AgentError('Proposta não atende ao crivo editorial.');
  if (/\p{Extended_Pictographic}/u.test(idea.message)) throw new AgentError('A proposta deve respeitar o tom sem emojis.');
  if (idea.engagement_claim === true) throw new AgentError('Afirmações de tendência de engajamento requerem análise comparativa ainda indisponível.');
  const since = now.getTime() - settings.similar_days * 86400000;
  if (previous.some(p => Date.parse(p.created_at) >= since && (normalize(p.topic) === normalize(idea.topic) || normalize(p.angle) === normalize(idea.angle)))) throw new AgentError('Tema ou ângulo já sugerido recentemente.');
  if ((settings.profile?.rejected_topics || []).some(t => normalize(idea.topic).includes(normalize(t)))) throw new AgentError('Tema explicitamente rejeitado.');
  idea.evidence = evidence.map(f => ({ id: f.id, url: f.data.url, quote: f.data.quote, published_at: f.data.published_at, observed_at: f.updated_at }));
  idea.limits = String(idea.limits || 'Julgamento editorial revisável; nenhuma previsão de alcance.').slice(0, 1800);
  return idea;
}

export function parseFeedback(text) {
  const s = normalize(text);
  if (/\b(nao quero falar (desse|deste) tema|nao quero falar sobre)\b/.test(s)) return { status: 'discarded', preference: 'reject_topic', explicit_reason: text };
  if (/\b(guarda|guardar) (para|pra) depois\b/.test(s)) return { status: 'saved', explicit_reason: null };
  if (/\b(isso ja fiz|ja publiquei|publiquei isso)\b/.test(s)) return { status: 'published', explicit_reason: text };
  if (/\b(nao gostei|nao combina comigo|nao quero essa ideia)\b/.test(s)) return { status: 'discarded', explicit_reason: /nao combina|porque|pois|prefiro/.test(s) ? text : null };
  if (/\b(mais nessa linha|quero algo mais simples)\b/.test(s)) return { preference: /mais simples/.test(s) ? 'simpler' : 'more_like_this', explicit_reason: text };
  if (/^(aprovad[ao]|aprovo|gostei( dessa ideia)?)$/.test(s)) return { status: 'approved', explicit_reason: null };
  return null;
}

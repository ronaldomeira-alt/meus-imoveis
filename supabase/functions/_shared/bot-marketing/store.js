import { rows, AgentError, UUID } from '../central-bots/core.js';
import { DEFAULTS, PROFILE, SEEDS, fingerprint, validateSettings, parseFeedback, safeSourceUrl } from './core.js';

export const table = (ctx, name) => ctx.db.from(`agent_marketing_${name}`);
export const scoped = (ctx, name, fields = '*') => table(ctx, name).select(fields).eq('account_id', ctx.accountId);
export async function setupMarketing(ctx, bot) {
  await rows(table(ctx, 'settings').upsert({ account_id: ctx.accountId, bot_id: bot.id, config: DEFAULTS, profile: PROFILE }, { onConflict: 'account_id', ignoreDuplicates: true }));
  await rows(table(ctx, 'sources').upsert(SEEDS.map(s => ({ ...s, account_id: ctx.accountId, trust: 'official_identity_domain' })), { onConflict: 'account_id,url', ignoreDuplicates: true }));
}
export async function settings(ctx) {
  const s = await rows(scoped(ctx, 'settings').maybeSingle());
  if (!s) throw new AgentError('Marketing ainda não inicializado.', 409);
  return { ...s, config: { ...DEFAULTS, ...s.config, enabled: s.enabled, paused: s.paused } };
}
export async function remember(ctx, record, retention = 365) {
  const key = record.fingerprint || await fingerprint(record.kind, record.topic, record.data?.url, record.data?.quote || record.data?.id || '');
  await rows(table(ctx, 'memory').upsert({ account_id: ctx.accountId, ...record, fingerprint: key,
    expires_at: ['content', 'research'].includes(record.kind) ? new Date(Date.now() + retention * 86400000).toISOString() : null,
  }, { onConflict: 'account_id,fingerprint', ignoreDuplicates: true }));
  return rows(scoped(ctx, 'memory').eq('fingerprint', key).single());
}
export async function memory(ctx, { topic, kind, state, source_id } = {}) {
  let q = scoped(ctx, 'memory').order('updated_at', { ascending: false }).limit(30);
  if (topic) q = q.ilike('topic', `%${String(topic).slice(0, 150).replace(/[%_]/g, '')}%`);
  if (kind) q = q.eq('kind', kind);
  if (state) q = q.eq('state', state);
  if (source_id) { if (!UUID.test(source_id)) throw new AgentError('Fonte inválida.'); q = q.eq('source_id', source_id); }
  return rows(q);
}
export async function marketingStatus(ctx) {
  if (ctx.env.MARKETING_BOT_ENABLED !== 'true') return { unavailable: true, reason: 'Marketing desativado no servidor.' };
  const s = await rows(scoped(ctx, 'settings', 'enabled,paused,next_research_at,last_cycle_at,last_error').maybeSingle());
  if (!s) return { unavailable: true, reason: 'Marketing não inicializado.' };
  const [tasks, ideas, sources] = await Promise.all([
    rows(scoped(ctx, 'tasks', 'id,status,phase,steps,calls,reserved_usd,measured_usd,created_at,finished_at,error').order('created_at', { ascending: false }).limit(3)),
    rows(scoped(ctx, 'ideas', 'id,topic,status,created_at,delivered_at').order('created_at', { ascending: false }).limit(10)),
    rows(scoped(ctx, 'sources', 'identity,access_status,last_checked_at,limits').limit(20)),
  ]);
  return { source: 'agent_marketing_*', settings: s, tasks, ideas, sources, limits: 'Listas limitadas; acesso desconhecido não significa sucesso.' };
}
export async function invalidateEvidence(ctx, bot, record, note, key) {
  const related = await rows(scoped(ctx,'ideas').contains('proposal',{evidence_ids:[record.id]}).limit(50));
  const conv = await rows(ctx.db.from('agent_conversations').select('id').eq('account_id',ctx.accountId).eq('bot_id',bot.id).maybeSingle());
  for (const idea of related) {
    if (!idea.revisions.some(r=>r.key===key)) await rows(table(ctx,'ideas').update({status:idea.status==='published'?'published':'saved',proposal:{...idea.proposal,corrected:true,correction:note},revisions:[...idea.revisions,{key,at:new Date().toISOString(),correction:note}],updated_at:new Date().toISOString()}).eq('account_id',ctx.accountId).eq('id',idea.id));
    if (conv && idea.delivered_at) {
      const hex=(await fingerprint('correction',idea.id,key)).slice(0,32);
      const id=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20)}`;
      await rows(ctx.db.from('agent_messages').upsert({account_id:ctx.accountId,conversation_id:conv.id,client_message_id:id,role:'assistant',content:`${idea.topic}: ${note}`,sources:[{tool:'marketingCorrection',observed_at:new Date().toISOString(),data:{idea_id:idea.id,memory_id:record.id}}]},{onConflict:'account_id,conversation_id,client_message_id,role',ignoreDuplicates:true}));
    }
  }
}
export async function panel(ctx, filters = {}) {
  const [s, ideas, records, sources, tasks, feedback, notifications] = await Promise.all([
    settings(ctx), rows(scoped(ctx, 'ideas').order('created_at', { ascending: false }).limit(60)), memory(ctx, filters),
    rows(scoped(ctx, 'sources').order('last_checked_at', { ascending: false, nullsFirst: false }).limit(50)),
    rows(scoped(ctx, 'tasks').order('created_at', { ascending: false }).limit(20)),
    rows(scoped(ctx, 'feedback').order('created_at', { ascending: false }).limit(20)),
    rows(scoped(ctx, 'notifications').order('created_at', { ascending: false }).limit(20)),
  ]);
  return { settings: s, ideas, memory: records, sources, tasks, feedback, notifications,
    capabilities: { search: !!ctx.env.MARKETING_BRAVE_API_KEY, instagram_binding: ctx.env.MARKETING_INSTAGRAM_ACCOUNT_ID === ctx.accountId && !!ctx.env.MARKETING_INSTAGRAM_CONNECTION_ID, media_analysis: false, semantic_search: false, server_enabled: ctx.env.MARKETING_BOT_ENABLED === 'true' } };
}
export async function marketingAction(ctx, bot, body) {
  if (!ctx.user?.id) throw new AgentError('Esta ação requer decisão humana.', 403);
  switch (body.operation) {
    case 'panel': return panel(ctx, body.filters);
    case 'settings': {
      const config = validateSettings(body.settings);
      const current = await settings(ctx);
      const patch = { config: { ...current.config, ...config }, updated_at: new Date().toISOString() };
      for (const k of ['enabled', 'paused']) if (Object.hasOwn(config, k)) patch[k] = config[k];
      await rows(table(ctx, 'settings').update(patch).eq('account_id', ctx.accountId));
      return { saved: true };
    }
    case 'profile': {
      if (!body.profile || typeof body.profile !== 'object' || Array.isArray(body.profile) || JSON.stringify(body.profile).length > 12000) throw new AgentError('Perfil inválido.');
      for (const k of ['rejected_topics', 'desired_topics', 'inferences', 'restrictions']) if (body.profile[k] && !Array.isArray(body.profile[k])) throw new AgentError('Perfil inválido.');
      for (const k of ['declared','confirmed']) if (Object.hasOwn(body.profile,k) && (!body.profile[k] || typeof body.profile[k]!=='object' || Array.isArray(body.profile[k]))) throw new AgentError('Perfil inválido.');
      for (const k of ['rejected_topics','desired_topics','restrictions']) if (body.profile[k] && (body.profile[k].length>50 || body.profile[k].some(t=>typeof t!=='string'||t.length>300))) throw new AgentError('Temas do perfil inválidos.');
      const current = await settings(ctx);
      const allowed = ['declared','confirmed','inferences','rejected_topics','desired_topics','restrictions'];
      if (Object.keys(body.profile).some(k => !allowed.includes(k))) throw new AgentError('Campo de perfil inválido.');
      await rows(table(ctx, 'settings').update({ profile: { ...current.profile, ...body.profile, declared:{...current.profile.declared,...body.profile.declared},confirmed:{...current.profile.confirmed,...body.profile.confirmed},corrected_at: new Date().toISOString(), provenance: 'Correção explícita do responsável' }, updated_at: new Date().toISOString() }).eq('account_id', ctx.accountId));
      await remember(ctx, { kind: 'preference', topic: 'Perfil editorial', nature: 'user_opinion', fingerprint: `profile:${body.request_id || crypto.randomUUID()}`, data: { correction: body.profile, user_id: ctx.user.id, at: new Date().toISOString() } });
      return { saved: true };
    }
    case 'feedback': return feedback(ctx, body);
    case 'memory_correct':
    case 'memory_delete': {
      if (!UUID.test(body.memory_id || '')) throw new AgentError('Memória inválida.');
      const existing = await rows(scoped(ctx, 'memory').eq('id', body.memory_id).maybeSingle());
      if (!existing) throw new AgentError('Memória não encontrada.', 404);
      if (body.operation === 'memory_delete') {
        await rows(table(ctx, 'memory').delete().eq('account_id', ctx.accountId).eq('id', body.memory_id));
      } else {
        const correction = String(body.correction || '').trim();
        if (!correction || correction.length > 4000) throw new AgentError('Correção inválida.');
        await rows(table(ctx, 'memory').update({ state: 'corrected', nature: 'user_opinion', updated_at: new Date().toISOString(), data: { ...existing.data, contradicted: true, correction, correction_by: ctx.user.id, corrected_at: new Date().toISOString() } }).eq('account_id', ctx.accountId).eq('id', body.memory_id));
      }
      // Existing proposals must show a visible correction before being used.
      const related = await rows(scoped(ctx, 'ideas').contains('proposal', { evidence_ids: [body.memory_id] }).limit(50));
      for (const idea of related) {
        const note = body.operation === 'memory_delete' ? 'Uma evidência desta ideia foi removida. Revise antes de produzir.' : `Correção de evidência: ${body.correction}`;
        await rows(table(ctx, 'ideas').update({ status: idea.status === 'published' ? 'published' : 'saved', proposal: { ...idea.proposal, corrected: true, correction: note }, revisions: [...idea.revisions, { at: new Date().toISOString(), correction: note }], updated_at: new Date().toISOString() }).eq('account_id', ctx.accountId).eq('id', idea.id));
        const conv = await rows(ctx.db.from('agent_conversations').select('id').eq('account_id', ctx.accountId).eq('bot_id', bot.id).maybeSingle());
        if (conv && idea.delivered_at) await rows(ctx.db.from('agent_messages').insert({ account_id: ctx.accountId, conversation_id: conv.id, client_message_id: crypto.randomUUID(), role: 'assistant', content: `${idea.topic}: ${note}`, sources: [] }));
      }
      return { saved: true };
    }
    case 'source': {
      const url = safeSourceUrl(body.url, ctx.env);
      if (typeof body.identity !== 'string' || body.identity.trim().length < 3 || body.identity.length > 200) throw new AgentError('Identifique a fonte.');
      await rows(table(ctx, 'sources').upsert({ account_id: ctx.accountId, url, identity: body.identity.trim(), kind: body.kind === 'feed' ? 'feed' : 'article', trust: 'human_supplied', access_status: 'unknown' }, { onConflict: 'account_id,url', ignoreDuplicates: true }));
      return { saved: true };
    }
    case 'draft': return draft(ctx, body);
    default: throw new AgentError('Ação de Marketing não permitida.', 403);
  }
}
export async function feedback(ctx, body) {
  if (!UUID.test(body.idea_id || '') || !UUID.test(body.request_id || '') || typeof body.text !== 'string' || body.text.trim().length < 2 || body.text.length > 4000) throw new AgentError('Feedback inválido.');
  let decision = parseFeedback(body.text) || { explicit_reason: body.text };
  if (body.status) {
    if (!['saved','approved','discarded','published'].includes(body.status)) throw new AgentError('Estado inválido.');
    decision = { ...decision, status: body.status };
  }
  const applied = await rows(ctx.db.rpc('agent_marketing_feedback_apply', { p_account_id: ctx.accountId, p_idea_id: body.idea_id, p_request_id: body.request_id, p_user_id: ctx.user.id, p_text: body.text, p_decision: decision }));
  if (!applied) throw new AgentError('Ideia não encontrada nesta conta.', 404);
  return { saved: true, decision };
}
async function draft(ctx, body) {
  if (!UUID.test(body.idea_id || '')) throw new AgentError('Ideia inválida.');
  const idea = await rows(scoped(ctx, 'ideas').eq('id', body.idea_id).maybeSingle());
  if (!idea) throw new AgentError('Ideia não encontrada.', 404);
  if (idea.draft_id) return { draft_id: idea.draft_id };
  // Stable ID makes crashes/retries idempotent. INSERT only, never overwrite posts.
  const payload = { id: idea.id, caption: `${idea.proposal.hook}\n\n${idea.proposal.practical}`, media_urls: [], post_type: 'feed', channel: 'instagram', status: 'draft', created_by: ctx.user.id };
  const result = await ctx.db.from('marketing_posts').insert(payload);
  if (result.error && result.error.code !== '23505') throw new AgentError('Post Studio indisponível; rascunho não enviado.', 503);
  if (result.error) {
    const existing = await rows(ctx.db.from('marketing_posts').select('id').eq('id', idea.id).eq('created_by', ctx.user.id).maybeSingle());
    if (!existing) throw new AgentError('Identificador de rascunho em conflito.', 409);
  }
  await rows(table(ctx, 'ideas').update({ draft_id: idea.id }).eq('account_id', ctx.accountId).eq('id', idea.id));
  return { draft_id: idea.id };
}

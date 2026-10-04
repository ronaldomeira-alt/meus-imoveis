import { AgentError, rows, event, redactOperationalData } from '../central-bots/core.js';
import { fingerprint, assessIdea, safeSourceUrl, normalize, localDay } from './core.js';
import { readSource, searchWeb, readInventory, readInstagram } from './sources.js';
import { editorialCall } from './ai.js';
import { scoped, table, settings, remember, memory, invalidateEvidence } from './store.js';

const stamp = () => new Date().toISOString();
export async function marketingTick(ctx, bot, dependencies = {}) {
  if (ctx.env.MARKETING_BOT_ENABLED !== 'true') return { skipped: true, reason: 'Feature flag desligada.' };
  const s = await settings(ctx);
  if (!s.enabled || s.paused || !bot.active) return { skipped: true, reason: 'Marketing pausado ou desativado.' };
  // Delivery runs independently of research/analysis, including silent-hour deferral.
  if (Date.parse(s.next_delivery_at) <= Date.now()) await deliverPending(ctx, bot, s, dependencies.sendPush);
  const claimed = await rows(ctx.db.rpc('agent_marketing_claim', { p_account_id: ctx.accountId, p_bot_id: bot.id }));
  if (!claimed.length) return { skipped: true };
  const task = claimed[0], cp = structuredClone(task.checkpoint || {}), cfg = s.config;
  let phase = task.phase, done = false;
  const reserve = async cost => {
    if (!await rows(ctx.db.rpc('agent_marketing_reserve', { p_account_id: ctx.accountId, p_task_id: task.id, p_lease: task.lease_token, p_cost: cost }))) throw new AgentError('Orçamento ou limite de chamadas atingido.');
  };
  const call = async (contract, data) => {
    const result = await editorialCall(ctx, bot, contract, data, reserve, dependencies.providerFactory);
    cp.usage = [...(cp.usage || []), { provider: result.provider, model: result.model, usage: result.usage, measured_usd: result.cost_usd, estimated_upper_bound_usd: result.estimated_upper_bound_usd, at: stamp() }];
    return result.output;
  };
  try {
    switch (phase) {
      case 'context': {
        // No CRM Leads, Match or operational Captador sources are used.
        const [stock, instagram, records, recent] = await Promise.allSettled([
          (dependencies.readInventory || readInventory)(ctx), (dependencies.readInstagram || readInstagram)(ctx),
          memory(ctx), rows(scoped(ctx, 'ideas', 'id,topic,angle,status,proposal,created_at').order('created_at', { ascending: false }).limit(40)),
        ]);
        cp.stock = stock.status === 'fulfilled' ? stock.value : { unavailable: true };
        cp.instagram = instagram.status === 'fulfilled' ? instagram.value : { unavailable: true, status: 'connection_read_failed' };
        // Persist Instagram observations separately from expiring chat/checkpoints.
        for (const content of (cp.instagram.contents || [])) await remember(ctx, { kind: 'content', topic: content.caption.slice(0, 150), fingerprint: `instagram:${content.id}:${localDay()}`, data: { ...content, metrics_observed_at: cp.instagram.observed_at } }, cfg.retention_days);
        cp.instagram = { ...cp.instagram, contents: (cp.instagram.contents || []).map(c => ({ ...c, caption: c.caption.slice(0, 700) })).slice(0, 12) };
        cp.memory = records.status === 'fulfilled' ? records.value.filter(r => ['fact','preference','investigation','relation'].includes(r.kind)).slice(0, 15).map(r => ({ ...r, data: { ...r.data, text: undefined } })) : [];
        cp.previous = recent.status === 'fulfilled' ? recent.value.map(i => ({ id: i.id, topic: i.topic, angle: i.angle, status: i.status, created_at: i.created_at })) : [];
        cp.sources = await rows(scoped(ctx, 'sources').order('last_checked_at', { ascending: true, nullsFirst: true }).limit(cfg.max_sources));
        cp.limits = [!cp.stock.unavailable ? cp.stock.limits : 'Estoque indisponível.', cp.instagram.limits || `Instagram: ${cp.instagram.status}`, records.status === 'rejected' ? 'Memória indisponível; avaliação suspensa.' : ''];
        if (records.status === 'rejected' || recent.status === 'rejected') throw new AgentError('Não foi possível verificar memória e duplicatas.', 503);
        phase = 'plan'; break;
      }
      case 'plan': {
        const plan = await call('Planeje pesquisa exploratória baseada em estoque, perfil, feedback e investigações anteriores. {"hypothesis":"...", "queries":["até duas buscas opcionais"], "source_urls":["até 3 URLs das fontes disponíveis"], "why":"..."}. Priorize fontes locais, novidade e fonte original; não exija um tema fornecido pelo usuário.', { profile: s.profile, inventory: cp.stock, instagram: cp.instagram, memory: cp.memory, previous: cp.previous, sources: cp.sources, search_available: !!ctx.env.MARKETING_BRAVE_API_KEY });
        cp.plan = plan;
        const selected = [...new Set((Array.isArray(plan.source_urls) ? plan.source_urls : []).filter(u => cp.sources.some(s => s.url === u)).slice(0, 3))];
        cp.queue = (selected.length ? selected : cp.sources.slice(0, 2).map(s => s.url)).map(url => ({ url, kind: 'discovery' }));
        cp.queries = Array.isArray(plan.queries) ? plan.queries.filter(q => typeof q === 'string').slice(0, 2) : [];
        cp.read_count = 0; cp.articles = []; cp.seen = []; cp.discovery = [];
        await remember(ctx, { kind: 'research', topic: String(plan.hypothesis || 'Descoberta editorial').slice(0, 250), nature: 'hypothesis', fingerprint: `research:${task.id}`, data: { task_id: task.id, plan, at: stamp() } }, cfg.retention_days);
        phase = 'collect'; break;
      }
      case 'collect': {
        if (!cp.search_done && cp.queries.length && ctx.env.MARKETING_BRAVE_API_KEY) {
          // Search is a separate stage, never evidence. Configured per-request
          // tariff must be included in the same durable budget reservation.
          const price = Number(ctx.env.MARKETING_SEARCH_MAX_USD);
          if (!Number.isFinite(price) || price < 0) throw new AgentError('Configure teto de custo da pesquisa web.');
          await reserve(price);
          const result = await (dependencies.searchWeb || searchWeb)(cp.queries[0], ctx.env);
          cp.discovery.push(result);
          cp.queue.push(...(result.results || []).map(r => ({ url: r.url, kind: 'article' })));
          cp.search_done = true;
          break;
        }
        const next = cp.queue.shift();
        if (!next || cp.read_count >= cfg.max_sources) { phase = 'evaluate'; break; }
        if (cp.seen.includes(next.url)) break;
        cp.seen.push(next.url); cp.read_count++;
        let source = cp.sources.find(s => s.url === next.url);
        try {
          const result = await (dependencies.readSource || readSource)(next.url, ctx.env);
          if (!source) {
            await rows(table(ctx, 'sources').upsert({ account_id: ctx.accountId, url: safeSourceUrl(result.url, ctx.env), identity: new URL(result.url).hostname, trust: 'domain_observed_only', kind: result.kind, region: 'Não verificada' }, { onConflict: 'account_id,url', ignoreDuplicates: true }));
            source = await rows(scoped(ctx, 'sources').eq('url', result.url).single());
          }
          await rows(table(ctx, 'sources').update({ access_status: 'accessible', last_checked_at: stamp(), limits: result.limits }).eq('account_id', ctx.accountId).eq('id', source.id));
          if (result.kind === 'feed') {
            const fresh = result.entries.filter(e => e.published_at && Date.parse(e.published_at) >= Date.now() - 14 * 86400000).slice(0, cfg.max_sources);
            cp.discovery.push({ source_id: source.id, entries: fresh, observed_at: result.observed_at });
            // Agent decides which discovered articles merit reading next.
            phase = 'select';
          } else {
            cp.articles.push({ ...result, source_id: source.id, id: await fingerprint(result.url, result.published_at) });
            if (!result.truncated) {
              const previousFacts = await rows(scoped(ctx,'memory').eq('kind','fact').eq('state','active').contains('data',{url:result.url}).limit(30));
              for (const f of previousFacts) {
                if (f.data.quote && !result.text.includes(f.data.quote)) {
                  const note='A citação anterior não aparece na nova leitura da fonte. Isso não prova que a informação era falsa; revise a ideia antes de produzir.';
                  await rows(table(ctx,'memory').update({state:'needs_review',updated_at:stamp(),data:{...f.data,verification:'unlocated_on_recheck',rechecked_at:stamp(),review_reason:note}}).eq('account_id',ctx.accountId).eq('id',f.id));
                  await invalidateEvidence(ctx,bot,f,note,await fingerprint(result.url,result.text));
                }
              }
            }
            await remember(ctx, { kind: 'content', topic: result.title, source_id: source.id, fingerprint: `article:${await fingerprint(result.url, result.published_at)}`, data: { url: result.url, title: result.title, published_at: result.published_at, observed_at: result.observed_at, observation: result.observation, excerpt: result.text.slice(0, 1200), limits: result.limits } }, cfg.retention_days);
          }
        } catch (e) {
          cp.limits.push(`Fonte ${new URL(next.url).hostname}: ${e instanceof AgentError ? e.message : 'Consulta indisponível.'}`);
          if (source) await rows(table(ctx, 'sources').update({ access_status: 'unavailable', last_checked_at: stamp(), limits: cp.limits.at(-1) }).eq('account_id', ctx.accountId).eq('id', source.id));
        }
        if (phase !== 'select' && (!cp.queue.length || cp.read_count >= cfg.max_sources)) phase = 'evaluate';
        break;
      }
      case 'select': {
        const clues = cp.discovery.flatMap(d => d.entries || d.results || []).slice(0, 20);
        // After one selection call, further feeds reuse the chosen set rather
        // than consuming an unbounded number of model calls.
        if (!cp.selection_done && clues.length) {
          const selected = await call('Escolha até 3 artigos promissores entre as URLs nas pistas. {"urls":["..."],"reason":"..."}. Pode escolher zero; títulos não são evidências. Considere hipótese, contexto e novidades reais.', { hypothesis: cp.plan, profile: s.profile, stock: cp.stock.properties?.slice(0, 15), previous: cp.previous, clues });
          cp.queue.unshift(...(Array.isArray(selected.urls) ? selected.urls : []).filter(u => clues.some(c => c.url === u)).slice(0, 3).map(url => ({ url, kind: 'article' })));
          cp.selection_done = true; cp.selection_reason = String(selected.reason || '').slice(0, 1000);
        }
        phase = 'collect'; break;
      }
      case 'evaluate': {
        if (!cp.articles.length || Date.parse(s.next_analysis_at) > Date.now()) {
          cp.judgment = { reason: !cp.articles.length ? 'Nenhum artigo legível com evidência suficiente; pistas isoladas não sustentam proposta.' : 'Coleta preservada; análise aguarda sua frequência configurada.', ideas: [], facts: [] };
          phase = 'persist'; break;
        }
        // Selective recovery includes facts from previous cycles, not entire chat.
        const facts = await memory(ctx, { kind: 'fact', state: 'active' });
        const output = await call(`Avalie evidências e perfil. Retorne {"reason":"justificativa de silêncio ou escolhas", "facts":[{"article_id":"ID observado","quote":"trecho literal exato (máximo 600 caracteres)","claim":"afirmação sustentada","topic":"...","location":"..."}],"ideas":[{"topic":"...","angle":"...","why_now":"...","fit":"...","format":"...","hook":"...","practical":"o que gravar/mostrar","effort":"...","reasoning":"juízo editorial","message":"mensagem curta natural para Ronaldo","fact_indexes":[0],"existing_fact_ids":[],"evidence_sufficient":true,"own_angle":true,"fit_confirmed":true,"sensitive":false,"unsupported_financial_claim":false,"engagement_claim":false,"revisit_reason":"se antiga","limits":"..."}],"investigations":[{"hypothesis":"...","next_steps":"...","stop_condition":"..."}],"closed_investigations":[{"id":"ID existente","reason":"motivo de encerramento"}]}. Até 3 fatos, 1 ideia e ${cfg.max_investigations} investigações. Reveja investigações anteriores e encerre as insustentáveis com razão explícita. Não correlacione por obrigação. Consulte data da fonte. Se citações ou conteúdo não sustentarem pauta, ideas=[]. Nunca copie os placeholders do contrato.`, { profile: s.profile, inventory: cp.stock.properties?.slice(0, 20), instagram: cp.instagram, articles: cp.articles.map(a => ({ ...a, text: a.text.slice(0, 5000) })).slice(0, 3), earlier_facts: facts.slice(0, 10), investigations: cp.memory.filter(m=>m.kind==='investigation'), previous: cp.previous, limits: cp.limits });
        cp.judgment = output; cp.earlier_facts = facts.slice(0, 10);
        cp.analyzed = true;
        // Save model result in the task before writing facts/ideas on next tick.
        phase = 'review'; break;
      }
      case 'review': {
        const output = cp.judgment || {};
        const candidates = (Array.isArray(output.ideas) ? output.ideas : []).slice(0, 1);
        if (candidates.length) {
          const verdict = await call('Você é o revisor crítico de uma proposta ainda NÃO entregue. Verifique todas as afirmações de why_now, gancho e mensagem contra os artigos. Rejeite conexões temporais inventadas, coincidências apresentadas como razão, temas apenas ligados ao público genérico, saúde sem ligação concreta com moradia/região, promessas financeiras e ângulos copiados. Notícias de serviço podem ser úteis, mas a relevância para o trabalho de Ronaldo deve ser concreta. Não confie nas autoavaliações booleanas da proposta. Zero aprovações é válido. Não reescreva nem invente evidência. JSON: {"approved_indexes":[],"rejected":[{"index":0,"reason":"explique o problema real"}],"summary":"seu julgamento editorial próprio"}. Aprove um índice somente se todos os critérios forem sustentados. Não copie placeholders do contrato.', { profile: s.profile, candidates, facts: output.facts, articles: cp.articles.map(a => ({ id: a.id, title: a.title, text: a.text.slice(0, 5000), published_at: a.published_at, url: a.url })), prior_facts: cp.earlier_facts, limits: cp.limits });
          const approved = Array.isArray(verdict.approved_indexes) ? verdict.approved_indexes.filter(i => Number.isInteger(i) && i >= 0 && i < candidates.length) : [];
          cp.review = verdict;
          cp.judgment = { ...output, ideas: candidates.filter((_, i) => approved.includes(i)), reason: String(verdict.summary || 'Revisão não forneceu justificativa suficiente; nenhuma entrega.').slice(0, 1800) };
          if (!verdict.summary || /justificativa de sil[eê]ncio ou escolhas|seu julgamento editorial pr[oó]prio/i.test(verdict.summary)) cp.judgment.ideas = [];
        }
        phase = 'persist'; break;
      }
      case 'persist': {
        const output = cp.judgment || { facts: [], ideas: [], reason: 'Sem julgamento editorial.' };
        cp.facts = [];
        for (const item of (Array.isArray(output.facts) ? output.facts : []).slice(0, 3)) {
          const article = cp.articles.find(a => a.id === item.article_id);
          if (!article || typeof item.quote !== 'string' || item.quote.length < 30 || item.quote.length > 600 || !article.text.includes(item.quote) || !article.published_at) { cp.facts.push(null); continue; }
          const fact = await remember(ctx, { kind: 'fact', source_id: article.source_id, topic: String(item.topic || article.title).slice(0, 250), fingerprint: `fact:${await fingerprint(article.url, item.quote)}`, data: { claim: String(item.claim || '').slice(0, 800), quote: item.quote, url: article.url, published_at: article.published_at, collected_at: article.observed_at, location: String(item.location || 'Não verificada').slice(0, 120), verification: 'observed_quote', support: 'Citação conferida no texto acessível; interpretação editorial revisável.', contradictions: [] } });
          cp.facts.push(fact);
        }
        cp.idea_ids = [];
        const previous = await rows(scoped(ctx, 'ideas', 'id,topic,angle,created_at').order('created_at', { ascending: false }).limit(150));
        for (const raw of (Array.isArray(output.ideas) ? output.ideas : []).slice(0, 1)) {
          try {
            const allFacts = [...cp.facts.filter(Boolean), ...(cp.earlier_facts || [])];
            const ids = [...(Array.isArray(raw.fact_indexes) ? raw.fact_indexes : []).map(i => cp.facts[i]?.id).filter(Boolean), ...(Array.isArray(raw.existing_fact_ids) ? raw.existing_fact_ids : [])];
            const proposal = assessIdea({ ...raw, evidence_ids: ids }, allFacts, previous, { ...cfg, profile: s.profile });
            // Property references are optional and validated against actual stock.
            const propertyId = raw.property_id && cp.stock.properties?.some(p => p.id === raw.property_id) ? raw.property_id : null;
            const key = await fingerprint(proposal.topic, proposal.angle, task.id);
            const ideaId = await rows(ctx.db.rpc('agent_marketing_propose', { p_account_id: ctx.accountId, p_task_id: task.id, p_lease: task.lease_token, p_topic: proposal.topic, p_angle: proposal.angle, p_topic_key: normalize(proposal.topic), p_angle_key: normalize(proposal.angle), p_fingerprint: key, p_proposal: { ...proposal, task_id: task.id }, p_property_id: propertyId }));
            if (!ideaId) throw new AgentError('Tema ou ângulo repetido, Marketing pausado ou reserva expirada.');
            cp.idea_ids.push(ideaId);
            for (const f of proposal.evidence) await remember(ctx, { kind: 'relation', topic: proposal.topic, fingerprint: `relation:${ideaId}:${f.id}`, data: { from: f.id, to: ideaId, kind: 'supports', justification: proposal.reasoning } });
          } catch (error) { cp.limits.push(error instanceof AgentError ? error.message : 'Proposta não persistida.'); }
        }
        const active = await memory(ctx, { kind: 'investigation', state: 'active' });
        for (const closed of (Array.isArray(output.closed_investigations) ? output.closed_investigations : []).slice(0,cfg.max_investigations)) {
          const prior = active.find(i=>i.id===closed.id);
          if (prior && typeof closed.reason==='string' && closed.reason.trim().length>5) await rows(table(ctx,'memory').update({state:'closed',updated_at:stamp(),data:{...prior.data,closed_at:stamp(),closure_reason:closed.reason.slice(0,1000)}}).eq('account_id',ctx.accountId).eq('id',prior.id));
        }
        for (const investigation of (Array.isArray(output.investigations) ? output.investigations : []).slice(0, Math.max(0, cfg.max_investigations - active.length))) {
          if (typeof investigation.hypothesis !== 'string' || typeof investigation.next_steps !== 'string' || typeof investigation.stop_condition !== 'string') continue;
          await remember(ctx, { kind: 'investigation', topic: investigation.hypothesis.slice(0, 250), nature: 'hypothesis', fingerprint: `investigation:${await fingerprint(investigation.hypothesis)}`, data: { ...investigation, task_id: task.id, steps: task.steps, budget_remaining_usd: Math.max(0, cfg.cycle_budget_usd - task.reserved_usd), consulted: cp.seen, result: output.reason, next_review_at: stamp() } });
        }
        if (cp.analyzed) await rows(table(ctx, 'settings').update({ next_analysis_at: new Date(Date.now() + cfg.analysis_minutes * 60000).toISOString() }).eq('account_id', ctx.accountId));
        phase = 'deliver'; break;
      }
      case 'deliver':
        if (Date.parse(s.next_delivery_at) <= Date.now()) await deliverPending(ctx, bot, s, dependencies.sendPush);
        done = true; phase = 'done';
        await event(ctx, bot.id, null, 'marketing_cycle_completed', { task_id: task.id, ideas: cp.idea_ids || [], reason: cp.judgment?.reason, limits: cp.limits });
        cp.articles = (cp.articles || []).map(({ text, ...article }) => ({ ...article, excerpt: text?.slice(0, 600) }));
        break;
      default: throw new AgentError('Etapa de pesquisa inválida.');
    }
    const saved = await checkpoint(ctx, task, phase, cp, done);
    if (!saved) throw new AgentError('Reserva de execução expirou; retomada será feita pelo servidor.', 409);
    return { task_id: task.id, phase, completed: done, ideas: cp.idea_ids || [], reason: done ? cp.judgment?.reason : undefined };
  } catch (error) {
    if (error.billing) cp.usage = [...(cp.usage || []), { ...error.billing, measured_usd: error.billing.cost_usd, at: stamp(), failed: true }];
    const message = error instanceof AgentError ? error.message : 'Pesquisa interrompida; fontes ou integração indisponíveis.';
    await checkpoint(ctx, task, task.phase, cp, false, message);
    await event(ctx, bot.id, null, 'marketing_cycle_failed', { task_id: task.id, phase: task.phase, error: message });
    return { task_id: task.id, failed: true, error: message };
  }
}
async function checkpoint(ctx, task, phase, cp, done = false, error = null) {
  // Credentials never enter checkpoints or AI context.
  return rows(ctx.db.rpc('agent_marketing_checkpoint', { p_account_id: ctx.accountId, p_task_id: task.id, p_lease: task.lease_token, p_phase: phase, p_checkpoint: redactOperationalData(cp, ctx.env), p_done: done, p_error: error }));
}
export async function deliverPending(ctx, bot, s, sendPush) {
  const pending = await rows(scoped(ctx, 'ideas').eq('status', 'proposed').order('created_at').limit(20));
  for (const idea of pending) {
    if (!idea.delivered_at) await rows(ctx.db.rpc('agent_marketing_deliver', { p_account_id: ctx.accountId, p_bot_id: bot.id, p_idea_id: idea.id }));
    if (sendPush && bot.notifications) {
      const claims = await rows(ctx.db.rpc('agent_marketing_claim_push', { p_account_id: ctx.accountId, p_idea_id: idea.id }));
      if (claims.length) {
        let result, status;
        try {
          result = await sendPush(ctx.accountId, { title: 'Bot de Marketing', body: 'Uma ideia editorial está disponível na conversa.', url: '/central-de-bots?bot=marketing', tag: `marketing-${idea.id}` }, { db: ctx.db });
          status = result.sentCount > 0 ? 'sent' : 'failed';
          result = { sent: result.sentCount ?? null, failed: result.failedCount ?? null, unavailable: !!result.error };
        } catch { status = 'unknown'; result = { reason: 'Resultado de envio desconhecido; sem reenvio automático.' }; }
        await rows(table(ctx, 'notifications').update({ status, result }).eq('account_id', ctx.accountId).eq('id', claims[0].id));
      }
    }
  }
  await rows(table(ctx, 'settings').update({ next_delivery_at: new Date(Date.now() + s.config.delivery_minutes * 60000).toISOString() }).eq('account_id', ctx.accountId));
}

import { rows, event, AgentError } from './core.js';
import { updateAgentOperationalState, recordOperationalMemory, getAgentOperationalState } from './state-memory.js';
import { getCaptureSummary, getRecentRounds, getRecentResponses } from './captador-adapter.js';
import { humanIncident } from './communication.js';

/**
 * Converte data para chave de slot diário no fuso horário de Brasília
 */
export function getDailyDigestSlotKey(date = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return `${day}-daily-digest`;
}

/**
 * Reivindica atomicamente a execução de um job autônomo com idempotência e lease de concorrência.
 */
export async function claimAutonomousJob(ctx, { botId, jobType, slotKey, leaseSeconds = 300, maxAttempts = 3 }) {
  // Tenta via RPC atômico
  try {
    const res = await ctx.db.rpc('agent_claim_autonomous_job', {
      p_account_id: ctx.accountId,
      p_bot_id: botId,
      p_job_type: jobType,
      p_slot_key: slotKey,
      p_lease_seconds: leaseSeconds,
    });
    const jobList = res.data || (Array.isArray(res) ? res : []);
    if (jobList.length > 0) {
      const job = jobList[0];
      const claimed = job.claimed === true;
      const alreadyCompleted = job.status === 'completed';
      const concurrentLocked = !claimed && job.status === 'running';
      const retryExhausted = !claimed && job.status === 'failed';
      const shouldExecute = claimed;

      return {
        job,
        alreadyCompleted,
        concurrentLocked,
        retryExhausted,
        shouldExecute,
      };
    }
  } catch {
    // Fallback gracioso para query direta se RPC não estiver na fixture de teste
  }

  // Fallback via tabela direta
  const existing = await rows(
    ctx.db
      .from('agent_autonomous_jobs')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('bot_id', botId)
      .eq('job_type', jobType)
      .eq('slot_key', slotKey)
      .maybeSingle(),
  );

  if (existing) {
    if (existing.status === 'completed') {
      return { job: existing, alreadyCompleted: true, concurrentLocked: false, retryExhausted: false, shouldExecute: false };
    }
    if (existing.status === 'running' && existing.lease_until && new Date(existing.lease_until) > new Date()) {
      return { job: existing, alreadyCompleted: false, concurrentLocked: true, retryExhausted: false, shouldExecute: false };
    }
    if (existing.status === 'failed' && existing.attempts >= (existing.max_attempts || maxAttempts)) {
      return { job: existing, alreadyCompleted: false, concurrentLocked: false, retryExhausted: true, shouldExecute: false };
    }

    const leaseUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString();
    const updated = await rows(
      ctx.db
        .from('agent_autonomous_jobs')
        .update({
          status: 'running',
          attempts: (existing.attempts || 0) + 1,
          lease_until: leaseUntil,
          started_at: existing.started_at || new Date().toISOString(),
        })
        .eq('account_id', ctx.accountId)
        .eq('id', existing.id)
        .select()
        .single(),
    );
    return { job: updated, alreadyCompleted: false, concurrentLocked: false, retryExhausted: false, shouldExecute: true };
  }

  const leaseUntil = new Date(Date.now() + leaseSeconds * 1000).toISOString();
  const inserted = await ctx.db
    .from('agent_autonomous_jobs')
    .insert({
      account_id: ctx.accountId,
      bot_id: botId,
      job_type: jobType,
      slot_key: slotKey,
      status: 'running',
      attempts: 1,
      max_attempts: maxAttempts,
      lease_until: leaseUntil,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (inserted.error) {
    if (inserted.error.code === '23505') {
      return { job: null, alreadyCompleted: false, concurrentLocked: true, retryExhausted: false, shouldExecute: false };
    }
    throw new AgentError('Falha ao reivindicar job autônomo.', 503);
  }

  return { job: inserted.data, alreadyCompleted: false, concurrentLocked: false, retryExhausted: false, shouldExecute: true };
}

/**
 * Conclui um job autônomo com sucesso
 */
export async function completeAutonomousJob(ctx, jobId, { summary = '', data = {}, notified = false } = {}) {
  return rows(
    ctx.db
      .from('agent_autonomous_jobs')
      .update({
        status: 'completed',
        finished_at: new Date().toISOString(),
        lease_until: null,
        result_summary: summary,
        data,
        notified,
      })
      .eq('account_id', ctx.accountId)
      .eq('id', jobId)
      .select()
      .maybeSingle(),
  );
}

/**
 * Registra falha de um job autônomo (permitindo ou não retry)
 */
export async function failAutonomousJob(ctx, jobId, error, { retryable = true } = {}) {
  const errMsg = error?.message || String(error);
  return rows(
    ctx.db
      .from('agent_autonomous_jobs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        lease_until: null,
        error: errMsg,
      })
      .eq('account_id', ctx.accountId)
      .eq('id', jobId)
      .select()
      .maybeSingle(),
  );
}

/**
 * Despacha notificação inteligente respeitando deduplicação, cooldown e anti-spam
 */
export async function dispatchAutonomousNotification(
  ctx,
  bot,
  { kind, dedupKey, title, body, severity = 'medium', cooldownHours = 6, data = {} },
) {
  // 1. Regra de Severidade Mínima: 'low' nunca gera push imediato
  if (severity === 'low') {
    return { notified: false, reason: 'skipped_by_low_severity' };
  }

  // 2. Consulta log de notificações para anti-spam e cooldown
  const existing = await rows(
    ctx.db
      .from('agent_notifications_log')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('bot_id', bot.id)
      .eq('dedup_key', dedupKey)
      .maybeSingle(),
  );

  if (existing && existing.cooldown_until && new Date(existing.cooldown_until) > new Date()) {
    return { notified: false, reason: 'cooldown_active', cooldown_until: existing.cooldown_until };
  }

  // 3. Registra ou atualiza no log com novo cooldown
  const cooldownUntil = new Date(Date.now() + cooldownHours * 3600000).toISOString();
  await ctx.db
    .from('agent_notifications_log')
    .upsert(
      {
        account_id: ctx.accountId,
        bot_id: bot.id,
        kind,
        dedup_key: dedupKey,
        title,
        body,
        severity,
        sent_at: new Date().toISOString(),
        cooldown_until: cooldownUntil,
        payload: data,
      },
      { onConflict: 'account_id,bot_id,dedup_key' },
    );

  // 4. Executa envio real de push se o canal estiver ativo
  if (ctx.notify) {
    const eventType = kind === 'daily_digest' || kind === 'opportunity' ? 'result' : 'incident';
    await ctx.notify(bot, eventType, {
      title,
      body,
      url: `/central-de-bots?bot=${bot.slug}`,
      tag: `agent-${kind}-${dedupKey}`,
    });
  }

  await event(ctx, bot.id, null, 'notification_dispatched', {
    kind,
    dedup_key: dedupKey,
    severity,
    cooldown_until: cooldownUntil,
  });

  return { notified: true, cooldown_until: cooldownUntil };
}

/**
 * BOT GESTOR: Consolidação autônoma do resumo diário às 19:30 (ou slot diário)
 * Consulta estritamente dados reais dos 3 bots sem inventar informações.
 */
export async function executeDailyDigest(ctx, gestorBot, { slotKey, notify = true, force = false } = {}) {
  const currentSlot = slotKey || getDailyDigestSlotKey(new Date());

  const claim = await claimAutonomousJob(ctx, {
    botId: gestorBot.id,
    jobType: 'daily_digest',
    slotKey: currentSlot,
    leaseSeconds: 300,
    maxAttempts: 3,
  });

  if (!force && !claim.shouldExecute) {
    return {
      skipped: true,
      reason: claim.alreadyCompleted ? 'already_completed' : claim.concurrentLocked ? 'concurrent_lock' : 'retry_exhausted',
    };
  }

  const runInsert = await ctx.db
    .from('agent_runs')
    .insert({
      account_id: ctx.accountId,
      bot_id: gestorBot.id,
      trigger_type: 'schedule',
    })
    .select()
    .single();

  const run = runInsert.data || { id: null };

  try {
    // 1. Consulta dados reais do BOT CAPTADOR (estritamente read-only)
    const [captadorRounds, captadorSummary, captadorResponses] = await Promise.allSettled([
      getRecentRounds(ctx, { period: 'today', limit: 10 }),
      getCaptureSummary(ctx, { period: 'today' }),
      getRecentResponses(ctx, { period: 'today', limit: 10 }),
    ]);

    let captadorText = '';
    if (captadorSummary.status === 'fulfilled') {
      const s = captadorSummary.value;
      const roundsCount = s.rodadas_hoje_count || 0;
      const contactedCount = s.contacted || 0;
      const respondedCount = s.responded || 0;
      if (roundsCount === 0) {
        captadorText = 'O Bot Captador não registrou rodadas hoje.';
      } else {
        captadorText = `O Bot Captador realizou ${roundsCount} rodada${roundsCount > 1 ? 's' : ''} de captação hoje, abordou ${contactedCount} proprietário${contactedCount !== 1 ? 's' : ''} e obteve ${respondedCount} resposta${respondedCount !== 1 ? 's' : ''}.`;
      }
    } else {
      captadorText = 'Não foi possível confirmar os dados de captação do Bot Captador hoje.';
    }

    // 2. Consulta dados reais do BOT DE MARKETING
    const todaySaoPaulo = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());

    const [marketingIdeas, marketingMemories] = await Promise.allSettled([
      rows(
        ctx.db
          .from('agent_marketing_ideas')
          .select('id,topic,angle,status,created_at')
          .eq('account_id', ctx.accountId)
          .gte('created_at', `${todaySaoPaulo}T00:00:00-03:00`)
          .order('created_at', { ascending: false })
          .limit(10),
      ),
      rows(
        ctx.db
          .from('agent_operational_memories')
          .select('*')
          .eq('account_id', ctx.accountId)
          .eq('kind', 'research')
          .gte('created_at', `${todaySaoPaulo}T00:00:00-03:00`)
          .order('created_at', { ascending: false })
          .limit(5),
      ),
    ]);

    let marketingText = '';
    const ideasList = marketingIdeas.status === 'fulfilled' ? marketingIdeas.value : [];
    const researchList = marketingMemories.status === 'fulfilled' ? marketingMemories.value : [];

    if (ideasList.length > 0) {
      marketingText = `O Bot de Marketing encontrou tendências relevantes e preparou ${ideasList.length} proposta${ideasList.length > 1 ? 's' : ''} de pauta editorial para análise.`;
    } else if (researchList.length > 0) {
      marketingText = 'O Bot de Marketing realizou pesquisa de mercado hoje e registrou novas observações.';
    } else {
      marketingText = 'O Bot de Marketing não produziu novas propostas de pauta hoje.';
    }

    // 3. Consulta dados reais do BOT SENTINELA
    const [openIncidents, resolvedToday] = await Promise.allSettled([
      rows(
        ctx.db
          .from('agent_incidents')
          .select('id,component,observed,impact,status')
          .eq('account_id', ctx.accountId)
          .eq('status', 'open')
          .limit(10),
      ),
      rows(
        ctx.db
          .from('agent_incidents')
          .select('id,component,observed,resolved_at')
          .eq('account_id', ctx.accountId)
          .eq('status', 'resolved')
          .gte('resolved_at', `${todaySaoPaulo}T00:00:00-03:00`)
          .limit(10),
      ),
    ]);

    let sentinelaText = '';
    const openList = openIncidents.status === 'fulfilled' ? openIncidents.value : [];
    const resolvedList = resolvedToday.status === 'fulfilled' ? resolvedToday.value : [];

    if (openList.length > 0) {
      const topIssue = openList[0];
      sentinelaText = `O Bot Sentinela está acompanhando ${openList.length} ocorrência${openList.length > 1 ? 's' : ''} aberta${openList.length > 1 ? 's' : ''}, incluindo atenção em ${topIssue.component}.`;
    } else if (resolvedList.length > 0) {
      sentinelaText = `O Bot Sentinela não possui ocorrências abertas no momento. ${resolvedList.length} ocorrência${resolvedList.length > 1 ? 's' : ''} foi normalizada hoje.`;
    } else {
      sentinelaText = 'O Bot Sentinela não identificou nenhuma ocorrência aberta; todos os componentes monitorados estão normais.';
    }

    // 4. Monta o texto consolidado executivo do Bot Gestor (sempre em primeira pessoa)
    const digestContent = `Ronaldo, fechando o dia na Central de Bots:

Hoje acompanhei as operações da equipe e compilei o resumo do que foi realizado:

${captadorText}

${marketingText}

${sentinelaText}

Continuo acompanhando tudo por aqui. Se quiser detalhar algum ponto, é só me chamar.`;

    // 5. Grava mensagem na conversa do Bot Gestor para que Ronaldo a veja ao abrir a Central
    const conv = await rows(
      ctx.db
        .from('agent_conversations')
        .select('id')
        .eq('account_id', ctx.accountId)
        .eq('bot_id', gestorBot.id)
        .maybeSingle(),
    );

    const convId = conv?.id;
    if (convId) {
      await ctx.db.from('agent_messages').insert({
        account_id: ctx.accountId,
        conversation_id: convId,
        client_message_id: crypto.randomUUID(),
        role: 'assistant',
        content: digestContent,
        sources: [
          {
            tool: 'getBotsStatus',
            observed_at: new Date().toISOString(),
            data: {
              captador: captadorSummary.status === 'fulfilled' ? captadorSummary.value : null,
              marketing: { ideas: ideasList.length, research: researchList.length },
              sentinela: { open: openList.length, resolved: resolvedList.length },
            },
          },
        ],
      });
    }

    // 6. Atualiza o estado operacional da Camada 4
    await updateAgentOperationalState(ctx, gestorBot.id, {
      last_operational_at: new Date().toISOString(),
      last_operational_type: 'daily_digest',
      last_operational_summary: `Resumo diário consolidado gerado: ${openList.length} ocorrências abertas, ${ideasList.length} pautas de marketing.`,
      pending_items: openList.map((i) => ({ id: i.id, component: i.component, observed: i.observed })),
    });

    // 7. Grava memória operacional
    await recordOperationalMemory(ctx, gestorBot.id, {
      kind: 'observation',
      topic: 'Fechamento Diário',
      summary: `Resumo do dia: Captador (${captadorSummary.value?.rodadas_hoje_count || 0} rodadas), Marketing (${ideasList.length} pautas), Sentinela (${openList.length} abertos).`,
      data: { slot_key: currentSlot, open_incidents: openList.length },
      retentionDays: 14,
    });

    // 8. Dispara notificação push respeitando anti-spam
    let notificationResult = { notified: false };
    if (notify) {
      notificationResult = await dispatchAutonomousNotification(ctx, gestorBot, {
        kind: 'daily_digest',
        dedupKey: `digest:${currentSlot}`,
        title: 'Bot Gestor: Resumo do Dia',
        body: `Fechamento do dia: ${captadorSummary.value?.rodadas_hoje_count || 0} rodadas do Captador, ${ideasList.length} pautas do Marketing e ${openList.length} alertas do Sentinela.`,
        severity: 'medium',
        cooldownHours: 20, // 1 por dia
        data: { slot_key: currentSlot },
      });
    }

    // 9. Conclui o job
    if (claim.job?.id) {
      await completeAutonomousJob(ctx, claim.job.id, {
        summary: 'Resumo diário concluído com sucesso.',
        data: { slot_key: currentSlot },
        notified: notificationResult.notified,
      });
    }

    if (run.id) {
      await rows(
        ctx.db
          .from('agent_runs')
          .update({
            status: 'completed',
            finished_at: new Date().toISOString(),
            result: { digest_slot: currentSlot, notified: notificationResult.notified },
          })
          .eq('account_id', ctx.accountId)
          .eq('id', run.id),
      );
    }

    await event(ctx, gestorBot.id, run.id, 'daily_digest_generated', {
      slot_key: currentSlot,
      notified: notificationResult.notified,
    });

    return {
      success: true,
      content: digestContent,
      notified: notificationResult.notified,
      slot_key: currentSlot,
    };
  } catch (err) {
    if (claim.job?.id) {
      await failAutonomousJob(ctx, claim.job.id, err);
    }
    if (run.id) {
      await rows(
        ctx.db
          .from('agent_runs')
          .update({
            status: 'failed',
            finished_at: new Date().toISOString(),
            error: err.message,
          })
          .eq('account_id', ctx.accountId)
          .eq('id', run.id),
      );
    }
    throw err;
  }
}

/**
 * BOT SENTINELA: Análise de mudança de estado, resolução e notificação anti-spam
 */
export async function handleSentinelStateChange(ctx, sentinelaBot, { resolvedIncidents = [], openedIncidents = [] }) {
  // 1. Resolução de Incidentes Anteriores
  for (const incident of resolvedIncidents) {
    // Se o incidente foi notificado anteriormente como crítico/alto, notifica resolução
    await dispatchAutonomousNotification(ctx, sentinelaBot, {
      kind: 'resolved',
      dedupKey: `incident:${incident.fingerprint}:resolved`,
      title: 'Bot Sentinela: ocorrência normalizada',
      body: `Ronaldo, aquele problema que eu estava acompanhando no componente ${incident.component} normalizou.`,
      severity: 'medium',
      cooldownHours: 24,
      data: { incident_id: incident.id, component: incident.component },
    });

    await recordOperationalMemory(ctx, sentinelaBot.id, {
      kind: 'observation',
      topic: `Normalização: ${incident.component}`,
      summary: `A ocorrência no componente ${incident.component} normalizou após verificação.`,
      data: { incident_id: incident.id },
      retentionDays: 7,
    });
  }

  // 2. Novos Incidentes Abertos
  for (const incident of openedIncidents) {
    const isCriticalOrHigh = incident.impact === 'high' || incident.status === 'fail';
    const severity = isCriticalOrHigh ? 'high' : 'low';

    // Despacha com deduplicação: se a mesma ocorrência já foi notificada nas últimas 6 horas, não repete push
    await dispatchAutonomousNotification(ctx, sentinelaBot, {
      kind: isCriticalOrHigh ? 'critical_alert' : 'important_alert',
      dedupKey: `incident:${incident.fingerprint}:open`,
      title: 'Bot Sentinela: atenção necessária',
      body: humanIncident(incident),
      severity,
      cooldownHours: 6,
      data: { incident_id: incident.id, component: incident.component },
    });
  }

  // 3. Atualiza foco operacional do Sentinela
  const openCount = (await rows(
    ctx.db
      .from('agent_incidents')
      .select('component')
      .eq('account_id', ctx.accountId)
      .eq('status', 'open')
      .limit(5),
  )) || [];

  const topComponent = openCount[0]?.component || openedIncidents[0]?.component;
  const allWatched = [...new Set([...openCount.map((i) => i.component), ...openedIncidents.map((i) => i.component)])];

  if (topComponent) {
    await updateAgentOperationalState(ctx, sentinelaBot.id, {
      current_focus: `Acompanhando ocorrência em ${topComponent}`,
      watched_items: allWatched,
      last_operational_summary: `Monitoramento ativo: ${allWatched.length} ocorrência(s) em observação.`,
    });
  } else {
    await updateAgentOperationalState(ctx, sentinelaBot.id, {
      current_focus: null,
      watched_items: [],
      last_operational_summary: 'Todos os componentes monitorados estão normais.',
    });
  }
}

/**
 * Converte data para chave de slot de pesquisa editorial do Marketing (19:00 Brasília)
 */
export function getMarketingEditorialSlotKey(date = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return `${day}-marketing-editorial`;
}

/**
 * BOT DE MARKETING: Sincronização após execução autônoma de pesquisa
 */
export async function syncMarketingAutonomousResearch(ctx, marketingBot, { topic, summary, ideaProposal = null, alternatives = [] }) {
  await updateAgentOperationalState(ctx, marketingBot.id, {
    last_operational_at: new Date().toISOString(),
    last_operational_type: 'market_research',
    last_operational_summary: summary || 'Pesquisei tendências imobiliárias recentes e analisei fontes locais.',
    current_focus: topic ? `Analisando oportunidades de pauta sobre ${topic}` : 'Acompanhando tendências de mercado',
    metadata: {
      has_active_editorial: !!ideaProposal,
      primary_idea: ideaProposal ? (ideaProposal.topic || topic) : null,
      alternative_ideas: alternatives,
      last_editorial_date: new Date().toISOString(),
    },
  });

  await recordOperationalMemory(ctx, marketingBot.id, {
    kind: 'research',
    topic: topic || 'Pesquisa de Mercado',
    summary: summary || 'Pesquisa autônoma de tendências e notícias imobiliárias.',
    data: {
      autonomous: true,
      at: new Date().toISOString(),
      primary_idea: ideaProposal,
      alternatives,
    },
    retentionDays: 7, // Respeita Freshness Policy
  });

  if (ideaProposal && ideaProposal.isHighRelevance) {
    await dispatchAutonomousNotification(ctx, marketingBot, {
      kind: 'opportunity',
      dedupKey: `opportunity:${ideaProposal.id || topic}`,
      title: 'Bot de Marketing: oportunidade identificada',
      body: `Ronaldo, identifiquei uma pauta sobre ${topic} que combina bastante com o seu estoque e posicionamento.`,
      severity: 'medium',
      cooldownHours: 20,
      data: { idea_id: ideaProposal.id, topic },
    });
  }
}

/**
 * BOT DE MARKETING: Execução autônoma única diária às 19:00 (ou slot diário)
 * Política de Uma Ideia: 1 proposta principal bem desenvolvida e alternativas guardadas no estado.
 * Silêncio Inteligente: sem pauta qualificada -> ZERO push!
 */
export async function executeMarketingEditorial(ctx, marketingBot, { slotKey, notify = true, force = false, ideas = [] } = {}) {
  const currentSlot = slotKey || getMarketingEditorialSlotKey(new Date());

  const claim = await claimAutonomousJob(ctx, {
    botId: marketingBot.id,
    jobType: 'marketing_daily_editorial',
    slotKey: currentSlot,
    leaseSeconds: 300,
    maxAttempts: 3,
  });

  if (!force && !claim.shouldExecute) {
    return {
      skipped: true,
      reason: claim.alreadyCompleted ? 'already_completed' : claim.concurrentLocked ? 'concurrent_lock' : 'retry_exhausted',
    };
  }

  const runInsert = await ctx.db
    .from('agent_runs')
    .insert({
      account_id: ctx.accountId,
      bot_id: marketingBot.id,
      trigger_type: 'schedule',
    })
    .select()
    .single();

  const run = runInsert.data || { id: null };

  try {
    const candidateList = Array.isArray(ideas) ? ideas : [];
    const primaryCandidate = candidateList.find((i) => i.isHighRelevance !== false) || null;
    const alternatives = candidateList.filter((i) => i !== primaryCandidate);

    let notificationResult = { notified: false };

    if (primaryCandidate && primaryCandidate.isHighRelevance) {
      const conv = await rows(
        ctx.db
          .from('agent_conversations')
          .select('id')
          .eq('account_id', ctx.accountId)
          .eq('bot_id', marketingBot.id)
          .maybeSingle(),
      );

      const messageContent = `Ronaldo, analisei as notícias e tendências de hoje em João Pessoa e selecionei uma pauta principal:

📌 **${primaryCandidate.topic}**
- **Gancho:** ${primaryCandidate.hook || primaryCandidate.why_now || 'Oportunidade local em destaque'}
- **Formato sugerido:** ${primaryCandidate.format || 'Vídeo curto no Instagram Reels'}
- **Por que agora:** ${primaryCandidate.why_now || 'Movimentação relevante no mercado regional'}

Quer que eu desenvolva essa ou prefere explorar outra linha?`;

      if (conv?.id) {
        await ctx.db.from('agent_messages').insert({
          account_id: ctx.accountId,
          conversation_id: conv.id,
          client_message_id: crypto.randomUUID(),
          role: 'assistant',
          content: messageContent,
          sources: [
            {
              tool: 'researchMarketTrends',
              observed_at: new Date().toISOString(),
              data: { primary: primaryCandidate.topic, alternatives_count: alternatives.length },
            },
          ],
        });
      }

      await syncMarketingAutonomousResearch(ctx, marketingBot, {
        topic: primaryCandidate.topic,
        summary: `Pesquisa editorial diária concluída. Pauta selecionada: ${primaryCandidate.topic}.`,
        ideaProposal: primaryCandidate,
        alternatives,
      });

      if (notify) {
        notificationResult = await dispatchAutonomousNotification(ctx, marketingBot, {
          kind: 'opportunity',
          dedupKey: `editorial:${currentSlot}`,
          title: 'Bot de Marketing: pauta do dia',
          body: `Ronaldo, selecionei a pauta de hoje sobre ${primaryCandidate.topic}. Confira a proposta na conversa.`,
          severity: 'medium',
          cooldownHours: 20,
          data: { slot_key: currentSlot, topic: primaryCandidate.topic },
        });
      }
    } else {
      await syncMarketingAutonomousResearch(ctx, marketingBot, {
        topic: 'Monitoramento de Tendências',
        summary: 'Pesquisa realizada hoje nos canais oficiais; nenhuma pauta atingiu o limiar de relevância exigido.',
        ideaProposal: null,
        alternatives: [],
      });
    }

    if (claim.job?.id) {
      await completeAutonomousJob(ctx, claim.job.id, {
        summary: primaryCandidate ? `Editorial diário gerado: ${primaryCandidate.topic}` : 'Pesquisa diária concluída sem pauta qualificada (silêncio inteligente).',
        data: { slot_key: currentSlot, primary: primaryCandidate?.topic || null, alternatives: alternatives.length },
        notified: notificationResult.notified,
      });
    }

    if (run.id) {
      await rows(
        ctx.db
          .from('agent_runs')
          .update({
            status: 'completed',
            finished_at: new Date().toISOString(),
            result: { editorial_slot: currentSlot, notified: notificationResult.notified },
          })
          .eq('account_id', ctx.accountId)
          .eq('id', run.id),
      );
    }

    return {
      success: true,
      slot_key: currentSlot,
      primary_idea: primaryCandidate?.topic || null,
      notified: notificationResult.notified,
      alternatives_count: alternatives.length,
    };
  } catch (err) {
    if (claim.job?.id) {
      await failAutonomousJob(ctx, claim.job.id, err);
    }
    if (run.id) {
      await rows(
        ctx.db
          .from('agent_runs')
          .update({
            status: 'failed',
            finished_at: new Date().toISOString(),
            error: err.message,
          })
          .eq('account_id', ctx.accountId)
          .eq('id', run.id),
      );
    }
    throw err;
  }
}

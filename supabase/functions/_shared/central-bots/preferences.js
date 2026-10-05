import { rows, AgentError, UUID } from './core.js';
import { updateAgentOperationalState } from './state-memory.js';

/**
 * MÓDULO DE PREFERÊNCIAS PERSISTENTES E AUDITORIA DE CONFIGURAÇÃO (REVISÃO MASTER)
 *
 * Princípios de Precedência:
 * 1. Segurança e limites do sistema
 * 2. Missão fixa do agente
 * 3. Configurações persistentes aprovadas (armazenadas aqui)
 * 4. Instrução atual do Ronaldo no chat
 * 5. Memória / contexto recente
 * 6. Padrões de fábrica (defaults)
 */

export async function getAgentPreferences(ctx, botId) {
  if (!UUID.test(botId || '')) throw new AgentError('Bot inválido.');

  const existing = await rows(
    ctx.db
      .from('agent_preferences')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('bot_id', botId)
      .maybeSingle(),
  );

  if (existing) return existing;

  const initialized = {
    account_id: ctx.accountId,
    bot_id: botId,
    communication_preferences: {},
    behavior_preferences: {},
    research_preferences: {},
    notification_preferences: {},
    operational_preferences: {},
    previous_state: null,
    updated_by: 'system',
    updated_at: new Date().toISOString(),
  };

  try {
    await rows(
      ctx.db
        .from('agent_preferences')
        .upsert(initialized, { onConflict: 'account_id,bot_id', ignoreDuplicates: true }),
    );
  } catch {
    // Ignore concurrency conflicts on initialization
  }

  return (
    (await rows(
      ctx.db
        .from('agent_preferences')
        .select('*')
        .eq('account_id', ctx.accountId)
        .eq('bot_id', botId)
        .maybeSingle(),
    )) || initialized
  );
}

export async function updateAgentPreferences(
  ctx,
  botId,
  patch = {},
  { changedBy = 'gestor_chat', reason = '', category = 'behavior' } = {},
) {
  if (!UUID.test(botId || '')) throw new AgentError('Bot inválido.');

  const current = await getAgentPreferences(ctx, botId);

  // Guarda snapshot do estado anterior para suportar rollback ("volta como era antes")
  const previousStateSnapshot = {
    communication_preferences: { ...current.communication_preferences },
    behavior_preferences: { ...current.behavior_preferences },
    research_preferences: { ...current.research_preferences },
    notification_preferences: { ...current.notification_preferences },
    operational_preferences: { ...current.operational_preferences },
    updated_at: current.updated_at,
  };

  const updatedRecord = {
    account_id: ctx.accountId,
    bot_id: botId,
    communication_preferences: patch.communication_preferences
      ? { ...current.communication_preferences, ...patch.communication_preferences }
      : current.communication_preferences,
    behavior_preferences: patch.behavior_preferences
      ? { ...current.behavior_preferences, ...patch.behavior_preferences }
      : current.behavior_preferences,
    research_preferences: patch.research_preferences
      ? { ...current.research_preferences, ...patch.research_preferences }
      : current.research_preferences,
    notification_preferences: patch.notification_preferences
      ? { ...current.notification_preferences, ...patch.notification_preferences }
      : current.notification_preferences,
    operational_preferences: patch.operational_preferences
      ? { ...current.operational_preferences, ...patch.operational_preferences }
      : current.operational_preferences,
    previous_state: previousStateSnapshot,
    updated_by: changedBy,
    updated_at: new Date().toISOString(),
  };

  await rows(
    ctx.db
      .from('agent_preferences')
      .upsert(updatedRecord, { onConflict: 'account_id,bot_id' }),
  );

  // Registra auditoria da alteração (nunca alteração invisível)
  try {
    await rows(
      ctx.db.from('agent_config_audit').insert({
        account_id: ctx.accountId,
        bot_id: botId,
        changed_by: changedBy,
        category,
        previous_value: previousStateSnapshot,
        new_value: patch,
        reason: String(reason || '').slice(0, 500),
        confirmed: true,
      }),
    );
  } catch {
    // Log audit failure must not crash configuration
  }

  // Atualiza metadados no estado operacional para sincronização em tempo real
  await updateAgentOperationalState(ctx, botId, {
    metadata: {
      has_custom_preferences: true,
      last_preference_update: new Date().toISOString(),
    },
  }).catch(() => {});

  return updatedRecord;
}

export async function rollbackAgentPreferences(ctx, botId, { category = 'all' } = {}) {
  if (!UUID.test(botId || '')) throw new AgentError('Bot inválido.');

  const current = await getAgentPreferences(ctx, botId);
  if (!current.previous_state) {
    return {
      success: false,
      reason: 'Nenhuma alteração anterior encontrada para reverter.',
    };
  }

  const prev = current.previous_state;
  const restoredRecord = {
    account_id: ctx.accountId,
    bot_id: botId,
    communication_preferences: category === 'all' || category === 'communication'
      ? prev.communication_preferences
      : current.communication_preferences,
    behavior_preferences: category === 'all' || category === 'behavior'
      ? prev.behavior_preferences
      : current.behavior_preferences,
    research_preferences: category === 'all' || category === 'research'
      ? prev.research_preferences
      : current.research_preferences,
    notification_preferences: category === 'all' || category === 'notification'
      ? prev.notification_preferences
      : current.notification_preferences,
    operational_preferences: category === 'all' || category === 'operational'
      ? prev.operational_preferences
      : current.operational_preferences,
    previous_state: null, // Evita rollback circular infinito
    updated_by: 'rollback',
    updated_at: new Date().toISOString(),
  };

  await rows(
    ctx.db
      .from('agent_preferences')
      .upsert(restoredRecord, { onConflict: 'account_id,bot_id' }),
  );

  try {
    await rows(
      ctx.db.from('agent_config_audit').insert({
        account_id: ctx.accountId,
        bot_id: botId,
        changed_by: 'user_rollback',
        category,
        previous_value: current,
        new_value: restoredRecord,
        reason: 'Restauração do comportamento anterior solicitada pelo usuário',
        confirmed: true,
      }),
    );
  } catch {}

  return {
    success: true,
    preferences: restoredRecord,
  };
}

export async function buildAgentPreferencesContext(ctx, bot) {
  try {
    const prefs = await getAgentPreferences(ctx, bot.id);
    const lines = [];

    // Comunicação
    if (prefs.communication_preferences && Object.keys(prefs.communication_preferences).length > 0) {
      const comm = prefs.communication_preferences;
      if (comm.style) lines.push(`- Estilo de comunicação definido: ${comm.style}`);
      if (comm.tone) lines.push(`- Tom de voz preferido: ${comm.tone}`);
      if (comm.conciseness) lines.push(`- Nível de objetividade: ${comm.conciseness}`);
    }

    // Comportamento / Foco
    if (prefs.behavior_preferences && Object.keys(prefs.behavior_preferences).length > 0) {
      const beh = prefs.behavior_preferences;
      if (beh.focus) lines.push(`- Foco principal solicitado: ${beh.focus}`);
      if (beh.avoid) lines.push(`- Assuntos/estilos a evitar: ${beh.avoid}`);
      if (beh.guidelines) lines.push(`- Diretrizes comportamentais: ${beh.guidelines}`);
    }

    // Pesquisa (Marketing)
    if (prefs.research_preferences && Object.keys(prefs.research_preferences).length > 0) {
      const res = prefs.research_preferences;
      if (res.additional_sources && res.additional_sources.length > 0) {
        lines.push(`- Fontes prioritárias de pesquisa: ${res.additional_sources.join(', ')}`);
      }
      if (res.excluded_topics && res.excluded_topics.length > 0) {
        lines.push(`- Tópicos excluídos de pesquisa: ${res.excluded_topics.join(', ')}`);
      }
    }

    // Notificações (Sentinela / Gestor)
    if (prefs.notification_preferences && Object.keys(prefs.notification_preferences).length > 0) {
      const notif = prefs.notification_preferences;
      if (notif.sensitivity) lines.push(`- Sensibilidade de notificações: ${notif.sensitivity}`);
      if (notif.min_severity) lines.push(`- Severidade mínima para alertas: ${notif.min_severity}`);
    }

    // Operacional (Captador / Campanhas)
    if (prefs.operational_preferences && Object.keys(prefs.operational_preferences).length > 0) {
      const op = prefs.operational_preferences;
      if (op.campaign_type) lines.push(`- Tipo de campanha prioritária: ${op.campaign_type}`);
      if (op.max_price) lines.push(`- Limite máximo de preço nos filtros: R$ ${op.max_price}`);
      if (op.neighborhood) lines.push(`- Bairro de foco: ${op.neighborhood}`);
    }

    if (lines.length === 0) return '';

    return `PREFERÊNCIAS E DIRETRIZES ATIVAS DEFINIDAS POR RONALDO (PREVALECEM SOBRE OS PADRÕES):
${lines.join('\n')}`;
  } catch {
    return '';
  }
}

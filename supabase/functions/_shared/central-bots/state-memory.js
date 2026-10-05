import { rows, AgentError, UUID } from './core.js';

/**
 * CAMADA 4 — ESTADO OPERACIONAL PERSISTENTE E MEMÓRIA DOS AGENTES
 *
 * Princípios:
 * 1. Não é um "memory dump": armazena estados e eventos estruturados, não respostas inteiras de 4k tokens.
 * 2. Fonte de verdade soberana: a memória fornece continuidade e foco, mas NUNCA substitui o banco operacional.
 * 3. Separação de execuções: interação de chat != rodada operacional de captação ou inspeção.
 * 4. Bounded & Expiração: memórias possuem retenção e expiram conforme a natureza da informação.
 * 5. Multi-tenant estrito: isolamento garantido por account_id.
 */

export async function getAgentOperationalState(ctx, botId) {
  if (!UUID.test(botId || '')) throw new AgentError('Bot inválido.');
  
  const existing = await rows(
    ctx.db
      .from('agent_operational_state')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('bot_id', botId)
      .maybeSingle(),
  );

  if (existing) return existing;

  // Inicializa deterministicamente se não existir
  const initialized = await rows(
    ctx.db
      .from('agent_operational_state')
      .upsert(
        {
          account_id: ctx.accountId,
          bot_id: botId,
          pending_items: [],
          watched_items: [],
          metadata: {},
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'account_id,bot_id', ignoreDuplicates: true },
      ),
  );

  return (
    (await rows(
      ctx.db
        .from('agent_operational_state')
        .select('*')
        .eq('account_id', ctx.accountId)
        .eq('bot_id', botId)
        .maybeSingle(),
    )) || {
      account_id: ctx.accountId,
      bot_id: botId,
      pending_items: [],
      watched_items: [],
      metadata: {},
    }
  );
}

export async function updateAgentOperationalState(ctx, botId, patch = {}) {
  if (!UUID.test(botId || '')) throw new AgentError('Bot inválido.');
  
  const updateData = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  await rows(
    ctx.db
      .from('agent_operational_state')
      .upsert(
        {
          account_id: ctx.accountId,
          bot_id: botId,
          ...updateData,
        },
        { onConflict: 'account_id,bot_id' },
      ),
  );
}

export async function recordOperationalMemory(ctx, botId, {
  kind,
  topic = '',
  summary,
  data = {},
  retentionDays = 30,
}) {
  if (!UUID.test(botId || '')) throw new AgentError('Bot inválido.');
  if (!summary || typeof summary !== 'string') throw new AgentError('Resumo de memória obrigatório.');
  
  const validKinds = ['research', 'investigation', 'editorial', 'context', 'observation', 'decision'];
  if (!validKinds.includes(kind)) throw new AgentError('Tipo de memória inválido.');

  const expiresAt = retentionDays && Number.isFinite(retentionDays)
    ? new Date(Date.now() + retentionDays * 86400000).toISOString()
    : null;

  const inserted = await rows(
    ctx.db
      .from('agent_operational_memories')
      .insert({
        account_id: ctx.accountId,
        bot_id: botId,
        kind,
        topic: String(topic || '').slice(0, 200),
        summary: String(summary).slice(0, 4000),
        data: typeof data === 'object' && data !== null ? data : {},
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single(),
  );

  return inserted;
}

export async function getRelevantMemories(ctx, botId, {
  kind = null,
  kinds = null,
  topic = null,
  limit = 5,
} = {}) {
  if (!UUID.test(botId || '')) throw new AgentError('Bot inválido.');

  let q = ctx.db
    .from('agent_operational_memories')
    .select('id,kind,topic,summary,data,created_at,updated_at,expires_at')
    .eq('account_id', ctx.accountId)
    .eq('bot_id', botId);

  // Retenção: não carregar memórias expiradas
  const nowIso = new Date().toISOString();
  q = q.or(`expires_at.is.null,expires_at.gt.${nowIso}`);

  if (kind) {
    q = q.eq('kind', kind);
  } else if (Array.isArray(kinds) && kinds.length > 0) {
    q = q.in('kind', kinds);
  }

  if (topic) {
    q = q.ilike('topic', `%${String(topic).slice(0, 100).replace(/[%_]/g, '')}%`);
  }

  q = q.order('updated_at', { ascending: false }).limit(Math.min(limit, 20));

  return rows(q);
}

export function formatBrasiliaTimestamp(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * Constrói o bloco de contexto persistente injetado no system prompt de cada agente.
 * Enxuto, cirúrgico e focado em continuidade, novelty e separação de execuções.
 */
export async function buildAgentOperationalContext(ctx, bot, prompt = '') {
  const [state, memories] = await Promise.all([
    getAgentOperationalState(ctx, bot.id),
    getRelevantMemories(ctx, bot.id, { limit: 5 }),
  ]);

  const lastChatBrasilia = formatBrasiliaTimestamp(state.last_interaction_at);
  const lastOpBrasilia = formatBrasiliaTimestamp(state.last_operational_at);

  const sections = [];

  sections.push(`ESTADO OPERACIONAL PERSISTENTE DE ${bot.name.toUpperCase()}:`);
  sections.push(`- Última interação com o usuário (no chat da Central): ${lastChatBrasilia ? `${lastChatBrasilia} (horário de Brasília)` : 'Nenhuma interação anterior nesta conta.'}`);
  
  if (bot.kind === 'captador') {
    sections.push(`- Última rodada operacional de captação OLX (na VM Hyper-V): ${lastOpBrasilia ? `${lastOpBrasilia} (horário de Brasília)` : 'Conferir na ferramenta getCaptureSummary.'}`);
  } else {
    sections.push(`- Última atividade operacional de domínio: ${lastOpBrasilia ? `${lastOpBrasilia} (horário de Brasília)` : 'Nenhuma atividade registrada.'} ${state.last_operational_summary ? `(${state.last_operational_summary})` : ''}`);
  }

  if (state.current_focus) {
    sections.push(`- Foco operacional atual que você está acompanhando: ${state.current_focus}`);
  }

  if (Array.isArray(state.watched_items) && state.watched_items.length > 0) {
    sections.push(`- Itens sob observação ativa: ${JSON.stringify(state.watched_items.slice(0, 3))}`);
  }

  if (Array.isArray(state.pending_items) && state.pending_items.length > 0) {
    sections.push(`- Pendências sob sua responsabilidade: ${JSON.stringify(state.pending_items.slice(0, 3))}`);
  }

  // Complementos específicos por tipo de bot
  if (bot.kind === 'marketing') {
    // Carrega ideias recentes para evitar repetições (Novelty)
    const recentIdeas = await rows(
      ctx.db
        .from('agent_marketing_ideas')
        .select('topic,angle,status,created_at')
        .eq('account_id', ctx.accountId)
        .order('created_at', { ascending: false })
        .limit(6),
    );
    if (recentIdeas.length > 0) {
      sections.push(`- Ideias e pautas que você já apresentou anteriormente (REGRA DE NOVELTY: evite repetir exatamente a mesma ideia se Ronaldo pedir uma ideia nova):`);
      for (const idea of recentIdeas) {
        sections.push(`  * [${idea.status}]: "${idea.topic}" (Ângulo: ${idea.angle})`);
      }
    }
  }

  if (memories.length > 0) {
    sections.push(`- Memórias operacionais relevantes registradas anteriormente:`);
    for (const m of memories) {
      const dateStr = formatBrasiliaTimestamp(m.updated_at) || '';
      sections.push(`  * [${m.kind.toUpperCase()}${m.topic ? ` - ${m.topic}` : ''}] (${dateStr}): ${m.summary}`);
    }
  }

  sections.push(`
DIRETRIZES DE CONTINUIDADE E VERACIDADE (CAMADA 4):
1. CONTINUIDADE: Você não nasceu hoje. Use as informações acima para manter continuidade em conversas subsequentes. Se Ronaldo perguntar "o que você encontrou na sua última pesquisa?", "como está aquele problema que você estava acompanhando?" ou "o que ficou pendente?", responda com base nas suas memórias e estado recente.
2. FONTE FACTUAL SOBERANA: Memória serve para dar contexto histórico e continuidade, NUNCA para suplantar o estado real do banco de dados operacional. Se a pergunta for sobre dados factuais atuais (ex: quantas rodadas rodaram hoje, status atual de um alerta, imóveis disponíveis), consulte OBRIGATORIAMENTE a ferramenta factual na conversa atual. O banco operacional sempre vence a memória.
3. SEPARAÇÃO ESTRITA DE EXECUÇÕES (BOT CAPTADOR): Diferencie categoricamente a conversa com Ronaldo no chat (${lastChatBrasilia || 'hoje'}) da rodada de captação da OLX pela VM Hyper-V (${lastOpBrasilia || 'anterior'}). NUNCA diga que o Captador trabalhou ou captou imóveis em um horário em que você apenas conversou no chat da Central.
4. ATUALIZAÇÃO DE PROBLEMA (SENTINELA): Se Ronaldo perguntar por um problema que você estava acompanhando, identifique a ocorrência pelo seu foco recente e consulte o estado ATUAL via ferramenta (getComponentDiagnostics ou getOpenIncidents) antes de responder se melhorou ou se continua aberto.
5. NOVELTY / INEDITISMO (MARKETING): Se Ronaldo pedir uma nova sugestão de pauta/vídeo, confira as ideias já apresentadas e proponha uma pauta com ângulo diferente, evitando repetições.`);

  return sections.join('\n');
}

/**
 * Sincroniza deterministicamente execuções de ferramentas com o estado persistente do agente
 * sem queimar tokens ou depender de instruções do LLM.
 */
export async function syncToolExecutionToState(ctx, bot, toolName, args, result) {
  if (!result || result.unavailable) return;
  try {
    if (toolName === 'researchMarketTrends') {
      const topFindings = Array.isArray(result.findings) ? result.findings.slice(0, 3) : [];
      const summaryText = topFindings.map((f) => f.title).join(' | ') || 'Pesquisa ao vivo realizada';
      await updateAgentOperationalState(ctx, bot.id, {
        last_operational_at: new Date().toISOString(),
        last_operational_type: 'market_research',
        last_operational_summary: `Pesquisa ao vivo: ${result.total_findings || topFindings.length} itens encontrados em canais oficiais`,
        current_focus: 'Pautas de conteúdo imobiliário baseadas em notícias recentes',
        last_result_summary: summaryText,
        metadata: {
          last_query: args?.query || '',
          findings_count: result.total_findings || topFindings.length,
          sources: result.sources_checked || [],
        },
      });
      await recordOperationalMemory(ctx, bot.id, {
        kind: 'research',
        topic: 'Tendências e Notícias',
        summary: summaryText,
        data: {
          total: result.total_findings || topFindings.length,
          sources: result.sources_checked,
          sample_titles: topFindings.map((f) => f.title),
        },
        retentionDays: 7, // Notícias expiram em 7 dias
      });
    } else if (toolName === 'runLiveInspection' || toolName === 'getComponentDiagnostics') {
      const component = args?.component || result.component || 'sistema';
      const observed = result.observed || (result.healthy === true ? 'Verificação confirmou funcionamento normal' : result.healthy === false ? 'Verificação encontrou uma anomalia' : 'Verificação ainda sem conclusão confirmada');
      await updateAgentOperationalState(ctx, bot.id, {
        last_operational_at: new Date().toISOString(),
        last_operational_type: 'system_inspection',
        last_operational_summary: `Inspeção de ${component}: ${observed}`,
        current_focus: result.impact ? `Acompanhando ocorrência no componente ${component}` : 'Monitoramento contínuo',
        watched_items: result.impact ? [{ component, impact: result.impact, observed }] : [],
        last_result_summary: observed,
      });
      await recordOperationalMemory(ctx, bot.id, {
        kind: 'investigation',
        topic: component,
        summary: `Inspeção do componente ${component}: ${observed}. ${result.confirmed_cause ? 'Causa confirmada.' : 'Causa ainda não confirmada (em investigação).'}`,
        data: {
          component,
          impact: result.impact,
          observed,
        },
        retentionDays: 30,
      });
    } else if (toolName === 'searchCapturedProperties') {
      await updateAgentOperationalState(ctx, bot.id, {
        current_focus: args?.neighborhood ? `Consulta de imóveis no bairro ${args.neighborhood}` : 'Consulta de imóveis na base',
        metadata: {
          last_search_filters: args,
          total_found: result.total_found || 0,
        },
      });
    } else if (toolName === 'getCaptureSummary') {
      if (result.settings?.last_round_at) {
        await updateAgentOperationalState(ctx, bot.id, {
          last_operational_at: result.settings.last_round_at,
          last_operational_type: 'scraping_round',
          last_operational_summary: result.ultima_rodada_resumo || 'Última rodada operacional OLX',
        });
      }
    } else if (toolName === 'getBotsStatus' || toolName === 'getOperationalSummary') {
      await updateAgentOperationalState(ctx, bot.id, {
        last_operational_at: new Date().toISOString(),
        last_operational_type: 'management_sync',
        last_operational_summary: 'Consolidação operacional dos 4 bots da Central',
      });
    }
  } catch (err) {
    // Non-blocking
  }
}

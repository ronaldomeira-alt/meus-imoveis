export class AgentError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const AVATARS = [
  'gestor',
  'captador',
  'sentinela',
  'jade',
  'coral',
  'silver',
  'marketing',
];
export const AUTONOMIES = ['read_only', 'propose', 'approval', 'allowed_auto'];
export const MODES = ['on_demand', 'scheduled', 'monitoring'];

export async function rows(query) {
  const { data, error } = await query;
  if (error)
    throw new AgentError(
      'Não foi possível consultar ou salvar os dados da Central.',
      503,
    );
  return data;
}

export function requiredText(value, name, min = 1, max = 4000) {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.trim().length > max
  ) {
    throw new AgentError(`${name}: informe entre ${min} e ${max} caracteres.`);
  }
  return value.trim();
}

export function rangeArgs(args = {}) {
  const period = args.period ?? 'rolling';
  const days = args.days ?? (period === 'today' ? 1 : 30);
  const limit = args.limit ?? 10;
  if (
    !['rolling', 'today'].includes(period) ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 90 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 30
  ) {
    throw new AgentError('Período ou limite de consulta inválido.');
  }
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return {
    days: period === 'today' ? 1 : days,
    period,
    limit,
    since:
      period === 'today'
        ? new Date(`${today}T00:00:00-03:00`).toISOString()
        : new Date(Date.now() - days * 86400000).toISOString(),
  };
}

export async function event(
  ctx,
  botId,
  runId,
  type,
  payload = {},
  tool = null,
  duration = null,
) {
  await rows(
    ctx.db
      .from('agent_events')
      .insert({
        account_id: ctx.accountId,
        bot_id: botId,
        run_id: runId,
        type,
        payload,
        tool,
        duration_ms: duration,
      }),
  );
}

export function publicError(error) {
  return error instanceof AgentError
    ? error.message
    : 'A operação não pôde ser concluída. Tente novamente.';
}

export function redactOperationalData(value, env = {}) {
  const secrets = Object.entries(env)
    .filter(
      ([key, val]) =>
        /key|secret|token|password/i.test(key) &&
        typeof val === 'string' &&
        val.length > 12,
    )
    .map(([, val]) => val);
  function scrub(item, depth = 0) {
    if (depth > 12) return '[limite de profundidade]';
    if (typeof item === 'string') {
      let text = item;
      for (const secret of secrets)
        text = text.replaceAll(secret, '[redacted]');
      return text
        .replace(/Bearer\s+[\w.+/=-]+/gi, 'Bearer [redacted]')
        .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[redacted]')
        .replace(/\b(?:gsk_|sk-)[\w-]{12,}\b/g, '[redacted]')
        .replace(
          /((?:api[_-]?key|access[_-]?token|password|secret)\s*[=:]\s*)[^\s&,;]+/gi,
          '$1[redacted]',
        );
    }
    if (Array.isArray(item)) return item.map((v) => scrub(v, depth + 1));
    if (item && typeof item === 'object')
      return Object.fromEntries(
        Object.entries(item).map(([key, val]) => [
          key,
          /authorization|password|secret|token|api[_-]?key|private[_-]?key/i.test(
            key,
          )
            ? '[redacted]'
            : scrub(val, depth + 1),
        ]),
      );
    return item;
  }
  return scrub(value);
}

export const BUILTINS = [
  {
    slug: 'gestor',
    name: 'Bot Gestor',
    kind: 'gestor',
    avatar: 'gestor',
    sort_order: 0,
    mission:
      'Consolidar a operação real dos bots, correlacionar resultados e ocorrências e destacar aprovações que precisam do usuário. Nunca autorizar ações em nome do usuário.',
    tools: [
      'getBotsStatus',
      'getBotsRecentActivity',
      'getPendingApprovals',
      'getOperationalSummary',
      'getCaptureSummary',
      'getCaptureMetrics',
      'getOpenIncidents',
      'getMarketingStatus',
      'searchCapturedProperties',
      'researchMarketTrends',
      'runLiveInspection',
    ],
    work_mode: 'on_demand',
  },
  {
    slug: 'captador',
    name: 'Bot Captador',
    kind: 'captador',
    avatar: 'captador',
    sort_order: 1,
    mission:
      'Analisar somente os dados reais do Captador operacional. Não executar rodadas, mudar campanhas, configurações, limites, filas, tombstones ou a VM.',
    tools: [
      'getCaptureSummary',
      'getRecentRounds',
      'getRecentResponses',
      'getCaptureMetrics',
      'searchCapturedProperties',
    ],
    work_mode: 'on_demand',
  },
  {
    slug: 'sentinela',
    name: 'Bot Sentinela',
    kind: 'sentinela',
    avatar: 'sentinela',
    sort_order: 2,
    mission:
      'Observar o ecossistema, investigar anomalias sem alterar produção e apresentar evidências, impacto, hipóteses, confiança e recomendações. Nunca executar reparos.',
    tools: [
      'getSystemHealth',
      'getOpenIncidents',
      'getIncidentDetails',
      'getLastDeepInspection',
      'getRecentFailures',
      'getMarketingStatus',
      'runLiveInspection',
      'getComponentDiagnostics',
    ],
    work_mode: 'monitoring',
  },
  {
    slug: 'marketing', name: 'Bot de Marketing', kind: 'marketing', avatar: 'marketing', sort_order: 3,
    mission: 'Parceiro editorial de Ronaldo: pesquisar fontes acessíveis, aprender com feedback e propor ideias sustentadas. Pode permanecer em silêncio. Nunca publicar nem usar conversas privadas do CRM.',
    tools: ['getMarketingStatus','getMarketingMemory','getMarketingIdeas','researchMarketTrends','searchMarketingWeb'], work_mode: 'scheduled', autonomy: 'propose',
    notification_events: ['result'],
  },
];

export function maintenanceDossier(incident, approval = null) {
  return {
    version: 1,
    incident_id: incident.id,
    component: incident.component,
    expected: incident.expected,
    observed: incident.observed,
    impact: incident.impact,
    confidence: incident.confidence,
    ...incident.dossier,
    authorization: approval
      ? {
          id: approval.id,
          action: approval.action,
          decided_by: approval.decided_by,
          decided_at: approval.decided_at,
          status: approval.status,
        }
      : null,
    execution_allowed: false,
    scope: 'read_only_investigation',
  };
}

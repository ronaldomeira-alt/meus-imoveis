import { rows, rangeArgs, AgentError } from './core.js';

// Deliberately separate from the operational database/runner: SELECT only, no RPC.
export async function getCaptureSummary(ctx, args) {
  const { since, days, period } = rangeArgs(args);
  async function count(column, predicate = null) {
    let query = ctx.readDb
      .from('bot_captures')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId);
    if (column) query = query.gte(column, since);
    if (predicate) query = predicate(query);
    const result = await query;
    if (result.error || result.count == null)
      throw new AgentError('Dados de captação indisponíveis.', 503);
    return result.count;
  }
  const [contacted, responded, imported, waiting, settings, campaigns] =
    await Promise.all([
      count('contacted_at'),
      count('responded_at'),
      count('updated_at', (q) => q.not('imported_property_id', 'is', null)),
      count(null, (q) => q.eq('status', 'WAITING_RESPONSE')),
      rows(
        ctx.readDb
          .from('bot_settings')
          .select(
            'is_active,health_status,health_reason,last_round_at,next_round_at,last_round_summary,olx_last_checked_at',
          )
          .eq('account_id', ctx.accountId)
          .maybeSingle(),
      ),
      rows(
        ctx.readDb
          .from('bot_campaigns')
          .select('type,is_active,schedule_times')
          .eq('account_id', ctx.accountId),
      ),
    ]);
  return {
    source: 'bot_captures, bot_settings, bot_campaigns',
    observed_at: new Date().toISOString(),
    days,
    period,
    since,
    contacted,
    responded,
    imported_updated_in_period: imported,
    waiting_current: waiting,
    settings,
    campaigns,
    caveat:
      'Importações usam updated_at: o schema operacional não possui imported_at. Respostas no período não são necessariamente contatos do mesmo período.',
  };
}

export async function getRecentRounds(ctx, args) {
  const { since, limit } = rangeArgs(args);
  return {
    source: 'bot_execution_rounds',
    since,
    rounds: await rows(
      ctx.readDb
        .from('bot_execution_rounds')
        .select(
          'id,campaign_type,trigger_type,status,started_at,finished_at,analyzed_count,new_count,eligible_count,contacted_count,duplicate_count,error_count,error_summary',
        )
        .eq('account_id', ctx.accountId)
        .gte('started_at', since)
        .order('started_at', { ascending: false })
        .limit(limit),
    ),
  };
}

export async function getRecentResponses(ctx, args) {
  const { since, limit } = rangeArgs(args);
  return {
    source: 'bot_captures',
    since,
    responses: await rows(
      ctx.readDb
        .from('bot_captures')
        .select(
          'id,title,neighborhood,status,contacted_at,responded_at,imported_property_id',
        )
        .eq('account_id', ctx.accountId)
        .gte('responded_at', since)
        .order('responded_at', { ascending: false })
        .limit(limit),
    ),
  };
}

export async function getCaptureMetrics(ctx, args) {
  const { since, days, period } = rangeArgs(args);
  const groups = new Map();
  let scanned = 0,
    complete = false;
  // Bound the cost, and explicitly disclose partial cohorts instead of inventing totals.
  for (let start = 0; start < 5000; start += 500) {
    const data = await rows(
      ctx.readDb
        .from('bot_captures')
        .select('id,neighborhood,responded_at,imported_property_id')
        .eq('account_id', ctx.accountId)
        .gte('contacted_at', since)
        .order('id')
        .range(start, start + 499),
    );
    for (const item of data) {
      const name = item.neighborhood || 'Não informado';
      const group = groups.get(name) || {
        neighborhood: name,
        contacted: 0,
        responded: 0,
        imported: 0,
      };
      group.contacted++;
      if (item.responded_at) group.responded++;
      if (item.imported_property_id) group.imported++;
      groups.set(name, group);
    }
    scanned += data.length;
    if (data.length < 500) {
      complete = true;
      break;
    }
  }
  return {
    source: 'bot_captures',
    days,
    period,
    since,
    scanned,
    complete,
    cohort:
      'Contatados no período; respostas e importações observadas até agora.',
    neighborhoods: [...groups.values()]
      .map((g) => ({
        ...g,
        response_rate: Math.round((g.responded / g.contacted) * 1000) / 10,
      }))
      .sort((a, b) => b.response_rate - a.response_rate),
  };
}

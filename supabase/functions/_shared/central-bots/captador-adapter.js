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
  const rawRounds = await rows(
    ctx.readDb
      .from('bot_execution_rounds')
      .select(
        'id,campaign_type,trigger_type,status,started_at,finished_at,analyzed_count,new_count,eligible_count,contacted_count,duplicate_count,error_count,error_summary',
      )
      .eq('account_id', ctx.accountId)
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(limit),
  );
  return {
    source: 'bot_execution_rounds',
    since,
    rounds_count: rawRounds.length,
    rounds: rawRounds.map(r => {
      const start = r.started_at ? new Date(r.started_at) : null;
      const finish = r.finished_at ? new Date(r.finished_at) : null;
      const brasiliaTime = start ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      }).format(start) : null;
      const brasiliaDate = start ? new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(start) : null;
      return {
        ...r,
        started_at_brasilia: brasiliaTime,
        date_brasilia: brasiliaDate,
        hora_brasilia: brasiliaTime ? `${parseInt(brasiliaTime.split(':')[0], 10)}h${brasiliaTime.split(':')[1] !== '00' ? brasiliaTime.split(':')[1] : ''}` : null,
        duration_seconds: start && finish ? Math.round((finish.getTime() - start.getTime()) / 1000) : null,
      };
    }),
  };
}

export async function searchCapturedProperties(ctx, args = {}) {
  let query = ctx.readDb
    .from('bot_captures')
    .select('id,campaign_type,title,price,neighborhood,bedrooms,area_m2,status,url,contacted_at,responded_at,imported_property_id,rejection_reason,created_at')
    .eq('account_id', ctx.accountId);

  if (typeof args.neighborhood === 'string' && args.neighborhood.trim()) {
    query = query.ilike('neighborhood', `%${args.neighborhood.trim().replace(/[%_]/g, '')}%`);
  }
  if (Number.isInteger(args.bedrooms)) {
    query = query.eq('bedrooms', args.bedrooms);
  } else {
    if (Number.isInteger(args.min_bedrooms)) query = query.gte('bedrooms', args.min_bedrooms);
    if (Number.isInteger(args.max_bedrooms)) query = query.lte('bedrooms', args.max_bedrooms);
  }
  if (typeof args.min_price === 'number') query = query.gte('price', args.min_price);
  if (typeof args.max_price === 'number') query = query.lte('price', args.max_price);
  if (typeof args.min_area === 'number') query = query.gte('area_m2', args.min_area);
  if (typeof args.max_area === 'number') query = query.lte('area_m2', args.max_area);
  if (typeof args.status === 'string' && args.status) query = query.eq('status', args.status);
  if (args.approached === true) query = query.not('contacted_at', 'is', null);
  else if (args.approached === false) query = query.is('contacted_at', null);
  if (args.responded === true) query = query.not('responded_at', 'is', null);
  else if (args.responded === false) query = query.is('responded_at', null);
  if (args.waiting_response === true) query = query.eq('status', 'WAITING_RESPONSE');
  if (args.period === 'today') {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    query = query.gte('created_at', `${today}T00:00:00-03:00`);
  } else if (args.days && Number.isInteger(args.days)) {
    query = query.gte('created_at', new Date(Date.now() - args.days * 86400000).toISOString());
  }

  if (args.sort_by === 'price_asc') query = query.order('price', { ascending: true, nullsFirst: false });
  else if (args.sort_by === 'price_desc') query = query.order('price', { ascending: false, nullsFirst: false });
  else if (args.sort_by === 'area_desc') query = query.order('area_m2', { ascending: false, nullsFirst: false });
  else query = query.order('created_at', { ascending: false });

  const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);
  query = query.limit(limit);

  const raw = await rows(query);
  return {
    source: 'bot_captures',
    total_found: raw.length,
    filters_applied: args,
    properties: raw.map(p => {
      const priceNum = p.price != null ? Number(p.price) : null;
      return {
        ...p,
        price_formatted: priceNum != null ? `R$ ${priceNum.toLocaleString('pt-BR')}` : 'Não informado',
        price_thousands: priceNum != null ? `${Math.round(priceNum / 1000)} mil` : null,
        created_at_brasilia: p.created_at ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(p.created_at)) : null,
        contacted_at_brasilia: p.contacted_at ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(p.contacted_at)) : null,
      };
    }),
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

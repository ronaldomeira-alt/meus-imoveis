import { rows, rangeArgs, AgentError } from './core.js';

export function calculateNextOfficialRound(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const year = parseInt(get('year'), 10);
  const month = parseInt(get('month'), 10);
  const day = parseInt(get('day'), 10);
  const hour = parseInt(get('hour'), 10);
  const minute = parseInt(get('minute'), 10);
  const nowMinutes = hour * 60 + minute;

  const pad = (n) => String(n).padStart(2, '0');
  const todayStr = `${pad(day)}/${pad(month)}/${year}`;

  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowParts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(tomorrowDate);

  if (nowMinutes < 9 * 60) {
    return {
      horario: '09:00',
      data: todayStr,
      is_hoje: true,
      resumo: `hoje (${todayStr}) às 09:00 (horário de Brasília)`,
      proxima_rodada_texto: `A próxima rodada oficial está programada para hoje às 09:00 (horário de Brasília).`,
    };
  } else if (nowMinutes < 19 * 60) {
    return {
      horario: '19:00',
      data: todayStr,
      is_hoje: true,
      resumo: `hoje (${todayStr}) às 19:00 (horário de Brasília)`,
      proxima_rodada_texto: `A próxima rodada oficial está programada para hoje às 19:00 (horário de Brasília).`,
    };
  } else {
    return {
      horario: '09:00',
      data: tomorrowParts,
      is_hoje: false,
      resumo: `amanhã (${tomorrowParts}) às 09:00 (horário de Brasília)`,
      proxima_rodada_texto: `A próxima rodada oficial está programada para amanhã (${tomorrowParts}) às 09:00 (horário de Brasília).`,
    };
  }
}

// Deliberately separate from the operational database/runner: SELECT only, no RPC.
export async function getCaptureSummary(ctx, args) {
  const { since, until, days, period } = rangeArgs(args);
  async function count(column, predicate = null) {
    let query = ctx.readDb
      .from('bot_captures')
      .select('id', { count: 'exact', head: true })
      .eq('account_id', ctx.accountId);
    if (column) query = query.gte(column, since).lt(column, until);
    if (predicate) query = predicate(query);
    const result = await query;
    if (result.error || result.count == null)
      throw new AgentError('Dados de captação indisponíveis.', 503);
    return result.count;
  }
  const todaySaoPaulo = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const todayMidnightIso = `${todaySaoPaulo}T00:00:00-03:00`;

  const [contacted, responded, imported, waiting, settings, campaigns, roundsToday] =
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
      rows(
        ctx.readDb
          .from('bot_execution_rounds')
          .select('id,started_at,finished_at,status,contacted_count')
          .eq('account_id', ctx.accountId)
          .gte('started_at', todayMidnightIso)
          .order('started_at', { ascending: false }),
      ),
    ]);

  const lastRoundDate = settings?.last_round_at ? new Date(settings.last_round_at) : null;
  const nextRoundDate = settings?.next_round_at ? new Date(settings.next_round_at) : null;

  const lastRoundBrasiliaTime = lastRoundDate ? new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(lastRoundDate) : null;
  const lastRoundBrasiliaDate = lastRoundDate ? new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(lastRoundDate) : null;

  const nextRoundBrasiliaTime = nextRoundDate ? new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(nextRoundDate) : null;
  const nextRoundBrasiliaDate = nextRoundDate ? new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(nextRoundDate) : null;

  const todayBrasiliaDate = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());

  const lastRoundIsToday = lastRoundBrasiliaDate === todayBrasiliaDate;
  const nextOfficial = calculateNextOfficialRound(new Date());

  return {
    source: 'bot_captures, bot_settings, bot_campaigns, bot_execution_rounds',
    observed_at: new Date().toISOString(),
    data_brasilia: todayBrasiliaDate,
    days,
    period,
    since,
    until,
    rodadas_hoje_count: roundsToday.length,
    rodadas_hoje_resumo: roundsToday.length === 0
      ? 'Hoje ainda não houve nenhuma rodada registrada.'
      : `Hoje foram realizadas ${roundsToday.length} rodada(s).`,
    ultima_rodada_data: lastRoundBrasiliaDate,
    ultima_rodada_horario: lastRoundBrasiliaTime,
    ultima_rodada_resumo: lastRoundDate
      ? (lastRoundIsToday
          ? `A última rodada foi hoje às ${lastRoundBrasiliaTime} (horário de Brasília).`
          : `A última rodada registrada foi em ${lastRoundBrasiliaDate} às ${lastRoundBrasiliaTime} (horário de Brasília).`)
      : 'Nenhuma rodada anterior registrada.',
    proxima_rodada_horario: nextOfficial.horario,
    proxima_rodada_data: nextOfficial.data,
    proxima_rodada_is_hoje: nextOfficial.is_hoje,
    proxima_rodada_resumo: nextOfficial.resumo,
    proxima_rodada_texto: nextOfficial.proxima_rodada_texto,
    horarios_oficiais_configurados: ['09:00', '19:00'],
    contacted,
    responded,
    imported_updated_in_period: imported,
    waiting_current: waiting,
    settings: settings ? {
      ...settings,
      last_round_at_brasilia: lastRoundBrasiliaTime,
      last_round_date_brasilia: lastRoundBrasiliaDate,
      next_round_at_brasilia: nextRoundBrasiliaTime,
      next_round_date_brasilia: nextRoundBrasiliaDate,
    } : null,
    campaigns,
    caveat:
      'Importações usam updated_at: o schema operacional não possui imported_at. Respostas no período não são necessariamente contatos do mesmo período.',
  };
}

export async function getRecentRounds(ctx, args) {
  const { since, until, limit } = rangeArgs(args);
  const rawRounds = await rows(
    ctx.readDb
      .from('bot_execution_rounds')
      .select(
        'id,campaign_type,trigger_type,status,started_at,finished_at,analyzed_count,new_count,eligible_count,contacted_count,duplicate_count,error_count,error_summary',
      )
      .eq('account_id', ctx.accountId)
      .gte('started_at', since)
      .lt('started_at', until)
      .order('started_at', { ascending: false })
      .limit(limit),
  );

  const todaySaoPaulo = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  const roundsToday = rawRounds.filter(r => {
    if (!r.started_at) return false;
    const roundDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(r.started_at));
    return roundDate === todaySaoPaulo;
  });

  return {
    source: 'bot_execution_rounds',
    since,
    until,
    limit,
    possibly_truncated: rawRounds.length === limit,
    coverage: 'Contagem dos registros retornados. Se possibly_truncated=true, não afirme o total do período; amplie o limite até 30 ou explique que o resumo é parcial.',
    rounds_count: rawRounds.length,
    rounds_today_count: roundsToday.length,
    rounds_today_resumo: roundsToday.length === 0
      ? 'Hoje ainda não houve nenhuma rodada registrada.'
      : `Hoje foram realizadas ${roundsToday.length} rodada(s).`,
    proxima_rodada_resumo: calculateNextOfficialRound(new Date()).resumo,
    proxima_rodada_texto: calculateNextOfficialRound(new Date()).proxima_rodada_texto,
    horarios_oficiais_configurados: ['09:00', '19:00'],
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
  if (args.period || args.days !== undefined) {
    const { since, until } = rangeArgs(args);
    query = query.gte('created_at', since).lt('created_at', until);
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
    possibly_truncated: raw.length === limit,
    coverage: 'Imóveis retornados nesta consulta, não um total geral quando o limite foi atingido.',
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
  const { since, until, limit } = rangeArgs(args);
  return {
    source: 'bot_captures',
    since,
    until,
    responses: await rows(
      ctx.readDb
        .from('bot_captures')
        .select(
          'id,title,neighborhood,status,contacted_at,responded_at,imported_property_id',
        )
        .eq('account_id', ctx.accountId)
        .gte('responded_at', since)
        .lt('responded_at', until)
        .order('responded_at', { ascending: false })
        .limit(limit),
    ),
  };
}

export async function getCaptureMetrics(ctx, args) {
  const { since, until, days, period } = rangeArgs(args);
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
        .lt('contacted_at', until)
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
    until,
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

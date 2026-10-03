import { rows, event, maintenanceDossier, AgentError } from './core.js';

export function isDailyInspectionDue(lastStartedAt, now = new Date()) {
  if (!lastStartedAt) return true;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  return day.format(new Date(lastStartedAt)) !== day.format(now);
}

export function expectedCaptureSlot(
  campaigns,
  now = new Date(),
  graceMinutes = 90,
) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const slots = [];
  for (const campaign of campaigns.filter((c) => c.is_active)) {
    for (const time of campaign.schedule_times || []) {
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) continue;
      const date = new Date(`${today}T${time}:00-03:00`);
      for (const daysAgo of [0, 1]) {
        const slot = new Date(date.getTime() - daysAgo * 86400000);
        if (slot.getTime() + graceMinutes * 60000 <= now.getTime())
          slots.push(slot);
      }
    }
  }
  return slots.sort((a, b) => b - a)[0] || null;
}

async function probe(url, expectedStatus = [200]) {
  const start = Date.now();
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
    const status = expectedStatus.includes(response.status) ? 'ok' : 'fail';
    const text =
      response.status === 200 ? (await response.text()).slice(0, 100000) : '';
    return {
      status,
      observed: `HTTP ${response.status}`,
      duration_ms: Date.now() - start,
      http_status: response.status,
      text,
    };
  } catch {
    return {
      status: 'fail',
      observed: 'Sem resposta dentro da janela de verificação.',
      duration_ms: Date.now() - start,
    };
  }
}

export async function collectHealth(ctx, deep = false) {
  const checks = [];
  async function check(component, expected, fn) {
    try {
      checks.push({ component, expected, ...(await fn()) });
    } catch {
      checks.push({
        component,
        expected,
        status: 'unknown',
        observed: 'Fonte indisponível ou sem permissão de leitura.',
      });
    }
  }
  await check(
    'captador_telemetry',
    'Rodada registrada após o horário configurado, com tolerância de 90 minutos.',
    async () => {
      const [settings, campaigns, recent] = await Promise.all([
        rows(
          ctx.readDb
            .from('bot_settings')
            .select('is_active,last_round_at,health_status,olx_last_checked_at')
            .eq('account_id', ctx.accountId)
            .maybeSingle(),
        ),
        rows(
          ctx.readDb
            .from('bot_campaigns')
            .select('is_active,schedule_times')
            .eq('account_id', ctx.accountId),
        ),
        rows(
          ctx.readDb
            .from('bot_execution_rounds')
            .select('status,started_at,finished_at')
            .eq('account_id', ctx.accountId)
            .neq('trigger_type', 'SIMULATION')
            .order('started_at', { ascending: false })
            .limit(10),
        ),
      ]);
      if (!settings)
        return {
          status: 'unknown',
          observed: 'Sem configuração do Captador para esta conta.',
        };
      if (!settings.is_active)
        return {
          status: 'skipped',
          observed: 'Captador pausado na configuração existente.',
          evidence: settings,
        };
      const slot = expectedCaptureSlot(campaigns);
      if (!slot)
        return {
          status: 'skipped',
          observed: 'Nenhuma rodada vencida na janela observada.',
        };
      const round = recent.find(
        (r) => r.status === 'COMPLETED' && new Date(r.started_at) >= slot,
      );
      const settingsUpdated =
        settings.last_round_at && new Date(settings.last_round_at) >= slot;
      return {
        status: round ? 'ok' : 'fail',
        observed: round
          ? 'Rodada concluída registrada.'
          : settingsUpdated
            ? 'Configuração registra atividade, mas não há rodada correspondente no histórico.'
            : 'Nenhuma rodada concluída após o horário esperado.',
        evidence: {
          expected_slot: slot.toISOString(),
          settings,
          recent_rounds: recent,
        },
        confidence: settingsUpdated ? 0.65 : 0.9,
      };
    },
  );
  await check(
    'captador_queue',
    'Nenhuma reserva permanece presa por mais de 90 minutos.',
    async () => {
      const { count, error } = await ctx.readDb
        .from('bot_captures')
        .select('id', { head: true, count: 'exact' })
        .eq('account_id', ctx.accountId)
        .eq('status', 'RESERVED')
        .lt('reserved_at', new Date(Date.now() - 90 * 60000).toISOString());
      if (error || count == null) throw error || Error();
      return {
        status: count ? 'fail' : 'ok',
        observed: `${count} reservas acima da janela.`,
        evidence: { count },
      };
    },
  );
  await check(
    'marketing_queue',
    'Publicações agendadas não atrasam mais de duas horas.',
    async () => {
      const profiles = await rows(
        ctx.readDb
          .from('profiles')
          .select('user_id')
          .eq('account_id', ctx.accountId),
      );
      const ids = profiles.map((p) => p.user_id).filter(Boolean);
      if (!ids.length)
        return {
          status: 'unknown',
          observed: 'Não há vínculo verificável com a fila de publicações.',
        };
      const posts = await rows(
        ctx.readDb
          .from('marketing_posts')
          .select('id,status,scheduled_at,retry_count')
          .in('created_by', ids)
          .in('status', ['scheduled', 'publishing', 'failed'])
          .lt('scheduled_at', new Date(Date.now() - 7200000).toISOString())
          .limit(20),
      );
      return {
        status: posts.length ? 'fail' : 'ok',
        observed: posts.length
          ? `${posts.length} publicações atrasadas ou com falha (até 20).`
          : 'Nenhuma publicação atrasada encontrada.',
        evidence: { posts },
      };
    },
  );
  if (ctx.crmAccountId) {
    await check(
      'crm_automations',
      'Nenhuma execução pendente está atrasada mais de duas horas.',
      async () => {
        const pending = await rows(
          ctx.db
            .from('automation_pending_executions')
            .select('id,status,run_at')
            .eq('account_id', ctx.crmAccountId)
            .eq('status', 'pending')
            .lt('run_at', new Date(Date.now() - 7200000).toISOString())
            .limit(20),
        );
        return {
          status: pending.length ? 'fail' : 'ok',
          observed: `${pending.length} execuções atrasadas (até 20).`,
          evidence: { pending },
        };
      },
    );
  }
  const origin = ctx.env.APP_ORIGIN || 'https://ronaldomeira.com.br';
  await check('app_http', 'Página principal acessível via HTTPS.', async () => {
    const { text: _text, ...result } = await probe(origin + '/');
    return result;
  });
  await check(
    'match_api',
    'API exige autenticação para requisição anônima.',
    async () => {
      const { text: _text, ...result } = await probe(
        origin + '/api/matches',
        [401],
      );
      return result;
    },
  );
  if (deep) {
    await check(
      'pwa_manifest',
      'Manifesto válido com modo standalone e ícones.',
      async () => {
        const result = await probe(origin + '/manifest.json');
        const manifest = JSON.parse(result.text || '{}');
        return {
          status:
            result.status === 'ok' &&
            manifest.display === 'standalone' &&
            manifest.icons?.length
              ? 'ok'
              : 'fail',
          observed: 'Inspeção do manifesto PWA.',
          evidence: {
            display: manifest.display,
            icons: manifest.icons?.length || 0,
          },
        };
      },
    );
    await check(
      'pwa_push_worker',
      'Service Worker acessível com handlers de push e clique.',
      async () => {
        const result = await probe(origin + '/sw.js');
        return {
          status:
            result.status === 'ok' &&
            result.text.includes("addEventListener('push'") &&
            result.text.includes("addEventListener('notificationclick'")
              ? 'ok'
              : 'fail',
          observed:
            'Verificação estática do Service Worker; entrega no aparelho não é simulada.',
        };
      },
    );
    await check(
      'frontend_assets',
      'Recursos locais de JavaScript e CSS acessíveis.',
      async () => {
        const page = await probe(origin + '/');
        if (page.status !== 'ok')
          return { status: 'fail', observed: page.observed };
        const paths = [
          ...new Set(
            [
              ...page.text.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g),
            ].map((m) => m[1]),
          ),
        ].slice(0, 8);
        if (!paths.length)
          return {
            status: 'unknown',
            observed: 'Nenhum recurso local identificado no documento.',
          };
        const evidence = await Promise.all(
          paths.map(async (path) => {
            const { text: _text, ...result } = await probe(origin + path);
            return { path, ...result };
          }),
        );
        return {
          status: evidence.every((e) => e.status === 'ok') ? 'ok' : 'fail',
          observed: `${evidence.length} recursos verificados.`,
          evidence,
        };
      },
    );
  }
  return {
    inspected_at: new Date().toISOString(),
    depth: deep ? 'deep' : 'light',
    checks,
    coverage_gaps: [
      'VM/Chrome/9222 observados apenas por telemetria; sem controle remoto.',
      'Botões, formulários e layout exigem um navegador sintético autenticado; não cobertos por HTTP.',
      'Logs privados da Vercel, crons externos e serviços sem credenciais não foram consultados.',
      ...(!ctx.crmAccountId
        ? ['CRM externo sem mapeamento de conta autorizado.']
        : []),
    ],
  };
}

export async function inspectSystem(
  ctx,
  bot,
  { deep = false, trigger = 'inspection' } = {},
) {
  const insertedRun = await ctx.db
    .from('agent_runs')
    .insert({
      account_id: ctx.accountId,
      bot_id: bot.id,
      trigger_type: trigger,
    })
    .select()
    .single();
  if (insertedRun.error?.code === '23505')
    throw new AgentError(
      'O Sentinela já está trabalhando. Aguarde a conclusão.',
      409,
    );
  const run = await rows(insertedRun);
  try {
    const result = await collectHealth(ctx, deep);
    for (const check of result.checks) {
      const fingerprint = `health:${check.component}`;
      const existing = await rows(
        ctx.db
          .from('agent_incidents')
          .select('*')
          .eq('account_id', ctx.accountId)
          .eq('fingerprint', fingerprint)
          .eq('status', 'open')
          .maybeSingle(),
      );
      if (check.status === 'ok' || check.status === 'skipped') {
        if (existing)
          await rows(
            ctx.db
              .from('agent_incidents')
              .update({ status: 'resolved', resolved_at: result.inspected_at })
              .eq('account_id', ctx.accountId)
              .eq('id', existing.id),
          );
        continue;
      }
      const dossier = {
        evidence: check.evidence || { observed: check.observed },
        hypothesis:
          'A evidência exige investigação de disponibilidade, configuração ou execução; a causa raiz ainda não está confirmada.',
        alternative_hypotheses: [
          'Telemetria incompleta',
          'Indisponibilidade transitória',
        ],
        suggested_fix: 'Investigar as evidências antes de propor alteração.',
        risk: 'Nenhuma modificação operacional autorizada.',
        required_tests: [
          'Repetir consulta de leitura',
          'Comparar horários e registros',
        ],
        related_services: [check.component],
        related_files: [],
        execution_allowed: false,
      };
      if (existing) {
        await rows(
          ctx.db
            .from('agent_incidents')
            .update({
              last_seen_at: result.inspected_at,
              observed: check.observed,
              dossier,
            })
            .eq('account_id', ctx.accountId)
            .eq('id', existing.id),
        );
      } else {
        const inserted = await ctx.db
          .from('agent_incidents')
          .insert({
            account_id: ctx.accountId,
            bot_id: bot.id,
            run_id: run.id,
            fingerprint,
            component: check.component,
            expected: check.expected,
            observed: check.observed,
            impact: check.status === 'unknown' ? 'low' : 'medium',
            confidence:
              check.confidence ?? (check.status === 'unknown' ? 0.4 : 0.8),
            dossier,
          })
          .select()
          .single();
        if (inserted.error?.code === '23505') continue;
        if (inserted.error) throw inserted.error;
        const incident = inserted.data;
        await rows(
          ctx.db
            .from('agent_approvals')
            .insert({
              account_id: ctx.accountId,
              bot_id: bot.id,
              action: 'investigate_incident',
              reason: `Investigar ${check.component} sem modificar produção.`,
              context: { incident_id: incident.id },
            }),
        );
        await event(ctx, bot.id, run.id, 'incident_opened', {
          incident_id: incident.id,
          component: check.component,
        });
        await ctx.notify(bot, 'incident', {
          title: 'Bot Sentinela: atenção necessária',
          body: check.observed,
          url: `/central-de-bots?bot=sentinela&incident=${incident.id}`,
          tag: `agent-incident-${incident.id}`,
        });
      }
    }
    await rows(
      ctx.db
        .from('agent_runs')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString(),
          result,
        })
        .eq('account_id', ctx.accountId)
        .eq('id', run.id),
    );
    await event(ctx, bot.id, run.id, 'inspection_completed', {
      depth: result.depth,
      checks: result.checks.length,
      anomalies: result.checks.filter((c) =>
        ['fail', 'unknown'].includes(c.status),
      ).length,
    });
    return { run_id: run.id, ...result };
  } catch (error) {
    await ctx.db
      .from('agent_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: 'Inspeção não concluída.',
      })
      .eq('account_id', ctx.accountId)
      .eq('id', run.id);
    throw error;
  }
}

export { maintenanceDossier };

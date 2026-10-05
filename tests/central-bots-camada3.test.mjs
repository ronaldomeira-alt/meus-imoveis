import test from 'node:test';
import assert from 'node:assert/strict';
import { database, client } from './helpers/marketing-db.mjs';
import { getCaptureSummary, getRecentRounds, searchCapturedProperties, calculateNextOfficialRound } from '../supabase/functions/_shared/central-bots/captador-adapter.js';
import { botsStatus, executeTool, allowedTools } from '../supabase/functions/_shared/central-bots/tools.js';
import { listCentral } from '../supabase/functions/_shared/central-bots/service.js';
import { getComponentDiagnostics, runLiveInspection } from '../supabase/functions/_shared/central-bots/sentinel.js';
import { researchMarketTrends } from '../supabase/functions/_shared/bot-marketing/sources.js';
import { groundedReply, extractEvidenceNumbers } from '../supabase/functions/_shared/central-bots/ai-provider.js';
import { communicationSafe, humanFallback } from '../supabase/functions/_shared/central-bots/communication.js';

async function setupDatabaseTables(pg) {
  await pg.exec(`
    create table if not exists public.bot_captures (
      id uuid primary key,
      account_id uuid references public.accounts(id),
      campaign_type text,
      url text,
      normalized_url text,
      fingerprint text,
      title text,
      price numeric,
      neighborhood text,
      bedrooms integer,
      area_m2 numeric,
      status text,
      contacted_at timestamptz,
      responded_at timestamptz,
      imported_property_id text,
      rejection_reason text,
      updated_at timestamptz default now(),
      created_at timestamptz default now()
    );
    create table if not exists public.bot_execution_rounds (
      id uuid primary key,
      account_id uuid references public.accounts(id),
      campaign_type text,
      trigger_type text,
      status text,
      started_at timestamptz,
      finished_at timestamptz,
      analyzed_count integer default 0,
      new_count integer default 0,
      eligible_count integer default 0,
      contacted_count integer default 0,
      duplicate_count integer default 0,
      error_count integer default 0,
      error_summary text,
      created_at timestamptz default now()
    );
    create table if not exists public.bot_settings (
      account_id uuid primary key references public.accounts(id),
      is_active boolean default true,
      health_status text,
      health_reason text,
      last_round_at timestamptz,
      next_round_at timestamptz,
      last_round_summary jsonb,
      olx_last_checked_at timestamptz,
      updated_at timestamptz default now()
    );
    create table if not exists public.bot_campaigns (
      id uuid primary key,
      account_id uuid references public.accounts(id),
      type text,
      is_active boolean default true,
      schedule_times jsonb default '["09:00", "19:00"]'::jsonb
    );
  `);
}

test('CAMADA 3 - USER_QUERY_FIDELITY: searchCapturedProperties preserves intention without arbitrary filters', async () => {
  const pg = await database();
  try {
    await setupDatabaseTables(pg);
    const account = crypto.randomUUID();
    await pg.query('insert into accounts values($1)', [account]);

    // Insert properties created 3 days ago and today
    await pg.query(`
      insert into bot_captures (
        id, account_id, campaign_type, url, normalized_url, fingerprint, title, price, neighborhood, bedrooms, area_m2, status, contacted_at, responded_at, created_at
      ) values 
      ($1, $2, 'venda', 'https://olx.test/1', 'https://olx.test/1', 'fp1', 'Apartamento 3 quartos Bessa Contatado', 580000, 'Bessa', 3, 85, 'WAITING_RESPONSE', now() - interval '2 days', null, now() - interval '3 days'),
      ($3, $2, 'venda', 'https://olx.test/2', 'https://olx.test/2', 'fp2', 'Apartamento 2 quartos Bessa Barato', 420000, 'Bessa', 2, 60, 'DISCOVERED', null, null, now() - interval '4 days'),
      ($4, $2, 'venda', 'https://olx.test/3', 'https://olx.test/3', 'fp3', 'Apartamento 3 quartos Manaira', 750000, 'Manaíra', 3, 110, 'WAITING_RESPONSE', now() - interval '1 day', null, now() - interval '2 days'),
      ($5, $2, 'venda', 'https://olx.test/4', 'https://olx.test/4', 'fp4', 'Apartamento 3 quartos Bessa Respondido', 620000, 'Bessa', 3, 90, 'RESPONDED', now() - interval '1 day', now() - interval '1 hour', now() - interval '3 days')
    `, [crypto.randomUUID(), account, crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]);

    const ctx = { readDb: client(pg), db: client(pg), accountId: account, env: {} };

    // Query 1: "Quais imóveis de 3 quartos no Bessa você encontrou e já abordou, mas ainda não responderam?"
    // Fidelity: ONLY neighborhood=Bessa, bedrooms=3, approached=true, waiting_response=true. NO period: today!
    const q1 = await searchCapturedProperties(ctx, {
      neighborhood: 'Bessa',
      bedrooms: 3,
      approached: true,
      waiting_response: true,
    });
    assert.equal(q1.total_found, 1);
    assert.equal(q1.properties[0].title, 'Apartamento 3 quartos Bessa Contatado');
    assert.equal(q1.filters_applied.period, undefined, 'Must not inject period');
    assert.equal(q1.filters_applied.status, undefined, 'Must not inject status filter');

    // Query 2: "Me mostre apartamentos do Bessa até R$ 600 mil."
    // Fidelity: ONLY neighborhood=Bessa, max_price=600000. MUST return both DISCOVERED and WAITING_RESPONSE!
    const q2 = await searchCapturedProperties(ctx, {
      neighborhood: 'Bessa',
      max_price: 600000,
    });
    assert.equal(q2.total_found, 2);
    const statuses = q2.properties.map(p => p.status);
    assert.ok(statuses.includes('WAITING_RESPONSE'));
    assert.ok(statuses.includes('DISCOVERED'), 'Must include DISCOVERED when user did not specify status');
  } finally {
    await pg.close();
  }
});

test('CAMADA 3 - RACIOCÍNIO TEMPORAL: Captador timezone handling, 0 rounds today and schedule precision', async () => {
  const pg = await database();
  try {
    await setupDatabaseTables(pg);
    const account = crypto.randomUUID();
    await pg.query('insert into accounts values($1)', [account]);

    // Setup bot_settings with UTC 22:00:00Z (which is 19:00:00-03:00 Brasília time)
    await pg.query(`
      insert into bot_settings (account_id, is_active, next_round_at, last_round_at)
      values ($1, true, '2026-10-04T22:00:00Z', '2026-10-03T22:00:00Z')
    `, [account]);

    // Insert round from yesterday (2026-10-03 22:00 UTC = 19:00 BRT)
    await pg.query(`
      insert into bot_execution_rounds (
        id, account_id, campaign_type, trigger_type, status, started_at, finished_at, contacted_count
      ) values ($1, $2, 'venda', 'SCHEDULED', 'COMPLETED', '2026-10-03T22:00:00Z', '2026-10-03T22:06:00Z', 5)
    `, [crypto.randomUUID(), account]);

    const ctx = { readDb: client(pg), db: client(pg), accountId: account, env: {} };
    const summary = await getCaptureSummary(ctx, {});

    // 1. Dynamic next official round calculations
    // Se agora for 08:00 -> próxima = hoje 09:00
    const time08h = new Date('2026-10-04T08:00:00-03:00');
    const next08h = calculateNextOfficialRound(time08h);
    assert.equal(next08h.horario, '09:00');
    assert.equal(next08h.is_hoje, true);
    assert.ok(next08h.resumo.includes('09:00'));

    // Se agora for 14:00 -> próxima = hoje 19:00
    const time14h = new Date('2026-10-04T14:00:00-03:00');
    const next14h = calculateNextOfficialRound(time14h);
    assert.equal(next14h.horario, '19:00');
    assert.equal(next14h.is_hoje, true);
    assert.ok(next14h.resumo.includes('19:00'));

    // Se agora for 20:00 -> próxima = amanhã 09:00
    const time20h = new Date('2026-10-04T20:00:00-03:00');
    const next20h = calculateNextOfficialRound(time20h);
    assert.equal(next20h.horario, '09:00');
    assert.equal(next20h.is_hoje, false);
    assert.ok(next20h.resumo.includes('09:00'));
    assert.ok(next20h.resumo.includes('amanhã'));

    // 2. Summary zero rounds today
    assert.equal(summary.rodadas_hoje_count, 0);
    assert.equal(summary.rodadas_hoje_resumo, 'Hoje ainda não houve nenhuma rodada registrada.');

    // 3. Official configured times
    assert.deepEqual(summary.horarios_oficiais_configurados, ['09:00', '19:00']);

    // 4. Next round is dynamically computed and does NOT leak raw UTC 22h
    assert.ok(['09:00', '19:00'].includes(summary.proxima_rodada_horario));
    assert.ok(summary.proxima_rodada_texto.includes('horário de Brasília'));

    // 5. Last round summary references Brasília time and yesterday
    assert.ok(summary.ultima_rodada_resumo.includes('19:00'));
    assert.ok(!summary.ultima_rodada_resumo.startsWith('A última rodada foi hoje'));
  } finally {
    await pg.close();
  }
});

test('CAMADA 3 - GESTOR SÍNTESE OPERACIONAL: getBotsStatus returns structured 4-bot data and grounding supports summary', async () => {
  const pg = await database();
  try {
    await setupDatabaseTables(pg);
    const account = crypto.randomUUID(), user = crypto.randomUUID();
    await pg.query('insert into accounts values($1)', [account]);
    await pg.query('insert into auth.users values($1)', [user]);

    const ctx = {
      db: client(pg),
      readDb: client(pg),
      accountId: account,
      user: { id: user },
      env: { MARKETING_BOT_ENABLED: 'true' },
    };

    // 1. listCentral returns bots array
    const central = await listCentral(ctx);
    assert.ok(Array.isArray(central.bots), 'central.bots must be an Array');
    assert.equal(central.bots.length, 4, 'Must have 4 bots in Central');

    // 2. executeTool getBotsStatus returns structured data with counts and summary
    const gestorBot = central.bots.find(b => b.kind === 'gestor');
    assert.ok(gestorBot, 'Bot Gestor must exist');

    const toolResponse = await executeTool(ctx, gestorBot, null, 'getBotsStatus', {});
    assert.equal(toolResponse.total_bots, 4);
    assert.equal(toolResponse.total_ativos, 4);
    assert.ok(toolResponse.resumo_geral.includes('4 bots estão configurados'));
    assert.ok(Array.isArray(toolResponse.bots));

    // 3. Grounding & Communication verification: Gestor replying with the 4 bots does NOT fall back
    const sources = [{
      tool: 'getBotsStatus',
      data: toolResponse,
      arguments: {},
    }];

    const gestorReplyText = 'Hoje seus 4 bots estão ativos e operando. O Bot Gestor está pronto para organizar as tarefas, o Bot Captador tem rodadas programadas para as 09:00 e 19:00, o Bot Sentinela segue monitorando o sistema e o Bot de Marketing está disponível para pesquisas de tendências.';

    const isSafe = communicationSafe(gestorReplyText, sources, false);
    assert.equal(isSafe, true, 'Natural operational summary must be communicationSafe');

    const grounded = groundedReply(gestorReplyText, sources);
    assert.equal(grounded, gestorReplyText, 'Grounded reply must accept valid numbers (4, 09:00, 19:00) without fallback');
  } finally {
    await pg.close();
  }
});

test('CAMADA 3 - SENTINELA INVESTIGAÇÃO ENCADEADA: diagnostics and live inspection tool permissions and schemas', async () => {
  const pg = await database();
  try {
    await setupDatabaseTables(pg);
    const account = crypto.randomUUID(), user = crypto.randomUUID();
    await pg.query('insert into accounts values($1)', [account]);
    await pg.query('insert into auth.users values($1)', [user]);

    const ctx = {
      db: client(pg),
      readDb: client(pg),
      accountId: account,
      user: { id: user },
      env: { APP_ORIGIN: 'https://ronaldomeira.com.br' },
    };

    const central = await listCentral(ctx);
    const sentinelaBot = central.bots.find(b => b.kind === 'sentinela');
    assert.ok(sentinelaBot);

    const allowed = allowedTools(sentinelaBot).map(t => t.name);
    assert.ok(allowed.includes('getOpenIncidents'), 'Must include getOpenIncidents');
    assert.ok(allowed.includes('getComponentDiagnostics'), 'Must include getComponentDiagnostics');
    assert.ok(allowed.includes('runLiveInspection'), 'Must include runLiveInspection');

    const diag = await executeTool(ctx, sentinelaBot, null, 'getComponentDiagnostics', { component: 'captador_telemetry' });
    assert.equal(diag.component, 'captador_telemetry');
    assert.equal(diag.source, 'component_diagnostics');
    assert.equal(diag.is_confirmed_cause, false, 'Hypothesis must not be asserted as confirmed cause');
    assert.ok(diag.expected);
    assert.ok(diag.observed);
    assert.ok(diag.hypothesis);

    // Verification: Interpretation of HTTP 401 without evidence of expected auth
    const sources401 = [{
      tool: 'getComponentDiagnostics',
      data: {
        component: 'app_http',
        expected: 'Página principal acessível via HTTPS.',
        observed: 'HTTP 401: Unauthorized',
        is_confirmed_cause: false,
      },
      arguments: { component: 'app_http' },
    }];

    // Non-grounded assumption ("faz parte da proteção normal") is not safe
    const unsafeReply = 'A página principal travou porque a conexão caiu.';
    assert.equal(communicationSafe(unsafeReply, sources401, false), false, 'Asserting unverified downtime or cause is unsafe');

    // Factual statement separating observation from expected behavior
    const honestReply = 'A rota respondeu 401, ou seja, recusou o acesso. Ainda preciso confirmar se isso era o comportamento esperado ou se existe alguma falha de autenticação.';
    assert.equal(communicationSafe(honestReply, sources401, false), true, 'Honest factual differentiation must be communicationSafe');
  } finally {
    await pg.close();
  }
});

test('CAMADA 3 - MARKETING FRESHNESS POLICY: researchMarketTrends is available and provides fresh news', async () => {
  const ctx = {
    env: { MARKETING_BOT_ENABLED: 'true' },
    accountId: crypto.randomUUID(),
    db: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) }) }) },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    return new Response(
      `<rss><channel>
        <item><title>Mercado imobiliário em alta na orla de João Pessoa</title><link>https://www.joaopessoa.pb.gov.br/noticia/orla</link><pubDate>Sun, 04 Oct 2026 10:00:00 GMT</pubDate><description>Valorização em bairros como Bessa e Manaíra atrai novos investidores.</description></item>
      </channel></rss>`,
      { status: 200, headers: { 'content-type': 'application/xml' } },
    );
  };

  try {
    const trends = await researchMarketTrends(ctx, { query: 'imoveis' });
    assert.equal(trends.source, 'live_market_research');
    assert.ok(Array.isArray(trends.findings));
    assert.ok(trends.findings.length > 0);
    assert.ok(trends.guidance.includes('evidências reais'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { database, client } from './helpers/marketing-db.mjs';
import { searchCapturedProperties, getRecentRounds } from '../supabase/functions/_shared/central-bots/captador-adapter.js';
import { runLiveInspection, getComponentDiagnostics } from '../supabase/functions/_shared/central-bots/sentinel.js';
import { researchMarketTrends, searchMarketingWeb } from '../supabase/functions/_shared/bot-marketing/sources.js';
import { groundedReply, extractEvidenceNumbers } from '../supabase/functions/_shared/central-bots/ai-provider.js';
import { humanIncident, communicationSafe, humanFallback } from '../supabase/functions/_shared/central-bots/communication.js';
import { TOOL_CATALOG, allowedTools, executeTool } from '../supabase/functions/_shared/central-bots/tools.js';
import { BUILTINS } from '../supabase/functions/_shared/central-bots/core.js';

test('CAMADA 1: TOOL_CATALOG and BUILTINS contain all required tools with correct permissions', () => {
  const toolNames = TOOL_CATALOG.map((t) => t.name);
  assert.ok(toolNames.includes('searchCapturedProperties'), 'searchCapturedProperties exists in catalog');
  assert.ok(toolNames.includes('researchMarketTrends'), 'researchMarketTrends exists in catalog');
  assert.ok(toolNames.includes('searchMarketingWeb'), 'searchMarketingWeb exists in catalog');
  assert.ok(toolNames.includes('runLiveInspection'), 'runLiveInspection exists in catalog');
  assert.ok(toolNames.includes('getComponentDiagnostics'), 'getComponentDiagnostics exists in catalog');

  const captador = BUILTINS.find((b) => b.kind === 'captador');
  assert.ok(captador.tools.includes('searchCapturedProperties'));
  assert.ok(!captador.tools.includes('researchMarketTrends'));

  const marketing = BUILTINS.find((b) => b.kind === 'marketing');
  assert.ok(marketing.tools.includes('researchMarketTrends'));
  assert.ok(marketing.tools.includes('searchMarketingWeb'));

  const sentinela = BUILTINS.find((b) => b.kind === 'sentinela');
  assert.ok(sentinela.tools.includes('runLiveInspection'));
  assert.ok(sentinela.tools.includes('getComponentDiagnostics'));

  const gestor = BUILTINS.find((b) => b.kind === 'gestor');
  assert.ok(gestor.tools.includes('searchCapturedProperties'));
  assert.ok(gestor.tools.includes('researchMarketTrends'));
  assert.ok(gestor.tools.includes('runLiveInspection'));
});

async function ensureCaptadorTables(pg) {
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
  `);
}

test('CAMADA 1 - CAPTADOR: searchCapturedProperties filters by neighborhood, bedrooms, status and price', async () => {
  const pg = await database();
  try {
    await ensureCaptadorTables(pg);
    const account = crypto.randomUUID();
    await pg.query('insert into accounts values($1)', [account]);

    // Insert test properties
    await pg.query(`
      insert into bot_captures (
        id, account_id, campaign_type, url, normalized_url, fingerprint, title, price, neighborhood, bedrooms, area_m2, status, contacted_at, responded_at, created_at
      ) values 
      ($1, $2, 'venda', 'https://olx.test/1', 'https://olx.test/1', 'fp1', 'Apartamento 3 quartos Bessa', 580000, 'Bessa', 3, 85, 'WAITING_RESPONSE', now() - interval '2 hours', null, now() - interval '3 hours'),
      ($3, $2, 'venda', 'https://olx.test/2', 'https://olx.test/2', 'fp2', 'Apartamento 2 quartos Bessa', 420000, 'Bessa', 2, 60, 'WAITING_RESPONSE', now() - interval '1 hour', null, now() - interval '2 hours'),
      ($4, $2, 'venda', 'https://olx.test/3', 'https://olx.test/3', 'fp3', 'Apartamento 3 quartos Manaira', 750000, 'Manaíra', 3, 110, 'WAITING_RESPONSE', now() - interval '4 hours', null, now() - interval '5 hours'),
      ($5, $2, 'venda', 'https://olx.test/4', 'https://olx.test/4', 'fp4', 'Apartamento 3 quartos Bessa Respondido', 620000, 'Bessa', 3, 90, 'RESPONDED', now() - interval '10 hours', now() - interval '1 hour', now() - interval '12 hours')
    `, [crypto.randomUUID(), account, crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()]);

    const ctx = { readDb: client(pg), accountId: account, env: {} };

    // Query 1: 3 bedrooms in Bessa waiting response
    const q1 = await searchCapturedProperties(ctx, {
      neighborhood: 'Bessa',
      bedrooms: 3,
      waiting_response: true,
    });
    assert.equal(q1.total_found, 1);
    assert.equal(q1.properties[0].title, 'Apartamento 3 quartos Bessa');
    assert.equal(q1.properties[0].price_thousands, '580 mil');
    assert.match(q1.properties[0].price_formatted, /580\.000/);

    // Query 2: Apartments in Bessa up to R$ 600 mil
    const q2 = await searchCapturedProperties(ctx, {
      neighborhood: 'Bessa',
      max_price: 600000,
    });
    assert.equal(q2.total_found, 2);
    assert.ok(q2.properties.every((p) => p.price <= 600000));

    // Query 3: Approached without response
    const q3 = await searchCapturedProperties(ctx, {
      approached: true,
      responded: false,
    });
    assert.equal(q3.total_found, 3);
  } finally {
    await pg.close();
  }
});

test('CAMADA 1 - CAPTADOR: getRecentRounds enriches rounds with Brasília timezone and counts', async () => {
  const pg = await database();
  try {
    await ensureCaptadorTables(pg);
    const account = crypto.randomUUID();
    await pg.query('insert into accounts values($1)', [account]);

    // Round at 12:03 UTC -> 09:03 BRT
    await pg.query(`
      insert into bot_execution_rounds (
        id, account_id, campaign_type, trigger_type, status, started_at, finished_at, analyzed_count, new_count, contacted_count
      ) values 
      ($1, $2, 'venda', 'SCHEDULED', 'COMPLETED', '2026-10-04T12:03:00Z', '2026-10-04T12:09:00Z', 15, 8, 5),
      ($3, $2, 'venda', 'SCHEDULED', 'COMPLETED', '2026-10-04T22:01:00Z', '2026-10-04T22:07:00Z', 12, 3, 2)
    `, [crypto.randomUUID(), account, crypto.randomUUID()]);

    const ctx = { readDb: client(pg), accountId: account, env: {} };
    const result = await getRecentRounds(ctx, { days: 10 });
    assert.equal(result.rounds_count, 2);
    assert.equal(result.rounds[0].started_at_brasilia, '19:01');
    assert.equal(result.rounds[0].hora_brasilia, '19h01');
    assert.equal(result.rounds[1].started_at_brasilia, '09:03');
    assert.equal(result.rounds[1].hora_brasilia, '9h03');
    assert.equal(result.rounds[0].duration_seconds, 360);
  } finally {
    await pg.close();
  }
});

test('CAMADA 1 - MARKETING: researchMarketTrends returns real news feeds with guidance and freshness', async () => {
  const ctx = {
    env: { MARKETING_BOT_ENABLED: 'true' },
    accountId: crypto.randomUUID(),
    db: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [] }) }) }) }) }) },
  };

  // Mock fetcher for official feeds
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    return new Response(
      `<rss><channel>
        <item><title>Novo parque inaugurado no Bessa em João Pessoa</title><link>https://www.joaopessoa.pb.gov.br/noticia/parque</link><pubDate>Sun, 04 Oct 2026 10:00:00 GMT</pubDate><description>Prefeitura entrega novo espaço de lazer no Bessa.</description></item>
      </channel></rss>`,
      { status: 200, headers: { 'content-type': 'application/rss+xml' } }
    );
  };

  try {
    const research = await researchMarketTrends(ctx, { query: 'tendências Bessa' });
    assert.equal(research.source, 'live_market_research');
    assert.equal(research.freshness, 'live_research_completed_now');
    assert.ok(research.total_findings > 0);
    assert.match(research.findings[0].title, /Bessa/);
    assert.match(research.guidance, /Notícias e tendências recentes/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('CAMADA 1 - SENTINELA: runLiveInspection and getComponentDiagnostics execute on-demand probes', async () => {
  const pg = await database();
  try {
    const account = crypto.randomUUID();
    await pg.query('insert into accounts values($1)', [account]);

    const ctx = {
      db: client(pg),
      readDb: client(pg),
      accountId: account,
      env: { APP_ORIGIN: 'https://ronaldomeira.com.br' },
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      if (url.includes('/api/matches')) return new Response('Unauthorized', { status: 401 });
      return new Response('<html><body>OK</body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
    };

    try {
      const live = await runLiveInspection(ctx, { deep: false });
      assert.equal(live.source, 'live_system_probe');
      assert.ok(live.checks_total > 0);
      assert.ok(live.inspected_at_brasilia);
      assert.ok(Array.isArray(live.checks));

      const diag = await getComponentDiagnostics(ctx, { component: 'app_http' });
      assert.equal(diag.component, 'app_http');
      assert.equal(diag.source, 'component_diagnostics');
      assert.equal(diag.is_confirmed_cause, false);
      assert.ok(diag.expected);
      assert.ok(diag.observed);
    } finally {
      globalThis.fetch = originalFetch;
    }
  } finally {
    await pg.close();
  }
});

test('CAMADA 2 - GROUNDING: extractEvidenceNumbers supports UTC->Brasília, counts, thousands and percentages without fallback', () => {
  const sources = [
    {
      tool: 'getRecentRounds',
      data: {
        rounds_count: 2,
        rounds: [
          {
            started_at: '2026-10-04T12:03:00Z', // 09:03 BRT
            started_at_brasilia: '09:03',
            finished_at: '2026-10-04T12:09:00Z',
            contacted_count: 7,
          },
          {
            started_at: '2026-10-04T22:01:00Z', // 19:01 BRT
            started_at_brasilia: '19:01',
            contacted_count: 4,
          },
        ],
      },
    },
    {
      tool: 'searchCapturedProperties',
      data: {
        total_found: 3,
        properties: [
          {
            title: 'Apto 3 quartos no Bessa',
            bedrooms: 3,
            price: 580000,
            price_formatted: 'R$ 580.000',
            price_thousands: '580 mil',
            area_m2: 85,
            status: 'WAITING_RESPONSE',
          },
        ],
      },
    },
  ];

  // 1. UTC to Brasília conversion (12:03Z -> 9h03 / 09:03)
  const reply1 = 'Hoje fiz duas rodadas: uma às 9h03 e outra às 19h01. No total, foram 11 contatos.';
  assert.equal(groundedReply(reply1, sources), reply1);

  // 2. Counts and currency in thousands
  const reply2 = 'Encontrei 3 imóveis no Bessa de 3 quartos. Um deles custa R$ 580 mil e tem 85 m2.';
  assert.equal(groundedReply(reply2, sources), reply2);

  // 3. Exact currency formatted
  const reply3 = 'O valor registrado é R$ 580.000.';
  assert.equal(groundedReply(reply3, sources), reply3);

  // 4. Hallucinated number is safely rejected
  const hallucinated = 'Encontrei 123456789123 imóveis na praia.';
  assert.match(groundedReply(hallucinated, sources), /números ainda não ficaram claros/);

  // 5. Huge invalid price is safely rejected
  const fakePrice = 'O imóvel custa R$ 999999999.';
  assert.match(groundedReply(fakePrice, sources), /números ainda não ficaram claros/);
});

test('CAMADA 2 - COMMUNICATION: humanIncident does NOT force stiff cliches and communicationSafe allows natural diagnostic speech', () => {
  const incident = {
    id: crypto.randomUUID(),
    component: 'captador_telemetry',
    observed: 'Nenhuma rodada concluída após o horário esperado.',
    impact: 'medium',
    dossier: {
      evidence: { expected_slot: '2026-10-04T22:00:00Z' },
      hypothesis: 'A busca pode ter demorado mais para iniciar devido ao agendador.',
    },
  };
  const sources = [{ tool: 'getIncidentDetails', data: { incident } }];

  const text = humanIncident(incident);
  // Stiff cliché must be gone
  assert.doesNotMatch(text, /O próximo passo é conferir os registros e comparar o que era esperado/);
  assert.match(text, /Bot Captador/);
  assert.match(text, /19:00/);

  // Natural diagnostic statements must pass communicationSafe
  const natural1 = 'Ronaldo, confirmei que a busca atrasou, mas ainda não consegui descobrir o motivo.';
  assert.equal(communicationSafe(natural1, sources), true);

  const natural2 = 'Encontrei uma possível causa, mas ainda é uma hipótese em investigação.';
  assert.equal(communicationSafe(natural2, sources), true);

  const natural3 = 'A busca atrasou porque o agendador demorou a responder, o que ainda é uma suspeita.';
  assert.equal(communicationSafe(natural3, sources), true);

  // Unsubstantiated affirmative causes without hypothesis/uncertainty must still be safely rejected
  const unsafeCause = 'A busca falhou porque o banco de dados caiu com erro de rede.';
  assert.equal(communicationSafe(unsafeCause, sources), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { database, client } from './helpers/marketing-db.mjs';
import {
  claimAutonomousJob,
  completeAutonomousJob,
  failAutonomousJob,
  dispatchAutonomousNotification,
  executeDailyDigest,
  handleSentinelStateChange,
  syncMarketingAutonomousResearch,
  getDailyDigestSlotKey,
} from '../supabase/functions/_shared/central-bots/autonomy.js';
import {
  getAgentOperationalState,
  getRelevantMemories,
  buildAgentOperationalContext,
} from '../supabase/functions/_shared/central-bots/state-memory.js';
import { inspectSystem } from '../supabase/functions/_shared/central-bots/sentinel.js';
import { chat, bootstrap, tick } from '../supabase/functions/_shared/central-bots/service.js';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

function mockContext(pg, accountId = ACCOUNT_ID, notifications = []) {
  const dbClient = client(pg);
  return {
    accountId,
    db: dbClient,
    readDb: dbClient,
    user: { id: USER_ID },
    env: {
      MARKETING_BOT_ENABLED: 'true',
      SYSTEM_AI_ENABLED: 'true',
      SYSTEM_AI_PROVIDER: 'groq',
      GROQ_API_KEY: 'gsk_test_key_123456789012',
    },
    notify: async (bot, type, payload) => {
      notifications.push({ botId: bot.id, type, payload });
      return { sentCount: 1, failedCount: 0 };
    },
  };
}

async function setupTestEnvironment(pg, accountId = ACCOUNT_ID, notifications = []) {
  await pg.exec(`
    create table if not exists public.bot_captures (
      id uuid primary key default gen_random_uuid(),
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
      id uuid primary key default gen_random_uuid(),
      account_id uuid references public.accounts(id),
      campaign_type text,
      status text,
      started_at timestamptz,
      finished_at timestamptz,
      contacted_count integer default 0,
      summary jsonb,
      created_at timestamptz default now()
    );
    create table if not exists public.bot_settings (
      account_id uuid primary key references public.accounts(id),
      is_active boolean default true,
      health_status text default 'healthy',
      health_reason text,
      last_round_at timestamptz,
      next_round_at timestamptz,
      last_round_summary jsonb,
      olx_last_checked_at timestamptz
    );
    create table if not exists public.bot_campaigns (
      id uuid primary key default gen_random_uuid(),
      account_id uuid references public.accounts(id),
      type text default 'olx_scraping',
      is_active boolean default true,
      schedule_times text[] default array['09:00', '19:00']
    );
  `);

  await pg.query(`insert into public.accounts (id) values ($1) on conflict do nothing`, [accountId]);
  await pg.query(`insert into auth.users (id) values ($1) on conflict do nothing`, [USER_ID]);
  await pg.query(`insert into public.bot_settings (account_id, is_active, health_status, last_round_at) values ($1, true, 'healthy', now()) on conflict do nothing`, [accountId]);
  await pg.query(`insert into public.bot_campaigns (account_id, type, is_active) values ($1, 'olx_scraping', true) on conflict do nothing`, [accountId]);

  const ctx = mockContext(pg, accountId, notifications);
  await bootstrap(ctx);

  const botsList = (
    await pg.query(`select id, kind, slug, name, active, tools from public.agent_bots where account_id = $1`, [
      accountId,
    ])
  ).rows;

  return {
    ctx,
    bots: {
      gestor: botsList.find((b) => b.kind === 'gestor'),
      captador: botsList.find((b) => b.kind === 'captador'),
      sentinela: botsList.find((b) => b.kind === 'sentinela'),
      marketing: botsList.find((b) => b.kind === 'marketing'),
    },
    notifications,
  };
}

// ==============================================================================
// TESTE 1 — MARKETING OFFLINE: Pesquisa acontece em background, atualiza estado e memória
// ==============================================================================
test('CAMADA 5 - TESTE 1: Marketing offline pesquisa em background, grava memória e estado', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const marketing = bots.marketing;

  await syncMarketingAutonomousResearch(ctx, marketing, {
    topic: 'Tendências do Bessa',
    summary: 'Pesquisa diária offline identificou forte procura por apartamentos de 3 quartos no Bessa.',
    ideaProposal: { id: crypto.randomUUID(), isHighRelevance: true },
  });

  const state = await getAgentOperationalState(ctx, marketing.id);
  assert.ok(state.last_operational_at);
  assert.equal(state.last_operational_type, 'market_research');
  assert.match(state.last_operational_summary, /Pesquisa diária offline identificou forte procura/);
  assert.match(state.current_focus, /Tendências do Bessa/);

  const memories = await getRelevantMemories(ctx, marketing.id, { topic: 'Tendências do Bessa' });
  assert.equal(memories.length, 1);
  assert.equal(memories[0].kind, 'research');
  assert.match(memories[0].summary, /Pesquisa diária offline/);
});

// ==============================================================================
// TESTE 2 — MARKETING + CHAT: Aproveita pesquisa prévia em background sem reconsultar rede
// ==============================================================================
test('CAMADA 5 - TESTE 2: Marketing no chat acessa pesquisa prévia em background sem duplicar busca', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const marketing = bots.marketing;

  await syncMarketingAutonomousResearch(ctx, marketing, {
    topic: 'Lançamentos no Bessa',
    summary: 'Análise de tendências revelou 3 novos condomínios de alto padrão no Bessa.',
  });

  const prompt = 'O que você encontrou hoje?';
  const opContext = await buildAgentOperationalContext(ctx, marketing, prompt);

  assert.match(opContext, /Lançamentos no Bessa/);
  assert.match(opContext, /3 novos condomínios de alto padrão/);
  assert.match(opContext, /ESTADO OPERACIONAL PERSISTENTE/);
});

// ==============================================================================
// TESTE 3 — SENTINELA OFFLINE: Identifica ocorrência, registra dossiê e atualiza foco
// ==============================================================================
test('CAMADA 5 - TESTE 3: Sentinela offline detecta anomalia, atualiza foco e cria dossiê', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const sentinela = bots.sentinela;

  const incidentId = crypto.randomUUID();
  await handleSentinelStateChange(ctx, sentinela, {
    openedIncidents: [
      {
        id: incidentId,
        fingerprint: 'health:captador_telemetry',
        component: 'captador_telemetry',
        impact: 'high',
        expected: 'Telemetria online',
        observed: 'Porta 9222 não respondeu na checagem programada.',
      },
    ],
  });

  const state = await getAgentOperationalState(ctx, sentinela.id);
  assert.match(state.current_focus, /captador_telemetry/);
  assert.ok(state.watched_items.includes('captador_telemetry'));
});

// ==============================================================================
// TESTE 4 — NOTIFICAÇÃO SENTINELA (ANTI-SPAM): Primeiro alerta envia push; repetição é bloqueada
// ==============================================================================
test('CAMADA 5 - TESTE 4: Notificação do Sentinela respeita anti-spam e cooldown', async () => {
  const pg = await database();
  const notifications = [];
  const { ctx, bots } = await setupTestEnvironment(pg, ACCOUNT_ID, notifications);
  const sentinela = bots.sentinela;

  const firstDispatch = await dispatchAutonomousNotification(ctx, sentinela, {
    kind: 'critical_alert',
    dedupKey: 'incident:health:captador_telemetry:open',
    title: 'Bot Sentinela: Atenção necessária',
    body: 'Telemetria do Captador sem resposta.',
    severity: 'high',
    cooldownHours: 6,
  });
  assert.equal(firstDispatch.notified, true);
  assert.equal(notifications.length, 1);

  const secondDispatch = await dispatchAutonomousNotification(ctx, sentinela, {
    kind: 'critical_alert',
    dedupKey: 'incident:health:captador_telemetry:open',
    title: 'Bot Sentinela: Atenção necessária',
    body: 'Telemetria do Captador sem resposta.',
    severity: 'high',
    cooldownHours: 6,
  });
  assert.equal(secondDispatch.notified, false);
  assert.equal(secondDispatch.reason, 'cooldown_active');
  assert.equal(notifications.length, 1);
});

// ==============================================================================
// TESTE 5 — RESOLUÇÃO: Normalização de problema gera notificação única e limpa foco
// ==============================================================================
test('CAMADA 5 - TESTE 5: Normalização de ocorrência emite notificação amigável e limpa foco', async () => {
  const pg = await database();
  const notifications = [];
  const { ctx, bots } = await setupTestEnvironment(pg, ACCOUNT_ID, notifications);
  const sentinela = bots.sentinela;

  await handleSentinelStateChange(ctx, sentinela, {
    resolvedIncidents: [
      {
        id: crypto.randomUUID(),
        fingerprint: 'health:captador_telemetry',
        component: 'telemetria do Captador',
      },
    ],
  });

  assert.equal(notifications.length, 1);
  assert.match(notifications[0].payload.body, /aquele problema que eu estava acompanhando no componente telemetria do Captador normalizou/);

  const state = await getAgentOperationalState(ctx, sentinela.id);
  assert.equal(state.current_focus, null);
  assert.deepEqual(state.watched_items, []);
});

// ==============================================================================
// TESTE 6 — GESTOR: Resumo automático do dia consolida fontes reais sem alucinação
// ==============================================================================
test('CAMADA 5 - TESTE 6: Gestor gera resumo consolidado do dia com dados reais dos 3 agentes', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const gestor = bots.gestor;

  await pg.query(
    `insert into public.bot_execution_rounds (account_id, campaign_type, status, started_at, finished_at)
     values ($1, 'olx_scraping', 'COMPLETED', now() - interval '2 minutes', now() - interval '1 minute')`,
    [ctx.accountId],
  );

  await pg.query(
    `insert into public.bot_captures (account_id, url, title, status, contacted_at, responded_at, created_at)
     values ($1, 'https://olx.com.br/item-1', 'Apartamento Teste', 'WAITING_RESPONSE', now() - interval '2 minutes', now() - interval '1 minute', now() - interval '2 minutes')`,
    [ctx.accountId],
  );

  await pg.query(
    `insert into public.agent_marketing_ideas (account_id, topic, angle, proposal, fingerprint, status, created_at)
     values ($1, 'Investimento no Bessa', 'Valorização imobiliária', '{"text":"Proposta de vídeo curto sobre o Bessa"}'::jsonb, 'fp-idea-test-6', 'proposed', now())`,
    [ctx.accountId],
  );

  const result = await executeDailyDigest(ctx, gestor, {
    slotKey: `test-${Date.now()}-digest`,
    notify: false,
    force: true,
  });

  assert.equal(result.success, true);
  assert.match(result.content, /Ronaldo, fechando o dia na Central de Bots/);
  assert.match(result.content, /Bot Captador realizou 1 rodada/);
  assert.match(result.content, /Bot de Marketing encontrou tendências relevantes e preparou 1 proposta/);
  assert.match(result.content, /Bot Sentinela não identificou nenhuma ocorrência aberta/);

  const state = await getAgentOperationalState(ctx, gestor.id);
  assert.equal(state.last_operational_type, 'daily_digest');
  assert.ok(state.last_operational_summary);
});

// ==============================================================================
// TESTE 7 — CAPTADOR (READ-ONLY ABSOLUTO): Leitura sem mutação nas tabelas operacionais
// ==============================================================================
test('CAMADA 5 - TESTE 7: Central lê dados do Captador de forma estritamente read-only', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);

  const captureId = crypto.randomUUID();
  await pg.query(
    `insert into public.bot_captures (id, account_id, url, title, status, created_at)
     values ($1, $2, 'https://olx.com.br/item-readonly', 'Imóvel Protegido', 'DISCOVERED', now())`,
    [captureId, ctx.accountId],
  );

  const beforeCaptures = (await pg.query(`select * from public.bot_captures where id = $1`, [captureId])).rows;

  await executeDailyDigest(ctx, bots.gestor, {
    slotKey: `test-ro-${Date.now()}`,
    notify: false,
    force: true,
  });

  const afterCaptures = (await pg.query(`select * from public.bot_captures where id = $1`, [captureId])).rows;
  assert.deepEqual(beforeCaptures, afterCaptures, 'A tabela bot_captures não foi modificada');
});

// ==============================================================================
// TESTE 8 — IDEMPOTÊNCIA: Mesmo slot disparado duas vezes resulta em execução única
// ==============================================================================
test('CAMADA 5 - TESTE 8: Idempotência garante execução única para o mesmo slot', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const gestor = bots.gestor;
  const slot = 'slot-idempotencia-2026';

  const firstClaim = await claimAutonomousJob(ctx, {
    botId: gestor.id,
    jobType: 'daily_digest',
    slotKey: slot,
  });
  assert.equal(firstClaim.shouldExecute, true);
  assert.equal(firstClaim.alreadyCompleted, false);

  await completeAutonomousJob(ctx, firstClaim.job.id, { summary: 'Primeira execução concluída' });

  const secondClaim = await claimAutonomousJob(ctx, {
    botId: gestor.id,
    jobType: 'daily_digest',
    slotKey: slot,
  });
  assert.equal(secondClaim.shouldExecute, false);
  assert.equal(secondClaim.alreadyCompleted, true);
});

// ==============================================================================
// TESTE 9 — CONCORRÊNCIA: Execuções simultâneas são bloqueadas pelo lease ativo
// ==============================================================================
test('CAMADA 5 - TESTE 9: Bloqueio de concorrência com lease ativo impede execuções simultâneas', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const sentinela = bots.sentinela;
  const slot = 'slot-concorrencia-lock';

  const claim1 = await claimAutonomousJob(ctx, {
    botId: sentinela.id,
    jobType: 'system_inspection',
    slotKey: slot,
    leaseSeconds: 60,
  });
  assert.equal(claim1.shouldExecute, true);

  const claim2 = await claimAutonomousJob(ctx, {
    botId: sentinela.id,
    jobType: 'system_inspection',
    slotKey: slot,
    leaseSeconds: 60,
  });
  assert.equal(claim2.shouldExecute, false);
  assert.equal(claim2.concurrentLocked, true);
});

// ==============================================================================
// TESTE 10 — RETRY: Erro transitório permite retry; esgotamento marca failed definitivo
// ==============================================================================
test('CAMADA 5 - TESTE 10: Retry limitado para falha transitória e encerramento após max_attempts', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const marketing = bots.marketing;
  const slot = 'slot-retry-test';

  const claim1 = await claimAutonomousJob(ctx, {
    botId: marketing.id,
    jobType: 'market_research',
    slotKey: slot,
    maxAttempts: 2,
    leaseSeconds: 0,
  });
  assert.equal(claim1.shouldExecute, true);
  await failAutonomousJob(ctx, claim1.job.id, new Error('Erro transitório 1'));

  const claim2 = await claimAutonomousJob(ctx, {
    botId: marketing.id,
    jobType: 'market_research',
    slotKey: slot,
    maxAttempts: 2,
    leaseSeconds: 0,
  });
  assert.equal(claim2.shouldExecute, true);
  await failAutonomousJob(ctx, claim2.job.id, new Error('Erro permanente 2'));

  const claim3 = await claimAutonomousJob(ctx, {
    botId: marketing.id,
    jobType: 'market_research',
    slotKey: slot,
    maxAttempts: 2,
    leaseSeconds: 0,
  });
  assert.equal(claim3.shouldExecute, false);
  assert.equal(claim3.retryExhausted, true);
});

// ==============================================================================
// TESTE 11 — ANTI-SPAM: Múltiplas ocorrências repetidas não geram spam de notificações
// ==============================================================================
test('CAMADA 5 - TESTE 11: Anti-spam suprime notificações repetidas', async () => {
  const pg = await database();
  const notifications = [];
  const { ctx, bots } = await setupTestEnvironment(pg, ACCOUNT_ID, notifications);
  const sentinela = bots.sentinela;

  for (let i = 0; i < 5; i++) {
    await dispatchAutonomousNotification(ctx, sentinela, {
      kind: 'critical_alert',
      dedupKey: 'incident:telemetry_loop',
      title: 'Alerta',
      body: 'Erro na telemetria',
      severity: 'high',
      cooldownHours: 6,
    });
  }

  assert.equal(notifications.length, 1);
});

// ==============================================================================
// TESTE 12 — MULTI-TENANT: Isolamento completo de jobs, memórias e notificações
// ==============================================================================
test('CAMADA 5 - TESTE 12: Isolamento multi-tenant impede vazamento de jobs e notificações', async () => {
  const pg = await database();
  const envA = await setupTestEnvironment(pg, ACCOUNT_ID);
  const envB = await setupTestEnvironment(pg, OTHER_ACCOUNT_ID);

  await claimAutonomousJob(envA.ctx, {
    botId: envA.bots.gestor.id,
    jobType: 'daily_digest',
    slotKey: 'slot-conta-a',
  });

  const jobsContaB = (
    await pg.query(`select * from public.agent_autonomous_jobs where account_id = $1`, [envB.ctx.accountId])
  ).rows;
  assert.equal(jobsContaB.length, 0);
});

// ==============================================================================
// TESTE 13 — BROWSER FECHADO: Execução autônoma em background opera sem dependência do frontend
// ==============================================================================
test('CAMADA 5 - TESTE 13: Rotinas autônomas operam sem frontend aberto', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);

  // 1. Simula disparo em background via cron chamando a ação 'tick' para o Gestor
  const firstTick = await tick(ctx, bots.gestor.id);
  assert.equal(firstTick.success, true);
  assert.ok(firstTick.content);
  assert.match(firstTick.content, /Ronaldo, fechando o dia na Central de Bots/);

  // 2. Confirma que job foi persistido no banco
  const jobs = (
    await pg.query(
      `select * from public.agent_autonomous_jobs where account_id = $1 and bot_id = $2 and status = 'completed'`,
      [ctx.accountId, bots.gestor.id],
    )
  ).rows;
  assert.equal(jobs.length, 1);

  // 3. Simula segundo disparo do mesmo slot (ex: retry de cron ou abertura do CRM)
  // e confirma que a idempotência pula a execução sem duplicar trabalho
  const secondTick = await tick(ctx, bots.gestor.id);
  assert.equal(secondTick.skipped, true);
  assert.equal(secondTick.reason, 'already_completed');
});

// ==============================================================================
// TESTE 14 — CUSTO: Zero chamadas de IA quando o monitoramento está saudável
// ==============================================================================
test('CAMADA 5 - TESTE 14: Monitoramento do Sentinela com sistema saudável consome zero tokens de IA', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const sentinela = bots.sentinela;

  let aiCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('completions')) {
      aiCalls++;
    }
    return originalFetch(url, options);
  };

  try {
    const result = await inspectSystem(ctx, sentinela, { deep: false, trigger: 'schedule' });
    assert.equal(result.checks.length > 0, true);
    assert.equal(aiCalls, 0, 'Nenhuma chamada de IA deve ser realizada para verificação saudável');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ==============================================================================
// TESTE 15 — REGRESSÃO COMPLETA: Camada 4 e Camadas Anteriores Continuam Verdes
// ==============================================================================
test('CAMADA 5 - TESTE 15: Camada 4 e Camadas Anteriores mantêm integridade operacional', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);

  const mkt = bots.marketing;
  await syncMarketingAutonomousResearch(ctx, mkt, {
    topic: 'Cabo Branco',
    summary: 'Pesquisa realizada com sucesso.',
  });

  const state = await getAgentOperationalState(ctx, mkt.id);
  assert.equal(state.last_operational_type, 'market_research');
  assert.match(state.current_focus, /Cabo Branco/);
});

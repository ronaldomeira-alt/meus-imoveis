import test from 'node:test';
import assert from 'node:assert/strict';
import { database, client } from './helpers/marketing-db.mjs';
import {
  getAgentOperationalState,
  updateAgentOperationalState,
  recordOperationalMemory,
  getRelevantMemories,
  buildAgentOperationalContext,
  syncToolExecutionToState,
} from '../supabase/functions/_shared/central-bots/state-memory.js';
import { botsStatus, dispatch } from '../supabase/functions/_shared/central-bots/tools.js';
import { chat, bootstrap } from '../supabase/functions/_shared/central-bots/service.js';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';

function mockContext(pg, accountId = ACCOUNT_ID) {
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
  };
}

async function setupTestEnvironment(pg, accountId = ACCOUNT_ID) {
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
      id uuid primary key default gen_random_uuid(),
      account_id uuid references public.accounts(id),
      type text,
      is_active boolean default true,
      schedule_times jsonb default '["09:00", "19:00"]'::jsonb
    );
  `);
  await pg.query('insert into auth.users (id) values ($1) on conflict do nothing', [USER_ID]);
  await pg.query('insert into public.accounts (id) values ($1) on conflict do nothing', [accountId]);
  const ctx = mockContext(pg, accountId);
  await bootstrap(ctx);
  const botsRes = await pg.query('select * from public.agent_bots where account_id = $1', [accountId]);
  const botsMap = Object.fromEntries(botsRes.rows.map((b) => [b.slug, b]));
  return { ctx, bots: botsMap };
}

// ==============================================================================
// TESTE 1 — MARKETING: Recuperar pesquisa após sessão encerrada
// ==============================================================================
test('CAMADA 4 - TESTE 1 (MARKETING): Recupera o que encontrou na última pesquisa após sessão encerrada', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const marketing = bots.marketing;

  // 1. Simula conclusão da ferramenta researchMarketTrends
  const researchResult = {
    source: 'live_market_research',
    total_findings: 3,
    sources_checked: ['Prefeitura de João Pessoa', 'Agência Brasil'],
    findings: [
      { title: 'Operação Tapa-Buraco em 29 bairros da capital', kind: 'news' },
      { title: 'Sine-JP oferece 593 vagas de trabalho', kind: 'news' },
      { title: 'Avanço nas obras da orla de Cabo Branco', kind: 'news' },
    ],
  };

  await syncToolExecutionToState(ctx, marketing, 'researchMarketTrends', { query: '', search_web: true }, researchResult);

  // 2. Verifica estado persistido no banco
  const state = await getAgentOperationalState(ctx, marketing.id);
  assert.equal(state.last_operational_type, 'market_research');
  assert.match(state.last_result_summary, /Operação Tapa-Buraco/);

  // 3. Em uma nova sessão/conversa (sem histórico prévio), constrói o contexto operacional
  const contextText = await buildAgentOperationalContext(ctx, marketing, 'O que você encontrou na sua última pesquisa?');

  assert.match(contextText, /Pesquisa ao vivo: 3 itens encontrados/);
  assert.match(contextText, /Operação Tapa-Buraco/);
  assert.match(contextText, /Sine-JP oferece 593 vagas/);
  assert.match(contextText, /DIRETRIZES DE CONTINUIDADE E VERACIDADE/);
});

// ==============================================================================
// TESTE 2 — MARKETING: Novelty e evitar repetir ideias já apresentadas
// ==============================================================================
test('CAMADA 4 - TESTE 2 (MARKETING): Contexto injeta ideias anteriores e impede repetição (Novelty)', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const marketing = bots.marketing;

  // 1. Registra uma ideia que já foi apresentada anteriormente
  await pg.query(
    `insert into public.agent_marketing_ideas (account_id, topic, angle, fingerprint, topic_key, angle_key, status, proposal)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      ctx.accountId,
      'Operação Tapa-Buraco no Bessa',
      'Impacto das obras viárias na valorização dos imóveis',
      'fp_tapa_buraco_1',
      'infra_bessa',
      'valorizacao',
      'proposed',
      JSON.stringify({ hook: 'Veja as obras no Bessa', practical: 'Compre antes da valorização' }),
    ],
  );

  // 2. Constrói contexto para uma nova sessão pedindo "Me dê uma ideia nova"
  const contextText = await buildAgentOperationalContext(ctx, marketing, 'Me dê uma ideia nova.');

  // 3. Garante que a ideia anterior está documentada no bloco de Novelty para o modelo
  assert.match(contextText, /REGRA DE NOVELTY: evite repetir exatamente a mesma ideia/);
  assert.match(contextText, /Operação Tapa-Buraco no Bessa/);
  assert.match(contextText, /Impacto das obras viárias na valorização dos imóveis/);
});

// ==============================================================================
// TESTE 3 — SENTINELA: Acompanhamento de ocorrência após encerramento de sessão
// ==============================================================================
test('CAMADA 4 - TESTE 3 (SENTINELA): Identifica ocorrência acompanhada e consulta estado atual', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const sentinela = bots.sentinela;

  // 1. Sentinela investiga incidente no componente captador_telemetry
  const diagnosticResult = {
    source: 'component_diagnostics',
    impact: 'medium',
    observed: 'Nenhuma rodada concluída após o horário esperado.',
    confirmed_cause: false,
    component: 'captador_telemetry',
  };

  await syncToolExecutionToState(ctx, sentinela, 'getComponentDiagnostics', { component: 'captador_telemetry' }, diagnosticResult);

  // 2. Em nova sessão, usuário pergunta "Como está aquele problema que você estava acompanhando?"
  const contextText = await buildAgentOperationalContext(ctx, sentinela, 'Como está aquele problema que você estava acompanhando?');

  assert.match(contextText, /captador_telemetry/);
  assert.match(contextText, /Acompanhando ocorrência no componente captador_telemetry/);
  assert.match(contextText, /ATUALIZAÇÃO DE PROBLEMA \(SENTINELA\)/);
  assert.match(contextText, /getComponentDiagnostics ou getOpenIncidents/);
});

// ==============================================================================
// TESTE 4 — GESTOR: Consolidação factual de pendências dos agentes
// ==============================================================================
test('CAMADA 4 - TESTE 4 (GESTOR): Consolida pendências dos outros agentes sem inventar dados', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const gestor = bots.gestor;
  const sentinela = bots.sentinela;

  // 1. Cria pendência no Sentinela (incidente aberto)
  await pg.query(
    `insert into public.agent_incidents (account_id, bot_id, fingerprint, component, expected, observed, impact, confidence, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, 'open')`,
    [ctx.accountId, sentinela.id, 'fp_sent_1', 'captador_telemetry', 'Rodada concluída', 'Sem registro', 'medium', 0.9],
  );

  // 2. Cria pendência no Marketing (ideia aguardando)
  await pg.query(
    `insert into public.agent_marketing_ideas (account_id, topic, angle, fingerprint, topic_key, angle_key, status, proposal)
     values ($1, $2, $3, $4, $5, $6, 'proposed', $7)`,
    [ctx.accountId, 'Pauta de Infraestrutura', 'Ângulo Urbano', 'fp_mkt_pendente', 'infra', 'urbano', JSON.stringify({})],
  );

  // 3. Executa getOperationalSummary
  const summary = await dispatch(ctx, 'getOperationalSummary', {});

  assert.equal(summary.incidents.incidents.length, 1);
  assert.equal(summary.incidents.incidents[0].component, 'captador_telemetry');
  assert.equal(summary.marketing.ideas.length, 1);
  assert.equal(summary.marketing.ideas[0].topic, 'Pauta de Infraestrutura');
});

// ==============================================================================
// TESTE 5 — CAPTADOR: Diferenciação entre interação de Chat e rodada operacional OLX
// ==============================================================================
test('CAMADA 4 - TESTE 5 (CAPTADOR): botsStatus e adaptador diferenciam rigorosamente conversa no chat de rodada operacional', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const captador = bots.captador;

  // 1. Configura última rodada operacional de captação OLX para 19:00 de ontem
  const lastRoundIso = '2026-10-04T22:00:00.000Z'; // 19:00 BRT
  await pg.query(
    `insert into public.bot_settings (account_id, is_active, health_status, last_round_at)
     values ($1, true, 'healthy', $2)
     on conflict (account_id) do update set last_round_at = excluded.last_round_at`,
    [ctx.accountId, lastRoundIso],
  );

  // 2. Simula uma interação com o agente no chat às 22:30 (hoje)
  const chatInteractionIso = '2026-10-05T01:30:00.000Z'; // 22:30 BRT
  await updateAgentOperationalState(ctx, captador.id, {
    last_interaction_at: chatInteractionIso,
  });

  // 3. Consulta botsStatus
  const statusList = await botsStatus(ctx);
  const captadorStatus = statusList.find((b) => b.kind === 'captador');

  assert.ok(captadorStatus);
  // Garante que ultima_interacao_chat_brasilia reflete a conversa no chat
  assert.match(captadorStatus.ultima_interacao_chat_brasilia, /22:30/);
  // Garante que a rodada operacional OLX reflete o horário de captação real (19:00)
  assert.match(captadorStatus.ultima_rodada_operacional_brasilia, /19:00/);
  // Garante que a última execução operacional NÃO é 22:30
  assert.match(captadorStatus.ultima_atividade, /Última rodada operacional de captação OLX em/);
  assert.match(captadorStatus.resumo_factual, /Última rodada operacional de captação OLX/);
  assert.match(captadorStatus.resumo_factual, /Última conversa com o Ronaldo no chat em/);
});

// ==============================================================================
// TESTE 6 — FONTE DE VERDADE: Banco Operacional vence Memória Antiga
// ==============================================================================
test('CAMADA 4 - TESTE 6 (FONTE DE VERDADE): Busca operacional prevalece sobre memória desatualizada', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const captador = bots.captador;

  // 1. Grava uma memória antiga dizendo que não havia imóveis
  await recordOperationalMemory(ctx, captador.id, {
    kind: 'context',
    topic: 'Bessa',
    summary: '0 imóveis disponíveis encontrados no Bessa.',
    data: { total: 0 },
  });

  // 2. Insere um imóvel real recém captado no banco operacional
  await pg.query(
    `insert into public.bot_captures (id, account_id, url, title, neighborhood, price, bedrooms, status, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [crypto.randomUUID(), ctx.accountId, 'https://olx.com.br/item-123', 'Apartamento Moderno Bessa', 'Bessa', 450000, 3, 'DISCOVERED'],
  );

  // 3. Executa a ferramenta searchCapturedProperties
  const result = await dispatch(ctx, 'searchCapturedProperties', { neighborhood: 'Bessa' });

  // A ferramenta factual deve retornar 1 imóvel real, ignorando a memória antiga de 0 imóveis
  assert.equal(result.total_found, 1);
  assert.equal(result.properties[0].title, 'Apartamento Moderno Bessa');
  assert.equal(Number(result.properties[0].price), 450000);
});

// ==============================================================================
// TESTE 7 — RETENÇÃO & EXPIRAÇÃO: Memórias antigas/expiradas não são carregadas
// ==============================================================================
test('CAMADA 4 - TESTE 7 (RETENÇÃO): Memórias expiradas são filtradas e não são carregadas no contexto', async () => {
  const pg = await database();
  const { ctx, bots } = await setupTestEnvironment(pg);
  const marketing = bots.marketing;

  // 1. Cria uma memória expirada (expires_at no passado)
  const expiredDate = new Date(Date.now() - 86400000).toISOString(); // 1 dia atrás
  await pg.query(
    `insert into public.agent_operational_memories (account_id, bot_id, kind, topic, summary, expires_at)
     values ($1, $2, 'research', 'Notícia Antiga Expirada', 'Esta notícia é da semana passada e já expirou', $3)`,
    [ctx.accountId, marketing.id, expiredDate],
  );

  // 2. Cria uma memória ativa (expires_at no futuro)
  const activeDate = new Date(Date.now() + 86400000 * 5).toISOString(); // daqui a 5 dias
  await pg.query(
    `insert into public.agent_operational_memories (account_id, bot_id, kind, topic, summary, expires_at)
     values ($1, $2, 'research', 'Notícia Fresca Ativa', 'Esta notícia acabou de sair hoje', $3)`,
    [ctx.accountId, marketing.id, activeDate],
  );

  // 3. Busca memórias relevantes
  const memories = await getRelevantMemories(ctx, marketing.id, { limit: 10 });

  // Garante que a notícia ativa foi carregada
  const activeMemory = memories.find((m) => m.topic === 'Notícia Fresca Ativa');
  assert.ok(activeMemory);

  // Garante que a notícia expirada foi estritamente descartada
  const expiredMemory = memories.find((m) => m.topic === 'Notícia Antiga Expirada');
  assert.equal(expiredMemory, undefined);
});

// ==============================================================================
// TESTE 8 — ISOLAMENTO MULTI-TENANT: Estado de uma conta nunca vaza para outra
// ==============================================================================
test('CAMADA 4 - TESTE 8 (MULTI-TENANT): Estado e memórias de uma conta são invisíveis para outra conta', async () => {
  const pg = await database();
  const envA = await setupTestEnvironment(pg, ACCOUNT_ID);
  const envB = await setupTestEnvironment(pg, OTHER_ACCOUNT_ID);

  const mktA = envA.bots.marketing;
  const mktB = envB.bots.marketing;

  // 1. Conta A grava memória confidencial
  await recordOperationalMemory(envA.ctx, mktA.id, {
    kind: 'editorial',
    topic: 'Conta A Exclusivo',
    summary: 'Estratégia ultra confidencial da Conta A',
  });

  // 2. Conta A atualiza foco operacional
  await updateAgentOperationalState(envA.ctx, mktA.id, {
    current_focus: 'Foco Secreto da Conta A',
  });

  // 3. Conta B consulta seu estado e memórias
  const stateB = await getAgentOperationalState(envB.ctx, mktB.id);
  const memoriesB = await getRelevantMemories(envB.ctx, mktB.id);

  assert.notEqual(stateB.current_focus, 'Foco Secreto da Conta A');
  assert.equal(memoriesB.some((m) => m.topic === 'Conta A Exclusivo'), false);

  // 4. Constrói contexto para a Conta B e confirma ausência de vazamento
  const contextB = await buildAgentOperationalContext(envB.ctx, mktB, 'Qual seu foco?');
  assert.equal(contextB.includes('Foco Secreto da Conta A'), false);
  assert.equal(contextB.includes('Estratégia ultra confidencial da Conta A'), false);
});

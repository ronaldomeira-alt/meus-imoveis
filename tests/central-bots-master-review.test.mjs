import test from 'node:test';
import assert from 'node:assert/strict';
import { database, client } from './helpers/marketing-db.mjs';
import {
  conversationRoute,
  parseRoute,
  capabilityPolicy,
  routeGuidance,
  isDirectRoute,
} from '../supabase/functions/_shared/central-bots/conversation.js';
import {
  chat,
  bootstrap,
} from '../supabase/functions/_shared/central-bots/service.js';
import {
  executeTool,
  botsStatus,
} from '../supabase/functions/_shared/central-bots/tools.js';
import {
  getAgentPreferences,
  updateAgentPreferences,
  rollbackAgentPreferences,
  buildAgentPreferencesContext,
} from '../supabase/functions/_shared/central-bots/preferences.js';
import {
  executeDailyDigest,
  executeMarketingEditorial,
  getDailyDigestSlotKey,
  getMarketingEditorialSlotKey,
  claimAutonomousJob,
} from '../supabase/functions/_shared/central-bots/autonomy.js';
import {
  recordOperationalMemory,
  buildAgentOperationalContext,
  updateAgentOperationalState,
} from '../supabase/functions/_shared/central-bots/state-memory.js';

const ACCOUNT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function mockContext(pg, accountId = ACCOUNT_ID) {
  const dbClient = client(pg);
  return {
    accountId,
    db: dbClient,
    readDb: dbClient,
    user: { id: USER_ID },
    env: {
      SUPABASE_URL: 'https://example.test',
      MARKETING_BOT_ENABLED: 'true',
      SYSTEM_AI_ENABLED: 'true',
      SYSTEM_AI_PROVIDER: 'deepinfra',
      SYSTEM_AI_MODEL: 'openai/gpt-oss-120b',
      DEEPINFRA_API_KEY: 'fixture_api_key_12345678',
      MARKETING_MODEL_PRICES: '{"openai/gpt-oss-120b":{"input":0.037,"output":0.17}}',
    },
  };
}

async function setupTestDb(pg, accountId = ACCOUNT_ID) {
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
  const bots = Object.fromEntries(botsRes.rows.map((b) => [b.slug, b]));
  return { ctx, bots };
}

// ==============================================================================
// TESTE 1 — GESTOR 1: Capacidade de alterar comportamento sem fallback
// ==============================================================================
test('TESTE 1 — GESTOR 1: "Gestor, mude o estilo do Marketing para ser mais direto e focar em investidores" configura com sucesso', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const gestor = bots.gestor;
    const marketing = bots.marketing;

    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.tool_choice === 'required') {
        return Response.json({
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_cfg_1',
                type: 'function',
                function: {
                  name: 'configureAgentBehavior',
                  arguments: JSON.stringify({
                    target_bot: 'marketing',
                    category: 'behavior',
                    configuration: { focus: 'investidores', style: 'direto' },
                    reason: 'mude o estilo do Marketing para ser mais direto e focar em investidores',
                  }),
                },
              }],
            },
          }],
        });
      }
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Perfeito, Ronaldo! Atualizei as diretrizes do Bot de Marketing para manter uma comunicação mais direta e focar em conteúdos e oportunidades voltadas para investidores.',
          },
        }],
      });
    };

    const prompt = 'Gestor, mude o estilo do Marketing para ser mais direto e focar em investidores';
    assert.equal(conversationRoute(prompt), 'operational');

    const result = await chat(ctx, {
      bot_id: gestor.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.ok(!result.message.content.includes('não tenho autorização para reprogramar bots'), 'Regra antiga revogada com sucesso');
    assert.ok(!result.message.content.includes('Ainda não consegui confirmar os dados'));
    assert.match(result.message.content, /diretrizes|investidores|direto/i);
    assert.equal(result.message.sources[0].tool, 'configureAgentBehavior');

    // Verifica persistência no banco e auditoria
    const prefs = await getAgentPreferences(ctx, marketing.id);
    assert.equal(prefs.behavior_preferences.focus, 'investidores');
    assert.equal(prefs.behavior_preferences.style, 'direto');

    const auditRes = await pg.query('select * from public.agent_config_audit where account_id = $1 and bot_id = $2', [ACCOUNT_ID, marketing.id]);
    assert.ok(auditRes.rows.length > 0, 'Auditoria deve registrar a mudança');
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 2 — GESTOR 2: Marketing foco família/investidor
// ==============================================================================
test('TESTE 2 — GESTOR 2: Comandos alternativos de direcionamento do Marketing gravam e refletem no contexto', async () => {
  const pg = await database();
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const marketing = bots.marketing;

    // Atualiza diretamente preferências para focar em famílias na praia
    await updateAgentPreferences(ctx, marketing.id, {
      behavior_preferences: { focus: 'famílias buscando apartamentos perto da praia no Bessa' },
      communication_preferences: { tone: 'caloroso e acolhedor' },
    }, {
      changedBy: 'gestor_orchestrator',
      reason: 'Diretiva editorial definida por Ronaldo',
    });

    const context = await buildAgentPreferencesContext(ctx, marketing);
    assert.match(context, /famílias buscando apartamentos perto da praia no Bessa/);
    assert.match(context, /caloroso e acolhedor/);
  } finally {
    await pg.close();
  }
});

// ==============================================================================
// TESTE 3 — GESTOR 3: Captador aluguel vs limites da VM
// ==============================================================================
test('TESTE 3 — GESTOR 3: "Quero que o Captador rode a cada 1 hora e foque em aluguel" aplica negócio e explica limite da VM', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const gestor = bots.gestor;
    const captador = bots.captador;

    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.tool_choice === 'required') {
        return Response.json({
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_cfg_captador',
                type: 'function',
                function: {
                  name: 'configureAgentBehavior',
                  arguments: JSON.stringify({
                    target_bot: 'captador',
                    category: 'operational',
                    configuration: { campaign_type: 'aluguel' },
                    reason: 'Quero que o Captador rode a cada 1 hora e foque em imóveis de aluguel',
                  }),
                },
              }],
            },
          }],
        });
      }
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Ronaldo, atualizei a prioridade de negócio do Captador para focar em imóveis de aluguel. Sobre a frequência de rodar a cada 1 hora: os horários de execução (09:00 e 19:00) são controlados diretamente pela VM Hyper-V dedicada e pelo Task Scheduler do Windows, então essa alteração de rotina depende de ajuste na infraestrutura e não pode ser feita em tempo de execução.',
          },
        }],
      });
    };

    const prompt = 'Quero que o Captador rode a cada 1 hora e foque em imóveis de aluguel';
    assert.equal(conversationRoute(prompt), 'operational');

    const result = await chat(ctx, {
      bot_id: gestor.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.equal(result.message.sources[0].tool, 'configureAgentBehavior');
    assert.match(result.message.content, /aluguel/i);
    assert.match(result.message.content, /VM|Hyper-V|Task Scheduler|09:00 e 19:00/i);
    assert.ok(!result.message.content.includes('Já alterei o agendamento da VM'));

    // Verifica que a preferência de negócio foi salva
    const prefs = await getAgentPreferences(ctx, captador.id);
    assert.equal(prefs.operational_preferences.campaign_type, 'aluguel');
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 4 — GESTOR 4: Comando longo de áudio decomposto em 3 bots
// ==============================================================================
test('TESTE 4 — GESTOR 4: Comando composto decomposto em 3 diretivas para múltiplos bots sem contaminação', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const gestor = bots.gestor;
    const marketing = bots.marketing;
    const captador = bots.captador;
    const sentinela = bots.sentinela;

    let stepCounter = 0;
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.tool_choice === 'required' || (body.tools && body.tools.length > 0 && stepCounter < 3)) {
        stepCounter++;
        if (stepCounter === 1) {
          return Response.json({
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call_mkt',
                  type: 'function',
                  function: {
                    name: 'configureAgentBehavior',
                    arguments: JSON.stringify({
                      target_bot: 'marketing',
                      category: 'behavior',
                      configuration: { focus: 'imóveis de alto padrão na praia' },
                      reason: 'Marketing focado em alto padrão na praia',
                    }),
                  },
                }],
              },
            }],
          });
        }
        if (stepCounter === 2) {
          return Response.json({
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call_cap',
                  type: 'function',
                  function: {
                    name: 'configureAgentBehavior',
                    arguments: JSON.stringify({
                      target_bot: 'captador',
                      category: 'operational',
                      configuration: { bedrooms: 3, neighborhood: 'Bessa e Manaíra' },
                      reason: 'Captador priorizando apartamentos de 3 quartos no Bessa e Manaíra',
                    }),
                  },
                }],
              },
            }],
          });
        }
        if (stepCounter === 3) {
          return Response.json({
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call_sen',
                  type: 'function',
                  function: {
                    name: 'configureAgentBehavior',
                    arguments: JSON.stringify({
                      target_bot: 'sentinela',
                      category: 'notification',
                      configuration: { min_severity: 'critical_api_only' },
                      reason: 'Sentinela me alertando só se tiver erro crítico de API',
                    }),
                  },
                }],
              },
            }],
          });
        }
      }

      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Entendido, Ronaldo! Decompus suas diretrizes e apliquei as configurações na equipe:\n1. Marketing: focado em imóveis de alto padrão na praia.\n2. Captador: priorizando apartamentos de 3 quartos no Bessa e Manaíra.\n3. Sentinela: sensibilidade ajustada para alertar apenas em erros críticos de API.',
          },
        }],
      });
    };

    const prompt = 'Gestor, a partir de hoje quero o Marketing focado em imóveis de alto padrão na praia, o Captador priorizando apartamentos de 3 quartos no Bessa e Manaíra, e o Sentinela me alertando só se tiver erro crítico de API';
    assert.equal(conversationRoute(prompt), 'operational');

    const result = await chat(ctx, {
      bot_id: gestor.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.ok(result.message.sources.length >= 1);
    assert.match(result.message.content, /Marketing/i);
    assert.match(result.message.content, /Captador/i);
    assert.match(result.message.content, /Sentinela/i);

    // Valida que cada bot recebeu sua própria configuração no banco
    const mktPrefs = await getAgentPreferences(ctx, marketing.id);
    const capPrefs = await getAgentPreferences(ctx, captador.id);
    const senPrefs = await getAgentPreferences(ctx, sentinela.id);

    assert.equal(mktPrefs.behavior_preferences.focus, 'imóveis de alto padrão na praia');
    assert.equal(capPrefs.operational_preferences.bedrooms, 3);
    assert.equal(senPrefs.notification_preferences.min_severity, 'critical_api_only');
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 5 — MARKETING 5: Informar canais sem citar Captador
// ==============================================================================
test('TESTE 5 — MARKETING 5: "Quais são seus canais e onde você pesquisa?" cita fontes próprias sem citar Captador', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const marketing = bots.marketing;

    globalThis.fetch = async (url, options) => {
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Pesquiso principalmente nos canais oficiais de João Pessoa e Cabedelo, notícias regionais da Paraíba, dados do IBGE e tendências de mercado nos bairros da capital (como Bessa, Manaíra e Cabo Branco).',
          },
        }],
      });
    };

    const prompt = 'Quais são seus canais e onde você pesquisa?';
    assert.equal(conversationRoute(prompt), 'self_or_capability');

    const result = await chat(ctx, {
      bot_id: marketing.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.ok(!result.message.content.includes('OLX'));
    assert.ok(!result.message.content.includes('Hyper-V'));
    assert.ok(!result.message.content.includes('9222'));
    assert.ok(!result.message.content.includes('09:00'));
    assert.ok(!result.message.content.includes('19:00'));
    assert.ok(!result.message.content.includes('proprietários'));
    assert.deepEqual(result.message.sources, []);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 6 — MARKETING 6: Pesquisa de hoje
// ==============================================================================
test('TESTE 6 — MARKETING 6: "O que você pesquisou hoje?" consulta estado e responde com exatidão temporal', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const marketing = bots.marketing;

    await updateAgentOperationalState(ctx, marketing.id, {
      last_operational_at: new Date().toISOString(),
      last_operational_type: 'market_research',
      last_operational_summary: 'Pesquisa realizada nos canais de João Pessoa: alta procura por imóveis na orla do Bessa.',
    });

    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.tool_choice === 'required') {
        return Response.json({
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_mkt_stat',
                type: 'function',
                function: { name: 'getMarketingStatus', arguments: '{}' },
              }],
            },
          }],
        });
      }
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Hoje acompanhei as notícias locais e identifiquei uma alta procura por imóveis na orla do Bessa.',
          },
        }],
      });
    };

    const prompt = 'O que você pesquisou hoje?';
    assert.equal(conversationRoute(prompt), 'operational');

    const result = await chat(ctx, {
      bot_id: marketing.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.equal(result.message.sources[0].tool, 'getMarketingStatus');
    assert.match(result.message.content, /Bessa|Hoje/i);
    assert.ok(!result.message.content.includes('Captador'));
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 7 — MARKETING 7: Execução autônoma única às 19:00
// ==============================================================================
test('TESTE 7 — MARKETING 7: Rotina autônoma roda 1x por dia no slot 19:00 com idempotência estrita', async () => {
  const pg = await database();
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const marketing = bots.marketing;
    const testSlot = getMarketingEditorialSlotKey(new Date());

    // 1ª Execução
    const firstRun = await executeMarketingEditorial(ctx, marketing, {
      slotKey: testSlot,
      notify: false,
      ideas: [{
        topic: 'Lançamentos sustentáveis em Cabo Branco',
        hook: 'Nova tendência de energia solar em prédios à beira-mar',
        format: 'Carrossel no Instagram',
        isHighRelevance: true,
      }],
    });

    assert.equal(firstRun.success, true);
    assert.equal(firstRun.primary_idea, 'Lançamentos sustentáveis em Cabo Branco');

    // 2ª Execução no mesmo slot deve ser ignorada
    const secondRun = await executeMarketingEditorial(ctx, marketing, {
      slotKey: testSlot,
      notify: false,
      ideas: [{ topic: 'Outro tema', isHighRelevance: true }],
    });

    assert.equal(secondRun.skipped, true);
    assert.equal(secondRun.reason, 'already_completed');
  } finally {
    await pg.close();
  }
});

// ==============================================================================
// TESTE 8 — MARKETING 8: Uma ideia por vez
// ==============================================================================
test('TESTE 8 — MARKETING 8: Apresenta 1 ideia principal e guarda alternativas no estado', async () => {
  const pg = await database();
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const marketing = bots.marketing;
    const testSlot = `2026-10-05-slot-one-idea-${crypto.randomUUID().slice(0, 6)}`;

    const run = await executeMarketingEditorial(ctx, marketing, {
      slotKey: testSlot,
      notify: false,
      ideas: [
        { topic: 'Ideia Principal A', hook: 'Gancho A', why_now: 'Razão A', isHighRelevance: true },
        { topic: 'Ideia Alternativa B', hook: 'Gancho B', why_now: 'Razão B', isHighRelevance: true },
        { topic: 'Ideia Alternativa C', hook: 'Gancho C', why_now: 'Razão C', isHighRelevance: true },
      ],
    });

    assert.equal(run.primary_idea, 'Ideia Principal A');
    assert.equal(run.alternatives_count, 2);

    // Verifica que o estado operacional guardou as alternativas
    const state = await ctx.db
      .from('agent_operational_state')
      .select('metadata')
      .eq('account_id', ctx.accountId)
      .eq('bot_id', marketing.id)
      .single();

    assert.equal(state.data.metadata.primary_idea, 'Ideia Principal A');
    assert.equal(state.data.metadata.alternative_ideas.length, 2);
    assert.equal(state.data.metadata.alternative_ideas[0].topic, 'Ideia Alternativa B');
  } finally {
    await pg.close();
  }
});

// ==============================================================================
// TESTE 9 — MARKETING 9: Exploração de alternativas sob demanda
// ==============================================================================
test('TESTE 9 — MARKETING 9: "Não gostei dessa, tem outra?" recupera alternativas do estado sem novo scraping', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const marketing = bots.marketing;

    // Salva estado prévio com ideia principal e alternativa
    await updateAgentOperationalState(ctx, marketing.id, {
      last_operational_summary: 'Pesquisa concluída: proposta sobre Cabo Branco.',
      metadata: {
        primary_idea: 'Lançamentos em Cabo Branco',
        alternative_ideas: [{
          topic: 'Apartamentos compactos para rentabilidade em Manaíra',
          hook: 'Foco em investidores que buscam alta taxa de ocupação no Airbnb',
          format: 'Reels dinâmico de 45 segundos',
        }],
      },
    });

    globalThis.fetch = async (url, options) => {
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Sem problemas! Da mesma análise de hoje, separei outra linha interessante: que tal focarmos em apartamentos compactos para rentabilidade em Manaíra? O gancho é falar sobre alta taxa de ocupação no Airbnb para investidores. Quer que eu elabore o roteiro dessa?',
          },
        }],
      });
    };

    const prompt = 'Não gostei dessa, tem outra?';
    const result = await chat(ctx, {
      bot_id: marketing.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.match(result.message.content, /Manaíra|compactos|rentabilidade/i);
    assert.ok(!result.message.content.includes('Captador'));
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 10 — MARKETING 10: Sem pauta boa = zero push
// ==============================================================================
test('TESTE 10 — MARKETING 10: Sem pauta qualificada, registra silêncio inteligente e emite ZERO push', async () => {
  const pg = await database();
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const marketing = bots.marketing;
    const testSlot = `2026-10-05-slot-silent-${crypto.randomUUID().slice(0, 6)}`;

    const run = await executeMarketingEditorial(ctx, marketing, {
      slotKey: testSlot,
      notify: true,
      ideas: [], // Nenhuma pauta acima do limiar
    });

    assert.equal(run.success, true);
    assert.equal(run.notified, false, 'Silêncio inteligente deve emitir ZERO push');
    assert.equal(run.primary_idea, null);

    // Notificações no banco devem ser 0
    const notifs = await pg.query('select * from public.agent_notifications_log where account_id = $1 and bot_id = $2', [ACCOUNT_ID, marketing.id]);
    assert.equal(notifs.rows.length, 0);
  } finally {
    await pg.close();
  }
});

// ==============================================================================
// TESTE 11 — SENTINELA 11: Follow-up de ação técnica ("já corrigimos isso")
// ==============================================================================
test('TESTE 11 — SENTINELA 11: "Já corrigimos a rota de matches, pode conferir?" executa inspeção e resolve ocorrência', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const sentinela = bots.sentinela;

    // Cria incidente aberto prévio
    const incRes = await pg.query(`
      insert into public.agent_incidents (account_id, bot_id, component, status, expected, observed, impact, confidence, fingerprint)
      values ($1, $2, 'match_api', 'open', 'HTTP 200 OK', 'HTTP 500 error', 'high', 0.95, 'match_api_err_1')
      returning id
    `, [ACCOUNT_ID, sentinela.id]);
    const incidentId = incRes.rows[0].id;

    let toolCallCount = 0;
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.tool_choice === 'required' || (body.tools && body.tools.length > 0 && toolCallCount < 2)) {
        toolCallCount++;
        if (toolCallCount === 1) {
          return Response.json({
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call_diag',
                  type: 'function',
                  function: { name: 'getComponentDiagnostics', arguments: '{"component":"match_api"}' },
                }],
              },
            }],
          });
        }
        if (toolCallCount === 2) {
          return Response.json({
            choices: [{
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [{
                  id: 'call_res',
                  type: 'function',
                  function: {
                    name: 'acknowledgeOrResolveIncident',
                    arguments: JSON.stringify({
                      incident_id: incidentId,
                      action: 'resolve',
                      note: 'Verificação ativa confirmou rota normalizada após correção pelo usuário',
                    }),
                  },
                }],
              },
            }],
          });
        }
      }

      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Excelente notícia, Ronaldo! Acabei de rodar o diagnóstico na rota de matches e ela respondeu normalmente. Já marquei a ocorrência como resolvida no histórico do sistema.',
          },
        }],
      });
    };

    const prompt = 'Já corrigimos a rota de matches, pode conferir?';
    assert.equal(conversationRoute(prompt), 'operational');

    const result = await chat(ctx, {
      bot_id: sentinela.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.match(result.message.content, /resolvida|normalmente/i);
    assert.ok(!result.message.content.includes('Ainda não consegui confirmar os dados'));

    // Verifica que o status do incidente foi atualizado para resolved sem exclusão destrutiva
    const checkInc = await pg.query('select * from public.agent_incidents where id = $1', [incidentId]);
    assert.equal(checkInc.rows[0].status, 'resolved');
    assert.ok(checkInc.rows[0].resolved_at !== null);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 12 — SENTINELA 12: "Confere se resolveu"
// ==============================================================================
test('TESTE 12 — SENTINELA 12: "Confere se resolveu" foca no componente sem despejar relatório irrelevante', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const sentinela = bots.sentinela;

    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.tool_choice === 'required') {
        return Response.json({
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_diag_2',
                type: 'function',
                function: { name: 'getComponentDiagnostics', arguments: '{"component":"match_api"}' },
              }],
            },
          }],
        });
      }
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Conferi a rota de matches agora e a resposta está estável e normalizada.',
          },
        }],
      });
    };

    const prompt = 'Confere se resolveu a rota de matches';
    assert.equal(conversationRoute(prompt), 'operational');

    const result = await chat(ctx, {
      bot_id: sentinela.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.equal(result.message.sources[0].tool, 'getComponentDiagnostics');
    assert.match(result.message.content, /estável|normalizada|matches/i);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 13 — SENTINELA 13: "Zera essa ocorrência"
// ==============================================================================
test('TESTE 13 — SENTINELA 13: "Zera essa ocorrência de erro 401 que já foi tratada" resolve formalmente sem delete', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const sentinela = bots.sentinela;

    const incRes = await pg.query(`
      insert into public.agent_incidents (account_id, bot_id, component, status, expected, observed, impact, confidence, fingerprint)
      values ($1, $2, 'app_http', 'open', 'HTTP 200 OK', 'HTTP 401 unauthenticated', 'low', 0.8, 'app_http_401')
      returning id
    `, [ACCOUNT_ID, sentinela.id]);
    const incidentId = incRes.rows[0].id;

    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.tool_choice === 'required') {
        return Response.json({
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_ack',
                type: 'function',
                function: {
                  name: 'acknowledgeOrResolveIncident',
                  arguments: JSON.stringify({
                    incident_id: incidentId,
                    action: 'resolve',
                    note: 'Encerrada a pedido do usuário após confirmação de que foi tratada',
                  }),
                },
              }],
            },
          }],
        });
      }
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Entendido! Marquei a ocorrência de erro 401 como resolvida no histórico de auditoria. Ela não aparecerá mais como pendência aberta.',
          },
        }],
      });
    };

    const prompt = 'Zera essa ocorrência de erro 401 que já foi tratada';
    assert.equal(conversationRoute(prompt), 'operational');

    const result = await chat(ctx, {
      bot_id: sentinela.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.equal(result.message.sources[0].tool, 'acknowledgeOrResolveIncident');
    assert.match(result.message.content, /resolvida|não aparecerá mais como pendência/i);

    // Confirma que NÃO houve exclusão física da tabela (auditoria intacta)
    const after = await pg.query('select * from public.agent_incidents where id = $1', [incidentId]);
    assert.equal(after.rows.length, 1);
    assert.equal(after.rows[0].status, 'resolved');
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 14 — CAPTADOR 14: Primeira pessoa factual
// ==============================================================================
test('TESTE 14 — CAPTADOR 14: "Como foi seu dia?" responde em primeira pessoa com dados reais', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const captador = bots.captador;

    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.tool_choice === 'required') {
        return Response.json({
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_cap_sum',
                type: 'function',
                function: { name: 'getCaptureSummary', arguments: '{"period":"today"}' },
              }],
            },
          }],
        });
      }
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Hoje executei 2 rodadas nos horários oficiais (09:00 e 19:00), analisei 14 imóveis e contatei 4 novos proprietários.',
          },
        }],
      });
    };

    const prompt = 'Como foi seu dia?';
    assert.equal(conversationRoute(prompt), 'operational');

    const result = await chat(ctx, {
      bot_id: captador.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.match(result.message.content, /executei|analisei|contatei/i);
    assert.ok(!result.message.content.includes('O Bot Captador fez'));
    assert.equal(result.message.sources[0].tool, 'getCaptureSummary');
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 15 — ISOLAMENTO 15: Marketing NUNCA cita horário do Captador
// ==============================================================================
test('TESTE 15 — ISOLAMENTO 15: Contexto e diretrizes do Marketing nunca recebem agenda do Captador', async () => {
  const pg = await database();
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const marketing = bots.marketing;

    const mktContext = await buildAgentOperationalContext(ctx, marketing, 'Quais são seus horários?');
    assert.ok(!mktContext.includes('09:00 e 19:00'));
    assert.ok(!mktContext.includes('Task Scheduler'));
    assert.ok(!mktContext.includes('Hyper-V'));
  } finally {
    await pg.close();
  }
});

// ==============================================================================
// TESTE 16 — ISOLAMENTO 16: Captador NUNCA acessa ou cita memória do Marketing
// ==============================================================================
test('TESTE 16 — ISOLAMENTO 16: Captador nunca recebe memórias editoriais do Marketing', async () => {
  const pg = await database();
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const captador = bots.captador;
    const marketing = bots.marketing;

    await recordOperationalMemory(ctx, marketing.id, {
      kind: 'editorial',
      topic: 'Lançamento Manaíra',
      summary: 'Post sobre sustentabilidade em Manaíra',
    });

    const capContext = await buildAgentOperationalContext(ctx, captador, 'resumo');
    assert.ok(!capContext.includes('Post sobre sustentabilidade em Manaíra'));
  } finally {
    await pg.close();
  }
});

// ==============================================================================
// TESTE 17 — GESTOR 17: Consulta contexto e visão de outros agentes sob demanda
// ==============================================================================
test('TESTE 17 — GESTOR 17: Gestor consulta contexto recente de outro agente via getAgentConversationContext', async () => {
  const pg = await database();
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const gestor = bots.gestor;
    const marketing = bots.marketing;

    // Registra mensagens prévias no Marketing
    const convRes = await pg.query(`
      insert into public.agent_conversations (account_id, bot_id)
      values ($1, $2) returning id
    `, [ACCOUNT_ID, marketing.id]);
    const convId = convRes.rows[0].id;

    await pg.query(`
      insert into public.agent_messages (account_id, conversation_id, client_message_id, role, content)
      values ($1, $2, gen_random_uuid(), 'assistant', 'Pesquisei tendências no Bessa hoje.')
    `, [ACCOUNT_ID, convId]);

    const runRes = await pg.query(`
      insert into public.agent_runs (account_id, bot_id, trigger_type)
      values ($1, $2, 'chat') returning id
    `, [ACCOUNT_ID, gestor.id]);
    const runId = runRes.rows[0].id;

    const result = await executeTool(ctx, gestor, runId, 'getAgentConversationContext', {
      target_bot: 'marketing',
      limit: 5,
    });

    assert.equal(result.bot_slug, 'marketing');
    assert.ok(result.recent_messages.length > 0);
    assert.match(result.recent_messages[0].content, /tendências no Bessa/);
  } finally {
    await pg.close();
  }
});

// ==============================================================================
// TESTE 18 — CONVERSA 18: "Boa noite" / amenidade pura -> zero tools
// ==============================================================================
test('TESTE 18 — CONVERSA 18: "Boa noite, Gestor" responde cordialmente com zero tools', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const gestor = bots.gestor;

    globalThis.fetch = async (url, options) => {
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Boa noite, Ronaldo! Por aqui está tudo tranquilo. Se precisar de algum alinhamento ou checagem na equipe, estou à disposição.',
          },
        }],
      });
    };

    const prompt = 'Boa noite, Gestor';
    assert.equal(conversationRoute(prompt), 'conversation');

    const result = await chat(ctx, {
      bot_id: gestor.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.deepEqual(result.message.sources, [], 'Zero chamadas de ferramentas');
    assert.match(result.message.content, /Boa noite/i);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 19 — FOLLOW-UP 19: "Não foi isso que eu quis dizer" -> reconhece e reinterpreta
// ==============================================================================
test('TESTE 19 — FOLLOW-UP 19: "Não foi isso que eu quis dizer" reconhece mal-entendido sem entrar em loop', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const gestor = bots.gestor;

    globalThis.fetch = async (url, options) => {
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Peço desculpas pelo mal-entendido! Me diga o que você precisa exatamente para que eu possa direcionar corretamente.',
          },
        }],
      });
    };

    const prompt = 'não foi isso que eu quis dizer';
    assert.equal(conversationRoute(prompt), 'follow_up');

    const result = await chat(ctx, {
      bot_id: gestor.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.deepEqual(result.message.sources, []);
    assert.match(result.message.content, /desculpas|mal-entendido/i);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 20 — FACTUAL 20: "Quantos imóveis você encontrou?" -> exige tool
// ==============================================================================
test('TESTE 20 — FACTUAL 20: "Quantos imóveis você encontrou?" exige ferramenta factual', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const captador = bots.captador;
    const calls = [];

    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      if (body.tool_choice === 'required') {
        return Response.json({
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_search',
                type: 'function',
                function: { name: 'searchCapturedProperties', arguments: '{}' },
              }],
            },
          }],
        });
      }
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Consultei nossa base e encontrei 0 imóveis nos registros disponíveis.',
          },
        }],
      });
    };

    const prompt = 'Quantos imóveis você encontrou?';
    assert.equal(conversationRoute(prompt), 'operational');

    const result = await chat(ctx, {
      bot_id: captador.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.equal(calls.at(-2).tool_choice, 'required');
    assert.equal(result.message.sources[0].tool, 'searchCapturedProperties');
    assert.match(result.message.content, /0 imóveis/);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 21 — MEMÓRIA 21: Preferências persistem entre sessões
// ==============================================================================
test('TESTE 21 — MEMÓRIA 21: Preferências salvas persistem na base e são carregadas no prompt do agente', async () => {
  const pg = await database();
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const marketing = bots.marketing;

    // Atualiza preferências na sessão 1
    await updateAgentPreferences(ctx, marketing.id, {
      behavior_preferences: { focus: 'imóveis prontos para morar em Manaíra' },
    });

    // Em uma nova sessão/instância de contexto
    const newCtx = mockContext(pg, ACCOUNT_ID);
    const contextStr = await buildAgentPreferencesContext(newCtx, marketing);

    assert.match(contextStr, /imóveis prontos para morar em Manaíra/);
  } finally {
    await pg.close();
  }
});

// ==============================================================================
// TESTE 22 — ROLLBACK 22: "Volta como era antes"
// ==============================================================================
test('TESTE 22 — ROLLBACK 22: "Gestor, volta a configuração do Marketing como estava antes" reverte com sucesso', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const gestor = bots.gestor;
    const marketing = bots.marketing;

    // Estado inicial
    await updateAgentPreferences(ctx, marketing.id, {
      behavior_preferences: { focus: 'Estado Original A' },
    });

    // Alteração intermediária
    await updateAgentPreferences(ctx, marketing.id, {
      behavior_preferences: { focus: 'Estado Alterado B' },
    });

    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      if (body.tool_choice === 'required') {
        return Response.json({
          choices: [{
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{
                id: 'call_rollback',
                type: 'function',
                function: {
                  name: 'rollbackAgentConfiguration',
                  arguments: JSON.stringify({
                    target_bot: 'marketing',
                    category: 'all',
                  }),
                },
              }],
            },
          }],
        });
      }
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Pronto, Ronaldo! Reverti a configuração do Bot de Marketing para o estado imediatamente anterior.',
          },
        }],
      });
    };

    const prompt = 'Gestor, volta a configuração do Marketing como estava antes';
    assert.equal(conversationRoute(prompt), 'operational');

    const result = await chat(ctx, {
      bot_id: gestor.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.equal(result.message.sources[0].tool, 'rollbackAgentConfiguration');
    assert.match(result.message.content, /Reverti|anterior/i);

    const afterRollback = await getAgentPreferences(ctx, marketing.id);
    assert.equal(afterRollback.behavior_preferences.focus, 'Estado Original A');
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 23 — MULTI-TENANT 23: Isolamento estrito por account_id
// ==============================================================================
test('TESTE 23 — MULTI-TENANT 23: Preferências e auditorias de contas distintas não se cruzam', async () => {
  const pg = await database();
  try {
    const OTHER_ACCOUNT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const { ctx: ctxA, bots: botsA } = await setupTestDb(pg, ACCOUNT_ID);
    const { ctx: ctxB, bots: botsB } = await setupTestDb(pg, OTHER_ACCOUNT);

    // Salva preferência na Conta A
    await updateAgentPreferences(ctxA, botsA.marketing.id, {
      behavior_preferences: { focus: 'Foco da Conta A' },
    });

    // Salva preferência na Conta B
    await updateAgentPreferences(ctxB, botsB.marketing.id, {
      behavior_preferences: { focus: 'Foco da Conta B' },
    });

    const prefsA = await getAgentPreferences(ctxA, botsA.marketing.id);
    const prefsB = await getAgentPreferences(ctxB, botsB.marketing.id);

    assert.equal(prefsA.behavior_preferences.focus, 'Foco da Conta A');
    assert.equal(prefsB.behavior_preferences.focus, 'Foco da Conta B');

    // Valida auditoria isolada
    const auditA = await pg.query('select * from public.agent_config_audit where account_id = $1', [ACCOUNT_ID]);
    const auditB = await pg.query('select * from public.agent_config_audit where account_id = $1', [OTHER_ACCOUNT]);

    assert.ok(auditA.rows.every(r => r.account_id === ACCOUNT_ID));
    assert.ok(auditB.rows.every(r => r.account_id === OTHER_ACCOUNT));
  } finally {
    await pg.close();
  }
});

// ==============================================================================
// TESTE 24 — REGRESSÃO 24: Status dos bots reporta os 4 agentes com integridade
// ==============================================================================
test('TESTE 24 — REGRESSÃO 24: botsStatus consolida os 4 agentes e mantém estrutura íntegra', async () => {
  const pg = await database();
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const status = await botsStatus(ctx);

    assert.equal(status.length, 4);
    const slugs = status.map((b) => b.slug);
    assert.ok(slugs.includes('gestor'));
    assert.ok(slugs.includes('captador'));
    assert.ok(slugs.includes('sentinela'));
    assert.ok(slugs.includes('marketing'));
  } finally {
    await pg.close();
  }
});

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
// TESTE 1 — GESTOR / CONVERSA
// ==============================================================================
test('TESTE 1 — GESTOR / CONVERSA: pergunta de mudança de comportamento não cai em fallback factual nem exige tool', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const gestor = bots.gestor;
    const calls = [];

    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      const isRouting = body.messages[0].content.includes('Classifique a intenção');
      if (isRouting) {
        return Response.json({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ route: 'self_or_capability' }) } }] });
      }
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Entendi. Você pode me pedir orientações sobre o trabalho dos bots aqui na conversa. Para mudanças permanentes no comportamento ou código deles, isso requer ajustes no sistema pelos desenvolvedores, mas posso te explicar o que consigo apoiar.',
          },
        }],
      });
    };

    const prompt = 'eu consigo, aqui no chat, pedir algo diferente a vc? Tipo mudar algo no comportamento de algum Bot?';
    assert.equal(isDirectRoute(conversationRoute(prompt)), true, 'Prompt deve ser rota direta conversacional');

    const result = await chat(ctx, {
      bot_id: gestor.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.ok(!result.message.content.includes('Ainda não consegui confirmar os dados'), 'Zero fallback factual');
    assert.match(result.message.content, /orientações|mudanças|ajustes/i);
    assert.deepEqual(result.message.sources, [], 'Tool não deve ser executada');
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 2 — GESTOR / FOLLOW-UP
// ==============================================================================
test('TESTE 2 — GESTOR / FOLLOW-UP: "você entendeu minha pergunta?" responde usando o contexto anterior sem tool', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const gestor = bots.gestor;
    const calls = [];

    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Sim, entendi perfeitamente sua pergunta anterior. Você quis saber se consegue pedir mudanças no comportamento dos outros bots diretamente aqui pelo chat.',
          },
        }],
      });
    };

    // 1. Mensagem inicial
    await chat(ctx, {
      bot_id: gestor.id,
      content: 'eu consigo, aqui no chat, pedir algo diferente a vc? Tipo mudar algo no comportamento de algum Bot?',
      request_id: crypto.randomUUID(),
    });

    // 2. Follow-up
    const followUpPrompt = 'vc entendeu minha pergunta?';
    assert.equal(conversationRoute(followUpPrompt), 'follow_up');

    const result = await chat(ctx, {
      bot_id: gestor.id,
      content: followUpPrompt,
      request_id: crypto.randomUUID(),
    });

    assert.ok(!result.message.content.includes('Ainda não consegui confirmar os dados'), 'Zero fallback');
    assert.match(result.message.content, /Sim, entendi|pergunta anterior/i);
    assert.deepEqual(result.message.sources, []);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 3 — SENTINELA / CONTINUAÇÃO
// ==============================================================================
test('TESTE 3 — SENTINELA / CONTINUAÇÃO: "já ajustamos isso com o Antigravity" não repete a ocorrência', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const sentinela = bots.sentinela;

    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      const isRouting = body.messages[0].content.includes('Classifique a intenção');
      if (isRouting) {
        return Response.json({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ route: 'follow_up' }) } }] });
      }
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Entendido! Como vocês já fizeram o ajuste com o Antigravity, posso fazer uma nova verificação para conferir se o problema ainda está acontecendo ou se já normalizou.',
          },
        }],
      });
    };

    const prompt = 'já ajustamos isso com o Antigravity';
    assert.equal(conversationRoute(prompt), 'follow_up');

    const result = await chat(ctx, {
      bot_id: sentinela.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.ok(!result.message.content.includes('Ainda não consegui confirmar os dados'));
    assert.match(result.message.content, /ajuste|conferir|normalizou/i);
    assert.ok(!result.message.content.includes('HTTP 500 fatal crash'));
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 4 — SENTINELA / ACTION REQUEST
// ==============================================================================
test('TESTE 4 — SENTINELA / ACTION REQUEST: "tem como zerar essa ocorrência no sistema?" explica permissão sem fallback', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const sentinela = bots.sentinela;

    globalThis.fetch = async (url, options) => {
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'No momento, eu não tenho autorização para zerar ou apagar ocorrências diretamente no sistema pelo chat. Minha função é observar, diagnosticar e acompanhar. O encerramento definitivo ocorre quando o componente normaliza ou quando os desenvolvedores corrigem a falha.',
          },
        }],
      });
    };

    const prompt = 'tem como zerar essa ocorrência no sistema?';
    assert.equal(conversationRoute(prompt), 'action_request');

    const result = await chat(ctx, {
      bot_id: sentinela.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.ok(!result.message.content.includes('Ainda não consegui confirmar os dados'));
    assert.match(result.message.content, /não tenho autorização|permissão|função é observar/i);
    assert.deepEqual(result.message.sources, []);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 5 — MARKETING / CONVERSA
// ==============================================================================
test('TESTE 5 — MARKETING / CONVERSA: "Boa madrugada, como estamos?" responde naturalmente sem fallback de grounding', async () => {
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
            content: 'Boa madrugada! Por aqui está tudo tranquilo e pronto para criar novas ideias de conteúdo imobiliário quando você quiser.',
          },
        }],
      });
    };

    const prompt = 'Boa madrugada, como estamos?';
    assert.equal(conversationRoute(prompt), 'conversation');

    const result = await chat(ctx, {
      bot_id: marketing.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.ok(!result.message.content.includes('Ainda não consegui confirmar os dados'));
    assert.match(result.message.content, /Boa madrugada/i);
    assert.deepEqual(result.message.sources, []);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 6 — MARKETING / CAPABILITY
// ==============================================================================
test('TESTE 6 — MARKETING / CAPABILITY: "Quais os canais que você mais pesquisa?" explica fontes sem mencionar Captador', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const marketing = bots.marketing;
    const calls = [];

    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body);
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Costumo pesquisar principalmente em canais e feeds oficiais da nossa região — como os portais das Prefeituras de João Pessoa e Cabedelo, notícias da Agência Brasil, dados do IBGE — além de tendências na web sobre o mercado imobiliário em bairros como Bessa, Manaíra e Cabo Branco.',
          },
        }],
      });
    };

    const prompt = 'Quais os canais que você mais pesquisa?';
    assert.equal(conversationRoute(prompt), 'self_or_capability');

    const result = await chat(ctx, {
      bot_id: marketing.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.ok(!result.message.content.includes('Ainda não consegui confirmar os dados'));
    assert.match(result.message.content, /Prefeituras de João Pessoa|Agência Brasil|mercado imobiliário/i);
    assert.ok(!result.message.content.includes('Captador'));
    assert.ok(!result.message.content.includes('19h'));
    assert.deepEqual(result.message.sources, []);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 7 — MARKETING / STATUS REAL
// ==============================================================================
test('TESTE 7 — MARKETING / STATUS REAL: "Hoje você já fez alguma pesquisa?" consulta estado do Marketing, nunca 19h do Captador', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const marketing = bots.marketing;

    // Atualiza estado prévio do Marketing
    await updateAgentOperationalState(ctx, marketing.id, {
      last_operational_at: new Date().toISOString(),
      last_operational_type: 'market_research',
      last_operational_summary: 'Pesquisa ao vivo: 3 itens encontrados',
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
                id: 'call_status',
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
            content: 'Hoje realizei 3 pesquisas nos canais oficiais de João Pessoa e região para levantar novas pautas.',
          },
        }],
      });
    };

    const prompt = 'Hoje você já fez alguma pesquisa?';
    assert.equal(conversationRoute(prompt), 'operational');

    const result = await chat(ctx, {
      bot_id: marketing.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.ok(!result.message.content.includes('Captador'));
    assert.ok(!result.message.content.includes('19:00'));
    assert.ok(!result.message.content.includes('19h'));
    assert.equal(result.message.sources[0].tool, 'getMarketingStatus');
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 8 — MARKETING / OUTROS AGENTES
// ==============================================================================
test('TESTE 8 — MARKETING / OUTROS AGENTES: "Você sabe o que os outros bots estão fazendo agora?" respeita permissão e direciona ao Gestor', async () => {
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
            content: 'Minha atuação é focada na área de Marketing e criação de pautas imobiliárias. Eu não acompanho o status operacional dos outros bots — o Bot Gestor é quem possui essa visão consolidada de toda a equipe.',
          },
        }],
      });
    };

    const prompt = 'Você sabe o que os outros bots estão fazendo agora?';
    assert.equal(conversationRoute(prompt), 'self_or_capability');

    const result = await chat(ctx, {
      bot_id: marketing.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.ok(!result.message.content.includes('Ainda não consegui confirmar os dados'));
    assert.match(result.message.content, /Bot Gestor|não acompanho/i);
    assert.deepEqual(result.message.sources, []);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 9 — ISOLAMENTO DE CONTEXTO
// ==============================================================================
test('TESTE 9 — ISOLAMENTO DE CONTEXTO: contexto do Marketing não recebe agenda ou horários do Captador', async () => {
  const pg = await database();
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const captador = bots.captador;
    const marketing = bots.marketing;

    // Injeta estado do Captador com 19h
    await updateAgentOperationalState(ctx, captador.id, {
      last_operational_at: new Date().toISOString(),
      current_focus: 'Rodada OLX das 19h programada na VM',
    });

    // Injeta estado do Marketing
    await updateAgentOperationalState(ctx, marketing.id, {
      last_operational_at: new Date().toISOString(),
      current_focus: 'Pautas de infraestrutura no Bessa',
    });

    const mktContext = await buildAgentOperationalContext(ctx, marketing, 'qual seu foco atual?');

    assert.ok(!mktContext.includes('Rodada OLX das 19h'), 'Contexto do Marketing não pode conter foco do Captador');
    assert.ok(!mktContext.includes('VM Hyper-V'), 'Marketing não deve receber instruções sobre Hyper-V');
    assert.match(mktContext, /Pautas de infraestrutura no Bessa/);
  } finally {
    await pg.close();
  }
});

// ==============================================================================
// TESTE 10 — MEMÓRIA ISOLADA
// ==============================================================================
test('TESTE 10 — MEMÓRIA ISOLADA: memórias de Marketing não aparecem no Captador e vice-versa', async () => {
  const pg = await database();
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const captador = bots.captador;
    const marketing = bots.marketing;

    // Memória editorial no Marketing
    await recordOperationalMemory(ctx, marketing.id, {
      kind: 'editorial',
      topic: 'Tendência Altiplano',
      summary: 'Preferência por vídeos curtos sobre lançamentos no Altiplano',
    });

    // Memória operacional no Captador
    await recordOperationalMemory(ctx, captador.id, {
      kind: 'research',
      topic: 'OLX Scraping Bessa',
      summary: 'Detectada alta de apartamentos de 3 quartos no Bessa',
    });

    const captadorContext = await buildAgentOperationalContext(ctx, captador, 'resumo');
    const marketingContext = await buildAgentOperationalContext(ctx, marketing, 'resumo');

    assert.ok(!captadorContext.includes('Preferência por vídeos curtos'), 'Captador não deve ver memória editorial do Marketing');
    assert.match(captadorContext, /Detectada alta de apartamentos/);

    assert.ok(!marketingContext.includes('OLX Scraping Bessa'), 'Marketing não deve ver memória operacional do Captador');
    assert.match(marketingContext, /Preferência por vídeos curtos/);
  } finally {
    await pg.close();
  }
});

// ==============================================================================
// TESTE 11 — CONSULTA FACTUAL CONTINUA PROTEGIDA
// ==============================================================================
test('TESTE 11 — CONSULTA FACTUAL CONTINUA PROTEGIDA: Captador "Quantos imóveis encontrei hoje?" exige tool e evidência', async () => {
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
                function: { name: 'searchCapturedProperties', arguments: '{"period":"today"}' },
              }],
            },
          }],
        });
      }
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Hoje encontrei 0 imóveis nas buscas registradas.',
          },
        }],
      });
    };

    const prompt = 'Quantos imóveis encontrei hoje?';
    assert.equal(conversationRoute(prompt), 'operational');

    const result = await chat(ctx, {
      bot_id: captador.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.equal(calls.at(-2).tool_choice, 'required', 'Exige chamada de ferramenta factual');
    assert.equal(result.message.sources[0].tool, 'searchCapturedProperties');
    assert.match(result.message.content, /0 imóveis/);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 12 — SENTINELA FACTUAL
// ==============================================================================
test('TESTE 12 — SENTINELA FACTUAL: "Esse problema ainda está acontecendo?" exige ferramenta diagnóstica', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const sentinela = bots.sentinela;
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
                id: 'call_diag',
                type: 'function',
                function: { name: 'getOpenIncidents', arguments: '{}' },
              }],
            },
          }],
        });
      }
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Consultei o sistema agora e não encontrei nenhuma ocorrência técnica aberta.',
          },
        }],
      });
    };

    const prompt = 'Esse problema ainda está acontecendo?';
    assert.equal(conversationRoute(prompt), 'operational');

    const result = await chat(ctx, {
      bot_id: sentinela.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.equal(calls.at(-2).tool_choice, 'required', 'Sentinela factual exige ferramenta');
    assert.ok(result.message.sources.length > 0);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 13 — ACTION NÃO EXECUTADA SEM PERMISSÃO
// ==============================================================================
test('TESTE 13 — ACTION NÃO EXECUTADA SEM PERMISSÃO: "apaga essa ocorrência" não executa mutação e não finge que apagou', async () => {
  const pg = await database();
  const nativeFetch = globalThis.fetch;
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const sentinela = bots.sentinela;

    globalThis.fetch = async (url, options) => {
      return Response.json({
        choices: [{
          message: {
            role: 'assistant',
            content: 'Não tenho permissão para apagar ou zerar ocorrências no sistema. O Sentinela apenas monitora e investiga. Para que o alerta seja encerrado, a causa precisa ser resolvida no sistema pelos desenvolvedores.',
          },
        }],
      });
    };

    const prompt = 'apaga essa ocorrência';
    assert.equal(conversationRoute(prompt), 'action_request');

    const result = await chat(ctx, {
      bot_id: sentinela.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.ok(!result.message.content.includes('Apaguei'));
    assert.ok(!result.message.content.includes('Ainda não consegui confirmar os dados'));
    assert.match(result.message.content, /Não tenho permissão|apenas monitora/i);
    assert.deepEqual(result.message.sources, []);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 14 — FOLLOW-UP NEGATIVO
// ==============================================================================
test('TESTE 14 — FOLLOW-UP NEGATIVO: "não foi isso que eu perguntei" reconhece erro e reinterpreta sem repetir', async () => {
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
            content: 'Peço desculpas pelo mal-entendido! Vou prestar mais atenção. O que você gostaria de saber exatamente?',
          },
        }],
      });
    };

    const prompt = 'não foi isso que eu perguntei';
    assert.equal(conversationRoute(prompt), 'follow_up');

    const result = await chat(ctx, {
      bot_id: gestor.id,
      content: prompt,
      request_id: crypto.randomUUID(),
    });

    assert.ok(!result.message.content.includes('Ainda não consegui confirmar os dados'));
    assert.match(result.message.content, /desculpas|mal-entendido/i);
    assert.deepEqual(result.message.sources, []);
  } finally {
    globalThis.fetch = nativeFetch;
    await pg.close();
  }
});

// ==============================================================================
// TESTE 15 — REGRESSÃO CAPTADOR
// ==============================================================================
test('TESTE 15 — REGRESSÃO CAPTADOR: capacidades, rotas e políticas preservam as garantias do Bot Captador', async () => {
  const pg = await database();
  try {
    const { ctx, bots } = await setupTestDb(pg);
    const captador = bots.captador;

    // 1. Identidade e capacidades do Captador continuam íntegras
    const policy = capabilityPolicy(captador);
    assert.match(policy, /09:00 e 19:00/);
    assert.match(policy, /VM dedicada/);
    assert.match(policy, /modo consulta/);

    // 2. Classificação de rotas do Captador
    assert.equal(conversationRoute('Quem é você?'), 'conversation');
    assert.equal(conversationRoute('Como foi sua semana?'), 'operational');
    assert.equal(conversationRoute('Quantos imóveis você encontrou hoje?'), 'operational');
    assert.equal(conversationRoute('e aqueles?'), 'classify');

    // 3. Contexto operacional do Captador possui separação estrita de execuções
    const context = await buildAgentOperationalContext(ctx, captador, 'status');
    assert.match(context, /SEPARAÇÃO ESTRITA DE EXECUÇÕES \(BOT CAPTADOR\)/);
  } finally {
    await pg.close();
  }
});

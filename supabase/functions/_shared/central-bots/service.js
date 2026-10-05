import {OWNER_COMMAND_POLICY,extraRoundRequested,LIVE_OPERATIONS,isRoutineDeferral} from './owner-control.js';
import {rememberChat,chatMemoryContext} from './chat-memory.js';
import {
  rows,
  AgentError,
  requiredText,
  UUID,
  AVATARS,
  AUTONOMIES,
  MODES,
  BUILTINS,
  event,
  maintenanceDossier,
  redactOperationalData,
} from './core.js';
import {
  TOOL_CATALOG,
  allowedTools,
  executeTool,
  botsStatus,
} from './tools.js';
import { createAIProvider, groundedReply } from './ai-provider.js';
import {
  requiresOperationalEvidence,
  identityPolicy,
  capabilityPolicy,
  routeGuidance,
  isDirectRoute,
  conversationRoute,
  ROUTING_POLICY,
  parseRoute,
  requestedPeriod,
  hasExplicitPeriod,
  temporalPolicy,
} from './conversation.js';
import { BOT_COMMUNICATION_POLICY, technicalDetailsRequested, communicationSafe, humanFallback, humanSourceSummary, configurationReceipt, instagramAccessReceipt } from './communication.js';
import { inspectSystem, isDailyInspectionDue } from './sentinel.js';
import { setupMarketing, scoped as marketingScoped, feedback as marketingFeedback } from '../bot-marketing/store.js';
import { parseFeedback } from '../bot-marketing/core.js';
import { marketingTick } from '../bot-marketing/worker.js';
import { executeDailyDigest } from './autonomy.js';
import { costEnvelope, marketingModel } from '../bot-marketing/ai.js';
import {
  updateAgentOperationalState,
  recordOperationalMemory,
  buildAgentOperationalContext,
  syncToolExecutionToState,
} from './state-memory.js';
import { buildAgentPreferencesContext } from './preferences.js';

export async function bootstrap(ctx) {
  await rows(
    ctx.db
      .from('agent_runtime_settings')
      .upsert(
        {
          account_id: ctx.accountId,
          function_url: `${ctx.env.SUPABASE_URL}/functions/v1/central-bots`,
        },
        { onConflict: 'account_id', ignoreDuplicates: true },
      ),
  );
  const insertedBots = await rows(
    ctx.db.from('agent_bots').upsert(
      BUILTINS.filter(bot => bot.kind !== 'marketing' || ctx.env.MARKETING_BOT_ENABLED === 'true').map((bot) => ({
        ...bot,
        // PostgREST batches use the union of columns. Missing fields otherwise
        // become NULL, including on rows skipped by ON CONFLICT DO NOTHING.
        autonomy: bot.autonomy ?? 'read_only',
        notification_events: bot.notification_events ?? ['incident', 'approval'],
        account_id: ctx.accountId,
        created_by: ctx.user.id,
      })),
      { onConflict: 'account_id,slug', ignoreDuplicates: true },
    ).select('id'),
  );
  if (Array.isArray(insertedBots) && insertedBots.length > 0) {
    await rows(
      ctx.db.from('agent_operational_state').upsert(
        insertedBots.map((b) => ({ account_id: ctx.accountId, bot_id: b.id })),
        { onConflict: 'account_id,bot_id', ignoreDuplicates: true },
      ),
    );
  }
  const sentinel = await rows(
    ctx.db
      .from('agent_bots')
      .select('id')
      .eq('account_id', ctx.accountId)
      .eq('slug', 'sentinela')
      .single(),
  );
  await rows(
    ctx.db
      .from('agent_schedules')
      .upsert(
        {
          account_id: ctx.accountId,
          bot_id: sentinel.id,
          interval_minutes: 60,
        },
        { onConflict: 'account_id,bot_id', ignoreDuplicates: true },
      ),
  );
  if (ctx.env.MARKETING_BOT_ENABLED === 'true') {
    const marketing = await rows(ctx.db.from('agent_bots').select('*').eq('account_id', ctx.accountId).eq('slug', 'marketing').single());
    await setupMarketing(ctx, marketing);
  }
}

export async function getBot(ctx, id) {
  if (!UUID.test(id || '')) throw new AgentError('Bot inválido.');
  const bot = await rows(
    ctx.db
      .from('agent_bots')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('id', id)
      .maybeSingle(),
  );
  if (!bot) throw new AgentError('Bot não encontrado nesta conta.', 404);
  if (bot.kind === 'marketing' && ctx.env.MARKETING_BOT_ENABLED !== 'true') throw new AgentError('Marketing desativado no servidor.', 503);
  return bot;
}

async function conversation(ctx, botId) {
  await rows(
    ctx.db
      .from('agent_conversations')
      .upsert(
        { account_id: ctx.accountId, bot_id: botId },
        { onConflict: 'account_id,bot_id', ignoreDuplicates: true },
      ),
  );
  return rows(
    ctx.db
      .from('agent_conversations')
      .select('id')
      .eq('account_id', ctx.accountId)
      .eq('bot_id', botId)
      .single(),
  );
}

export async function listCentral(ctx, includePreviews = false) {
  await bootstrap(ctx);
  const [bots, approvals, approvalHistory, incidents, settings] =
    await Promise.all([
      botsStatus(ctx),
      rows(
        ctx.db
          .from('agent_approvals')
          .select('*')
          .eq('account_id', ctx.accountId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(100),
      ),
      rows(
        ctx.db
          .from('agent_approvals')
          .select('*')
          .eq('account_id', ctx.accountId)
          .neq('status', 'pending')
          .order('decided_at', { ascending: false })
          .limit(30),
      ),
      rows(
        ctx.db
          .from('agent_incidents')
          .select('*')
          .eq('account_id', ctx.accountId)
          .eq('status', 'open')
          .order('last_seen_at', { ascending: false })
          .limit(100),
      ),
      rows(
        ctx.db
          .from('agent_runtime_settings')
          .select('enabled,last_tick_at')
          .eq('account_id', ctx.accountId)
          .single(),
      ),
    ]);
  const previews = {};
  if (includePreviews) {
    const conversations = await rows(ctx.db.from('agent_conversations').select('id,bot_id').eq('account_id',ctx.accountId));
    await Promise.all(conversations.filter(conv=>bots.some(bot=>bot.id===conv.bot_id)).map(async conv=>{
      const latest=await rows(ctx.db.from('agent_messages').select('role,content,created_at').eq('account_id',ctx.accountId).eq('conversation_id',conv.id).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(1).maybeSingle());
      if (latest) previews[conv.bot_id]={...latest,content:latest.content.slice(0,220)};
    }));
  }
  return {
    bots,
    ...(includePreviews ? {previews} : {}),
    approvals: [...approvals, ...approvalHistory],
    incidents,
    settings,
    tools: TOOL_CATALOG,
    provider_configured: ctx.aiConfig ? ctx.aiConfig.enabled && ctx.aiConfig.configured : Boolean(
      ctx.env.DEEPINFRA_API_KEY || ctx.env.GROQ_API_KEY || ctx.env.OPENAI_API_KEY || ctx.env.GEMINI_API_KEY,
    ),
  };
}

export async function getConversation(ctx, botId, sessionId = null) {
  if(sessionId && !UUID.test(sessionId))throw new AgentError('Sessão de conversa inválida.');
  await getBot(ctx, botId);
  const conv = await conversation(ctx, botId);
  let messageQuery=ctx.db.from('agent_messages').select('*').eq('account_id',ctx.accountId).eq('conversation_id',conv.id).gt('expires_at',new Date().toISOString());
  if(sessionId)messageQuery=messageQuery.eq('session_id',sessionId);
  const [messages, runs, events] = await Promise.all([
    rows(messageQuery.order('created_at',{ascending:false}).limit(100)),
    rows(
      ctx.db
        .from('agent_runs')
        .select('*')
        .eq('account_id', ctx.accountId)
        .eq('bot_id', botId)
        .order('started_at', { ascending: false })
        .limit(30),
    ),
    rows(
      ctx.db
        .from('agent_events')
        .select('*')
        .eq('account_id', ctx.accountId)
        .eq('bot_id', botId)
        .order('created_at', { ascending: false })
        .limit(50),
    ),
  ]);
  return {
    conversation_id: conv.id,
    messages: messages.reverse(),
    runs,
    events,
  };
}

export async function clearConversation(ctx, botId) {
  if (botId && botId !== 'all') {
    const bot = await getBot(ctx, botId);
    const conv = await conversation(ctx, bot.id);
    await ctx.db
      .from('agent_messages')
      .delete()
      .eq('account_id', ctx.accountId)
      .eq('conversation_id', conv.id);
    await event(ctx, bot.id, null, 'conversation_cleared', {
      conversation_id: conv.id,
    });
    return { ok: true, bot_id: bot.id, conversation_id: conv.id };
  }
  await ctx.db
    .from('agent_messages')
    .delete()
    .eq('account_id', ctx.accountId);
  return { ok: true, cleared_all: true };
}

async function analyze(ctx, bot, prompt, trigger, requestId, history = []) {
  if (!bot.active) throw new AgentError('Este bot está desativado.', 409);
  const provider = createAIProvider(ctx.env, bot.provider);
  const tools = allowedTools(bot);
  if (!tools.length)
    throw new AgentError(
      'Nenhuma ferramenta de consulta está habilitada para este bot.',
      409,
    );
  const inserted = await ctx.db
    .from('agent_runs')
    .insert({
      account_id: ctx.accountId,
      bot_id: bot.id,
      trigger_type: trigger,
      request_id: requestId,
    })
    .select()
    .single();
  if (inserted.error?.code === '23505')
    throw new AgentError(
      'Este bot já está processando uma solicitação. Aguarde a conclusão.',
      409,
    );
  if (inserted.error)
    throw new AgentError('Não foi possível iniciar a consulta.', 503);
  const run = inserted.data;
  const sources = [];
  const technical = technicalDetailsRequested(prompt);
  const extraRound = Boolean(ctx.user && extraRoundRequested(prompt));
  if(extraRound) await event(ctx,bot.id,run.id,'extra_round_requested',{requested_by:ctx.user.id,requested_at:new Date().toISOString(),request_id:requestId});
  try {
function botSpecificDirectives(bot) {
  const sections = [];

  sections.push(`RACIOCÍNIO TEMPORAL (AMERICA/SAO_PAULO):
- Todas as datas e horários devem respeitar o fuso horário de Brasília.
- Se o usuário perguntar quantas vezes você trabalhou hoje e hoje não houve execuções registradas (count = 0), responda com clareza que hoje ainda não houve execuções registradas.
- Se a última atividade foi ontem ou em outra data anterior, informe com exatidão data e horário local.`);

  if (bot.kind === 'captador' || bot.kind === 'gestor') {
    sections.push(`POLÍTICA USER_QUERY_FIDELITY (NUNCA INVENTAR FILTROS):
- Ao chamar a ferramenta de busca (searchCapturedProperties), use ESTRITAMENTE os filtros solicitados pelo usuário na pergunta.
- Se o usuário NÃO disse "hoje" ou não especificou um período, NÃO passe "period: today" nem "days". Deixe o período em branco para buscar todo o histórico disponível.
- Se o usuário NÃO especificou um status exato (como DISCOVERED ou WAITING_RESPONSE), NÃO passe o filtro de status. Deixe o status em branco para buscar todos os registros compatíveis.
- Nunca estreite a busca arbitrariamente.`);
  }

  if (bot.kind === 'captador') {
    sections.push(`RODADAS E HORÁRIOS OPERACIONAIS (BOT CAPTADOR):
- Para você (Bot Captador): os horários oficiais configurados são 09:00 e 19:00 (horário de Brasília).
- A próxima rodada deve seguir estritamente o horário atual de Brasília: se agora for antes das 09:00, a próxima é hoje às 09:00; se for entre 09:00 e 19:00, a próxima é hoje às 19:00; se já passou das 19:00, a próxima é amanhã às 09:00. NUNCA diga que a próxima rodada é 19:00 se esse horário já passou hoje! Use sempre os campos proxima_rodada_resumo e proxima_rodada_texto fornecidos pela ferramenta.`);
  }

  if (bot.kind === 'marketing') {
    sections.push(`FRESHNESS POLICY, PESQUISA ATIVA E POLÍTICA DE UMA IDEIA (BOT DE MARKETING):
- FONTES PRÓPRIAS E ISOLAMENTO: Você é o Bot de Marketing. Suas fontes são canais e feeds oficiais da nossa região (portais de João Pessoa/Cabedelo, IBGE, Agência Brasil) e tendências web sobre mercado imobiliário. Você NÃO executa nem acompanha rodadas de captação imobiliária (essas pertencem exclusivamente ao Bot Captador às 09h e 19h). NUNCA mencione horários do Captador, VM Hyper-V ou captação de proprietários como se fossem pesquisas suas!
- POLÍTICA DE UMA IDEIA: Ao sugerir pautas ou ideias de conteúdo, apresente SEMPRE UMA ÚNICA IDEIA PRINCIPAL por vez, bem desenvolvida e estruturada (gancho, formato, canal, por que faz sentido agora). Não despeje listas genéricas de 5 ideias. Guarde as alternativas no estado. Finalize com um convite natural: "Quer que eu desenvolva essa ou prefere explorar outra linha?".
- ALTERNATIVAS SOB DEMANDA: Se o usuário disser "não gostei", "tem outra opção?" ou "que mais você pensou?", NÃO refaça a pesquisa web do zero: consulte e proponha uma das ideias alternativas já existentes no seu estado/memória!
- Quando a pergunta mencionar o Instagram conectado, consulte getInstagramContext. Consulte getMarketingStatus para saber o que foi executado. Legendas não são análise visual, e leitura de conteúdos não comprova análise de tendências.
- Se o usuário pedir ideias ou tendências e não houver registros para o dia de hoje, chame a ferramenta researchMarketTrends nesta conversa para buscar notícias frescas antes de responder.
- Se o usuário pedir para você mudar seu próprio tom ou foco no chat, chame a ferramenta updateMarketingPreferences.`);
  }

  if (bot.kind === 'sentinela') {
    sections.push(`INVESTIGAÇÃO ENCADEADA, RESOLUÇÃO DE INCIDENTES E DISTINÇÃO DE INTERPRETAÇÃO (BOT SENTINELA):
- Ao investigar problemas do sistema ou responder perguntas como "quais problemas encontrou" ou "o que aconteceu aqui": NÃO pare na listagem preliminar de getOpenIncidents. Se identificar uma ocorrência aberta ou anomalia, chame a ferramenta de diagnóstico getComponentDiagnostics (com o componente afetado) ou runLiveInspection para investigar os fatos em tempo real antes de responder.
- SE O USUÁRIO DISSER QUE JÁ CORRIGIU ("já corrigimos isso", "pode conferir?", "confere se resolveu"): execute imediatamente uma verificação ativa (runLiveInspection ou getComponentDiagnostics no componente). Se o teste comprovar que o problema foi corrigido, chame acknowledgeOrResolveIncident para marcar formalmente a ocorrência como resolvida no histórico de auditoria! Responda direto sobre o componente verificado, sem despejar relatórios de outros componentes normais.
- SE O USUÁRIO PEDIR PARA ZERAR UMA OCORRÊNCIA TRATADA ("zera essa ocorrência de erro 401 que já foi tratada"): execute a ferramenta acknowledgeOrResolveIncident para registrar formalmente a resolução/ciência. Confirme que ela não aparecerá mais como pendência aberta (mantendo o histórico seguro no banco).
- Distinga sempre com clareza: FATO (o que foi comprovado pela ferramenta), HIPÓTESE (suspeita que ainda exige verificação) e CAUSA CONFIRMADA. Se a causa não foi confirmada, diga com naturalidade que a causa ainda é desconhecida e está em investigação.
- REGRA CRÍTICA (OBSERVADO ≠ CAUSA CONFIRMADA e OBSERVADO ≠ COMPORTAMENTO ESPERADO):
  - Nunca afirme que um erro ou código HTTP (ex: HTTP 401) "faz parte da proteção de uma rota privada" a menos que haja evidência real de que aquela rota específica deveria exigir autenticação (ex: verificação match_api onde o esperado é 401).
  - Se a ferramenta apenas detectar HTTP 401 sem saber se aquilo era esperado (ex: app_http), você NUNCA deve inventar que "é normal". Afirme a verdade: "A rota respondeu 401, ou seja, recusou o acesso. Ainda preciso confirmar se isso era o comportamento esperado ou se existe alguma falha de autenticação ou configuração."`);
  }

  if (bot.kind === 'gestor') {
    sections.push(`COMANDO MASTER, ORQUESTRAÇÃO E RESUMO FACTUAL (BOT GESTOR):
- VOCÊ É O LÍDER E ORQUESTRADOR CENTRAL: A regra antiga de que você não reprograma bots foi revogada por Ronaldo. Você AGORA TEM autorização explícita para interpretar comandos em linguagem natural e configurar o comportamento, estilo, foco, prioridades e regras dos outros bots (Marketing, Captador, Sentinela e Gestor)!
- PROVA DE EXECUÇÃO: Confirme uma alteração somente se configureAgentBehavior retornar success=true e configuration_saved=true. Falha, indisponibilidade ou permissão negada significam que a alteração NÃO foi aplicada. Preferência salva não é rotina executada. Nunca prometa publicação, pesquisa global no Instagram, análise visual ou mudança de agendamento a partir de uma diretriz textual.
- INSTAGRAM: Consulte getInstagramContext antes de afirmar qual conta está conectada, se pode acessá-la ou se a conexão está indisponível. Explique os limites retornados.
- CONFIGURAÇÃO DE BOTS: Quando Ronaldo pedir para alterar foco ou comportamento de um bot (ex: "mude o estilo do Marketing para focar em investidores", "Captador priorizando apartamentos de 3 quartos no Bessa", "Sentinela alertando só erros críticos"): chame a ferramenta configureAgentBehavior com os parâmetros correspondentes!
- COMANDOS COMPOSTOS OU DE ÁUDIO (DECOMPOSIÇÃO): Quando Ronaldo enviar uma instrução contendo diretivas para múltiplos bots numa única mensagem (ex: Marketing focado em alto padrão, Captador em 3 quartos no Bessa/Manaíra e Sentinela em erros críticos), decomponha o pedido e chame configureAgentBehavior para cada bot individualmente, respondendo de forma clara, estruturada e sem misturar as diretivas entre os bots.
- REVERSÃO (ROLLBACK): Se Ronaldo pedir para reverter uma configuração ("volta como era antes", "desfaz a última alteração"), chame rollbackAgentConfiguration para restaurar o estado anterior.
- LIMITES DE INFRAESTRUTURA PROTEGIDA (NÍVEL 3): O Bot Captador roda numa VM Hyper-V dedicada com horários fixos de scraping (09:00 e 19:00) controlados pelo Task Scheduler do Windows. Se Ronaldo pedir para alterar essa frequência física (ex: rodar a cada 1 hora): aplique o que for regra de negócio (ex: foco em aluguel) via configureAgentBehavior, mas explique tecnicamente e com clareza que o agendamento da VM Hyper-V depende de ajuste na infraestrutura do Windows. NUNCA finja que alterou horários da VM.
- CONSULTA SOB DEMANDA DE OUTROS BOTS: Se Ronaldo perguntar o que outro bot andou fazendo, conversando ou pensando, use getAgentConversationContext ou getBotsStatus para consultar sob demanda sem contaminação.
- RESUMO FACTUAL DOS BOTS: Ao ser perguntado "como estão meus bots hoje", use os dados de getBotsStatus para apresentar um resumo humano, limpo e direto dos 4 bots, mencionando o status e a última/próxima atividade confirmada de cada um.`);
  }

  return sections.join('\n\n');
}

    let route = extraRound ? 'operational' : trigger === 'chat' ? conversationRoute(prompt) : 'operational';
    if (route === 'classify') {
      const routingMessages = [{role:'system',content:ROUTING_POLICY}, ...history.slice(-4), {role:'user',content:prompt}];
      if (bot.kind === 'marketing') {
        const cost = costEnvelope(ctx.env,routingMessages,marketingModel(ctx.env,bot.provider));
        if (!await rows(ctx.db.rpc('agent_marketing_reserve_chat',{p_account_id:ctx.accountId,p_run_id:run.id,p_cost:cost.estimate_usd}))) throw new AgentError('Limite de orçamento do Marketing atingido.',429);
      }
      const decision = await provider.complete({messages:routingMessages,tools:[],maxOutputTokens:64,reasoningEffort:'low'});
      route = parseRoute(decision.content);
    }
    if (requiresOperationalEvidence(prompt)) route = 'operational';
    if (isDirectRoute(route)) {
      const rememberedContext = await chatMemoryContext(ctx,bot.id);
      const directPreferences = redactOperationalData(await buildAgentPreferencesContext(ctx, bot).catch(() => ''), ctx.env);
      const messages = [
        {
          role: 'system',
          content: `Você é ${bot.name}, da Central de Bots do Meus Imóveis. ${BOT_COMMUNICATION_POLICY}
${identityPolicy(bot)}
${capabilityPolicy(bot)}

${routeGuidance(route, bot)}
${directPreferences}
${OWNER_COMMAND_POLICY}
${rememberedContext}`,
        },
        ...history,
        { role: 'user', content: prompt },
      ];
      if (bot.kind === 'marketing') {
        const cost = costEnvelope(ctx.env,messages,marketingModel(ctx.env,bot.provider));
        if (!await rows(ctx.db.rpc('agent_marketing_reserve_chat',{p_account_id:ctx.accountId,p_run_id:run.id,p_cost:cost.estimate_usd}))) throw new AgentError('Limite de orçamento do Marketing atingido.',429);
      }
      const reply = await provider.complete({
        messages,
        tools: [], maxOutputTokens: 1024, reasoningEffort: 'low',
        onText: ctx.onText ? text => {
          const safe=redactOperationalData(text,ctx.env).replace(/\*\*/g,'');
          if(communicationSafe(safe,[],technical)) ctx.onText(safe);
        } : undefined,
      });
      const greetingText = redactOperationalData(reply.content?.trim() || '',ctx.env).replace(/\*\*([^*\n]+)\*\*/g,'$1');
      const content = communicationSafe(greetingText,[],technical) ? greetingText : 'Vou explicar de um jeito mais simples. Qual parte você quer que eu esclareça?';
      if (!content) throw new AgentError('A IA não retornou uma resposta válida.',503);
      const auditResult={provider:provider.name,model:provider.model,tool_count:0,conversation_route:route};
      if (bot.kind === 'marketing') {
        const budget=await rows(ctx.db.from('agent_runs').select('result').eq('account_id',ctx.accountId).eq('id',run.id).single());
        Object.assign(auditResult,budget.result);
      }
      await rows(ctx.db.from('agent_runs').update({status:'completed',finished_at:new Date().toISOString(),result:auditResult}).eq('account_id',ctx.accountId).eq('id',run.id));
      await event(ctx,bot.id,run.id,'analysis_completed',{provider:provider.name,tool_count:0});
      return {content,sources:[],run_id:run.id};
    }
    const nowBrasilia = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      dateStyle: 'full',
      timeStyle: 'medium',
    }).format(new Date());

    const operationalContext = redactOperationalData(await buildAgentOperationalContext(ctx, bot, prompt).catch(() => 'A memória de continuidade está indisponível. Consulte as ferramentas factuais; não invente lembranças.'),ctx.env);
    const preferencesContext = await buildAgentPreferencesContext(ctx, bot).catch(() => '');

    const messages = [
      {
        role: 'system',
        content: `Você é ${bot.name}, da Central de Bots do Meus Imóveis. ${BOT_COMMUNICATION_POLICY}
${identityPolicy(bot)}
${capabilityPolicy(bot)}
${temporalPolicy(prompt)}
Data/hora atual: ${nowBrasilia} (Fuso America/Sao_Paulo).

${operationalContext}
${preferencesContext ? `\n${preferencesContext}\n` : ''}

DIRETRIZES CRÍTICAS DE AUTONOMIA E VERACIDADE:

${botSpecificDirectives(bot)}
${OWNER_COMMAND_POLICY}
${await chatMemoryContext(ctx,bot.id)}
Se perguntarem sobre algo que já foi discutido ou feito, consulte getAgentMemory com os termos relevantes. Não invente recordações.

${technical ? "A pessoa pediu detalhes técnicos explicitamente. Pode apresentá-los, preservando os limites de segurança e a distinção entre fato e hipótese." : "A pessoa não pediu detalhes técnicos. Use a explicação humana das fontes e preserve as incertezas."}
Missão declarada pelo usuário: ${bot.mission}`,
      },
      ...history,
      { role: 'user', content: prompt },
    ];
    let reply;
    const maxSteps = 4;
    for (let step = 0; step < maxSteps; step++) {
      if (bot.kind === 'marketing') {
        const cost = costEnvelope(ctx.env,[...messages,{role:'system',content:JSON.stringify(tools)}],marketingModel(ctx.env,bot.provider));
        const reserved = await rows(ctx.db.rpc('agent_marketing_reserve_chat',{p_account_id:ctx.accountId,p_run_id:run.id,p_cost:cost.estimate_usd}));
        if (!reserved) throw new AgentError('Limite de orçamento do Marketing atingido. Seu feedback pode continuar sendo registrado.',429);
      }

      const stepPrompt = step === 0
        ? (extraRound ? 'Rodada extra por solicitação direta do usuário: execute agora a operação pedida nas fontes habilitadas. Não adie por horários e não devolva apenas histórico de atividades. Respeite a proibição de contato/publicação quando presente. Retorne uma chamada de ferramenta.' : 'Etapa inicial: chame a ferramenta mais apropriada para obter os dados necessários para responder à pergunta (retorne apenas a chamada de ferramenta, sem texto livre).')
        : (step < maxSteps - 1
          ? `Você recebeu dados da ferramenta. Avalie com critério:
- Se os dados obtidos já forem suficientes para responder completamente com fatos e segurança, gere a resposta final ao Ronaldo em texto simples, coloquial, amigável e direto.
- Se a informação estiver vazia ou desatualizada (ex: Marketing sem ideias registradas), ou se houver um incidente/problema que precise de diagnóstico (ex: Sentinela com incidente aberto que precisa de getComponentDiagnostics ou runLiveInspection): NÃO encerre a conversa ainda! Chame a próxima ferramenta necessária para investigar os fatos.
- Nunca diga que não sabe uma informação se você possui uma ferramenta capaz de descobri-la.`
          : `Etapa final: elabore a resposta final para o Ronaldo em texto simples, coloquial, caloroso e direto. ${technical ? 'Pode incluir detalhes técnicos.' : 'Sem asteriscos, termos de banco de dados ou jargões internos.'} Responda estritamente com base nos fatos confirmados nas ferramentas desta conversa.`);

      const recalling=/lembra|lembrar|falamos|conversamos|combinamos|eu te disse/i.test(prompt);
      const immediateTools=recalling && step===0 ? tools.filter(tool=>tool.name==='getAgentMemory') : extraRound && step===0 ? tools.filter(tool=>LIVE_OPERATIONS.has(tool.name)) : [];
      reply = await provider.complete({
        messages: [{...messages[0],content:messages[0].content + '\n' + stepPrompt},...messages.slice(1)],
        tools: step === maxSteps - 1 ? [] : immediateTools.length ? immediateTools : tools,
        requireTool: step === 0,
        reasoningEffort: 'low',
        onText: ctx.onText && step > 0 ? text => {
          const boundary=text.search(/\S+$/u);
          const prefix=boundary<0?text:text.slice(0,boundary);
          const safe=redactOperationalData(prefix,ctx.env).replace(/\*\*/g,'');
          if(!(extraRound && isRoutineDeferral(safe)) && !instagramAccessReceipt(prompt,sources) && !sources.some(source => ['configureAgentBehavior','updateMarketingPreferences','rollbackAgentConfiguration'].includes(source.tool)) && safe.trim() && groundedReply(safe,sources)===safe.trim() && communicationSafe(safe,sources,technical)) ctx.onText(safe);
        } : undefined,
      });
      if (!reply.tool_calls?.length) break;
      if (reply.tool_calls.length > 3)
        throw new AgentError(
          'A consulta excedeu o limite de ferramentas. Faça uma pergunta mais específica.',
          422,
        );
      ctx.onText?.('');
      messages.push(reply);
      for (const call of reply.tool_calls.slice(0, 3)) {
        let result;
        try {
          const args = JSON.parse(call.function.arguments || '{}');
          const period = requestedPeriod(prompt);
          const schema = tools.find(tool => tool.name === call.function.name)?.parameters;
          if (period && schema?.properties?.period) { args.period = period; delete args.days; }
          if (call.function.name === 'searchCapturedProperties' && !hasExplicitPeriod(prompt)) { delete args.period; delete args.days; }
          result = redactOperationalData(
            await executeTool(ctx, bot, run.id, call.function.name, args),
            ctx.env,
          );
          sources.push({
            tool: call.function.name,
            arguments: args,
            observed_at: new Date().toISOString(),
            data: result,
          });
          await syncToolExecutionToState(ctx, bot, call.function.name, args, result);
        } catch {
          result = {
            unavailable: true,
            message:
              'Consulta indisponível ou não autorizada. Não infira números nem status.',
          };
          sources.push({tool:call.function.name,observed_at:new Date().toISOString(),data:result});
        }
        // Keep complete redacted evidence and tool references for investigation;
        // the human explanation guides presentation, not operational decisions.
        const serialized = JSON.stringify({ ...result, human_explanation: humanSourceSummary(result) });
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.function.name,
          content:
            serialized.length <= 40000
              ? serialized
              : JSON.stringify({
                  unavailable: true,
                  message: 'Resultado grande demais; reduza período ou limite.',
                }),
        });
      }
    }
    const grounded = (configurationReceipt(sources) || instagramAccessReceipt(prompt, sources) || groundedReply(reply?.content, sources)).replace(/\*\*([^*\n]+)\*\*/g,'$1');
    let content = communicationSafe(grounded,sources,technical) ? grounded : humanFallback(sources);
    if(extraRound) {
      const live=sources.filter(source=>LIVE_OPERATIONS.has(source.tool));
      const verified=live.some(source=>source.data&&!source.data.unavailable&&source.data.success!==false);
      if(isRoutineDeferral(content))content=verified ? 'Executei a consulta nas fontes habilitadas. O resultado confirmado está registrado nas fontes desta resposta.' : 'Não consegui confirmar a execução nesta tentativa; os registros indicam o impedimento real. O horário da rotina não impede seu pedido.';
      if(!verified && live.some(source=>source.data?.reason)) {
        const reason=live.find(source=>source.data?.reason)?.data.reason;
        if(communicationSafe(reason,live,technical))content=reason;
      }
      const when=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date());
      content=(verified?'Fiz uma consulta extra a seu pedido em ':'Tentei a execução extra a seu pedido em ')+when+' (horário de Brasília).\n\n'+content;
      await event(ctx,bot.id,run.id,verified?'extra_round_completed':'extra_round_unconfirmed',{requested_by:ctx.user.id,request_id:requestId,tools:live.map(source=>source.tool),verified});
    }
    const auditResult =
      trigger === 'chat'
        ? { extra_round:extraRound,requested_by:ctx.user?.id||null,provider: provider.name, model: provider.model, tool_count: sources.length, conversation_route:route }
        : { content, sources, provider: provider.name };
    if (bot.kind === 'marketing') {
      const budget = await rows(ctx.db.from('agent_runs').select('result').eq('account_id',ctx.accountId).eq('id',run.id).single());
      Object.assign(auditResult,budget.result);
    }
    await rows(
      ctx.db
        .from('agent_runs')
        .update({
          status: 'completed',
          finished_at: new Date().toISOString(),
          result: auditResult,
        })
        .eq('account_id', ctx.accountId)
        .eq('id', run.id),
    );
    await event(ctx, bot.id, run.id, 'analysis_completed', {
      provider: provider.name,
      tool_count: sources.length,
    });
    return { content, sources, run_id: run.id };
  } catch (error) {
    await ctx.db
      .from('agent_runs')
      .update({
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: 'Consulta não concluída.',
      })
      .eq('account_id', ctx.accountId)
      .eq('id', run.id);
    throw error;
  }
}

export async function chat(ctx, body) {
  const bot = await getBot(ctx, body.bot_id);
  const content = requiredText(body.content, 'Mensagem');
  if (!UUID.test(body.request_id || ''))
    throw new AgentError('Identificador da mensagem inválido.');
  if(body.session_id && !UUID.test(body.session_id))throw new AgentError('Sessão de conversa inválida.');
  const conv = await conversation(ctx, bot.id);
  const previous = await rows(
    ctx.db
      .from('agent_messages')
      .select('*')
      .eq('account_id', ctx.accountId)
      .eq('conversation_id', conv.id)
      .eq('client_message_id', body.request_id)
      .eq('role', 'assistant')
      .maybeSingle(),
  );
  if (previous) return { message: previous };
  const { count, error } = await ctx.db
    .from('agent_runs')
    .select('id', { head: true, count: 'exact' })
    .eq('account_id', ctx.accountId)
    .gte('started_at', new Date(Date.now() - 3600000).toISOString());
  if (error)
    throw new AgentError('Não foi possível verificar o limite de uso.', 503);
  if (count >= 60)
    throw new AgentError('Limite de consultas da hora atingido.', 429);
  let historyQuery=ctx.db.from('agent_messages').select('role,content').eq('account_id',ctx.accountId).eq('conversation_id',conv.id).gt('expires_at',new Date().toISOString());
  if(body.session_id)historyQuery=historyQuery.eq('session_id',body.session_id);
  const history=await rows(historyQuery.order('created_at',{ascending:false}).limit(12));
  await rows(
    ctx.db
      .from('agent_messages')
      .upsert(
        {
          account_id: ctx.accountId,
          conversation_id: conv.id,
          client_message_id: body.request_id,
          role: 'user',
          content,
          ...(body.session_id?{session_id:body.session_id,expires_at:new Date(Date.now()+86400000).toISOString()}:{}),
        },
        {
          onConflict: 'account_id,conversation_id,client_message_id,role',
          ignoreDuplicates: true,
        },
      ),
  );
  let result;
  const isAlternativeOrInquiry = /(?:tem\s+outra|outra\s+op|outra\s+ideia|que\s+mais|mostra\s+outra|manda\s+outra|troca\s+essa|\?)/i.test(content);
  if (bot.kind === 'marketing' && !isAlternativeOrInquiry && parseFeedback(content)) {
    const latest = await rows(ctx.db.from('agent_messages').select('client_message_id,sources').eq('account_id', ctx.accountId).eq('conversation_id', conv.id).eq('role','assistant').order('created_at', { ascending: false }).limit(1).maybeSingle());
    const ideaRef = latest?.sources?.find(s => s.tool === 'marketingFeedback')?.data?.idea_id || latest?.client_message_id;
    const idea = ideaRef ? await rows(marketingScoped(ctx, 'ideas').eq('id', ideaRef).maybeSingle()) : null;
    if (idea) {
      await marketingFeedback(ctx, { idea_id: idea.id, request_id: body.request_id, text: content });
      result = { content: 'Registrei sua escolha e vou considerar esse retorno nas próximas pesquisas.', sources: [{ tool: 'marketingFeedback', observed_at: new Date().toISOString(), data: { idea_id: idea.id } }], run_id: null };
    } else result = { content: 'Indique a ideia na aba Ideias para eu registrar esse retorno no lugar certo.', sources: [], run_id: null };
  }
  try {
  result ||= await analyze(
    ctx,
    bot,
    content,
    'chat',
    body.request_id,
    history.reverse(),
  );
  } catch(error) {
    await rememberChat(ctx,bot.id,body.request_id,content,[{tool:'requestedTask',data:{unavailable:true,success:false,reason:'Não foi possível concluir a execução.'}}],extraRoundRequested(content));
    throw error;
  }
  const message = await rows(
    ctx.db
      .from('agent_messages')
      .insert({
        account_id: ctx.accountId,
        conversation_id: conv.id,
        client_message_id: body.request_id,
        role: 'assistant',
        ...(body.session_id?{session_id:body.session_id,expires_at:new Date(Date.now()+86400000).toISOString()}:{}),
        content: result.content,
        sources: result.sources,
      })
      .select()
      .single(),
  );

  await updateAgentOperationalState(ctx, bot.id, {
    last_interaction_at: new Date().toISOString(),
  }).catch(() => {}); // Continuity must never discard an already saved answer.

  if (bot.kind === 'marketing' && result.sources?.some(source => ['researchMarketTrends','searchMarketingWeb','getMarketingIdeas'].includes(source.tool)) && result.content && !result.content.includes('Ainda não consegui confirmar')) {
    await recordOperationalMemory(ctx, bot.id, {
      kind: 'editorial',
      topic: 'Pauta e Ideias Apresentadas',
      summary: result.content.slice(0, 350),
      data: { client_message_id: body.request_id },
      retentionDays: 30,
    }).catch(() => {});
  }

  await rememberChat(ctx,bot.id,body.request_id,content,result.sources,extraRoundRequested(content));
  return { message, run_id: result.run_id };
}

export async function createBot(ctx, input) {
  const name = requiredText(input.name, 'Nome', 2, 60),
    mission = requiredText(input.mission, 'Missão', 5, 4000);
  if (
    !AVATARS.includes(input.avatar) ||
    !AUTONOMIES.includes(input.autonomy) ||
    !MODES.includes(input.work_mode)
  )
    throw new AgentError('Configuração do bot inválida.');
  const permitted = TOOL_CATALOG.map((t) => t.name);
  if (
    !Array.isArray(input.tools) ||
    !input.tools.length ||
    input.tools.some((t) => !permitted.includes(t))
  )
    throw new AgentError('Selecione ferramentas permitidas.');
  if (
    !Number.isInteger(input.interval_minutes) ||
    ![60, 180, 360, 1440, 10080].includes(input.interval_minutes)
  )
    throw new AgentError('Intervalo de trabalho inválido.');
  const { count, error } = await ctx.db
    .from('agent_bots')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', ctx.accountId);
  if (error || count >= 20)
    throw new AgentError(
      'Não foi possível criar outro bot. Limite: 20 por conta.',
      409,
    );
  const bot = await rows(
    ctx.db
      .from('agent_bots')
      .insert({
        account_id: ctx.accountId,
        slug: `custom-${crypto.randomUUID()}`,
        name,
        mission,
        kind: 'custom',
        avatar: input.avatar,
        tools: [...new Set(input.tools)],
        autonomy: input.autonomy,
        work_mode: input.work_mode,
        notifications: Boolean(input.notifications),
        notification_events: [
          'incident',
          'approval',
          ...(input.notify_results ? ['result'] : []),
        ],
        created_by: ctx.user.id,
      })
      .select()
      .single(),
  );
  if (bot.work_mode !== 'on_demand') {
    try {
      await rows(
        ctx.db
          .from('agent_schedules')
          .insert({
            account_id: ctx.accountId,
            bot_id: bot.id,
            interval_minutes: input.interval_minutes,
          }),
      );
    } catch (error) {
      await ctx.db
        .from('agent_bots')
        .delete()
        .eq('account_id', ctx.accountId)
        .eq('id', bot.id);
      throw error;
    }
  }
  await event(ctx, bot.id, null, 'bot_created', {
    work_mode: bot.work_mode,
    autonomy: bot.autonomy,
  });
  return { bot };
}

async function report(ctx, bot, trigger = 'schedule') {
  const requestId = crypto.randomUUID();
  const result = await analyze(
    ctx,
    bot,
    `Produza o relatório solicitado pela missão, usando as fontes autorizadas. ${bot.mission}`,
    trigger,
    requestId,
  );
  const conv = await conversation(ctx, bot.id);
  await rows(
    ctx.db
      .from('agent_messages')
      .insert({
        account_id: ctx.accountId,
        conversation_id: conv.id,
        client_message_id: requestId,
        role: 'assistant',
        content: result.content,
        sources: result.sources,
      }),
  );
  await ctx.notify(bot, 'result', {
    title: bot.name,
    body: 'Seu relatório está disponível.',
    url: `/central-de-bots?bot=${bot.slug}`,
    tag: `agent-report-${requestId}`,
  });
  return result;
}

export async function decideApproval(ctx, body) {
  if (
    !ctx.user?.id ||
    !UUID.test(body.approval_id || '') ||
    !['approve', 'deny'].includes(body.decision)
  )
    throw new AgentError('Decisão inválida.');
  const approval = await rows(
    ctx.db
      .from('agent_approvals')
      .update({
        status: body.decision === 'approve' ? 'approved' : 'denied',
        decided_by: ctx.user.id,
        decided_at: new Date().toISOString(),
      })
      .eq('account_id', ctx.accountId)
      .eq('id', body.approval_id)
      .eq('status', 'pending')
      .select()
      .maybeSingle(),
  );
  if (!approval)
    throw new AgentError(
      'Esta aprovação já foi decidida ou não pertence à conta.',
      409,
    );
  await event(ctx, approval.bot_id, null, 'approval_decided', {
    approval_id: approval.id,
    decision: body.decision,
    user_id: ctx.user.id,
  });
  if (body.decision === 'deny') return { approval };
  try {
    const bot = await getBot(ctx, approval.bot_id);
    let result;
    if (approval.action === 'investigate_incident') {
      const incident = await rows(
        ctx.db
          .from('agent_incidents')
          .select('*')
          .eq('account_id', ctx.accountId)
          .eq('id', approval.context.incident_id)
          .single(),
      );
      result = {
        inspection: await inspectSystem(ctx, bot, {
          deep: true,
          trigger: 'approval',
        }),
        dossier: maintenanceDossier(incident, approval),
      };
    } else if (approval.action === 'run_report')
      result = await report(ctx, bot, 'approval');
    else throw new AgentError('Ação fora do escopo da V1.', 403);
    await rows(
      ctx.db
        .from('agent_approvals')
        .update({ status: 'executed', result })
        .eq('account_id', ctx.accountId)
        .eq('id', approval.id),
    );
    return { approval: { ...approval, status: 'executed', result } };
  } catch (error) {
    await ctx.db
      .from('agent_approvals')
      .update({
        status: 'failed',
        result: {
          error:
            'Investigação ou relatório não concluído; nenhuma alteração operacional executada.',
        },
      })
      .eq('account_id', ctx.accountId)
      .eq('id', approval.id);
    throw error;
  }
}

export async function tick(ctx, botId) {
  const target = await getBot(ctx, botId);
  if (target.kind === 'marketing') return marketingTick(ctx, target, { sendPush: ctx.marketingSendPush });
  if (target.kind === 'gestor') return executeDailyDigest(ctx, target);
  await rows(
    ctx.db
      .from('agent_runtime_settings')
      .update({ last_tick_at: new Date().toISOString() })
      .eq('account_id', ctx.accountId),
  );
  await rows(
    ctx.db
      .from('agent_runs')
      .update({
        status: 'failed',
        error: 'Execução interrompida por tempo limite.',
        finished_at: new Date().toISOString(),
      })
      .eq('account_id', ctx.accountId)
      .eq('status', 'running')
      .lt('started_at', new Date(Date.now() - 10 * 60000).toISOString()),
  );
  const claimed = await rows(
    ctx.db.rpc('agent_claim_due_schedule', {
      p_account_id: ctx.accountId,
      p_bot_id: botId,
    }),
  );
  if (!claimed.length) return { skipped: true };
  const bot = await getBot(ctx, botId);
  if (bot.kind === 'sentinela') {
    const last = await rows(
      ctx.db
        .from('agent_runs')
        .select('started_at')
        .eq('account_id', ctx.accountId)
        .eq('bot_id', bot.id)
        .eq('status', 'completed')
        .eq('result->>depth', 'deep')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    return inspectSystem(ctx, bot, {
      deep: isDailyInspectionDue(last?.started_at),
      trigger: 'schedule',
    });
  }
    if (bot.work_mode === 'monitoring') {
    const changed = await rows(
      ctx.db
        .from('agent_events')
        .select('id')
        .eq('account_id', ctx.accountId)
        .in('type', ['incident_opened', 'tool_failed'])
        .gte(
          'created_at',
          new Date(
            Date.now() - claimed[0].interval_minutes * 60000,
          ).toISOString(),
        )
        .limit(1),
    );
    if (!changed.length)
      return { skipped: true, reason: 'Nenhuma ocorrência nova.' };
  }
  if (bot.autonomy === 'approval') {
    const existing = await rows(
      ctx.db
        .from('agent_approvals')
        .select('id')
        .eq('account_id', ctx.accountId)
        .eq('bot_id', bot.id)
        .eq('action', 'run_report')
        .eq('status', 'pending')
        .limit(1),
    );
    if (!existing.length) {
      await rows(
        ctx.db
          .from('agent_approvals')
          .insert({
            account_id: ctx.accountId,
            bot_id: bot.id,
            action: 'run_report',
            reason:
              'Autorizar o relatório agendado com ferramentas de leitura.',
            context: {},
          }),
      );
      await ctx.notify(bot, 'approval', {
        title: 'Central de Bots',
        body: `${bot.name} aguarda sua autorização.`,
        url: `/central-de-bots?bot=${bot.slug}`,
        tag: `agent-approval-${bot.id}`,
      });
    }
    return { awaiting_approval: true };
  }
  return report(ctx, bot);
}

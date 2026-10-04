import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  AgentError,
  UUID,
  rows,
  publicError,
  event,
  maintenanceDossier,
} from './core.js';
import {
  listCentral,
  getConversation,
  getBot,
  createBot,
  chat,
  decideApproval,
  tick,
} from './service.js';
import { inspectSystem } from './sentinel.js';
import { createAIProvider } from './ai-provider.js';
import { marketingAction } from '../bot-marketing/store.js';
import { globalAIContext } from '../system-ai/config.js';

function secretsEqual(a, b) {
  const left = Buffer.from(a || ''),
    right = Buffer.from(b || '');
  return (
    left.length > 0 &&
    left.length === right.length &&
    timingSafeEqual(left, right)
  );
}

export async function authorize(req, body, env, factory = createClient) {
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  if (
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.SUPABASE_ANON_KEY
  )
    throw new AgentError('Central não configurada.', 503);
  const db = factory(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, options);
  if (body.action === 'tick') {
    if (
      !UUID.test(body.account_id || '') ||
      !UUID.test(body.bot_id || '') ||
      !req.headers.get('x-central-cron')
    )
      throw new AgentError('Agendamento não autorizado.', 401);
    const runtime = await rows(
      db
        .from('agent_runtime_settings')
        .select('cron_secret,enabled')
        .eq('account_id', body.account_id)
        .maybeSingle(),
    );
    if (
      !runtime?.enabled ||
      !secretsEqual(req.headers.get('x-central-cron'), runtime.cron_secret)
    )
      throw new AgentError('Agendamento não autorizado.', 401);
    return { db, readDb: db, accountId: body.account_id, user: null, env };
  }
  const token = req.headers
    .get('authorization')
    ?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) throw new AgentError('Faça login para acessar a Central.', 401);
  const readDb = factory(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    ...options,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await readDb.auth.getUser(token);
  if (error || !data?.user)
    throw new AgentError('Sessão inválida ou expirada.', 401);
  if (
    data.user.email?.toLowerCase() !==
    (env.CENTRAL_ADMIN_EMAIL || 'ronaldomeira@gmail.com').toLowerCase()
  )
    throw new AgentError('Acesso não autorizado.', 403);
  const accountId = await rows(readDb.rpc('current_inventory_account_id'));
  if (!UUID.test(accountId || ''))
    throw new AgentError('Conta autenticada não encontrada.', 403);
  const runtime = await rows(
    db
      .from('agent_runtime_settings')
      .select('enabled')
      .eq('account_id', accountId)
      .maybeSingle(),
  );
  if (runtime?.enabled === false)
    throw new AgentError(
      'Central de Bots temporariamente desativada. O Captador operacional continua independente.',
      503,
    );
  return { db, readDb, accountId, user: data.user, env };
}

async function boundedBody(req) {
  if (Number(req.headers.get('content-length') || 0) > 4000000)
    throw new AgentError('Arquivo ou mensagem grande demais.', 413);
  const reader = req.body?.getReader();
  if (!reader) return {};
  const chunks = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > 4000000) {
      await reader.cancel();
      throw new AgentError('Arquivo ou mensagem grande demais.', 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AgentError('Requisição inválida.');
  }
}

/**
 * @param {Record<string, string>} env
 * @param {{ factory?: typeof createClient, sendPush?: (accountId: string, payload: object, options: object) => Promise<any> }} dependencies
 */
export function createAgentHandler(
  env,
  { factory = createClient, sendPush } = {},
) {
  return async function handler(req) {
    const origin = req.headers.get('origin');
    const allowed = [
      env.APP_ORIGIN || 'https://ronaldomeira.com.br',
      'https://www.ronaldomeira.com.br',
    ];
    if (env.CENTRAL_DEV_ORIGIN) allowed.push(env.CENTRAL_DEV_ORIGIN);
    const headers = {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      ...(origin && allowed.includes(origin)
        ? { 'Access-Control-Allow-Origin': origin }
        : {}),
    };
    const json = (body, status = 200) =>
      new Response(JSON.stringify(body), { status, headers });
    try {
      if (origin && !allowed.includes(origin))
        throw new AgentError('Origem não autorizada.', 403);
      if (req.method === 'OPTIONS')
        return new Response(null, { status: 204, headers });
      if (req.method !== 'POST')
        throw new AgentError('Método não permitido.', 405);
      if (env.CENTRAL_BOTS_ENABLED !== 'true')
        throw new AgentError(
          'Central de Bots temporariamente desativada.',
          503,
        );
      const body = await boundedBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new AgentError('Requisição inválida.');
      const ctx = await globalAIContext(await authorize(req, body, env, factory));
      ctx.marketingSendPush = sendPush;
      ctx.crmAccountId =
        ctx.accountId === env.MEUS_IMOVEIS_ACCOUNT_ID
          ? env.MATCH_CANONICAL_ACCOUNT_ID
          : null;
      ctx.notify = async (bot, type, payload) => {
        if (!bot.notifications || !bot.notification_events?.includes(type))
          return;
        try {
          if (!sendPush) throw new Error('Push bridge unavailable');
          const result = await sendPush(ctx.accountId, payload, { db: ctx.db });
          if (result.error) throw new Error('Push subscription lookup failed');
          await event(ctx, bot.id, null, 'push_attempted', {
            type,
            sent: result.sentCount,
            failed: result.failedCount,
          });
        } catch {
          try {
            await event(ctx, bot.id, null, 'push_failed', { type });
          } catch {
            /* Push must not stop inspections. */
          }
        }
      };
      switch (body.action) {
        case 'marketing': {
          if (env.MARKETING_BOT_ENABLED !== 'true') throw new AgentError('Marketing desativado no servidor.', 503);
          const bot = await getBot(ctx, body.bot_id);
          if (bot.kind !== 'marketing') throw new AgentError('Ação disponível apenas no Marketing.', 403);
          return json(await marketingAction(ctx, bot, body));
        }
        case 'list':
          return json(await listCentral(ctx, body.include_previews === true));
        case 'conversation':
          return json(await getConversation(ctx, body.bot_id));
        case 'chat': {
          if(body.stream !== true)return json(await chat(ctx,body));
          const encoder=new TextEncoder();let closed=false;
          const stream=new ReadableStream({
            async start(controller) {
              const send=value=>{if(!closed)controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'));};
              const heartbeat=setInterval(()=>send({type:'ping'}),10000);
              try {
                const result=await chat({...ctx,onText:text=>send({type:'text',text})},body);
                send({type:'done',...result});
              }catch(error){send({type:'error',error:publicError(error)});}
              finally{clearInterval(heartbeat);if(!closed){closed=true;controller.close();}}
            },
            cancel(){closed=true;},
          });
          return new Response(stream,{headers:{...headers,'Content-Type':'application/x-ndjson; charset=utf-8','X-Content-Type-Options':'nosniff'}});
        }
        case 'create_bot':
          return json(await createBot(ctx, body.bot || {}));
        case 'approval':
          return json(await decideApproval(ctx, body));
        case 'inspect': {
          const bot = await getBot(ctx, body.bot_id);
          if (bot.kind !== 'sentinela')
            throw new AgentError(
              'Inspeção disponível somente para o Sentinela.',
              403,
            );
          return json(
            await inspectSystem(ctx, bot, { deep: body.deep === true }),
          );
        }
        case 'incident': {
          if (!UUID.test(body.incident_id || ''))
            throw new AgentError('Ocorrência inválida.');
          const incident = await rows(
            ctx.db
              .from('agent_incidents')
              .select('*')
              .eq('account_id', ctx.accountId)
              .eq('id', body.incident_id)
              .maybeSingle(),
          );
          if (!incident)
            throw new AgentError('Ocorrência não encontrada.', 404);
          return json({ incident, dossier: maintenanceDossier(incident) });
        }
        case 'transcribe': {
          const bot = await getBot(ctx, body.bot_id);
          const usage = await ctx.db
            .from('agent_events')
            .select('id', { head: true, count: 'exact' })
            .eq('account_id', ctx.accountId)
            .eq('type', 'voice_requested')
            .gte('created_at', new Date(Date.now() - 3600000).toISOString());
          if (usage.error)
            throw new AgentError(
              'Não foi possível verificar o limite de áudio.',
              503,
            );
          if (usage.count >= 30)
            throw new AgentError(
              'Limite de transcrições da hora atingido.',
              429,
            );
          const mime = String(body.mime || '').split(';')[0];
          if (
            ![
              'audio/webm',
              'audio/mp4',
              'audio/aac',
              'audio/ogg',
              'audio/wav',
            ].includes(mime) ||
            typeof body.audio !== 'string' ||
            !/^[A-Za-z0-9+/]+={0,2}$/.test(body.audio)
          )
            throw new AgentError('Áudio inválido.');
          const bytes = Buffer.from(body.audio, 'base64');
          if (bytes.length < 100 || bytes.length > 2500000)
            throw new AgentError('Áudio vazio ou acima de 2,5 MB.', 413);
          await event(ctx, bot.id, null, 'voice_requested', {
            bytes: bytes.length,
          });
          const text = await createAIProvider(ctx.env, bot.provider).transcribe(
            bytes,
            mime,
          );
          await event(ctx, bot.id, null, 'voice_transcribed', {
            bytes: bytes.length,
          });
          return json({ text: text.trim().slice(0, 4000) });
        }
        case 'tick':
          return json(await tick(ctx, body.bot_id));
        default:
          throw new AgentError('Ação não permitida.', 403);
      }
    } catch (error) {
      return json(
        { error: publicError(error) },
        error instanceof AgentError ? error.status : 500,
      );
    }
  };
}

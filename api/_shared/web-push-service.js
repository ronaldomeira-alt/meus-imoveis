// ==============================================================================
// SERVIÇO DE WEB PUSH NOTIFICATIONS (BACKEND) — MEUS IMÓVEIS
// Envio com chaves VAPID, suporte a múltiplos dispositivos e auto-purge 404/410
// ==============================================================================

import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

// Carrega variáveis VAPID do ambiente
const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  process.env.VITE_VAPID_PUBLIC_KEY ||
  'BB_e6M8cQpybTAKp2E2AMye7t4gUC-Ycdts1g5r5RyDjMlPwMXNFz5E2ELB0_PApjxwN9jXbPtKDt2OoILS46qk';

const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  '8Sx3jxWD4aWnZjs_zpSa3KP0MvLxdX72hr0KmwIj8No';

const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT ||
  'mailto:ronaldomeira@gmail.com';

// Configuração única do web-push
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function stringifyPushErrorPart(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getPushErrorStatusCode(err) {
  return Number(err?.statusCode || err?.status || err?.response?.statusCode || err?.response?.status || 0);
}

function getPushErrorText(err) {
  return [
    err?.message,
    err?.body,
    err?.response?.body,
    err?.responseBody,
  ]
    .map(stringifyPushErrorPart)
    .filter(Boolean)
    .join(' ');
}

export function shouldPurgePushSubscriptionError(err) {
  const statusCode = getPushErrorStatusCode(err);
  const errorText = getPushErrorText(err).toLowerCase();

  return (
    statusCode === 404 ||
    statusCode === 410 ||
    (statusCode === 400 && errorText.includes('vapidpkhashmismatch'))
  );
}

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://qedptmrcvcbzhucoeznd.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlZHB0bXJjdmNiemh1Y29lem5kIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTc5NTAzOCwiZXhwIjoyMTAxMzcxMDM4fQ.-zYj_z6kiaJpH43mOqV_OKlXf6Q6zUJhEJfBa5KKu0Q';
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Envia uma notificação push para todos os aparelhos ativos cadastrados em uma conta
 */
export async function sendPushToAccount(accountId, payload, options = {}) {
  if (!accountId) throw new Error('accountId é obrigatório para envio de push.');

  const db = options.db || getSupabaseClient();

  // 1. Busca todas as subscriptions da conta
  const { data: subscriptions, error } = await db
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, auth_key, device_name')
    .eq('account_id', accountId);

  if (error) {
    console.error('Erro ao buscar subscriptions da conta:', error);
    return { sentCount: 0, failedCount: 0, removedCount: 0, error: error.message };
  }

  if (!subscriptions || subscriptions.length === 0) {
    return { sentCount: 0, failedCount: 0, removedCount: 0, message: 'Nenhum dispositivo registrado para esta conta.' };
  }

  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

  let sentCount = 0;
  let failedCount = 0;
  const expiredEndpoints = [];

  // 2. Dispara para cada dispositivo em paralelo
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth || sub.auth_key,
        },
      };

      try {
        await webpush.sendNotification(pushSubscription, payloadString, {
          TTL: 86400, // 24 horas no cache do provedor (Apple/Google)
        });
        sentCount++;
      } catch (err) {
        failedCount++;
        // 404 (Not Found), 410 (Gone) ou 400 VapidPkHashMismatch: dispositivo desinstalou, revogou ou chave VAPID antiga
        if (shouldPurgePushSubscriptionError(err)) {
          expiredEndpoints.push(sub.endpoint);
        } else {
          console.error(`Falha no envio push para dispositivo ${sub.device_name || sub.endpoint}:`, err?.message || err);
        }
      }
    })
  );

  // 3. Purge automático de subscriptions inválidas/expiradas
  let removedCount = 0;
  if (expiredEndpoints.length > 0) {
    const uniqueExpiredEndpoints = [...new Set(expiredEndpoints)];
    const { error: delError, count } = await db
      .from('push_subscriptions')
      .delete()
      .in('endpoint', uniqueExpiredEndpoints);

    if (!delError) {
      removedCount = count || uniqueExpiredEndpoints.length;
      console.log(`🧹 ${removedCount} subscription(s) expirada(s) removida(s) automaticamente do Supabase.`);
    }
  }

  return {
    sentCount,
    failedCount,
    removedCount,
    totalTargeted: subscriptions.length,
  };
}

// ── BUILDERS CANÔNICOS DE NOTIFICAÇÃO DO BOT CAPTADOR ─────────────────────────

/**
 * 1. Resumo após cada rodada do Bot Captador
 * Exemplo com novos:
 * "Bot Captador — rodada concluída"
 * "31 anúncios analisados.\n5 novos imóveis encontrados.\n4 proprietários abordados.\n1 duplicado descartado."
 * Exemplo sem novos:
 * "Nenhum imóvel novo encontrado nesta rodada."
 */
export function buildRoundSummaryPush(roundData) {
  const analyzed = Number(roundData.analyzed_count || roundData.analyzedCount || 0);
  const eligible = Number(roundData.eligible_count || roundData.eligibleCount || 0);
  const contacted = Number(roundData.contacted_count || roundData.contactedCount || 0);
  const duplicates = Number(roundData.duplicate_count || roundData.duplicateCount || 0);

  let bodyText = '';
  if (eligible === 0 && contacted === 0) {
    bodyText = 'Nenhum imóvel novo encontrado nesta rodada.';
  } else {
    const lines = [];
    if (analyzed > 0) lines.push(`${analyzed} anúncio${analyzed > 1 ? 's' : ''} analisado${analyzed > 1 ? 's' : ''}.`);
    if (eligible > 0) lines.push(`${eligible} novo${eligible > 1 ? 's' : ''} ${eligible > 1 ? 'imóveis encontrados' : 'imóvel encontrado'}.`);
    if (contacted > 0) lines.push(`${contacted} proprietário${contacted > 1 ? 's' : ''} abordado${contacted > 1 ? 's' : ''}.`);
    if (duplicates > 0) lines.push(`${duplicates} duplicado${duplicates > 1 ? 's' : ''} descartado${duplicates > 1 ? 's' : ''}.`);
    bodyText = lines.join('\n');
  }

  return {
    title: 'Bot Captador — rodada concluída',
    body: bodyText,
    icon: '/pwa-192.png',
    badge: '/favicon-32.png',
    tag: 'bot-round-summary',
    url: '/bot-captador',
  };
}

/**
 * 2. Proprietário respondeu
 * Exemplo:
 * "Bot Captador"
 * "Um proprietário respondeu à sua abordagem.\nCarlos Silva · Manaíra (Apto 3 Quartos)"
 * Ao tocar na notificação, abre diretamente em Bot Captador > Captações
 */
export function buildOwnerRespondedPush(captureData) {
  const parts = [];
  if (captureData.owner_name || captureData.ownerName) {
    parts.push(captureData.owner_name || captureData.ownerName);
  }
  if (captureData.neighborhood) {
    parts.push(captureData.neighborhood);
  }
  if (captureData.title) {
    parts.push(`(${captureData.title})`);
  }

  const detailLine = parts.length > 0 ? `\n${parts.join(' · ')}` : '';

  return {
    title: 'Bot Captador',
    body: `Um proprietário respondeu à sua abordagem.${detailLine}`,
    icon: '/pwa-192.png',
    badge: '/favicon-32.png',
    tag: `bot-owner-responded-${captureData.id || Date.now()}`,
    url: '/bot-captador?tab=captacoes',
  };
}

/**
 * 3. Falha importante do Bot Captador
 * Exemplo:
 * "Bot Captador precisa de atenção"
 * "Google Chrome não detectado na porta 9222 ou sessão da OLX deslogada."
 */
export function buildBotFailurePush(errorData) {
  const reason = errorData.error_summary || errorData.message || errorData.reason || 'Erro na execução da rodada programada.';

  return {
    title: 'Bot Captador precisa de atenção',
    body: String(reason).slice(0, 180),
    icon: '/pwa-192.png',
    badge: '/favicon-32.png',
    tag: 'bot-failure-alert',
    url: '/bot-captador?tab=painel',
  };
}

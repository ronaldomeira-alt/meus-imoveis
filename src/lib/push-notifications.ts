// ==============================================================================
// GERENCIADOR DE WEB PUSH NOTIFICATIONS DO CLIENTE PWA — MEUS IMÓVEIS
// Suporte nativo a iOS 16.4+ (PWA na Home Screen), Android, macOS e Windows
// ==============================================================================

import { supabase } from './supabase';
import { getCurrentAccountId } from './bot-captador/database';

export type PushPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

const RAW_VAPID_PUBLIC_KEY =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  'BB_e6M8cQpybTAKp2E2AMye7t4gUC-Ycdts1g5r5RyDjMlPwMXNFz5E2ELB0_PApjxwN9jXbPtKDt2OoILS46qk';

// Chave pública VAPID sanitizada (remove aspas, espaços e quebras de linha que a Vercel/Vite possam injetar)
const VAPID_PUBLIC_KEY = String(RAW_VAPID_PUBLIC_KEY).trim().replace(/['"\s\r\n]/g, '');

/**
 * Converte chave pública VAPID base64/base64url para Uint8Array puro (BufferSource exigido pelo PushManager e WebKit).
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const clean = String(base64Url || '').trim().replace(/['"\s\r\n]/g, '');
  if (!clean) {
    throw new Error('Chave pública VAPID não informada ou vazia.');
  }

  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Converte chave pública VAPID base64/base64url para ArrayBuffer
 */
export function urlBase64ToArrayBuffer(base64Url: string): ArrayBuffer {
  return urlBase64ToUint8Array(base64Url).buffer as ArrayBuffer;
}

/**
 * Verifica se a chave pública de uma subscription corresponde à chave pública VAPID atual
 */
export function isSubscriptionKeyMatching(
  sub: PushSubscription | null | undefined,
  targetUint8: Uint8Array
): boolean {
  if (!sub || !sub.options || !sub.options.applicationServerKey) return true;
  const existingKeyBytes = new Uint8Array(sub.options.applicationServerKey);
  if (existingKeyBytes.length !== targetUint8.length) return false;
  for (let i = 0; i < existingKeyBytes.length; i++) {
    if (existingKeyBytes[i] !== targetUint8[i]) return false;
  }
  return true;
}

/**
 * Detecta se o dispositivo atual é iOS (iPhone / iPad / iPod)
 */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/**
 * Detecta se o aplicativo está rodando como PWA instalado (standalone na Tela de Início)
 */
export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

/**
 * Detecta nome descritivo do aparelho atual
 */
export function getDeviceDescription(): string {
  if (typeof navigator === 'undefined') return 'Dispositivo Web';
  const ua = navigator.userAgent;

  let platform = 'Navegador Web';
  if (/iPhone/i.test(ua)) platform = 'iPhone';
  else if (/iPad/i.test(ua)) platform = 'iPad';
  else if (/Macintosh|Mac OS X/i.test(ua)) platform = 'Mac';
  else if (/Windows/i.test(ua)) platform = 'Windows PC';
  else if (/Android/i.test(ua)) platform = 'Android';

  const standalone = isStandalonePwa();
  if (standalone) {
    return `${platform} (PWA na Tela de Início)`;
  }

  let browser = '';
  if (/CriOS|Chrome/i.test(ua)) browser = 'Chrome';
  else if (/FxiOS|Firefox/i.test(ua)) browser = 'Firefox';
  else if (/Safari/i.test(ua)) browser = 'Safari';

  return `${platform} (${browser || 'Navegador Web'})`;
}

/**
 * Verifica se o navegador atual suporta Service Worker e Push API
 */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Retorna o estado atual da permissão de notificações
 */
export function getPushPermissionStatus(): PushPermissionStatus {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission as PushPermissionStatus;
}

/**
 * Registra o Service Worker do PWA se ainda não estiver registrado
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;

  try {
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  } catch (err) {
    console.error('Falha ao registrar Service Worker:', err);
    return null;
  }
}

/**
 * Verifica se este dispositivo já possui uma subscription push ativa e válida
 */
export async function getActiveSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return null;

    // Se houver subscrição com chave antiga diferente da VAPID atual, limpa para evitar falha no envio
    const currentKeyUint8 = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    if (sub.options?.applicationServerKey && !isSubscriptionKeyMatching(sub, currentKeyUint8)) {
      console.warn('Subscription existente usa chave VAPID diferente. Desinscrevendo para renovação limpa...');
      try {
        await sub.unsubscribe();
      } catch {
        // silencioso
      }
      return null;
    }

    return sub;
  } catch (err) {
    console.error('Erro ao buscar subscription ativa:', err);
    return null;
  }
}

/**
 * Inscreve o aparelho atual no Web Push e salva os dados no Supabase vinculados à account_id
 */
export async function subscribeDeviceToPush(): Promise<{ success: boolean; error?: string }> {
  if (!isPushSupported()) {
    return {
      success: false,
      error: 'Notificações push não são suportadas neste navegador. No iPhone, adicione o app à Tela de Início primeiro.',
    };
  }

  // 1. Solicita permissão explícita (ação de gesto direto do usuário)
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      success: false,
      error: permission === 'denied'
        ? 'Permissão para notificações bloqueada. Habilite nas configurações do seu navegador/aparelho.'
        : 'Permissão não concedida.',
    };
  }

  try {
    // 2. Garante o Service Worker pronto
    const reg = await navigator.serviceWorker.ready;
    if (!reg) {
      return { success: false, error: 'Não foi possível inicializar o Service Worker.' };
    }

    // 3. Converte chave pública VAPID para Uint8Array
    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    let subscription = await reg.pushManager.getSubscription();

    // Se houver assinatura pré-existente com chave desatualizada, desinscreve primeiro
    if (subscription && subscription.options?.applicationServerKey && !isSubscriptionKeyMatching(subscription, applicationServerKey)) {
      console.warn('Subscription com chave desatualizada detectada. Desinscrevendo antes de criar nova...');
      try {
        await subscription.unsubscribe();
      } catch {
        // segue para tentar nova subscrição
      }
      subscription = null;
    }

    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      });
    }

    const subJson = subscription.toJSON();
    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
      return { success: false, error: 'Falha ao obter credenciais da assinatura push do navegador.' };
    }

    // 4. Obtém a conta ativa no Supabase
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      return { success: false, error: 'Conta não identificada no sistema.' };
    }

    let userId: string | null = null;
    if (supabase) {
      const { data: authData } = await supabase.auth.getUser();
      userId = authData?.user?.id || null;
    }

    // 5. Salva ou atualiza a subscription no Supabase (Upsert por endpoint)
    if (supabase) {
      const { error: dbError } = await supabase
        .from('push_subscriptions')
        .upsert(
          {
            account_id: accountId,
            user_id: userId,
            endpoint: subJson.endpoint,
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
            auth_key: subJson.keys.auth,
            user_agent: navigator.userAgent,
            device_name: getDeviceDescription(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'endpoint' }
        );

      if (dbError) {
        console.error('Erro ao salvar subscription no Supabase:', dbError);
        return { success: false, error: `Erro ao registrar dispositivo no banco: ${dbError.message}` };
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('Erro ao assinar notificações push:', err);
    let msg = err?.message || 'Erro inesperado ao ativar notificações push.';
    if (isIosDevice() && !isStandalonePwa()) {
      msg = 'No iPhone, o Web Push requer que o Meus Imóveis esteja adicionado à Tela de Início. Toque no botão Compartilhar do Safari e selecione "Adicionar à Tela de Início".';
    } else if (isIosDevice() && isStandalonePwa()) {
      msg = `Não foi possível ativar notificações no iPhone (${msg}). Dica: feche o aplicativo da Tela de Início e abra-o novamente para restabelecer a conexão push do sistema iOS.`;
    }
    return { success: false, error: msg };
  }
}

/**
 * Remove a inscrição push deste aparelho e apaga do Supabase
 */
export async function unsubscribeDeviceFromPush(): Promise<{ success: boolean; error?: string }> {
  try {
    const subscription = await getActiveSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      if (supabase) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', endpoint);
      }
    }
    return { success: true };
  } catch (err: any) {
    console.error('Erro ao desativar notificações push:', err);
    return { success: false, error: err?.message || 'Falha ao desativar notificações.' };
  }
}

/**
 * Dispara notificação de teste para a conta logada
 */
export async function sendTestPushNotification(): Promise<{ success: boolean; sentCount?: number; message?: string }> {
  try {
    const accountId = await getCurrentAccountId();
    if (!accountId) {
      return { success: false, message: 'Conta não identificada.' };
    }

    const res = await fetch('/api/web-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test',
        accountId,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      return { success: false, message: data.error || 'Falha no disparo do push de teste.' };
    }

    return { success: true, sentCount: data.sentCount, message: data.message };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Erro ao enviar notificação de teste.' };
  }
}

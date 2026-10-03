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
const VAPID_PUBLIC_KEY_BYTES = 65;
const VAPID_PUBLIC_KEY_PREFIX = 0x04;

let serviceWorkerReadyPromise: Promise<ServiceWorkerRegistration | null> | null = null;
let readyServiceWorkerRegistration: ServiceWorkerRegistration | null = null;
let cachedVapidApplicationServerKey: Uint8Array | null = null;

function decodeBase64UrlChar(charCode: number): number {
  if (charCode >= 65 && charCode <= 90) return charCode - 65; // A-Z
  if (charCode >= 97 && charCode <= 122) return charCode - 71; // a-z
  if (charCode >= 48 && charCode <= 57) return charCode + 4; // 0-9
  if (charCode === 43 || charCode === 45) return 62; // + or -
  if (charCode === 47 || charCode === 95) return 63; // / or _
  throw new Error('Chave pública VAPID contém caracteres inválidos.');
}

/**
 * Converte chave pública VAPID base64/base64url para Uint8Array puro.
 * Implementação direta sem atob() para imunidade total contra
 * 'DOMException: The string contains invalid characters' do Safari / iOS WebKit.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const clean = String(base64Url || '').trim().replace(/['"\s\r\n]/g, '');
  if (!clean) {
    throw new Error('Chave pública VAPID não informada ou vazia.');
  }

  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(clean)) {
    throw new Error('Chave pública VAPID contém caracteres inválidos.');
  }

  const unpadded = clean.replace(/=+$/, '');
  if (unpadded.length % 4 === 1) {
    throw new Error('Chave pública VAPID tem tamanho Base64URL inválido.');
  }

  const len = unpadded.length;
  const byteLength = Math.floor((len * 3) / 4);
  const bytes = new Uint8Array(byteLength);

  let byteIdx = 0;
  for (let i = 0; i < len; i += 4) {
    const c1 = decodeBase64UrlChar(unpadded.charCodeAt(i));
    const c2 = i + 1 < len ? decodeBase64UrlChar(unpadded.charCodeAt(i + 1)) : 0;
    const c3 = i + 2 < len ? decodeBase64UrlChar(unpadded.charCodeAt(i + 2)) : 64;
    const c4 = i + 3 < len ? decodeBase64UrlChar(unpadded.charCodeAt(i + 3)) : 64;

    bytes[byteIdx++] = (c1 << 2) | (c2 >> 4);
    if (byteIdx < byteLength && c3 !== 64) {
      bytes[byteIdx++] = ((c2 & 15) << 4) | (c3 >> 2);
    }
    if (byteIdx < byteLength && c4 !== 64) {
      bytes[byteIdx++] = ((c3 & 3) << 6) | c4;
    }
  }

  if (bytes.length !== VAPID_PUBLIC_KEY_BYTES || bytes[0] !== VAPID_PUBLIC_KEY_PREFIX) {
    throw new Error('Chave pública VAPID inválida: esperado ponto P-256 não compactado de 65 bytes.');
  }

  return bytes;
}

function getVapidApplicationServerKey(): Uint8Array {
  if (!cachedVapidApplicationServerKey) {
    cachedVapidApplicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
  }
  return cachedVapidApplicationServerKey.slice();
}

async function getReadyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null;
  if (readyServiceWorkerRegistration) return readyServiceWorkerRegistration;

  if (!serviceWorkerReadyPromise) {
    serviceWorkerReadyPromise = (async () => {
      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const reg = await navigator.serviceWorker.ready;
      readyServiceWorkerRegistration = reg;
      return reg;
    })().catch((err) => {
      serviceWorkerReadyPromise = null;
      readyServiceWorkerRegistration = null;
      console.error('Falha ao preparar Service Worker:', err);
      return null;
    });
  }

  return serviceWorkerReadyPromise;
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
  return getReadyServiceWorkerRegistration();
}

/**
 * Prepara as dependências que não devem competir com o gesto do toque no Safari/iOS.
 */
export async function preparePushNotificationsForActivation(): Promise<ServiceWorkerRegistration | null> {
  try {
    getVapidApplicationServerKey();
    return await getReadyServiceWorkerRegistration();
  } catch (err) {
    console.error('Falha ao preparar Web Push:', err);
    return null;
  }
}

/**
 * Verifica se este dispositivo já possui uma subscription push ativa e válida
 */
export async function getActiveSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;

  try {
    const reg = await getReadyServiceWorkerRegistration();
    if (!reg) return null;

    const sub = await reg.pushManager.getSubscription();
    if (!sub) return null;

    // Se houver subscrição com chave antiga diferente da VAPID atual, limpa para evitar falha no envio
    const currentKeyUint8 = getVapidApplicationServerKey();
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

function formatSubscribeError(err: any): string {
  let msg = err?.message || 'Erro inesperado ao ativar notificações push.';
  if (isIosDevice() && !isStandalonePwa()) {
    msg = 'No iPhone, o Web Push requer que o Meus Imóveis esteja adicionado à Tela de Início. Toque no botão Compartilhar do Safari e selecione "Adicionar à Tela de Início".';
  } else if (isIosDevice() && isStandalonePwa()) {
    msg = `Não foi possível ativar notificações no iPhone (${msg}). Dica: feche o aplicativo da Tela de Início e abra-o novamente para restabelecer a conexão push do sistema iOS.`;
  }
  return msg;
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

  let applicationServerKey: Uint8Array;
  try {
    applicationServerKey = getVapidApplicationServerKey();
  } catch (err: any) {
    return { success: false, error: err?.message || 'Chave pública VAPID inválida.' };
  }

  const reg = readyServiceWorkerRegistration;
  if (!reg) {
    return {
      success: false,
      error: isIosDevice()
        ? 'A conexão push do iPhone ainda está iniciando. Feche e abra novamente o app pela Tela de Início e tente ativar as notificações mais uma vez.'
        : 'O Service Worker ainda não está pronto para criar a assinatura push. Recarregue a página e tente novamente.',
    };
  }

  // 1. Solicita permissão explícita (ação de gesto direto do usuário)
  let permission: NotificationPermission;
  try {
    permission = await Notification.requestPermission();
  } catch (err: any) {
    console.error('Erro ao solicitar permissão de notificações:', err);
    return { success: false, error: formatSubscribeError(err) };
  }

  if (permission !== 'granted') {
    return {
      success: false,
      error: permission === 'denied'
        ? 'Permissão para notificações bloqueada. Habilite nas configurações do seu navegador/aparelho.'
        : 'Permissão não concedida.',
    };
  }

  try {
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
    return { success: false, error: formatSubscribeError(err) };
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

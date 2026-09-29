import type { Property } from '../types/property';

/**
 * Retorna a URL pública canônica e estável para compartilhamento do imóvel.
 */
export function getPropertyPublicUrl(propertyId: string, baseUrl?: string): string {
  const origin =
    baseUrl ||
    (typeof window !== 'undefined' && window.location.origin) ||
    'https://ronaldomeira.com.br';
  const cleanOrigin = origin.replace(/\/+$/, '');
  return `${cleanOrigin}/imovel/${encodeURIComponent(propertyId)}`;
}

/**
 * Monta o texto natural e amigável para envio do imóvel (ex: WhatsApp, SMS, Direct).
 */
export function formatPropertyShareText(property: Pick<Property, 'type' | 'neighborhood' | 'condominium_name' | 'id'>, publicUrl: string): string {
  const place = property.condominium_name
    ? `${property.condominium_name} (${property.neighborhood})`
    : property.neighborhood;
  return `Olha este imóvel que encontrei para você:\n${property.type} em ${place}\n${publicUrl}`;
}

/**
 * Monta o link do WhatsApp com a mensagem pré-formatada.
 */
export function buildPropertyWhatsAppUrl(property: Pick<Property, 'type' | 'neighborhood' | 'condominium_name' | 'id'>, publicUrl: string, phone?: string): string {
  const message = formatPropertyShareText(property, publicUrl);
  const cleanPhone = phone ? phone.replace(/\D/g, '') : '';
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export interface ShareResult {
  success: boolean;
  method: 'native' | 'clipboard' | 'whatsapp' | 'error';
  message: string;
}

/**
 * Executa compartilhamento inteligente:
 * 1. Tenta Web Share API nativa se suportada no dispositivo (iPhone/Android/PWA)
 * 2. Fallback para copiar o link para a área de transferência
 */
export async function sharePropertyUniversal(
  property: Pick<Property, 'type' | 'neighborhood' | 'condominium_name' | 'id' | 'title'>,
  options?: { baseUrl?: string }
): Promise<ShareResult> {
  const url = getPropertyPublicUrl(property.id, options?.baseUrl);
  const title = property.title || `${property.type} em ${property.neighborhood}`;
  const text = formatPropertyShareText(property, url);

  // 1. Tenta compartilhamento nativo do SO/navegador
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title,
        text,
        url,
      });
      return { success: true, method: 'native', message: 'Compartilhado com sucesso.' };
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Usuário apenas fechou o share sheet do SO
        return { success: false, method: 'native', message: 'Compartilhamento cancelado.' };
      }
      // Se falhar de outra forma, prossegue para o fallback
    }
  }

  // 2. Fallback: Copiar para área de transferência
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return { success: true, method: 'clipboard', message: 'Link copiado para a área de transferência!' };
    } catch {
      return { success: false, method: 'error', message: 'Não foi possível copiar o link automaticamente.' };
    }
  }

  return { success: false, method: 'error', message: 'Compartilhamento não suportado neste navegador.' };
}

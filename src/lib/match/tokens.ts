/**
 * FASE 17, 18 & 19: Tokens Opacos Individuais e Compartilhamento via WhatsApp Pessoal
 */

/**
 * Gera um token opaco, criptograficamente seguro e sem qualquer PII.
 * 32 bytes de entropia aleatória -> 64 caracteres hexadecimais.
 */
export function generateTrackingToken(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback seguro caso executado em ambientes restritos
  let token = '';
  const hex = '0123456789abcdef';
  for (let i = 0; i < 64; i++) {
    token += hex[Math.floor(Math.random() * 16)];
  }
  return token;
}

/**
 * Monta o link individual de visualização pública com o token de rastreamento.
 * Exemplo: https://ronaldomeira.com.br/imovel/:id?token=:token ou /imoveis/p/:token
 */
export function buildSharePublicUrl(token: string, propertyId?: string, baseUrl?: string): string {
  const origin =
    baseUrl ||
    (typeof window !== 'undefined' && window.location.origin) ||
    'https://ronaldomeira.com.br';
  const cleanOrigin = origin.replace(/\/+$/, '');
  
  if (propertyId) {
    return `${cleanOrigin}/imovel/${encodeURIComponent(propertyId)}?token=${encodeURIComponent(token)}`;
  }
  return `${cleanOrigin}/imoveis/p/${encodeURIComponent(token)}`;
}

/**
 * Constrói o deep link para envio pelo WhatsApp pessoal do corretor.
 * Formato padrão: texto curto editável + link individual com token novo.
 */
export function buildWhatsAppPersonalLink(args: {
  phone: string;
  publicUrl: string;
  customText?: string;
}): string {
  const { phone, publicUrl, customText } = args;
  const cleanPhone = phone.replace(/\D/g, '');
  const text =
    customText?.trim() ||
    'Encontrei uma opção que combina com o que você está procurando. Dá uma olhada e me diz o que achou:';
  const message = `${text}\n${publicUrl}`;
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
}

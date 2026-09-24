import type { Property } from '../types/property';

export const sharePropertySafely = async (property: Property): Promise<boolean> => {
  const formatPrice = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

  const featuresList = [
    ...(property.apartment_features || []),
    ...(property.building_features || []),
  ].slice(0, 8).join(', ');

  const textToShare = `🏠 *${property.type} em ${property.neighborhood}*
📍 João Pessoa - PB

📐 Área: ${property.area_m2} m²
🛏️ Quartos: ${property.bedrooms} (${property.suites} suíte${property.suites > 1 ? 's' : ''})
🚗 Vagas: ${property.parking_spaces_type === 'Rotativas' ? 'Rotativas' : property.parking_spaces}
${property.position ? `☀️ Posição: ${property.position}\n` : ''}${property.condominium_name ? `🏢 Condomínio: ${property.condominium_name}\n` : ''}
💰 *Valor: ${formatPrice(property.price)}*
${property.condo_fee ? `Condomínio: ${formatPrice(property.condo_fee)}/mês` : ''}

${featuresList ? `✨ *Diferenciais:* ${featuresList}\n` : ''}
${property.notes ? `📝 ${property.notes}\n` : ''}
📲 *Interessado? Entre em contato para agendar uma visita exclusiva!*`;

  // Tenta compartilhar nativamente no mobile (WhatsApp/Instagram/Share Sheet)
  if (navigator.share) {
    try {
      await navigator.share({
        title: `${property.type} em ${property.neighborhood}`,
        text: textToShare,
      });
      return true;
    } catch {
      // Se o usuário cancelar ou falhar, fallback para clipboard
    }
  }

  // Fallback para área de transferência
  try {
    await navigator.clipboard.writeText(textToShare);
    return true;
  } catch (err) {
    console.error('Falha ao copiar:', err);
    return false;
  }
};

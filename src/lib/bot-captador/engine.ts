// ==============================================================================
// Motor de Filtros, Deduplicação em 4 Camadas e Fila FIFO — Bot Captador
// ==============================================================================

import type {
  BotCampaign,
  DiscoveredAdCandidate,
  BotCapture,
} from '../../types/bot-captador';

// ── NÍVEL 2: CANONICALIZAÇÃO DE URL ──────────────────────────────────────────

export function canonicalizeAdUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    // Remove parâmetros irrelevantes de tracking/marketing
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'msclkid', 'gad_source', 'source', 'ref', 'position', 'origin'
    ];
    trackingParams.forEach((param) => url.searchParams.delete(param));

    // Remove hash/âncoras
    url.hash = '';

    // Normaliza trailing slash
    let pathname = url.pathname.replace(/\/+$/, '');
    if (!pathname) pathname = '/';

    return `${url.protocol}//${url.hostname.toLowerCase()}${pathname}${url.search ? url.search : ''}`;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

// ── NÍVEL 3: FINGERPRINT MULTIDIMENSIONAL DO IMÓVEL ──────────────────────────

export function generatePropertyFingerprint(ad: {
  neighborhood?: string | null;
  bedrooms?: number | null;
  areaM2?: number | null;
  price?: number | null;
  title?: string | null;
  campaignType: 'venda' | 'locacao';
}): string {
  const normNeighborhood = (ad.neighborhood || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const normBedrooms = ad.bedrooms != null ? `${ad.bedrooms}q` : '0q';

  // Área agrupada em blocos de 3m² para evitar ruídos de arredondamento em portais
  const normArea = ad.areaM2 != null ? `${Math.round(ad.areaM2 / 3) * 3}m` : '0m';

  // Preço agrupado (para Venda em blocos de 5k, Locação em blocos de 50 reais)
  let normPrice = '0p';
  if (ad.price && ad.price > 0) {
    const step = ad.campaignType === 'venda' ? 5000 : 50;
    normPrice = `${Math.round(ad.price / step) * step}p`;
  }

  // Título limpo reduzido às 4 primeiras palavras significativas
  const cleanTitle = (ad.title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['com', 'para', 'com', 'que', 'apartamento', 'apto'].includes(w))
    .slice(0, 4)
    .join('');

  return `${ad.campaignType}_${normNeighborhood}_${normBedrooms}_${normArea}_${normPrice}_${cleanTitle}`;
}

// ── NÍVEL 4: SINAL DO ANUNCIANTE ──────────────────────────────────────────────

export function normalizeOwnerContact(contact?: string | null): string {
  if (!contact) return '';
  return contact.replace(/\D/g, '');
}

// ── VERIFICAÇÃO DE ELEGIBILIDADE E FILTRO PARTICULAR ─────────────────────────

export interface EvaluationResult {
  isEligible: boolean;
  rejectionReason?: string;
  isPossibleDuplicate?: boolean;
}

// Lista permanente de anúncios já contatados previamente pelo corretor (Regra Absoluta)
export const MANUALLY_EXCLUDED_EXTERNAL_IDS = new Set<string>([
  // Venda (4 anúncios)
  '1536488436',
  '1523994645',
  '1528897285',
  '1539301848',
  // Aluguel (5 anúncios)
  '1538452756',
  '1532219277',
  '1530052068',
  '1527797114',
  '1540164844',
]);

export function evaluateAdEligibility(
  ad: DiscoveredAdCandidate,
  campaign: BotCampaign,
  existingCaptures: BotCapture[],
  tombstoneFingerprints: Set<string>
): EvaluationResult {
  // 0. Verificação de Anúncios Contatados Manualmente pelo Corretor (Bloqueio Definitivo)
  if (ad.externalId && MANUALLY_EXCLUDED_EXTERNAL_IDS.has(ad.externalId)) {
    return {
      isEligible: false,
      rejectionReason: `Anúncio ID ${ad.externalId} já contatado manualmente pelo corretor (bloqueio definitivo de recontato)`,
    };
  }

  // 1. Verificação do filtro "Particular" (Requisito Central)
  if (campaign.only_private && !ad.isPrivate) {
    return {
      isEligible: false,
      rejectionReason: 'Não identificado como anúncio de proprietário particular (anunciante profissional ou imobiliária)',
    };
  }

  // 2. Verificação de Bairros e Filtro Geográfico
  if (campaign.neighborhoods && campaign.neighborhoods.length > 0) {
    if (!ad.neighborhood || ad.neighborhood.trim() === '') {
      return {
        isEligible: false,
        rejectionReason: 'Bairro não identificado no anúncio (campanha restrita a bairros específicos)',
      };
    }

    const adNeighNorm = ad.neighborhood.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const matched = campaign.neighborhoods.some((n) =>
      adNeighNorm.includes(n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
    );
    if (!matched) {
      return {
        isEligible: false,
        rejectionReason: `Bairro '${ad.neighborhood}' fora dos filtros configurados da campanha`,
      };
    }
  }

  // 3. Verificação de Preço
  if (ad.price != null && ad.price > 0) {
    if (campaign.min_price != null && ad.price < campaign.min_price) {
      return {
        isEligible: false,
        rejectionReason: `Preço (R$ ${ad.price}) abaixo do mínimo configurado (R$ ${campaign.min_price})`,
      };
    }
    if (campaign.max_price != null && ad.price > campaign.max_price) {
      return {
        isEligible: false,
        rejectionReason: `Preço (R$ ${ad.price}) acima do máximo configurado (R$ ${campaign.max_price})`,
      };
    }
  }

  // 4. Verificação de Quartos
  if (ad.bedrooms != null) {
    if (campaign.min_bedrooms != null && ad.bedrooms < campaign.min_bedrooms) {
      return {
        isEligible: false,
        rejectionReason: `Quartos (${ad.bedrooms}) abaixo do mínimo (${campaign.min_bedrooms})`,
      };
    }
    if (campaign.max_bedrooms != null && ad.bedrooms > campaign.max_bedrooms) {
      return {
        isEligible: false,
        rejectionReason: `Quartos (${ad.bedrooms}) acima do máximo (${campaign.max_bedrooms})`,
      };
    }
  }

  // 5. Verificação de Área
  if (ad.areaM2 != null) {
    if (campaign.min_area != null && ad.areaM2 < campaign.min_area) {
      return {
        isEligible: false,
        rejectionReason: `Área (${ad.areaM2}m²) abaixo do mínimo (${campaign.min_area}m²)`,
      };
    }
    if (campaign.max_area != null && ad.areaM2 > campaign.max_area) {
      return {
        isEligible: false,
        rejectionReason: `Área (${ad.areaM2}m²) acima do máximo (${campaign.max_area}m²)`,
      };
    }
  }

  // 6. Deduplicação em Múltiplas Camadas
  // Verificação contra Tombstones Perpétuos (NUNCA reabordar imóvel abordado)
  if (tombstoneFingerprints.has(ad.fingerprint)) {
    return {
      isEligible: false,
      rejectionReason: 'Imóvel já abordado anteriormente (tombstone ativo)',
    };
  }

  // Verificação contra Captações Ativas/Existentes
  for (const existing of existingCaptures) {
    // Camada 1: ID Externo idêntico
    if (ad.externalId && existing.external_id && ad.externalId === existing.external_id) {
      return {
        isEligible: false,
        rejectionReason: `Anúncio com ID externo '${ad.externalId}' já registrado`,
      };
    }

    // Camada 2: URL Canonicalizada idêntica
    if (ad.normalizedUrl === existing.normalized_url) {
      return {
        isEligible: false,
        rejectionReason: 'URL canonicalizada já registrada no sistema',
      };
    }

    // Camada 3: Fingerprint idêntico
    if (ad.fingerprint === existing.fingerprint) {
      return {
        isEligible: false,
        rejectionReason: 'Fingerprint do imóvel idêntico a anúncio já existente',
      };
    }

    // Camada 4: Possível Duplicidade / Republicação (mesmo anunciante e atributos essenciais)
    const adContact = normalizeOwnerContact(ad.ownerContact);
    const existContact = normalizeOwnerContact(existing.owner_contact);
    const sameContact = Boolean(adContact && existContact && adContact === existContact);
    const sameOwnerName = Boolean(
      ad.ownerName &&
      existing.owner_name &&
      ad.ownerName.trim().length > 2 &&
      ad.ownerName.trim().toLowerCase() === existing.owner_name.trim().toLowerCase()
    );

    const sameNeighborhood = Boolean(
      ad.neighborhood &&
      existing.neighborhood &&
      ad.neighborhood.trim().toLowerCase() === existing.neighborhood.trim().toLowerCase()
    );

    if ((sameContact || sameOwnerName) && sameNeighborhood) {
      return {
        isEligible: false,
        isPossibleDuplicate: true,
        rejectionReason: 'Possível duplicado/republicação: mesmo anunciante e mesmo bairro de anúncio existente',
      };
    }
  }

  return { isEligible: true };
}

// ── RENDERIZAÇÃO DE TEMPLATE (Fidelidade Absoluta ao Texto Cadastrado na v1) ──

export interface TemplateRenderOptions {
  interpolateVariables?: boolean; // Padrão: false (desativado na v1 por segurança)
}

export function renderMessageTemplate(
  templateContent: string,
  variables: { primeiro_nome?: string | null; titulo?: string | null; bairro?: string | null } = {},
  options: TemplateRenderOptions = { interpolateVariables: false }
): string {
  // Nesta v1, interpolação automática permanece desativada por padrão:
  // envia o texto exatamente como cadastrado e aprovado no Bot Captador.
  if (!options.interpolateVariables) {
    return templateContent;
  }

  let text = templateContent;
  if (variables.primeiro_nome) {
    text = text.replace(/\{primeiro_nome\}/gi, variables.primeiro_nome.trim());
  }
  if (variables.bairro) {
    text = text.replace(/\{bairro\}/gi, variables.bairro.trim());
  }
  return text;
}

// ── SELEÇÃO PSEUDOALEATÓRIA DE MENSAGEM CADASTRADA ───────────────────────────

export function pickMessageTemplate(
  templates: Array<{ id: string; content: string }>
): { id: string; content: string } | null {
  if (!templates || templates.length === 0) return null;
  const randomIndex = Math.floor(Math.random() * templates.length);
  return templates[randomIndex];
}

// ── CÁLCULO PRECISO DA PRÓXIMA RODADA (Horário Oficial de Brasília GMT-3) ───

export interface NextRoundCalculationOptions {
  referenceDate?: Date;
  fallbackTimes?: string[];
}

/**
 * Calcula com precisão a data/hora da próxima rodada com base nos horários configurados
 * nas campanhas do usuário, operando no Horário Oficial de Brasília (GMT-3).
 *
 * Regras:
 * 1. NUNCA agenda em horários fora dos configurados (elimina risco de rodar de madrugada).
 * 2. Se o horário atual for anterior ao próximo horário configurado no mesmo dia,
 *    o próximo disparo será hoje no respectivo horário.
 * 3. Se todos os horários do dia atual já passaram, agenda para o primeiro horário de amanhã.
 */
export function calculateNextRoundAt(
  campaigns: Array<{ is_active?: boolean; schedule_times?: string[] }>,
  options?: NextRoundCalculationOptions
): string {
  const referenceDate = options?.referenceDate || new Date();
  const fallbackTimes = options?.fallbackTimes || ['09:00', '19:00'];

  // Considera campanhas ativas, ou todas caso nenhuma esteja explicitamente ativa
  const activeCampaigns = campaigns.filter((c) => c.is_active !== false);
  const targetCampaigns = activeCampaigns.length > 0 ? activeCampaigns : campaigns;

  const rawTimes = targetCampaigns.flatMap((c) => {
    const times = c.schedule_times || [];
    const count = (c as any).rounds_per_day === 1 ? 1 : 2;
    return times.slice(0, count);
  });
  const validTimes = Array.from(
    new Set(
      rawTimes
        .map((t) => (typeof t === 'string' ? t.trim() : ''))
        .filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
    )
  ).sort();

  const timesToUse = validTimes.length > 0 ? validTimes : fallbackTimes;

  // Formata o dia no fuso de Brasília (en-CA resulta em YYYY-MM-DD)
  const brasiliaDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = brasiliaDateFormatter.format(referenceDate);

  // Calcula os candidatos futuros para hoje (com margem mínima de 1 minuto)
  const candidates: Date[] = [];
  for (const time of timesToUse) {
    const todayCandidate = new Date(`${todayStr}T${time}:00-03:00`);
    if (todayCandidate.getTime() > referenceDate.getTime() + 60 * 1000) {
      candidates.push(todayCandidate);
    }
  }

  // Se nenhum horário de hoje é futuro, calcula os horários para o próximo dia
  if (candidates.length === 0) {
    const tomorrowRef = new Date(referenceDate.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = brasiliaDateFormatter.format(tomorrowRef);
    for (const time of timesToUse) {
      candidates.push(new Date(`${tomorrowStr}T${time}:00-03:00`));
    }
  }

  candidates.sort((a, b) => a.getTime() - b.getTime());
  const nextTarget = candidates[0] || new Date(referenceDate.getTime() + 12 * 60 * 60 * 1000);

  return nextTarget.toISOString();
}


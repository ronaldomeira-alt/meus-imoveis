// ==============================================================================
// Provider Real: OLX Imóveis (João Pessoa / Paraíba)
// ==============================================================================

import type { CaptureProvider } from './types';
import type { BotCampaign, DiscoveredAdCandidate } from '../../../types/bot-captador';
import { canonicalizeAdUrl, generatePropertyFingerprint } from '../engine';

export class OlxCaptureProvider implements CaptureProvider {
  readonly id = 'olx';
  readonly name = 'OLX Brasil (Imóveis Particulares)';

  /**
   * Constrói a URL de pesquisa oficial da OLX com os filtros da campanha
   */
  buildSearchUrl(campaign: BotCampaign): string {
    const isVenda = campaign.type === 'venda';
    const categoryPath = isVenda ? 'venda' : 'aluguel';
    const base = `https://www.olx.com.br/imoveis/${categoryPath}/estado-pb/joao-pessoa`;
    const params = new URLSearchParams();

    // Filtro mandatório: f=p (Somente Proprietário Particular)
    if (campaign.only_private) {
      params.set('f', 'p');
    }

    // Faixa de Preço
    if (campaign.min_price != null && campaign.min_price > 0) {
      params.set('ps', String(Math.round(campaign.min_price)));
    }
    if (campaign.max_price != null && campaign.max_price > 0) {
      params.set('pe', String(Math.round(campaign.max_price)));
    }

    // Quartos (se configurado)
    if (campaign.min_bedrooms != null && campaign.min_bedrooms > 0) {
      params.set('rooms', String(campaign.min_bedrooms));
    }

    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  }

  /**
   * Retorna a URL direta do chat oficial da OLX para o anúncio
   */
  getConversationUrl(capture: { url: string; externalId?: string | null }): string {
    if (capture.externalId) {
      return `https://chat.olx.com.br/?list-id=${capture.externalId}`;
    }
    return capture.url;
  }

  /**
   * Analisa e extrai dados brutos de um card da OLX de forma conservadora
   */
  parseAdCard(raw: {
    listId: string;
    url: string;
    title: string;
    text: string;
    price?: number | null;
    bedrooms?: number | null;
    areaM2?: number | null;
    neighborhood?: string;
    campaignType: 'venda' | 'locacao';
  }): DiscoveredAdCandidate | null {
    if (!raw.listId || !raw.url) return null;

    const lowerText = raw.text.toLowerCase();

    // ── VALIDAÇÃO CONSERVADORA DO FILTRO PARTICULAR (REQUISITO 8) ─────────────
    // Se contiver qualquer menção a CRECI, imobiliária ou corretor -> REJEITADO
    const hasProfessionalMarker =
      lowerText.includes('creci') ||
      lowerText.includes('imobiliária') ||
      lowerText.includes('imobiliaria') ||
      lowerText.includes('corretor') ||
      lowerText.includes('corretora') ||
      lowerText.includes('plano profissional');

    // Se tiver selo explícito da OLX "direto com o proprietário"
    const hasOwnerBadge =
      lowerText.includes('direto com o proprietário') ||
      lowerText.includes('direto com proprietario') ||
      lowerText.includes('com proprietário');

    // Conservador: somente considerado particular se NÃO tiver marcador profissional
    // E tiver o selo de proprietário OU não tiver características de empresa
    const isPrivate = !hasProfessionalMarker && (hasOwnerBadge || !lowerText.includes('profissional'));

    // Normalização de Bairro
    let neighborhood = raw.neighborhood || '';
    if (!neighborhood) {
      const locMatch = raw.text.match(/(João Pessoa|Cabedelo),\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]+)/i);
      if (locMatch) {
        neighborhood = locMatch[2].split('\n')[0].trim();
      }
    }

    // Normalização de Quartos
    let bedrooms = raw.bedrooms ?? null;
    if (bedrooms == null) {
      const bedMatch = raw.text.match(/(\d+)\s*quarto/i);
      if (bedMatch) bedrooms = Number(bedMatch[1]);
    }

    // Normalização de Área
    let areaM2 = raw.areaM2 ?? null;
    if (areaM2 == null) {
      const areaMatch = raw.text.match(/(\d+)\s*m²/i);
      if (areaMatch) areaM2 = Number(areaMatch[1]);
    }

    const normalizedUrl = canonicalizeAdUrl(raw.url);
    const title = raw.title.trim() || 'Imóvel anunciado na OLX';

    const fingerprint = generatePropertyFingerprint({
      neighborhood,
      bedrooms,
      areaM2,
      price: raw.price,
      title,
      campaignType: raw.campaignType,
    });

    return {
      externalId: raw.listId,
      url: raw.url,
      normalizedUrl,
      fingerprint,
      title,
      price: raw.price || null,
      neighborhood: neighborhood || undefined,
      bedrooms: bedrooms || undefined,
      areaM2: areaM2 || undefined,
      ownerName: undefined, // Nome é preenchido com precisão ao abrir o chat ("Responder [Nome]")
      isPrivate,
      campaignType: raw.campaignType,
      provider: 'olx',
    };
  }

  /**
   * Descoberta de anúncios.
   * Se chamado no ambiente onde o navegador Chrome DevTools estiver acessível,
   * extrai os dados reais da listagem da OLX.
   */
  async discover(
    campaign: BotCampaign,
    _options?: { maxScan?: number }
  ): Promise<DiscoveredAdCandidate[]> {
    // Retorna a URL de pesquisa que deve ser alimentada pelo Executor
    return [];
  }
}

export const olxProvider = new OlxCaptureProvider();

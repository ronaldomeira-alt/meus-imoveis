// ==============================================================================
// Provedor de Simulação e Teste de Filtros (Mock / Sandbox Seguro)
// ==============================================================================

import type { CaptureProvider } from './types';
import type { BotCampaign, DiscoveredAdCandidate } from '../../../types/bot-captador';
import { canonicalizeAdUrl, generatePropertyFingerprint } from '../engine';

export class SimulationCaptureProvider implements CaptureProvider {
  readonly id = 'simulation';
  readonly name = 'Modo de Simulação / Teste';

  async discover(campaign: BotCampaign, options?: { maxScan?: number }): Promise<DiscoveredAdCandidate[]> {
    const limit = options?.maxScan || 15;
    const candidates: DiscoveredAdCandidate[] = [];

    const neighborhoods = campaign.neighborhoods.length > 0
      ? campaign.neighborhoods
      : ['Bessa', 'Manaíra', 'Tambaú', 'Cabo Branco'];

    // Gera um conjunto representativo de anúncios para simular o portal
    for (let i = 1; i <= limit; i++) {
      const neighborhood = neighborhoods[(i - 1) % neighborhoods.length];
      const isPrivate = i % 4 !== 0; // 75% particulares, 25% profissionais para testar filtro particular
      const bedrooms = 1 + ((i * 2) % 4); // 1 a 4 quartos
      const area = 40 + (i * 18);
      
      let price = 300000 + (i * 75000);
      if (campaign.type === 'locacao') {
        price = 1800 + (i * 350);
      }

      const rawUrl = `https://portal-imoveis.com.br/anuncio-${campaign.type}-${neighborhood.toLowerCase()}-${1000 + i}?utm_source=test&fbclid=123`;
      const normalizedUrl = canonicalizeAdUrl(rawUrl);
      const title = `Apartamento ${bedrooms} quartos em ${neighborhood} nascente`;

      const fingerprint = generatePropertyFingerprint({
        neighborhood,
        bedrooms,
        areaM2: area,
        price,
        title,
        campaignType: campaign.type,
      });

      candidates.push({
        externalId: `sim-${campaign.type}-${1000 + i}`,
        url: rawUrl,
        normalizedUrl,
        fingerprint,
        title,
        price,
        neighborhood,
        bedrooms,
        areaM2: area,
        ownerName: isPrivate ? `Proprietário Anúncio #${i}` : `Imobiliária Exemplo #${i}`,
        ownerContact: isPrivate ? `8398877${String(1000 + i).padStart(4, '0')}` : undefined,
        isPrivate,
        campaignType: campaign.type,
        provider: 'simulation',
      });
    }

    return candidates;
  }

  getConversationUrl(capture: { url: string; externalId?: string | null }): string {
    return capture.url;
  }

  async checkResponses(
    captures: Array<{ id: string; externalId?: string | null; url: string }>
  ): Promise<Array<{ captureId: string; respondedAt: string }>> {
    // Retorna respostas simuladas para os primeiros itens quando solicitado
    if (captures.length === 0) return [];
    return [
      {
        captureId: captures[0].id,
        respondedAt: new Date().toISOString(),
      },
    ];
  }

  async sendInitialApproach(
    _candidate: DiscoveredAdCandidate,
    _messageText: string
  ): Promise<{ success: boolean; externalMessageId?: string; error?: string }> {
    // No modo simulação, envio é sempre simulado com sucesso seguro
    return {
      success: true,
      externalMessageId: `msg-sim-${Date.now()}`,
    };
  }
}

export const simulationProvider = new SimulationCaptureProvider();

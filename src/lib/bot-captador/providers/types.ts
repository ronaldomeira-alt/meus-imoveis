// ==============================================================================
// Interface Padrão de Provedores de Captação (Adapter Pattern)
// ==============================================================================

import type {
  BotCampaign,
  DiscoveredAdCandidate,
} from '../../../types/bot-captador';

export interface CaptureProvider {
  readonly id: string;
  readonly name: string;

  /**
   * Realiza a descoberta de anúncios baseando-se nos filtros da campanha
   */
  discover(campaign: BotCampaign, options?: { maxScan?: number }): Promise<DiscoveredAdCandidate[]>;

  /**
   * Abre ou gera o link direto da conversa com o anunciante
   */
  getConversationUrl(capture: { url: string; externalId?: string | null }): string;

  /**
   * Verifica se há respostas recebidas para captações ativas
   */
  checkResponses?(captures: Array<{ id: string; externalId?: string | null; url: string }>): Promise<
    Array<{ captureId: string; respondedAt: string }>
  >;

  /**
   * Realiza o envio da abordagem inicial única (apenas em ambiente autorizado)
   */
  sendInitialApproach?(
    candidate: DiscoveredAdCandidate,
    messageText: string
  ): Promise<{ success: boolean; externalMessageId?: string; error?: string }>;
}

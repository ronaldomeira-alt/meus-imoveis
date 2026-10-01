// ==============================================================================
// Orquestrador de Execução de Rodada do Bot Captador
// ==============================================================================

import { supabase } from '../supabase';
import type {
  BotCampaign,
  TriggerType,
  DiscoveredAdCandidate,
  BotExecutionRound,
} from '../../types/bot-captador';
import {
  getBotSettings,
  getBotCampaigns,
  getBotMessageTemplates,
  getBotCaptures,
  getCurrentAccountId,
} from './database';
import {
  evaluateAdEligibility,
  pickMessageTemplate,
} from './engine';
import { simulationProvider } from './providers/simulation';

export interface RoundExecutionReport {
  roundId?: string;
  triggerType: TriggerType;
  campaignType: 'venda' | 'locacao' | 'both';
  analyzedCount: number;
  newCount: number;
  eligibleCount: number;
  contactedCount: number;
  duplicateCount: number;
  errorCount: number;
  summaryMessage: string;
  discoveredCandidates?: DiscoveredAdCandidate[];
}

// ── TRAVA DE SEGURANÇA ABSOLUTA DE ENVIO REAL ─────────────────────────────────
// Garante que NENHUM envio real automático ou manual dispare mensagens nesta versão.
export const REAL_SENDING_ENABLED = false;

export async function runBotRound(options: {
  triggerType: TriggerType;
  targetCampaignType?: 'venda' | 'locacao' | 'both';
}): Promise<RoundExecutionReport> {
  const { triggerType, targetCampaignType = 'both' } = options;
  const isSimulation = triggerType === 'SIMULATION';

  const settings = await getBotSettings();
  if (!settings) {
    throw new Error('Configurações do Bot Captador não encontradas.');
  }

  // Se o bot estiver pausado e não for simulação, aborta
  if (!isSimulation && !settings.is_active && triggerType !== 'MANUAL') {
    return {
      triggerType,
      campaignType: targetCampaignType,
      analyzedCount: 0,
      newCount: 0,
      eligibleCount: 0,
      contactedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      summaryMessage: 'Bot Captador está pausado. Nenhuma mensagem enviada.',
    };
  }

  const accountId = await getCurrentAccountId();
  if (!accountId) throw new Error('Conta autenticada não identificada.');

  const allCampaigns = await getBotCampaigns();
  const campaignsToRun = allCampaigns.filter((c) => {
    if (targetCampaignType !== 'both' && c.type !== targetCampaignType) return false;
    return isSimulation || c.is_active;
  });

  if (campaignsToRun.length === 0) {
    return {
      triggerType,
      campaignType: targetCampaignType,
      analyzedCount: 0,
      newCount: 0,
      eligibleCount: 0,
      contactedCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      summaryMessage: 'Nenhuma campanha ativa para executar.',
    };
  }

  const templates = await getBotMessageTemplates();
  if (!isSimulation && templates.length === 0) {
    throw new Error('Nenhuma mensagem de abordagem cadastrada. Cadastre pelo menos uma mensagem.');
  }

  // Busca histórico de captações e tombstones existentes para deduplicação
  const existingCaptures = await getBotCaptures({ limit: 500 });
  
  let tombstoneFingerprints = new Set<string>();
  if (supabase) {
    const { data: tombstones } = await supabase
      .from('bot_capture_tombstones')
      .select('fingerprint')
      .eq('account_id', accountId);
    if (tombstones) {
      tombstones.forEach((t) => tombstoneFingerprints.add(t.fingerprint));
    }
  }

  let totalAnalyzed = 0;
  let totalNew = 0;
  let totalEligible = 0;
  let totalContacted = 0;
  let totalDuplicates = 0;
  let totalErrors = 0;
  const discoveredForReport: DiscoveredAdCandidate[] = [];

  const roundStartTime = new Date().toISOString();

  for (const campaign of campaignsToRun) {
    // 1. Descoberta via Provider
    const candidates = await simulationProvider.discover(campaign, { maxScan: 20 });
    totalAnalyzed += candidates.length;

    const eligibleInThisRun: DiscoveredAdCandidate[] = [];

    // 2. Avaliação de Elegibilidade e Deduplicação
    for (const ad of candidates) {
      const evaluation = evaluateAdEligibility(ad, campaign, existingCaptures, tombstoneFingerprints);
      if (evaluation.isPossibleDuplicate) {
        totalDuplicates += 1;
      }

      if (evaluation.isEligible) {
        totalNew += 1;
        totalEligible += 1;
        eligibleInThisRun.push(ad);
        discoveredForReport.push(ad);

        // Se não for simulação, insere na fila do banco
        if (!isSimulation && supabase) {
          try {
            await supabase.from('bot_captures').insert({
              account_id: accountId,
              campaign_type: campaign.type,
              provider: ad.provider,
              external_id: ad.externalId,
              url: ad.url,
              normalized_url: ad.normalizedUrl,
              fingerprint: ad.fingerprint,
              title: ad.title,
              price: ad.price,
              neighborhood: ad.neighborhood,
              bedrooms: ad.bedrooms,
              area_m2: ad.areaM2,
              owner_name: ad.ownerName,
              owner_contact: ad.ownerContact,
              status: 'QUEUED',
            });
          } catch (insertErr) {
            console.warn('Candidato já existente no banco:', insertErr);
          }
        }
      }
    }

    // 3. Processamento de Abordagem da Fila (respeitando limite)
    // SEGURANÇA E BLOQUEIO DE ENVIO REAL:
    if (!REAL_SENDING_ENABLED) {
      console.log('🔒 Trava de Segurança Ativa: REAL_SENDING_ENABLED = false. Disparos bloqueados.');
    } else if (!isSimulation && supabase) {
      const limit = campaign.max_contacts_per_round || 10;
      let contactsInCampaign = 0;

      while (contactsInCampaign < limit) {
        const template = pickMessageTemplate(templates);
        if (!template) break;

        // Reserva atômica no banco (FIFO)
        const { data: reserved, error: rpcErr } = await supabase.rpc('reserve_next_bot_candidate', {
          p_account_id: accountId,
          p_campaign_type: campaign.type,
          p_template_id: template.id,
        });

        if (rpcErr || !reserved || reserved.length === 0) {
          break; // Não há mais itens na fila
        }

        const candidateToContact = reserved[0];

        try {
          // Envio da abordagem única
          const sendResult = await simulationProvider.sendInitialApproach(
            {
              externalId: candidateToContact.capture_id,
              url: candidateToContact.url,
              normalizedUrl: candidateToContact.url,
              fingerprint: candidateToContact.fingerprint,
              title: candidateToContact.title,
              isPrivate: true,
              campaignType: campaign.type,
              provider: 'simulation',
            },
            template.content
          );

          if (sendResult.success) {
            // Confirmação atômica no banco + criação de Tombstone
            await supabase.rpc('confirm_bot_capture_contacted', {
              p_capture_id: candidateToContact.capture_id,
              p_message_snapshot: template.content,
            });
            totalContacted += 1;
            contactsInCampaign += 1;
          } else {
            totalErrors += 1;
            await supabase
              .from('bot_captures')
              .update({ status: 'FAILED', rejection_reason: sendResult.error })
              .eq('id', candidateToContact.capture_id);
          }
        } catch (err: any) {
          totalErrors += 1;
          await supabase
            .from('bot_captures')
            .update({ status: 'FAILED', rejection_reason: err?.message || 'Erro inesperado no envio' })
            .eq('id', candidateToContact.capture_id);
        }
      }
    }
  }

  const roundFinishTime = new Date().toISOString();
  let createdRoundId: string | undefined;

  // Se não for simulação, registra a rodada de execução no histórico
  if (!isSimulation && supabase) {
    const roundPayload: Partial<BotExecutionRound> = {
      account_id: accountId,
      campaign_type: targetCampaignType,
      trigger_type: triggerType,
      status: totalErrors > 0 && totalContacted === 0 ? 'FAILED' : 'COMPLETED',
      started_at: roundStartTime,
      finished_at: roundFinishTime,
      analyzed_count: totalAnalyzed,
      new_count: totalNew,
      eligible_count: totalEligible,
      contacted_count: totalContacted,
      duplicate_count: totalDuplicates,
      error_count: totalErrors,
      error_summary: totalErrors > 0 ? `${totalErrors} falha(s) de envio registradas` : null,
    };

    const { data: roundRow } = await supabase
      .from('bot_execution_rounds')
      .insert(roundPayload)
      .select('id')
      .single();

    createdRoundId = roundRow?.id;

    // Atualiza saúde e horário da última rodada
    const now = new Date();
    const nextRound = new Date(now.getTime() + 10 * 60 * 60 * 1000); // estimativa de próxima rodada
    await supabase
      .from('bot_settings')
      .update({
        last_round_at: roundFinishTime,
        next_round_at: nextRound.toISOString(),
        last_round_summary: `${totalContacted} abordagens realizadas (${totalAnalyzed} analisados, ${totalEligible} elegíveis)`,
        health_status: 'active',
        health_reason: null,
      })
      .eq('account_id', accountId);
  }

  const summary = isSimulation
    ? `Simulação concluída: ${totalAnalyzed} analisados, ${totalEligible} elegíveis, ${totalDuplicates} duplicados. 0 mensagens enviadas (Modo Teste).`
    : !REAL_SENDING_ENABLED
    ? `Rodada em Modo Seguro: ${totalAnalyzed} analisados, ${totalEligible} elegíveis. Disparos bloqueados (real_sending_enabled = false). 0 mensagens enviadas.`
    : `Rodada concluída: ${totalAnalyzed} analisados, ${totalEligible} elegíveis, ${totalContacted} abordados com sucesso.`;

  return {
    roundId: createdRoundId,
    triggerType,
    campaignType: targetCampaignType,
    analyzedCount: totalAnalyzed,
    newCount: totalNew,
    eligibleCount: totalEligible,
    contactedCount: totalContacted,
    duplicateCount: totalDuplicates,
    errorCount: totalErrors,
    summaryMessage: summary,
    discoveredCandidates: discoveredForReport,
  };
}

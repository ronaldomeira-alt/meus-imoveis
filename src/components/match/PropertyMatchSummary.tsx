import React, { useState, useEffect } from 'react';
import {
  Users,
  Send,
  Trash2,
  Eye,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronRight,
  Flame,
} from 'lucide-react';
import type { Property } from '../../types/property';
import type { MatchRecord } from '../../lib/match/types';
import { getMatchesForProperty, suppressMatch, updateMatchStatus } from '../../lib/match/service';
import { WhatsAppSendModal } from './WhatsAppSendModal';
import { LeadDetailDrawer } from './LeadDetailDrawer';

interface PropertyMatchSummaryProps {
  property: Property;
  onNavigateToMatchCenter?: () => void;
}

export const PropertyMatchSummary: React.FC<PropertyMatchSummaryProps> = ({
  property,
  onNavigateToMatchCenter,
}) => {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMatchForSend, setSelectedMatchForSend] = useState<MatchRecord | null>(null);
  const [selectedMatchForDetail, setSelectedMatchForDetail] = useState<MatchRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'compativeis' | 'historico'>('compativeis');

  const loadMatches = async () => {
    setIsLoading(true);
    try {
      const data = await getMatchesForProperty(property.id, { minScore: 50 });
      setMatches(data);
    } catch (err) {
      console.error('[PropertyMatchSummary] Erro ao carregar matches:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMatches();
  }, [property.id]);

  const handleSuppress = async (match: MatchRecord) => {
    const success = await suppressMatch({
      matchId: match.id,
      leadId: match.leadId,
      propertyId: match.propertyId,
    });
    if (success) {
      setMatches((prev) => prev.filter((m) => m.id !== match.id));
    }
  };

  const totalMatches = matches.length;
  const sentMatches = matches.filter((m) => m.matchStatus === 'enviado');
  const interestedMatches = matches.filter(
    (m) => m.shares?.some((s) => s.isInterested)
  );

  return (
    <div className="panel-surface rounded-2xl border border-line-subtle overflow-hidden">
      {/* Header com KPIs Contextuais (Fase 12) */}
      <div className="p-4 border-b border-line-subtle bg-white/[0.01] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-ink-primary uppercase tracking-wider">
              Inteligência de Match & Túnel WACRM
            </h3>
            <p className="text-[11px] text-ink-secondary">
              Leads compatíveis com este imóvel calculados pelo motor de regras
            </p>
          </div>
        </div>

        {/* 3 Contadores Contextuais */}
        <div className="flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-lg bg-white/[0.02] border border-line-subtle text-center">
            <span className="text-[9px] uppercase font-bold text-ink-muted block leading-none">
              Matches
            </span>
            <span className="text-xs font-extrabold text-ink-primary">
              {totalMatches}
            </span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-white/[0.02] border border-line-subtle text-center">
            <span className="text-[9px] uppercase font-bold text-ink-muted block leading-none">
              Enviados
            </span>
            <span className="text-xs font-extrabold text-blue-400">
              {sentMatches.length}
            </span>
          </div>
          <div className="px-2.5 py-1 rounded-lg bg-white/[0.02] border border-line-subtle text-center">
            <span className="text-[9px] uppercase font-bold text-ink-muted block leading-none">
              Interesses
            </span>
            <span className="text-xs font-extrabold text-emerald-400">
              {interestedMatches.length}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Internas (Compatíveis vs Histórico de Envios) */}
      <div className="px-4 border-b border-line-subtle flex items-center gap-4 bg-white/[0.005]">
        <button
          onClick={() => setActiveTab('compativeis')}
          className={`py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'compativeis'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-secondary hover:text-ink-primary'
          }`}
        >
          Leads Compatíveis ({totalMatches})
        </button>
        <button
          onClick={() => setActiveTab('historico')}
          className={`py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'historico'
              ? 'border-accent text-accent'
              : 'border-transparent text-ink-secondary hover:text-ink-primary'
          }`}
        >
          Histórico de Envios ({sentMatches.length})
        </button>
      </div>

      {/* Conteúdo */}
      <div className="p-4">
        {isLoading ? (
          <div className="py-8 text-center text-xs text-ink-muted animate-pulse">
            Carregando compatibilidades com o WACRM...
          </div>
        ) : activeTab === 'compativeis' ? (
          matches.length === 0 ? (
            <div className="py-6 text-center text-xs text-ink-muted">
              Nenhum lead com compatibilidade ativa para este imóvel no momento.
            </div>
          ) : (
            <div className="space-y-2.5">
              {matches.map((m) => {
                const lead = m.lead;
                const scoreColor =
                  m.matchScore >= 85
                    ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
                    : m.matchScore >= 70
                    ? 'text-blue-400 bg-blue-500/15 border-blue-500/30'
                    : 'text-amber-400 bg-amber-500/15 border-amber-500/30';

                const hasInterest = m.shares?.some((s) => s.isInterested);
                const hasOpened = m.shares?.some((s) => (s.openCount || 0) > 0);

                return (
                  <div
                    key={m.id}
                    className="p-3 rounded-xl bg-white/[0.015] border border-line-subtle hover:border-line-hover transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    {/* Dados do Lead com Avatar Tipográfico */}
                    <div
                      className="flex items-center gap-3 cursor-pointer group flex-1 min-w-0"
                      onClick={() => setSelectedMatchForDetail(m)}
                    >
                      <div className="w-9 h-9 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-xs font-bold text-accent flex-shrink-0">
                        {lead?.initials || 'MS'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-ink-primary group-hover:text-accent transition-colors truncate">
                            {lead?.name || 'Cliente'}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${scoreColor}`}
                          >
                            {m.matchScore}% Match
                          </span>
                          {(lead?.aiScore ?? 0) >= 8 && (
                            <span className="text-[10px] font-semibold text-amber-400 flex items-center gap-0.5">
                              <Flame className="w-3 h-3" /> Quente
                            </span>
                          )}
                          {hasInterest && (
                            <span className="px-1.5 py-0.5 rounded text-[9.5px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              Tenho Interesse
                            </span>
                          )}
                        </div>
                        <div className="text-[10.5px] text-ink-secondary flex items-center gap-2 mt-0.5">
                          <span>Perfil {m.profileMaturity}%</span>
                          <span>•</span>
                          <span>
                            {m.matchStatus === 'enviado'
                              ? 'Enviado'
                              : m.matchStatus === 'novo'
                              ? 'Novo'
                              : m.matchStatus}
                          </span>
                          {hasOpened && (
                            <>
                              <span>•</span>
                              <span className="text-blue-400">Abriu o link</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Ações Rápidas */}
                    <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => setSelectedMatchForDetail(m)}
                        title="Ver detalhes do Match e perfil do Lead"
                        className="p-1.5 rounded-lg border border-line-subtle text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04] transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleSuppress(m)}
                        title="Descartar Match (Supressão definitiva do par)"
                        className="p-1.5 rounded-lg border border-line-subtle text-ink-secondary hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => setSelectedMatchForSend(m)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                          m.matchStatus === 'enviado'
                            ? 'bg-white/[0.04] text-ink-secondary border border-line-subtle hover:bg-white/[0.08]'
                            : 'btn-primary'
                        }`}
                      >
                        <Send className="w-3 h-3" />
                        {m.matchStatus === 'enviado' ? 'Reenviar' : 'Enviar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Histórico de Envios deste Imóvel (Fase 16) */
          sentMatches.length === 0 ? (
            <div className="py-6 text-center text-xs text-ink-muted">
              Este imóvel ainda não foi enviado para nenhum cliente via WhatsApp.
            </div>
          ) : (
            <div className="space-y-2">
              {sentMatches.map((m) => {
                const lead = m.lead;
                const shares = m.shares || [];
                const lastShare = shares[0];

                return (
                  <div
                    key={m.id}
                    className="p-3 rounded-xl bg-white/[0.015] border border-line-subtle flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-xs font-bold text-blue-400">
                        {lead?.initials || 'MS'}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-ink-primary">
                          {lead?.name || 'Cliente'}
                        </div>
                        <div className="text-[10.5px] text-ink-secondary flex items-center gap-1.5 mt-0.5">
                          <Clock className="w-3 h-3 text-ink-muted" />
                          <span>
                            {m.sentAt
                              ? `Enviado em ${new Date(m.sentAt).toLocaleDateString('pt-BR')}`
                              : 'Enviado'}
                          </span>
                          {lastShare && (
                            <>
                              <span>•</span>
                              <span>
                                {lastShare.openCount > 0
                                  ? `Abriu ${lastShare.openCount}x`
                                  : 'Não abriu ainda'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      {lastShare?.isInterested ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Interesse
                        </span>
                      ) : (
                        <span className="text-[10px] text-ink-muted">
                          Sem retorno explícito
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Modais de Envio e Drawer de Detalhes */}
      {selectedMatchForSend && (
        <WhatsAppSendModal
          isOpen={Boolean(selectedMatchForSend)}
          onClose={() => setSelectedMatchForSend(null)}
          match={selectedMatchForSend}
          onSentSuccess={(updated) => {
            setMatches((prev) =>
              prev.map((item) => (item.id === updated.id ? updated : item))
            );
          }}
        />
      )}

      {selectedMatchForDetail && (
        <LeadDetailDrawer
          isOpen={Boolean(selectedMatchForDetail)}
          onClose={() => setSelectedMatchForDetail(null)}
          match={selectedMatchForDetail}
          onSendWhatsApp={(matchToSend) => setSelectedMatchForSend(matchToSend)}
        />
      )}
    </div>
  );
};

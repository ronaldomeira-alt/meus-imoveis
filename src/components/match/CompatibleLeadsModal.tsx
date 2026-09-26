import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Sparkles,
  Flame,
  Gauge,
  Building2,
  Send,
  MoreVertical,
  CheckCircle2,
  Phone,
  Check,
  PauseCircle,
  Archive,
  Trash2,
  Layers,
  ArrowUpDown,
  ExternalLink,
} from 'lucide-react';
import type { MatchRecord, MatchStatus } from '../../lib/match/types';
import type { PropertyMatchGroup } from './PropertyMatchCard';
import { getPhotoUrl } from '../../lib/supabase';

interface CompatibleLeadsModalProps {
  isOpen: boolean;
  onClose: () => void;
  group: PropertyMatchGroup | null;
  onSendSingle: (match: MatchRecord) => void;
  onOpenLeadDetail?: (match: MatchRecord) => void;
  onStatusChange?: (match: MatchRecord, newStatus: MatchStatus) => void;
  onSuppress?: (match: MatchRecord) => void;
}

type SortOption = 'score_desc' | 'temp_desc' | 'maturity_desc' | 'recent_desc';
type FilterTab = 'all' | 'strong' | 'good' | 'possible';

const SORT_LABELS: Record<SortOption, string> = {
  score_desc: 'Maior compatibilidade',
  temp_desc: 'Maior temperatura',
  maturity_desc: 'Maior maturidade',
  recent_desc: 'Mais recentes',
};

export const CompatibleLeadsModal: React.FC<CompatibleLeadsModalProps> = ({
  isOpen,
  onClose,
  group,
  onSendSingle,
  onOpenLeadDetail,
  onStatusChange,
  onSuppress,
}) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [sortBy, setSortBy] = useState<SortOption>('score_desc');
  const [openMenuMatchId, setOpenMenuMatchId] = useState<string | null>(null);

  const rawMatches = useMemo(() => {
    return group?.matches || [];
  }, [group?.matches]);

  // Contadores das faixas oficiais do motor
  const countStrong = useMemo(
    () => rawMatches.filter((m) => Math.round(m.matchScore) >= 85).length,
    [rawMatches]
  );
  const countGood = useMemo(
    () =>
      rawMatches.filter(
        (m) => Math.round(m.matchScore) >= 70 && Math.round(m.matchScore) < 85
      ).length,
    [rawMatches]
  );
  const countPossible = useMemo(
    () =>
      rawMatches.filter(
        (m) => Math.round(m.matchScore) >= 50 && Math.round(m.matchScore) < 70
      ).length,
    [rawMatches]
  );

  const totalSentCount = useMemo(
    () => rawMatches.filter((m) => m.matchStatus === 'enviado' || (m.shares && m.shares.length > 0)).length,
    [rawMatches]
  );

  // Filtragem e ordenação
  const filteredMatches = useMemo(() => {
    let list = [...rawMatches];

    if (filterTab === 'strong') {
      list = list.filter((m) => Math.round(m.matchScore) >= 85);
    } else if (filterTab === 'good') {
      list = list.filter(
        (m) => Math.round(m.matchScore) >= 70 && Math.round(m.matchScore) < 85
      );
    } else if (filterTab === 'possible') {
      list = list.filter(
        (m) => Math.round(m.matchScore) >= 50 && Math.round(m.matchScore) < 70
      );
    }

    list.sort((a, b) => {
      if (sortBy === 'score_desc') {
        if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
        return (b.commercialPriority || 0) - (a.commercialPriority || 0);
      }
      if (sortBy === 'temp_desc') {
        const tempA = a.lead?.aiScore ?? 0;
        const tempB = b.lead?.aiScore ?? 0;
        return tempB - tempA;
      }
      if (sortBy === 'maturity_desc') {
        return (b.profileMaturity || 0) - (a.profileMaturity || 0);
      }
      if (sortBy === 'recent_desc') {
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      }
      return 0;
    });

    return list;
  }, [rawMatches, filterTab, sortBy]);

  // Limpeza de estado ao fechar
  useEffect(() => {
    if (!isOpen) {
      setSelectedIds([]);
      setFilterTab('all');
      setSortBy('score_desc');
      setOpenMenuMatchId(null);
    }
  }, [isOpen]);

  if (!isOpen || !group) return null;

  const prop = group.property;
  const coverUrl = prop?.coverUrl ? getPhotoUrl(prop.coverUrl) : null;
  const formattedPrice = prop?.priceMin
    ? new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
      }).format(prop.priceMin)
    : 'Sob consulta';

  const allFilteredSelected =
    filteredMatches.length > 0 &&
    filteredMatches.every((m) => selectedIds.includes(m.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const visibleIds = new Set(filteredMatches.map((m) => m.id));
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.has(id)));
    } else {
      const visibleIds = filteredMatches.map((m) => m.id);
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleBatchSend = () => {
    if (selectedIds.length === 0) return;
    const firstSelected = rawMatches.find((m) => m.id === selectedIds[0]);
    if (firstSelected) {
      onSendSingle(firstSelected);
    }
  };

  const getScoreBadgeClass = (score: number) => {
    if (score >= 85) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    if (score >= 70) return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 10 }}
          className="relative w-full max-w-3xl max-h-[92vh] sm:max-h-[85vh] rounded-2xl bg-surface-1 border border-line-subtle shadow-2xl overflow-hidden flex flex-col"
        >
          {/* 1. Header do Modal (Contexto do Imóvel) */}
          <div className="p-4 sm:p-5 border-b border-line-subtle bg-surface-2/40">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3.5 min-w-0">
                {/* Capa */}
                <div className="w-14 h-14 min-w-14 min-h-14 rounded-lg overflow-hidden bg-surface-2 border border-line-subtle shrink-0">
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt={prop.title}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="size-full flex items-center justify-center text-ink-muted">
                      <Building2 className="size-5" />
                    </div>
                  )}
                </div>

                {/* Título e Localização */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-ink-primary truncate" title={prop.title}>
                      {prop.title}
                    </h3>
                    {prop.operation && (
                      <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-white/[0.05] border border-line-subtle text-ink-secondary shrink-0">
                        {prop.operation}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-ink-secondary mt-0.5 truncate">
                    {prop.neighborhood ? `${prop.neighborhood}, ${prop.city || 'João Pessoa'}` : prop.city || 'João Pessoa'} •{' '}
                    <span className="text-emerald-400 font-semibold">{formattedPrice}</span>
                  </p>
                </div>
              </div>

              {/* Botão Fechar */}
              <button
                type="button"
                onClick={onClose}
                className="size-8 rounded-lg flex items-center justify-center text-ink-secondary hover:text-ink-primary hover:bg-white/[0.05] transition-colors cursor-pointer shrink-0"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Badges de Resumo do Imóvel */}
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line-subtle flex-wrap text-xs">
              <span className="px-2.5 py-0.5 rounded-full bg-accent/10 border border-accent/30 text-accent font-bold text-xs flex items-center gap-1.5">
                <Sparkles className="size-3" />
                {rawMatches.length} {rawMatches.length === 1 ? 'lead compatível' : 'leads compatíveis'}
              </span>

              {countStrong > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-semibold text-xs">
                  {countStrong} {countStrong === 1 ? 'match forte' : 'matches fortes'} (≥85%)
                </span>
              )}

              {totalSentCount > 0 && (
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-blue-400 font-semibold text-xs">
                  {totalSentCount} {totalSentCount === 1 ? 'envio realizado' : 'envios realizados'}
                </span>
              )}
            </div>

            {/* 2. Barra de Controles: Abas de Filtro + Ordenação */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-3 pt-3 border-t border-line-subtle">
              {/* Abas */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    filterTab === 'all'
                      ? 'bg-accent text-white shadow-xs'
                      : 'bg-white/[0.03] text-ink-secondary hover:text-ink-primary hover:bg-white/[0.06]'
                  }`}
                >
                  Todas ({rawMatches.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('strong')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    filterTab === 'strong'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white/[0.03] text-ink-secondary hover:text-ink-primary hover:bg-white/[0.06]'
                  }`}
                >
                  Forte ≥85% ({countStrong})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('good')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    filterTab === 'good'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white/[0.03] text-ink-secondary hover:text-ink-primary hover:bg-white/[0.06]'
                  }`}
                >
                  Bom 70–84% ({countGood})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('possible')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    filterTab === 'possible'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white/[0.03] text-ink-secondary hover:text-ink-primary hover:bg-white/[0.06]'
                  }`}
                >
                  Possível 50–69% ({countPossible})
                </button>
              </div>

              {/* Ordenação */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-ink-secondary">Ordenar:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="bg-surface-2 border border-line-subtle rounded-lg px-2.5 py-1 text-xs text-ink-primary font-medium focus:outline-none focus:border-accent"
                >
                  <option value="score_desc">Maior compatibilidade</option>
                  <option value="temp_desc">Maior temperatura</option>
                  <option value="maturity_desc">Maior maturidade</option>
                  <option value="recent_desc">Mais recentes</option>
                </select>
              </div>
            </div>

            {/* 3. Barra de Multi-seleção */}
            <div className="flex items-center justify-between gap-3 mt-3 pt-2.5 border-t border-line-subtle text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none text-ink-secondary hover:text-ink-primary font-medium">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  className="rounded border-line-subtle text-accent focus:ring-accent bg-surface-2 size-4 cursor-pointer"
                />
                <span>Selecionar todos os visíveis ({filteredMatches.length})</span>
              </label>

              <div className="flex items-center gap-2">
                {selectedIds.length > 0 && (
                  <span className="text-xs font-semibold text-accent">
                    {selectedIds.length} {selectedIds.length === 1 ? 'selecionado' : 'selecionados'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleBatchSend}
                  disabled={selectedIds.length === 0}
                  className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-3 rounded-lg flex items-center transition-colors cursor-pointer"
                >
                  <Send className="size-3" />
                  <span>Enviar selecionados ({selectedIds.length})</span>
                </button>
              </div>
            </div>
          </div>

          {/* 4. Lista Rolável de Leads Compatíveis */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
            {filteredMatches.length === 0 ? (
              <div className="flex h-44 flex-col items-center justify-center text-center p-6 text-ink-secondary">
                <Sparkles className="size-8 text-ink-muted/40 mb-2" />
                <p className="text-xs font-medium text-ink-primary">Nenhum lead nesta faixa de compatibilidade</p>
                <p className="text-[11px] text-ink-muted mt-0.5">Tente selecionar outra aba de filtro acima.</p>
              </div>
            ) : (
              filteredMatches.map((m) => {
                const lead = m.lead;
                const score = Math.round(m.matchScore);
                const isSelected = selectedIds.includes(m.id);
                const isMenuOpen = openMenuMatchId === m.id;

                return (
                  <div
                    key={m.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'bg-accent/10 border-accent/40 shadow-xs'
                        : 'bg-surface-2/40 border-line-subtle hover:bg-surface-2/70 hover:border-line-strong'
                    }`}
                  >
                    {/* Checkbox + Avatar */}
                    <div className="flex items-center gap-3 shrink-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(m.id)}
                        className="rounded border-line-subtle text-accent focus:ring-accent bg-surface-2 size-4 cursor-pointer"
                      />

                      <div
                        className="size-9 rounded-full bg-accent/15 border border-accent/30 text-accent font-bold text-xs flex items-center justify-center shrink-0 cursor-pointer"
                        onClick={() => onOpenLeadDetail && onOpenLeadDetail(m)}
                        title="Ver detalhes do lead"
                      >
                        {lead?.initials || lead?.name?.slice(0, 2).toUpperCase() || 'LD'}
                      </div>
                    </div>

                    {/* Detalhes do Lead */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`rounded-full px-2 py-0.2 text-[10px] font-bold border ${getScoreBadgeClass(
                            score
                          )}`}
                        >
                          {score}% match
                        </span>

                        <h4
                          className="text-xs font-bold text-ink-primary hover:text-accent cursor-pointer truncate max-w-[240px] sm:max-w-xs transition-colors"
                          onClick={() => onOpenLeadDetail && onOpenLeadDetail(m)}
                        >
                          {lead?.name || 'Cliente'}
                        </h4>

                        {m.matchStatus !== 'novo' && (
                          <span className="rounded-full bg-white/[0.04] border border-line-subtle px-1.5 py-0.2 text-[10px] text-ink-secondary capitalize">
                            {m.matchStatus}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-ink-secondary mt-1 flex-wrap">
                        {lead?.phone && (
                          <span className="font-mono flex items-center gap-1">
                            <Phone className="size-2.5 text-ink-muted" />
                            {lead.phone}
                          </span>
                        )}

                        {lead?.aiScore !== undefined && lead.aiScore > 0 && (
                          <span className="flex items-center gap-1 text-amber-400 font-semibold">
                            <Flame className="size-3 text-amber-500" />
                            Score {lead.aiScore}/10
                          </span>
                        )}

                        {m.profileMaturity !== undefined && (
                          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                            <Gauge className="size-3 text-emerald-500" />
                            Maturidade {m.profileMaturity}%
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Ação Enviar + Menu Opções */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onSendSingle(m)}
                        className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 rounded-lg flex items-center transition-colors cursor-pointer"
                        title="Enviar este imóvel para o WhatsApp pessoal deste lead"
                      >
                        <Send className="size-3" />
                        <span>Enviar</span>
                      </button>

                      {/* Menu de Contexto (Pausar / Arquivar / Descartar) */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setOpenMenuMatchId(isMenuOpen ? null : m.id)}
                          className="size-7 rounded-lg flex items-center justify-center text-ink-secondary hover:text-ink-primary hover:bg-white/[0.05] transition-colors cursor-pointer"
                        >
                          <MoreVertical className="size-3.5" />
                        </button>

                        {isMenuOpen && (
                          <div className="absolute right-0 top-8 z-30 w-40 rounded-xl bg-surface-2 border border-line-subtle shadow-xl p-1 text-xs space-y-0.5 animate-in fade-in-0 zoom-in-95">
                            {onStatusChange && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onStatusChange(m, m.matchStatus === 'pausado' ? 'novo' : 'pausado');
                                    setOpenMenuMatchId(null);
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] text-ink-primary flex items-center gap-2 cursor-pointer"
                                >
                                  <PauseCircle className="size-3.5 text-amber-400" />
                                  <span>{m.matchStatus === 'pausado' ? 'Reativar Match' : 'Pausar Match'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    onStatusChange(m, m.matchStatus === 'arquivado' ? 'novo' : 'arquivado');
                                    setOpenMenuMatchId(null);
                                  }}
                                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] text-ink-primary flex items-center gap-2 cursor-pointer"
                                >
                                  <Archive className="size-3.5 text-slate-400" />
                                  <span>{m.matchStatus === 'arquivado' ? 'Desarquivar' : 'Arquivar'}</span>
                                </button>
                              </>
                            )}
                            {onSuppress && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSuppress(m);
                                  setOpenMenuMatchId(null);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-rose-500/10 text-rose-400 flex items-center gap-2 cursor-pointer border-t border-line-subtle mt-1"
                              >
                                <Trash2 className="size-3.5 text-rose-400" />
                                <span>Descartar Match</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

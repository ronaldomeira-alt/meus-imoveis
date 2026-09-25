import React, { useState, useEffect, useMemo } from 'react';
import {
  Sparkles,
  Search,
  Filter,
  Send,
  Trash2,
  Eye,
  PauseCircle,
  Archive,
  CheckCircle2,
  Building2,
  Flame,
  Phone,
  Clock,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';
import type { MatchRecord, MatchStatus } from '../../lib/match/types';
import { getAllMatches, suppressMatch, updateMatchStatus } from '../../lib/match/service';
import { WhatsAppSendModal } from './WhatsAppSendModal';
import { LeadDetailDrawer } from './LeadDetailDrawer';
import { getPhotoUrl } from '../../lib/supabase';

export const MatchView: React.FC = () => {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MatchStatus>('novo');

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [scoreFilter, setScoreFilter] = useState<'all' | 'strong' | 'good' | 'manual'>('all');
  const [tempFilter, setTempFilter] = useState<'all' | 'hot' | 'warm' | 'cold'>('all');
  const [maturityFilter, setMaturityFilter] = useState<'all' | 'qualified' | 'growing'>('all');

  // Modais
  const [selectedMatchForSend, setSelectedMatchForSend] = useState<MatchRecord | null>(null);
  const [selectedMatchForDetail, setSelectedMatchForDetail] = useState<MatchRecord | null>(null);

  const fetchMatches = async () => {
    setIsLoading(true);
    try {
      const data = await getAllMatches({ status: activeTab, minScore: 50 });
      setMatches(data);
    } catch (err) {
      console.error('[MatchView] Erro ao carregar matches:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, [activeTab]);

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

  const handleStatusChange = async (match: MatchRecord, newStatus: MatchStatus) => {
    const success = await updateMatchStatus(match.id, newStatus);
    if (success) {
      setMatches((prev) => prev.filter((m) => m.id !== match.id));
    }
  };

  // Filtragem e busca
  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      // 1. Busca textual
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const leadName = (m.lead?.name || '').toLowerCase();
        const leadPhone = (m.lead?.phone || '').toLowerCase();
        const propTitle = (m.property?.title || '').toLowerCase();
        const propNeighborhood = (m.property?.neighborhood || '').toLowerCase();
        if (
          !leadName.includes(query) &&
          !leadPhone.includes(query) &&
          !propTitle.includes(query) &&
          !propNeighborhood.includes(query)
        ) {
          return false;
        }
      }

      // 2. Faixa de Match
      if (scoreFilter === 'strong' && m.matchScore < 85) return false;
      if (scoreFilter === 'good' && (m.matchScore < 70 || m.matchScore >= 85)) return false;
      if (scoreFilter === 'manual' && m.matchScore >= 70) return false;

      // 3. Temperatura
      const score = m.lead?.aiScore ?? 0;
      if (tempFilter === 'hot' && score < 8) return false;
      if (tempFilter === 'warm' && (score < 5 || score >= 8)) return false;
      if (tempFilter === 'cold' && score >= 5) return false;

      // 4. Maturidade
      if (maturityFilter === 'qualified' && m.profileMaturity < 70) return false;
      if (maturityFilter === 'growing' && m.profileMaturity >= 70) return false;

      return true;
    });
  }, [matches, searchTerm, scoreFilter, tempFilter, maturityFilter]);

  // Agrupamento por Imóvel (Perspectiva IMÓVEL → LEADS COMPATÍVEIS)
  const groupedByProperty = useMemo(() => {
    const map = new Map<string, { property: any; matches: MatchRecord[] }>();
    for (const m of filteredMatches) {
      const propId = m.propertyId;
      if (!map.has(propId)) {
        map.set(propId, {
          property: m.property || {
            propertyId: propId,
            title: 'Imóvel',
            neighborhood: 'João Pessoa',
            priceMin: 0,
          },
          matches: [],
        });
      }
      map.get(propId)!.matches.push(m);
    }
    return Array.from(map.values());
  }, [filteredMatches]);

  return (
    <div className="flex-1 flex flex-col min-h-0 gap-3 overflow-hidden animate-fade-in p-2 sm:p-4">
      {/* ── Topo: Marca e Abas de Estado ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line-subtle pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-ink-primary tracking-tight">
              MATCH — Túnel Imóveis ↔ Leads
            </h2>
            <p className="text-xs text-ink-secondary">
              Perspectiva do Catálogo: Imóvel → Leads Compatíveis com prioridade comercial
            </p>
          </div>
        </div>

        {/* Abas Padronizadas: Novos, Enviados, Pausados, Arquivados */}
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.02] border border-line-subtle self-start sm:self-center">
          <button
            onClick={() => setActiveTab('novo')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'novo'
                ? 'bg-accent text-white shadow-md shadow-accent/20'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            Novos
          </button>
          <button
            onClick={() => setActiveTab('enviado')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'enviado'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            Enviados
          </button>
          <button
            onClick={() => setActiveTab('pausado')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'pausado'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            Pausados
          </button>
          <button
            onClick={() => setActiveTab('arquivado')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'arquivado'
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            Arquivados
          </button>
        </div>
      </div>

      {/* ── Barra de Filtros ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-white/[0.015] border border-line-subtle text-xs">
        {/* Campo de Busca */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            type="text"
            placeholder="Buscar por lead, telefone ou imóvel..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-black/20 border border-line-subtle text-xs text-ink-primary focus:outline-none focus:border-accent"
          />
        </div>

        {/* Filtros em Pílulas */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Faixa de Match */}
          <select
            value={scoreFilter}
            onChange={(e) => setScoreFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-black/20 border border-line-subtle text-ink-primary text-xs focus:outline-none"
          >
            <option value="all">Todas as faixas</option>
            <option value="strong">Matches Fortes (85%+)</option>
            <option value="good">Bons Matches (70–84%)</option>
            <option value="manual">Consulta Manual (50–69%)</option>
          </select>

          {/* Temperatura */}
          <select
            value={tempFilter}
            onChange={(e) => setTempFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-black/20 border border-line-subtle text-ink-primary text-xs focus:outline-none"
          >
            <option value="all">Todas temperaturas</option>
            <option value="hot">Quente (8–10)</option>
            <option value="warm">Morno (5–7)</option>
            <option value="cold">Frio (0–4)</option>
          </select>

          {/* Maturidade */}
          <select
            value={maturityFilter}
            onChange={(e) => setMaturityFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-black/20 border border-line-subtle text-ink-primary text-xs focus:outline-none"
          >
            <option value="all">Todas maturidades</option>
            <option value="qualified">Qualificados (&gt;= 70%)</option>
            <option value="growing">Em qualificação (&lt; 70%)</option>
          </select>

          <button
            onClick={fetchMatches}
            title="Recarregar"
            className="p-1.5 rounded-lg border border-line-subtle text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Lista de Imóveis com seus Leads Compatíveis ── */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-ink-muted animate-pulse">
            Carregando inteligência de Match do túnel...
          </div>
        ) : groupedByProperty.length === 0 ? (
          <div className="py-16 text-center panel-surface rounded-2xl p-8 border border-line-subtle">
            <Building2 className="w-10 h-10 text-ink-muted mx-auto mb-2" />
            <h4 className="text-sm font-bold text-ink-primary mb-1">
              Nenhum Match nesta aba
            </h4>
            <p className="text-xs text-ink-secondary max-w-sm mx-auto">
              {activeTab === 'novo'
                ? 'Quando novos imóveis forem cadastrados ou leads atingirem maturidade >= 70%, os Matches aparecerão aqui automaticamente.'
                : 'Não há registros marcados com este status.'}
            </p>
          </div>
        ) : (
          groupedByProperty.map((group) => {
            const prop = group.property;
            const coverUrl = prop?.coverUrl
              ? getPhotoUrl(prop.coverUrl)
              : 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=600&q=80';

            return (
              <div
                key={prop.propertyId}
                className="panel-surface rounded-2xl border border-line-subtle overflow-hidden"
              >
                {/* Header do Imóvel */}
                <div className="p-3.5 bg-white/[0.02] border-b border-line-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={coverUrl}
                      alt={prop.title}
                      className="w-12 h-12 rounded-xl object-cover border border-white/[0.06] flex-shrink-0"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-ink-primary">
                          {prop.title}
                        </h3>
                        <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/[0.05] text-ink-secondary">
                          {prop.operation || 'venda'}
                        </span>
                      </div>
                      <div className="text-[11px] text-ink-secondary flex items-center gap-2 mt-0.5">
                        <span>{prop.neighborhood}, {prop.city}</span>
                        <span>•</span>
                        <span className="text-emerald-400 font-semibold">
                          {prop.priceMin
                            ? prop.priceMin.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                                maximumFractionDigits: 0,
                              })
                            : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <span className="px-2.5 py-1 rounded-lg bg-accent/10 border border-accent/30 text-accent font-extrabold text-xs">
                      {group.matches.length}{' '}
                      {group.matches.length === 1 ? 'lead compatível' : 'leads compatíveis'}
                    </span>
                  </div>
                </div>

                {/* Lista de Leads Compatíveis com este Imóvel */}
                <div className="p-3 divide-y divide-white/[0.03] space-y-1">
                  {group.matches.map((m) => {
                    const lead = m.lead;
                    const scoreColor =
                      m.matchScore >= 85
                        ? 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30'
                        : m.matchScore >= 70
                        ? 'text-blue-400 bg-blue-500/15 border-blue-500/30'
                        : 'text-amber-400 bg-amber-500/15 border-amber-500/30';

                    return (
                      <div
                        key={m.id}
                        className="pt-2 pb-2 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.01] rounded-lg px-2 transition-colors"
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
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${scoreColor}`}>
                                {m.matchScore}% Match
                              </span>
                              {(lead?.aiScore ?? 0) >= 8 && (
                                <span className="text-[10px] font-semibold text-amber-400 flex items-center gap-0.5">
                                  <Flame className="w-3 h-3" /> Quente
                                </span>
                              )}
                              <span className="text-[10px] text-ink-muted">
                                Maturidade {m.profileMaturity}%
                              </span>
                            </div>
                            <div className="text-[10.5px] text-ink-secondary flex items-center gap-2 mt-0.5">
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-ink-muted" />
                                {lead?.phone || 'Telefone não informado'}
                              </span>
                              <span>•</span>
                              <span>Prioridade Comercial: {m.commercialPriority}</span>
                            </div>
                          </div>
                        </div>

                        {/* Ações Rápidas */}
                        <div className="flex items-center gap-1.5 flex-shrink-0 self-end sm:self-center">
                          <button
                            onClick={() => setSelectedMatchForDetail(m)}
                            title="Ver análise do Lead e critérios do Match"
                            className="p-1.5 rounded-lg border border-line-subtle text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04] transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {activeTab !== 'pausado' && (
                            <button
                              onClick={() => handleStatusChange(m, 'pausado')}
                              title="Pausar Match"
                              className="p-1.5 rounded-lg border border-line-subtle text-ink-secondary hover:text-amber-400 hover:border-amber-500/30 hover:bg-amber-500/10 transition-colors"
                            >
                              <PauseCircle className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {activeTab !== 'arquivado' && (
                            <button
                              onClick={() => handleStatusChange(m, 'arquivado')}
                              title="Arquivar Match"
                              className="p-1.5 rounded-lg border border-line-subtle text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04] transition-colors"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            onClick={() => handleSuppress(m)}
                            title="Descartar Match (Supressão definitiva do par)"
                            className="p-1.5 rounded-lg border border-line-subtle text-ink-secondary hover:text-rose-400 hover:border-rose-500/30 hover:bg-rose-500/10 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => setSelectedMatchForSend(m)}
                            className="btn-primary px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ml-1"
                          >
                            <Send className="w-3 h-3" />
                            Enviar
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
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

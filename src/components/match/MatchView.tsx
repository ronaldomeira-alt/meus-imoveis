import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Sparkles,
  Search,
  Filter,
  Send,
  Building2,
  RefreshCw,
  SlidersHorizontal,
  Flame,
  Gauge,
  Layers,
} from 'lucide-react';
import type { MatchRecord, MatchStatus } from '../../lib/match/types';
import { getAllMatches, suppressMatch, updateMatchStatus } from '../../lib/match/service';
import { PropertyMatchCard, type PropertyMatchGroup } from './PropertyMatchCard';
import { CompatibleLeadsModal } from './CompatibleLeadsModal';
import { PropertyAnalysisView } from './PropertyAnalysisView';
import { WhatsAppSendModal } from './WhatsAppSendModal';
import { LeadDetailDrawer } from './LeadDetailDrawer';

export const MatchView: React.FC = () => {
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<MatchStatus>('novo');

  // Filtros compactos
  const [searchTerm, setSearchTerm] = useState('');
  const [scoreFilter, setScoreFilter] = useState<'all' | 'strong' | 'good' | 'manual'>('all');
  const [tempFilter, setTempFilter] = useState<'all' | 'hot' | 'warm' | 'cold'>('all');
  const [maturityFilter, setMaturityFilter] = useState<'all' | 'qualified' | 'growing'>('all');

  // Modais e gavetas
  const [modalGroup, setModalGroup] = useState<PropertyMatchGroup | null>(null);
  const [selectedMatchForSend, setSelectedMatchForSend] = useState<MatchRecord | null>(null);
  const [selectedMatchForDetail, setSelectedMatchForDetail] = useState<MatchRecord | null>(null);

  // Subrota de análise de imóvel (/match/imovel/:id)
  const [analysisPropertyId, setAnalysisPropertyId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const match = window.location.pathname.match(/\/match\/imovel\/([^/]+)/);
      if (match) return match[1];
    }
    return null;
  });

  // Sincroniza History API (popstate) para navegação da subrota
  useEffect(() => {
    const handlePopState = () => {
      const match = window.location.pathname.match(/\/match\/imovel\/([^/]+)/);
      setAnalysisPropertyId(match ? match[1] : null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openAnalysis = useCallback((propertyId: string) => {
    setAnalysisPropertyId(propertyId);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', `/match/imovel/${propertyId}`);
    }
  }, []);

  const closeAnalysis = useCallback(() => {
    setAnalysisPropertyId(null);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/match');
    }
  }, []);

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
  const groupedByProperty = useMemo<PropertyMatchGroup[]>(() => {
    const map = new Map<string, PropertyMatchGroup>();
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

    // Ordena cada grupo de matches por compatibilidade decrescente
    for (const group of map.values()) {
      group.matches.sort((a, b) => b.matchScore - a.matchScore);
    }

    // Ordena os imóveis por prioridade do melhor match
    return Array.from(map.values()).sort((a, b) => {
      const scoreA = a.matches[0]?.matchScore ?? 0;
      const scoreB = b.matches[0]?.matchScore ?? 0;
      return scoreB - scoreA;
    });
  }, [filteredMatches]);

  // Se a subrota de análise de imóvel estiver ativa, renderiza PropertyAnalysisView
  const currentAnalysisGroup = useMemo(() => {
    if (!analysisPropertyId) return null;
    return groupedByProperty.find((g) => g.property.propertyId === analysisPropertyId) || null;
  }, [groupedByProperty, analysisPropertyId]);

  if (analysisPropertyId) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-base">
        <PropertyAnalysisView
          propertyId={analysisPropertyId}
          group={currentAnalysisGroup}
          onBack={closeAnalysis}
          onSendSingle={(m) => setSelectedMatchForSend(m)}
          onOpenLeadDetail={(m) => setSelectedMatchForDetail(m)}
        />

        {/* Modal de Envio WhatsApp */}
        {selectedMatchForSend && (
          <WhatsAppSendModal
            isOpen={Boolean(selectedMatchForSend)}
            onClose={() => setSelectedMatchForSend(null)}
            match={selectedMatchForSend}
            onSentSuccess={(updated) => {
              setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
            }}
          />
        )}

        {/* Drawer de Detalhes do Lead */}
        {selectedMatchForDetail && (
          <LeadDetailDrawer
            isOpen={Boolean(selectedMatchForDetail)}
            onClose={() => setSelectedMatchForDetail(null)}
            match={selectedMatchForDetail}
            onSendWhatsApp={(m) => {
              setSelectedMatchForDetail(null);
              setSelectedMatchForSend(m);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="match-scroll-shell flex-1 flex flex-col min-h-0 gap-3 overflow-y-auto md:overflow-hidden animate-fade-in p-2 sm:p-4">
      {/* ── Topo: Marca e Abas de Estado ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line-subtle pb-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-ink-primary tracking-tight">
              MATCH — Catálogo de Imóveis & Leads
            </h2>
            <p className="text-xs text-ink-secondary">
              Perspectiva do Imóvel: Imóvel → Melhor Lead e Leads Compatíveis
            </p>
          </div>
        </div>

        {/* Abas Padronizadas: Novos, Enviados, Pausados, Arquivados */}
        <div className="match-tabs sticky top-0 z-20 flex items-center gap-1.5 p-1 rounded-xl bg-surface-2/95 border border-line-subtle self-start sm:self-center w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('novo')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'novo'
                ? 'bg-accent text-white shadow-md shadow-accent/20'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            Novos
          </button>
          <button
            onClick={() => setActiveTab('enviado')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'enviado'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            Enviados
          </button>
          <button
            onClick={() => setActiveTab('pausado')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'pausado'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-500/20'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            Pausados
          </button>
          <button
            onClick={() => setActiveTab('arquivado')}
            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'arquivado'
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            Arquivados
          </button>
        </div>
      </div>

      {/* ── Barra Compacta de Filtros ── */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl bg-surface-1 border border-line-subtle text-xs shrink-0">
        {/* Campo de Busca */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <input
            type="text"
            placeholder="Buscar imóvel, bairro ou lead..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-surface-2 border border-line-subtle text-ink-primary placeholder:text-ink-muted focus:outline-none focus:border-accent text-xs"
          />
        </div>

        {/* Filtros em Linha Compacta */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Faixa de Match */}
          <select
            value={scoreFilter}
            onChange={(e) => setScoreFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-surface-2 border border-line-subtle text-ink-primary text-xs focus:outline-none focus:border-accent font-medium cursor-pointer"
          >
            <option value="all">Todas as Faixas</option>
            <option value="strong">Match Forte (≥85%)</option>
            <option value="good">Bom Match (70–84%)</option>
            <option value="manual">Manual (50–69%)</option>
          </select>

          {/* Temperatura */}
          <select
            value={tempFilter}
            onChange={(e) => setTempFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-surface-2 border border-line-subtle text-ink-primary text-xs focus:outline-none focus:border-accent font-medium cursor-pointer"
          >
            <option value="all">Temperatura: Todas</option>
            <option value="hot">Quente (Score ≥8)</option>
            <option value="warm">Morno (Score 5–7)</option>
            <option value="cold">Frio (Score &lt;5)</option>
          </select>

          {/* Maturidade */}
          <select
            value={maturityFilter}
            onChange={(e) => setMaturityFilter(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-lg bg-surface-2 border border-line-subtle text-ink-primary text-xs focus:outline-none focus:border-accent font-medium cursor-pointer"
          >
            <option value="all">Maturidade: Todas</option>
            <option value="qualified">Qualificado (≥70%)</option>
            <option value="growing">Em Formação (&lt;70%)</option>
          </select>

          {/* Botão de Atualizar */}
          <button
            onClick={fetchMatches}
            disabled={isLoading}
            className="p-1.5 rounded-lg bg-surface-2 hover:bg-surface-3 border border-line-subtle text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer"
            title="Recarregar matches"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-accent' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── GRID PRINCIPAL: 3 CARDS POR LINHA NO DESKTOP ── */}
      <div className="flex-1 min-h-0 overflow-visible md:overflow-y-auto pr-1">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-56 rounded-xl bg-surface-1 border border-line-subtle animate-pulse p-4 flex flex-col justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 min-w-14 min-h-14 rounded-lg bg-surface-2 shrink-0" />
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-surface-2 rounded w-3/4" />
                    <div className="h-3 bg-surface-2 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-16 rounded-lg bg-surface-2" />
                <div className="h-7 rounded-lg bg-surface-2 w-1/3" />
              </div>
            ))}
          </div>
        ) : groupedByProperty.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-8 border border-dashed border-line-subtle rounded-2xl bg-surface-1/40">
            <Building2 className="w-12 h-12 text-ink-muted/40 mb-3" />
            <h3 className="text-sm font-bold text-ink-primary">
              Nenhum Imóvel com Match nesta aba
            </h3>
            <p className="text-xs text-ink-secondary mt-1 max-w-sm">
              Não encontramos imóveis compatíveis com os filtros selecionados ou com o status atual.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
            {groupedByProperty.map((group) => (
              <PropertyMatchCard
                key={group.property.propertyId}
                group={group}
                onOpenModal={(g) => setModalGroup(g)}
                onOpenAnalysis={(propId) => openAnalysis(propId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modal de Leads Compatíveis ── */}
      {modalGroup && (
        <CompatibleLeadsModal
          isOpen={Boolean(modalGroup)}
          onClose={() => setModalGroup(null)}
          group={modalGroup}
          onSendSingle={(m) => setSelectedMatchForSend(m)}
          onOpenLeadDetail={(m) => setSelectedMatchForDetail(m)}
          onStatusChange={handleStatusChange}
          onSuppress={handleSuppress}
        />
      )}

      {/* ── Modal de Envio WhatsApp ── */}
      {selectedMatchForSend && (
        <WhatsAppSendModal
          isOpen={Boolean(selectedMatchForSend)}
          onClose={() => setSelectedMatchForSend(null)}
          match={selectedMatchForSend}
          onSentSuccess={(updated) => {
            setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
            // Atualiza também dentro do modal aberto, se houver
            if (modalGroup) {
              setModalGroup((prev) =>
                prev
                  ? {
                      ...prev,
                      matches: prev.matches.map((m) => (m.id === updated.id ? updated : m)),
                    }
                  : null
              );
            }
          }}
        />
      )}

      {/* ── Drawer Lateral de Detalhes do Lead ── */}
      {selectedMatchForDetail && (
        <LeadDetailDrawer
          isOpen={Boolean(selectedMatchForDetail)}
          onClose={() => setSelectedMatchForDetail(null)}
          match={selectedMatchForDetail}
          onSendWhatsApp={(m) => {
            setSelectedMatchForDetail(null);
            setSelectedMatchForSend(m);
          }}
        />
      )}
    </div>
  );
};

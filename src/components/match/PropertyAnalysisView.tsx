import React, { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Flame,
  Gauge,
  Building2,
  Send,
  CheckCircle2,
  Clock,
  Phone,
  Bed,
  Maximize2,
  MapPin,
  ExternalLink,
  Share2,
  Calendar,
  AlertCircle,
  Eye,
  Heart,
  ChevronRight,
} from 'lucide-react';
import type { MatchRecord, MatchStatus } from '../../lib/match/types';
import type { PropertyMatchGroup } from './PropertyMatchCard';
import { getPhotoUrl } from '../../lib/supabase';

interface PropertyAnalysisViewProps {
  propertyId: string;
  group: PropertyMatchGroup | null;
  onBack: () => void;
  onSendSingle: (match: MatchRecord) => void;
  onOpenLeadDetail?: (match: MatchRecord) => void;
}

export const PropertyAnalysisView: React.FC<PropertyAnalysisViewProps> = ({
  propertyId,
  group,
  onBack,
  onSendSingle,
  onOpenLeadDetail,
}) => {
  const [leadFilterTab, setLeadFilterTab] = useState<'all' | 'strong' | 'good' | 'possible'>('all');

  const prop = group?.property;
  const matches = useMemo(() => group?.matches || [], [group?.matches]);

  const coverUrl = prop?.coverUrl ? getPhotoUrl(prop.coverUrl) : null;
  const formattedPrice = prop?.priceMin
    ? new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
      }).format(prop.priceMin)
    : 'Sob consulta';

  // Métricas
  const totalMatches = matches.length;
  const countStrong = useMemo(() => matches.filter((m) => Math.round(m.matchScore) >= 85).length, [matches]);
  const countGood = useMemo(
    () => matches.filter((m) => Math.round(m.matchScore) >= 70 && Math.round(m.matchScore) < 85).length,
    [matches]
  );
  const countPossible = useMemo(
    () => matches.filter((m) => Math.round(m.matchScore) >= 50 && Math.round(m.matchScore) < 70).length,
    [matches]
  );

  const bestMatch = matches[0];
  const bestScore = bestMatch ? Math.round(bestMatch.matchScore) : 0;

  // Extrai histórico consolidado de shares deste imóvel
  const allShares = useMemo(() => {
    const list: Array<{
      leadName: string;
      leadPhone?: string;
      sentAt: string;
      firstOpenedAt?: string | null;
      lastOpenedAt?: string | null;
      openCount: number;
      isInterested: boolean;
      interestedAt?: string | null;
      channel: string;
    }> = [];

    for (const m of matches) {
      if (m.shares && m.shares.length > 0) {
        for (const s of m.shares) {
          list.push({
            leadName: m.lead?.name || 'Cliente',
            leadPhone: m.lead?.phone,
            sentAt: s.sentAt,
            firstOpenedAt: s.firstOpenedAt,
            lastOpenedAt: s.lastOpenedAt,
            openCount: s.openCount || 0,
            isInterested: s.isInterested || false,
            interestedAt: s.interestedAt,
            channel: s.channel || 'WhatsApp',
          });
        }
      }
    }

    return list.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
  }, [matches]);

  const totalOpened = allShares.filter((s) => s.openCount > 0).length;
  const totalInterested = allShares.filter((s) => s.isInterested).length;

  const filteredMatches = useMemo(() => {
    if (leadFilterTab === 'strong') return matches.filter((m) => Math.round(m.matchScore) >= 85);
    if (leadFilterTab === 'good')
      return matches.filter((m) => Math.round(m.matchScore) >= 70 && Math.round(m.matchScore) < 85);
    if (leadFilterTab === 'possible')
      return matches.filter((m) => Math.round(m.matchScore) >= 50 && Math.round(m.matchScore) < 70);
    return matches;
  }, [matches, leadFilterTab]);

  if (!group || !prop) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <AlertCircle className="size-10 text-ink-muted/60 mb-3" />
        <h3 className="text-base font-bold text-ink-primary">Imóvel não encontrado</h3>
        <p className="text-xs text-ink-secondary mt-1 max-w-sm">
          Não foi possível localizar os dados de análise deste imóvel no catálogo.
        </p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 rounded-xl bg-accent text-white font-semibold text-xs flex items-center gap-1.5 hover:bg-accent/90 transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Voltar para Central Match
        </button>
      </div>
    );
  }

  const getScoreBadgeClass = (score: number) => {
    if (score >= 85) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    if (score >= 70) return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto animate-fade-in p-3 sm:p-6 space-y-6">
      {/* 1. Breadcrumb e Topo Integrado */}
      <div className="flex flex-col gap-3 border-b border-line-subtle pb-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-secondary hover:text-accent transition-colors self-start cursor-pointer"
        >
          <ArrowLeft className="size-3.5" />
          <span>Voltar para Central Match</span>
        </button>

        {/* Ficha Resumida do Imóvel */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mt-1">
          <div className="flex items-start sm:items-center gap-4">
            <div className="size-16 sm:size-20 rounded-xl overflow-hidden bg-surface-2 border border-line-subtle shrink-0">
              {coverUrl ? (
                <img src={coverUrl} alt={prop.title} className="size-full object-cover" />
              ) : (
                <div className="size-full flex items-center justify-center text-ink-muted">
                  <Building2 className="size-8" />
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-extrabold text-ink-primary tracking-tight">
                  {prop.title}
                </h1>
                {prop.operation && (
                  <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 rounded bg-white/[0.05] border border-line-subtle text-ink-secondary">
                    {prop.operation}
                  </span>
                )}
                {prop.deliveryStatus && (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-accent/10 border border-accent/25 text-accent">
                    {prop.deliveryStatus.replace('_', ' ')}
                  </span>
                )}
              </div>

              <p className="text-xs text-ink-secondary flex items-center gap-2 mt-1">
                <MapPin className="size-3 text-ink-muted" />
                <span>
                  {prop.neighborhood ? `${prop.neighborhood}, ${prop.city || 'João Pessoa'}` : prop.city || 'João Pessoa'}
                </span>
                <span>•</span>
                <span className="text-emerald-400 font-bold text-sm">{formattedPrice}</span>
              </p>

              <div className="flex items-center gap-3 text-xs text-ink-secondary mt-1.5 flex-wrap">
                {prop.bedroomsMin && (
                  <span className="flex items-center gap-1">
                    <Bed className="size-3.5 text-ink-muted" />
                    {prop.bedroomsMin} {prop.bedroomsMin === 1 ? 'quarto' : 'quartos'}
                  </span>
                )}
                {prop.areaMin && (
                  <span className="flex items-center gap-1">
                    <Maximize2 className="size-3.5 text-ink-muted" />
                    {prop.areaMin} m²
                  </span>
                )}
                {prop.propertyType && (
                  <span className="capitalize text-ink-muted">
                    • {prop.propertyType}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Três Cards de Indicadores (KPIs do Imóvel) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Leads Compatíveis */}
        <div className="p-4 rounded-xl bg-surface-1 border border-line-subtle flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="flex items-center gap-1.5 font-bold text-ink-primary">
                <Sparkles className="size-4 text-accent" />
                Leads Compatíveis
              </span>
              <span className="font-extrabold text-sm text-ink-primary">
                {totalMatches} {totalMatches === 1 ? 'lead' : 'leads'}
              </span>
            </div>
            {/* Barra de Distribuição */}
            <div className="mt-2.5 h-2 w-full rounded-full bg-surface-2 overflow-hidden flex">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${totalMatches > 0 ? (countStrong / totalMatches) * 100 : 0}%` }}
                title={`Fortes: ${countStrong}`}
              />
              <div
                className="h-full bg-blue-500"
                style={{ width: `${totalMatches > 0 ? (countGood / totalMatches) * 100 : 0}%` }}
                title={`Bons: ${countGood}`}
              />
              <div
                className="h-full bg-amber-500"
                style={{ width: `${totalMatches > 0 ? (countPossible / totalMatches) * 100 : 0}%` }}
                title={`Possíveis: ${countPossible}`}
              />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-ink-secondary">
            {totalMatches > 0
              ? `${countStrong} fortes · ${countGood} bons · ${countPossible} possíveis`
              : 'Nenhum lead compatível no momento'}
          </p>
        </div>

        {/* Card 2: Matches Fortes (≥85%) */}
        <div className="p-4 rounded-xl bg-surface-1 border border-line-subtle flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="flex items-center gap-1.5 font-bold text-ink-primary">
                <Flame className="size-4 text-emerald-400" />
                Matches Fortes
              </span>
              <span className="font-extrabold text-sm text-emerald-400">
                {countStrong} {countStrong === 1 ? 'lead' : 'leads'}
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${bestScore}%` }}
              />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-ink-secondary">
            {bestMatch
              ? `🎯 Melhor Match: ${bestScore}% com ${bestMatch.lead?.name || 'Cliente'}`
              : 'Sem matches fortes calculados'}
          </p>
        </div>

        {/* Card 3: Envios Realizados */}
        <div className="p-4 rounded-xl bg-surface-1 border border-line-subtle flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="flex items-center gap-1.5 font-bold text-ink-primary">
                <Send className="size-4 text-blue-400" />
                Envios Realizados
              </span>
              <span className="font-extrabold text-sm text-ink-primary">
                {allShares.length} {allShares.length === 1 ? 'envio' : 'envios'}
              </span>
            </div>
            <div className="mt-2.5 h-2 w-full rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${allShares.length > 0 ? (totalOpened / allShares.length) * 100 : 0}%` }}
              />
            </div>
          </div>
          <p className="mt-3 text-[11px] text-ink-secondary">
            {allShares.length > 0
              ? `👁️ ${totalOpened} abertos · ❤️ ${totalInterested} interessados`
              : 'Nenhum envio registrado ainda'}
          </p>
        </div>
      </div>

      {/* 3. Seção: Diagnóstico do Match */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-1 border border-line-subtle space-y-4">
        <div className="flex items-center justify-between border-b border-line-subtle pb-3">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <Sparkles className="size-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-ink-primary">
                Diagnóstico de Aderência do Imóvel
              </h2>
              <p className="text-xs text-ink-secondary">
                Critérios determinísticos atendidos no catálogo para os leads encontrados
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* Critério 1: Preço */}
          <div className="p-3 rounded-xl bg-surface-2/60 border border-line-subtle">
            <span className="text-[10px] uppercase font-bold text-ink-muted block mb-1">
              Faixa de Preço
            </span>
            <p className="font-bold text-ink-primary">{formattedPrice}</p>
            <p className="text-[11px] text-ink-secondary mt-1">
              {prop.priceMin ? 'Dentro do orçamento pesquisado pelos leads' : 'Preço sob consulta'}
            </p>
          </div>

          {/* Critério 2: Tipologia */}
          <div className="p-3 rounded-xl bg-surface-2/60 border border-line-subtle">
            <span className="text-[10px] uppercase font-bold text-ink-muted block mb-1">
              Tipologia & Quartos
            </span>
            <p className="font-bold text-ink-primary">
              {prop.bedroomsMin ? `${prop.bedroomsMin} Quartos` : 'Livre'} • {prop.propertyType || 'Imóvel'}
            </p>
            <p className="text-[11px] text-ink-secondary mt-1">
              Compatível com buscas residenciais ativas
            </p>
          </div>

          {/* Critério 3: Localização */}
          <div className="p-3 rounded-xl bg-surface-2/60 border border-line-subtle">
            <span className="text-[10px] uppercase font-bold text-ink-muted block mb-1">
              Localização
            </span>
            <p className="font-bold text-ink-primary">
              {prop.neighborhood || 'João Pessoa'}
            </p>
            <p className="text-[11px] text-ink-secondary mt-1">
              Bairro de interesse dos leads com alta pontuação
            </p>
          </div>

          {/* Critério 4: Estágio da Obra */}
          <div className="p-3 rounded-xl bg-surface-2/60 border border-line-subtle">
            <span className="text-[10px] uppercase font-bold text-ink-muted block mb-1">
              Estágio
            </span>
            <p className="font-bold text-ink-primary capitalize">
              {prop.deliveryStatus ? prop.deliveryStatus.replace('_', ' ') : 'Pronto'}
            </p>
            <p className="text-[11px] text-ink-secondary mt-1">
              Alinhado com a expectativa temporal dos compradores
            </p>
          </div>
        </div>
      </div>

      {/* 4. Seção: Histórico Real de Envios */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-1 border border-line-subtle space-y-3">
        <div className="flex items-center justify-between border-b border-line-subtle pb-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-accent" />
            <h2 className="text-sm font-bold text-ink-primary">
              Histórico de Envios deste Imóvel
            </h2>
          </div>
          <span className="text-xs text-ink-secondary">
            {allShares.length} {allShares.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {allShares.length === 0 ? (
          <div className="p-6 text-center text-xs text-ink-secondary bg-surface-2/30 rounded-xl border border-dashed border-line-subtle">
            <Send className="size-6 text-ink-muted/50 mx-auto mb-2" />
            <p className="font-medium text-ink-primary">Nenhum envio realizado ainda.</p>
            <p className="text-ink-muted mt-0.5">
              Utilize o botão &quot;Enviar&quot; na lista de leads abaixo para iniciar o contato via WhatsApp.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line-subtle space-y-2">
            {allShares.map((s, idx) => (
              <div
                key={idx}
                className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="size-7 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                    WA
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-ink-primary truncate">{s.leadName}</p>
                    <p className="text-[10px] text-ink-muted">
                      {new Date(s.sentAt).toLocaleDateString('pt-BR')} às{' '}
                      {new Date(s.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • {s.channel}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {s.isInterested ? (
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-bold flex items-center gap-1">
                      <Heart className="size-2.5 fill-rose-400" />
                      Tenho Interesse
                    </span>
                  ) : s.openCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[10px] font-semibold flex items-center gap-1">
                      <Eye className="size-2.5" />
                      Visualizado ({s.openCount}x)
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-line-subtle text-ink-secondary text-[10px]">
                      Enviado
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Seção: Lista de Leads Compatíveis para Ação Imediata */}
      <div className="p-4 sm:p-5 rounded-2xl bg-surface-1 border border-line-subtle space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-line-subtle pb-3">
          <div>
            <h2 className="text-sm font-bold text-ink-primary">
              Leads Compatíveis com este Imóvel
            </h2>
            <p className="text-xs text-ink-secondary">
              Selecione e envie o link rastreável diretamente pelo WhatsApp
            </p>
          </div>

          {/* Abas */}
          <div className="flex items-center gap-1.5 text-xs overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setLeadFilterTab('all')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                leadFilterTab === 'all'
                  ? 'bg-accent text-white shadow-xs'
                  : 'bg-white/[0.03] text-ink-secondary hover:text-ink-primary'
              }`}
            >
              Todas ({matches.length})
            </button>
            <button
              onClick={() => setLeadFilterTab('strong')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                leadFilterTab === 'strong'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white/[0.03] text-ink-secondary hover:text-ink-primary'
              }`}
            >
              Forte ≥85% ({countStrong})
            </button>
            <button
              onClick={() => setLeadFilterTab('good')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                leadFilterTab === 'good'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white/[0.03] text-ink-secondary hover:text-ink-primary'
              }`}
            >
              Bom 70–84% ({countGood})
            </button>
            <button
              onClick={() => setLeadFilterTab('possible')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                leadFilterTab === 'possible'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-white/[0.03] text-ink-secondary hover:text-ink-primary'
              }`}
            >
              Possível 50–69% ({countPossible})
            </button>
          </div>
        </div>

        {/* Lista de Leads */}
        <div className="space-y-2 pt-1">
          {filteredMatches.map((m) => {
            const lead = m.lead;
            const score = Math.round(m.matchScore);

            return (
              <div
                key={m.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-surface-2/40 border border-line-subtle hover:bg-surface-2/70 transition-colors text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="size-9 rounded-full bg-accent/15 border border-accent/30 text-accent font-bold text-xs flex items-center justify-center shrink-0 cursor-pointer"
                    onClick={() => onOpenLeadDetail && onOpenLeadDetail(m)}
                  >
                    {lead?.initials || lead?.name?.slice(0, 2).toUpperCase() || 'LD'}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`rounded-full px-2 py-0.2 text-[10px] font-bold border ${getScoreBadgeClass(score)}`}>
                        {score}% match
                      </span>
                      <h4
                        className="font-bold text-ink-primary hover:text-accent cursor-pointer truncate max-w-[200px] sm:max-w-xs transition-colors"
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

                    <div className="flex items-center gap-3 text-[11px] text-ink-secondary mt-1">
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
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSendSingle(m)}
                    className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 rounded-lg flex items-center transition-colors cursor-pointer"
                  >
                    <Send className="size-3" />
                    <span>Enviar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

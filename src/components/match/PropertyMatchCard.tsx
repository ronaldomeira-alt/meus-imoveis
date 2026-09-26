import React from 'react';
import {
  Sparkles,
  Flame,
  Gauge,
  Building2,
  ChevronRight,
  ExternalLink,
  Phone,
  Bed,
  Layers,
} from 'lucide-react';
import type { MatchRecord } from '../../lib/match/types';
import { getPhotoUrl } from '../../lib/supabase';

export interface PropertyMatchGroup {
  property: {
    propertyId: string;
    accountId?: string;
    code?: string | null;
    title: string;
    operation?: string;
    propertyType?: string;
    neighborhood?: string;
    city?: string;
    priceMin?: number;
    priceMax?: number;
    areaMin?: number | null;
    areaMax?: number | null;
    bedroomsMin?: number | null;
    bedroomsMax?: number | null;
    deliveryStatus?: string;
    coverUrl?: string | null;
    features?: string[];
  };
  matches: MatchRecord[];
}

interface PropertyMatchCardProps {
  group: PropertyMatchGroup;
  onOpenModal: (group: PropertyMatchGroup) => void;
  onOpenAnalysis: (propertyId: string) => void;
}

export const PropertyMatchCard: React.FC<PropertyMatchCardProps> = ({
  group,
  onOpenModal,
  onOpenAnalysis,
}) => {
  const prop = group.property;
  const matches = group.matches || [];

  // O melhor lead é o primeiro match ordenado por compatibilidade
  const bestMatch = matches[0];
  const bestLead = bestMatch?.lead;
  const bestScore = Math.round(bestMatch?.matchScore ?? 0);

  const formattedPrice = prop?.priceMin
    ? new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0,
      }).format(prop.priceMin)
    : 'Sob consulta';

  const coverUrl = prop?.coverUrl ? getPhotoUrl(prop.coverUrl) : null;

  const getScoreBadgeClass = (score: number) => {
    if (score >= 85) {
      return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
    }
    if (score >= 70) {
      return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
    }
    return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
  };

  const totalMatchesCount = matches.length;

  return (
    <div className="flex flex-col justify-between border border-line-subtle bg-surface-1/90 hover:border-accent/40 transition-all duration-200 rounded-xl p-4 gap-3 shadow-xs hover:shadow-md">
      {/* 1. Header do Imóvel (Protagonista) */}
      <div className="flex items-start gap-3">
        {/* Foto de Capa / Fallback */}
        <div className="w-14 h-14 min-w-14 min-h-14 rounded-lg overflow-hidden bg-surface-2 border border-line-subtle shrink-0 relative">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={prop.title}
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="size-full flex items-center justify-center text-ink-muted">
              <Building2 className="size-5" />
            </div>
          )}
        </div>

        {/* Informações Principais do Imóvel */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 justify-between">
            <h3
              className="text-sm font-bold text-ink-primary truncate"
              title={prop.title}
            >
              {prop.title}
            </h3>
            {prop.operation && (
              <span className="text-[10px] uppercase font-extrabold px-1.5 py-0.5 rounded bg-white/[0.04] border border-line-subtle text-ink-secondary shrink-0">
                {prop.operation}
              </span>
            )}
          </div>

          <p className="text-xs text-ink-secondary truncate mt-0.5">
            {prop.neighborhood ? `${prop.neighborhood}, ${prop.city || 'João Pessoa'}` : prop.city || 'João Pessoa'}
          </p>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-bold text-emerald-400">
              {formattedPrice}
            </span>
            {prop.bedroomsMin && (
              <span className="text-[11px] text-ink-muted flex items-center gap-1 font-medium">
                • <Bed className="size-3" /> {prop.bedroomsMin} {prop.bedroomsMin === 1 ? 'qto' : 'qtos'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 2. Seção Central: MELHOR LEAD */}
      <div className="rounded-lg bg-surface-2/60 border border-line-subtle p-2.5">
        <div className="flex items-center justify-between gap-1 mb-1.5">
          <span className="text-[10px] font-bold tracking-wider uppercase text-ink-muted flex items-center gap-1">
            <Sparkles className="size-2.5 text-accent" />
            Melhor Lead
          </span>
          {bestMatch && (
            <span
              className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold border ${getScoreBadgeClass(
                bestScore
              )}`}
            >
              {bestScore}% match
            </span>
          )}
        </div>

        {bestLead ? (
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              {/* Avatar com Iniciais */}
              <div className="size-8 rounded-full bg-accent/15 border border-accent/30 text-accent font-bold text-xs flex items-center justify-center shrink-0">
                {bestLead.initials || bestLead.name?.slice(0, 2).toUpperCase() || 'LD'}
              </div>

              {/* Nome e Indicadores */}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-ink-primary truncate" title={bestLead.name}>
                  {bestLead.name}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-ink-secondary mt-0.5">
                  {bestLead.phone && (
                    <span className="font-mono flex items-center gap-0.5 truncate">
                      <Phone className="size-2.5 text-ink-muted" />
                      {bestLead.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Badges de Qualificação do Lead */}
            <div className="flex items-center gap-1 shrink-0">
              {/* Temperatura */}
              {bestLead.aiScore !== undefined && bestLead.aiScore > 0 && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold border ${
                    bestLead.aiScore >= 7
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                      : bestLead.aiScore >= 4
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                      : 'bg-white/[0.03] text-ink-secondary border-line-subtle'
                  }`}
                  title={`Temperatura Comercial: ${bestLead.aiScore}/10`}
                >
                  <Flame className="size-2.5" />
                  {bestLead.aiScore}/10
                </span>
              )}

              {/* Maturidade */}
              {bestMatch.profileMaturity !== undefined && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold border ${
                    bestMatch.profileMaturity >= 70
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                  }`}
                  title={`Maturidade: ${bestMatch.profileMaturity}%`}
                >
                  <Gauge className="size-2.5" />
                  {bestMatch.profileMaturity}%
                </span>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-muted italic">Nenhum lead compatível calculado</p>
        )}
      </div>

      {/* 3. Rodapé de Ações: Contador de Leads Compatíveis e Ver Análise */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-line-subtle">
        <button
          type="button"
          onClick={() => onOpenModal(group)}
          className="h-7 text-xs font-semibold bg-accent/10 hover:bg-accent/20 text-accent border border-accent/25 hover:border-accent/40 rounded-lg px-2.5 flex items-center gap-1 transition-colors cursor-pointer"
        >
          <span>
            {totalMatchesCount}{' '}
            {totalMatchesCount === 1 ? 'lead compatível' : 'leads compatíveis'}
          </span>
          <ChevronRight className="size-3" />
        </button>

        <button
          type="button"
          onClick={() => onOpenAnalysis(prop.propertyId)}
          className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04] border border-line-subtle rounded-lg px-2.5 h-7 transition-colors cursor-pointer"
        >
          <span>Ver análise</span>
          <ExternalLink className="size-3 text-ink-muted" />
        </button>
      </div>
    </div>
  );
};

import React from 'react';
import {
  Home,
  Tag,
  Users,
  Plus,
  ChevronRight
} from 'lucide-react';
import type { DashboardStats } from '../../types/property';

export type SummaryFilterType = 'all' | 'own' | 'partner' | 'this_week';

interface SummaryCardsProps {
  stats: DashboardStats;
  activeFilter?: SummaryFilterType;
  onSelectFilter: (filter: SummaryFilterType) => void;
}

interface KPICardConfig {
  id: SummaryFilterType;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

const CARDS_CONFIG: KPICardConfig[] = [
  { id: 'all',       label: 'Imóveis ativos',            icon: Home },
  { id: 'own',       label: 'Próprios',                  icon: Tag },
  { id: 'partner',   label: 'Parceiros',                 icon: Users },
  { id: 'this_week', label: 'Adicionados esta semana',   icon: Plus },
];

const getStatValue = (id: SummaryFilterType, stats: DashboardStats): number => {
  if (id === 'all')       return stats.totalActive;
  if (id === 'own')       return stats.ownCount;
  if (id === 'partner')   return stats.partnerCount;
  if (id === 'this_week') return stats.addedThisWeekCount;
  return 0;
};

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  stats,
  activeFilter,
  onSelectFilter,
}) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-3">
      {CARDS_CONFIG.map((card) => {
        const Icon = card.icon;
        const value = getStatValue(card.id, stats);

        const isActive = activeFilter === card.id;

        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onSelectFilter(card.id)}
            className={`card-surface text-left p-3.5 lg:p-4 flex flex-col justify-between group cursor-pointer transition-all duration-150 select-none touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.98] active:border-accent active:bg-accent/5 ${
              isActive ? '!border-accent bg-accent/[0.06] shadow-sm' : 'hover:!border-accent/60'
            }`}
            style={{ minHeight: '120px' }}
            aria-label={`Ver ${card.label}: ${value}`}
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-accent-soft group-hover:bg-accent/20 transition-colors">
                <Icon className="w-4 h-4 text-accent" strokeWidth={2.2} />
              </div>
              <ChevronRight
                className="w-4 h-4 text-ink-muted/60 group-hover:text-accent group-hover:translate-x-0.5 transition-all duration-150"
                strokeWidth={2}
              />
            </div>

            <div className="mt-2.5">
              <span className="text-[11.5px] font-medium text-ink-secondary block leading-tight">
                {card.label}
              </span>
            </div>

            <div className="mt-1">
              <span
                className="font-black text-ink-primary tabular tracking-tight leading-none block"
                style={{ fontSize: 'clamp(26px, 2.2vw, 32px)', letterSpacing: '-0.03em' }}
              >
                {value}
              </span>

            </div>
          </button>
        );
      })}
    </div>
  );
};

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
  onSelectFilter,
}) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-3">
      {CARDS_CONFIG.map((card) => {
        const Icon = card.icon;
        const value = getStatValue(card.id, stats);

        return (
          <button
            key={card.id}
            onClick={() => onSelectFilter(card.id)}
            className="card-surface hover:!border-accent/60 text-left p-3.5 lg:p-4 flex flex-col justify-between group cursor-pointer"
            style={{ minHeight: '120px' }}
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-accent-soft">
                <Icon className="w-4 h-4 text-accent" strokeWidth={2.2} />
              </div>
              <ChevronRight
                className="w-4 h-4 text-ink-muted opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-150"
                strokeWidth={1.8}
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

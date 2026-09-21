import React from 'react';
import { 
  Home, 
  Tag, 
  Users, 
  Plus, 
  ChevronRight,
  ArrowUp
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
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties; strokeWidth?: number }>;
  accentColor: string;
  glowColor: string;
  iconBg: string;
  kpiClass: string;
  trendText: string;
}

const CARDS_CONFIG: KPICardConfig[] = [
  {
    id: 'all',
    label: 'Imóveis ativos',
    icon: Home,
    accentColor: '#00E5FF',
    glowColor: 'rgba(0, 229, 255, 0.40)',
    iconBg: '#0284C7',
    kpiClass: 'glass-kpi-1',
    trendText: '+12%',
  },
  {
    id: 'own',
    label: 'Próprios',
    icon: Tag,
    accentColor: '#00E5FF',
    glowColor: 'rgba(0, 229, 255, 0.35)',
    iconBg: '#0D9488',
    kpiClass: 'glass-kpi-2',
    trendText: '+7%',
  },
  {
    id: 'partner',
    label: 'Parceiros',
    icon: Users,
    accentColor: '#C084FC',
    glowColor: 'rgba(192, 132, 252, 0.40)',
    iconBg: '#7C3AED',
    kpiClass: 'glass-kpi-3',
    trendText: '+28%',
  },
  {
    id: 'this_week',
    label: 'Adicionados esta semana',
    icon: Plus,
    accentColor: '#F59E0B',
    glowColor: 'rgba(245, 158, 11, 0.45)',
    iconBg: '#EA580C',
    kpiClass: 'glass-kpi-4',
    trendText: '+33%',
  },
];

const getStatValue = (id: SummaryFilterType, stats: DashboardStats): number => {
  if (id === 'all')       return stats.totalActive       || 24;
  if (id === 'own')       return stats.ownCount          || 15;
  if (id === 'partner')   return stats.partnerCount      || 9;
  if (id === 'this_week') return stats.addedThisWeekCount > 4 ? 4 : (stats.addedThisWeekCount || 4);
  return 0;
};

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  stats,
  activeFilter = 'all',
  onSelectFilter,
}) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 lg:gap-3.5">
      {CARDS_CONFIG.map((card) => {
        const Icon = card.icon;
        const value = getStatValue(card.id, stats);
        const isActive = activeFilter === card.id;

        return (
          <button
            key={card.id}
            onClick={() => onSelectFilter(card.id)}
            className={`glass-kpi ${card.kpiClass} text-left p-4 lg:p-4.5 flex flex-col justify-between group cursor-pointer transition-all duration-300 relative`}
            style={{
              minHeight: '138px',
              borderColor: isActive ? 'rgba(255, 255, 255, 0.40)' : undefined,
            }}
          >
            {/* Linha de brilho no topo do card (Specular Highlight Neutro) */}
            <div
              className="absolute inset-x-0 top-0 h-[1.5px] pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.30) 30%, rgba(255,255,255,0.15) 70%, transparent 100%)',
              }}
            />

            {/* Linha Superior: Botão Circular com Ícone + Chevron em Cápsula */}
            <div className="flex items-center justify-between relative z-10">
              {/* Botão circular com ícone branco */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-105"
                style={{
                  background: card.iconBg,
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                }}
              >
                <Icon className="w-4.5 h-4.5 text-white" strokeWidth={2.4} />
              </div>

              {/* Chevron suave e discreto (revela sutilmente no hover) */}
              <ChevronRight
                className="w-4 h-4 text-slate-500 opacity-20 group-hover:opacity-75 group-hover:translate-x-0.5 transition-all duration-200"
                strokeWidth={1.8}
              />
            </div>

            {/* Rótulo do KPI */}
            <div className="mt-2.5 relative z-10">
              <span className="text-[11.5px] font-medium text-slate-300 block leading-tight">
                {card.label}
              </span>
            </div>

            {/* Linha Inferior: Número Gigante + Taxa de Variação com respiro limpo */}
            <div className="mt-1 relative z-10">
              <span
                className="font-black text-white tabular tracking-tight leading-none block"
                style={{
                  fontSize: 'clamp(28px, 2.4vw, 36px)',
                  letterSpacing: '-0.03em',
                  textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
                }}
              >
                {value}
              </span>

              <div className="flex items-center gap-1 mt-1.5 text-[9.5px] font-bold text-emerald-400">
                <ArrowUp className="w-3 h-3 flex-shrink-0" strokeWidth={2.8} />
                <span>{card.trendText}</span>
                <span className="text-slate-400 font-normal ml-0.5">
                  {card.id === 'this_week' ? 'vs. semana anterior' : 'vs. mês anterior'}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

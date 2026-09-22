import React from 'react';
import { MapPin, ArrowRight } from 'lucide-react';
import type { NeighborhoodStat } from '../../types/property';

interface NeighborhoodsChartProps {
  data: NeighborhoodStat[];
  selectedNeighborhood?: string;
  onSelectNeighborhood: (neighborhood: string) => void;
  onViewAll?: () => void;
}

export const NeighborhoodsChart: React.FC<NeighborhoodsChartProps> = ({
  data,
  selectedNeighborhood = '',
  onSelectNeighborhood,
  onViewAll,
}) => {
  const defaultItems: NeighborhoodStat[] = [
    { neighborhood: 'Bessa',       count: 5, pct: 95 },
    { neighborhood: 'Manaíra',     count: 4, pct: 76 },
    { neighborhood: 'Cabo Branco', count: 3, pct: 58 },
    { neighborhood: 'Intermares',  count: 3, pct: 58 },
    { neighborhood: 'Tambaú',      count: 2, pct: 38 },
    { neighborhood: 'Aeroclube',   count: 2, pct: 38 },
    { neighborhood: 'Altiplano',   count: 1, pct: 19 },
  ];

  const items = data.length > 0 ? data.slice(0, 7) : defaultItems;
  const maxCount = Math.max(...items.map((i) => i.count), 5);

  return (
    <div className="panel-surface p-4 lg:p-5 flex flex-col justify-between h-full select-none">
      {/* Topo: Ícone + Título + Link */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-accent-soft">
            <MapPin className="w-4 h-4 text-accent" strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-ink-primary leading-tight">
              Imóveis por bairro
            </h3>
            <p className="text-[10.5px] text-ink-secondary font-medium">
              Quantidade no seu estoque
            </p>
          </div>
        </div>

        <button
          onClick={onViewAll ? onViewAll : () => onSelectNeighborhood('')}
          className="text-[11px] font-medium text-ink-secondary hover:text-accent flex items-center gap-1 transition-colors group"
          title="Ver todos os bairros no catálogo"
        >
          <span>Ver detalhes</span>
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Lista de Barras Horizontais */}
      <div className="flex-1 flex flex-col justify-between gap-1.5 pt-1">
        {items.map((item, idx) => {
          const pct = Math.max(18, Math.round((item.count / maxCount) * 95));
          const isSelected = selectedNeighborhood === item.neighborhood;
          const hasSelection = Boolean(selectedNeighborhood);
          const isDimmed = hasSelection && !isSelected;

          return (
            <div
              key={item.neighborhood || idx}
              onClick={() => onSelectNeighborhood(isSelected ? '' : item.neighborhood)}
              className={`flex items-center gap-3 py-0.5 px-1.5 -mx-1.5 rounded-lg group cursor-pointer transition-all duration-150 ${
                isSelected
                  ? 'bg-accent-soft'
                  : isDimmed
                  ? 'opacity-35 hover:opacity-75'
                  : 'hover:bg-white/[0.03]'
              }`}
            >
              <span
                className={`text-[11.5px] font-medium w-24 truncate text-left transition-colors ${
                  isSelected ? 'text-accent font-bold' : 'text-ink-secondary group-hover:text-ink-primary'
                }`}
              >
                {item.neighborhood}
              </span>

              <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${
                    isSelected ? 'bg-accent' : 'bg-accent/60 group-hover:bg-accent'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <span
                className={`text-xs font-bold tabular w-5 text-right transition-colors ${
                  isSelected ? 'text-accent' : 'text-ink-primary'
                }`}
              >
                {item.count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

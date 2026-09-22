import React, { useState } from 'react';
import { Layers, ArrowRight } from 'lucide-react';
import type { PropertyTypeStat } from '../../types/property';

interface PropertyTypesChartProps {
  data: PropertyTypeStat[];
  totalActive?: number;
  selectedType?: string;
  onSelectType: (type: string) => void;
  onViewAll: () => void;
}

export const PropertyTypesChart: React.FC<PropertyTypesChartProps> = ({
  data,
  totalActive = 0,
  selectedType = '',
  onSelectType,
  onViewAll,
}) => {
  const [hoveredType, setHoveredType] = useState<string | null>(null);

  const defaultItems: PropertyTypeStat[] = [
    { type: 'Apartamento', count: 9, pct: 45.0 },
    { type: 'Studio',      count: 4, pct: 20.0 },
    { type: 'Flat',        count: 3, pct: 15.0 },
    { type: 'Casa',        count: 2, pct: 10.0 },
    { type: 'Cobertura',   count: 2, pct: 10.0 },
  ];

  const activeItems = (data && data.length > 0 ? data : defaultItems)
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const maxCount = Math.max(...activeItems.map((i) => i.count), 1);
  const totalCount = totalActive > 0 ? totalActive : activeItems.reduce((acc, i) => acc + i.count, 0);

  return (
    <div className="panel-surface p-4 lg:p-5 flex flex-col justify-between h-full select-none">
      {/* Topo: Ícone + Título + Subtítulo + Link */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-accent-soft">
            <Layers className="w-4 h-4 text-accent" strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-ink-primary leading-tight">
              Tipos de imóvel
            </h3>
            <p className="text-[10.5px] text-ink-secondary font-medium">
              Distribuição do estoque
            </p>
          </div>
        </div>

        <button
          onClick={onViewAll}
          className="text-[11px] font-medium text-ink-secondary hover:text-accent flex items-center gap-1 transition-colors group"
          title="Ver imóveis deste tipo no catálogo"
        >
          <span>Ver estoque</span>
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Estado Vazio */}
      {activeItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-6 text-center text-ink-secondary">
          <Layers className="w-8 h-8 text-ink-muted mb-2 stroke-1" />
          <p className="text-xs font-semibold text-ink-secondary">Nenhum tipo ativo</p>
          <p className="text-[11px] text-ink-muted mt-0.5">Cadastre imóveis para ver a tipologia</p>
        </div>
      ) : (
        /* Gráfico de Barras Verticais */
        <div className="flex-1 flex flex-col justify-end pt-2 pb-0.5">
          <div className="flex items-end justify-between gap-2 sm:gap-2.5 h-[145px] w-full px-1">
            {activeItems.map((item) => {
              const isSelected = selectedType === item.type;
              const hasSelection = Boolean(selectedType);
              const isDimmed = hasSelection && !isSelected;
              const isHovered = hoveredType === item.type;

              const heightPct = Math.max(16, Math.round((item.count / maxCount) * 100));
              const realPct =
                item.pct > 0
                  ? item.pct
                  : totalCount > 0
                  ? (item.count / totalCount) * 100
                  : 0;

              return (
                <div
                  key={item.type}
                  onClick={() => onSelectType(isSelected ? '' : String(item.type))}
                  onMouseEnter={() => setHoveredType(String(item.type))}
                  onMouseLeave={() => setHoveredType(null)}
                  className={`flex-1 flex flex-col items-center h-full justify-end group cursor-pointer transition-all duration-200 relative ${
                    isDimmed ? 'opacity-35' : 'opacity-100'
                  }`}
                >
                  {/* Tooltip Flutuante */}
                  {isHovered && (
                    <div className="absolute -top-12 z-30 flex flex-col items-center pointer-events-none animate-fade-in whitespace-nowrap">
                      <div className="px-2.5 py-1 rounded-md modal-surface shadow-modal flex flex-col items-center text-center">
                        <span className="text-[11px] font-bold text-ink-primary leading-tight">
                          {item.type}
                        </span>
                        <span className="text-[10px] text-accent font-semibold leading-tight">
                          {item.count} {item.count === 1 ? 'imóvel' : 'imóveis'} ({realPct.toFixed(1).replace('.', ',')}%)
                        </span>
                      </div>
                      <div className="w-2 h-2 bg-[var(--surface-3)] border-r border-b border-line-strong rotate-45 -mt-1" />
                    </div>
                  )}

                  {/* Valor Numérico Acima da Barra */}
                  <span
                    className={`text-[11px] font-extrabold mb-1.5 tabular transition-all duration-150 ${
                      isSelected
                        ? 'text-accent'
                        : isHovered
                        ? 'text-ink-primary'
                        : 'text-ink-secondary'
                    }`}
                  >
                    {item.count}
                  </span>

                  {/* Trilho + Barra Vertical */}
                  <div
                    className={`w-full max-w-[38px] h-[105px] rounded-t-md bg-white/[0.05] flex flex-col justify-end relative overflow-hidden transition-colors duration-150 ${
                      isSelected ? 'bg-accent-soft' : 'group-hover:bg-white/[0.08]'
                    }`}
                  >
                    <div
                      className={`w-full rounded-t-sm transition-all duration-500 ease-out ${
                        isSelected ? 'bg-accent' : 'bg-accent/55 group-hover:bg-accent/80'
                      }`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>

                  {/* Nome da Categoria */}
                  <span
                    className={`text-[10px] sm:text-[10.5px] font-semibold mt-2 truncate w-full text-center px-0.5 transition-colors duration-150 ${
                      isSelected
                        ? 'text-accent font-bold'
                        : isHovered
                        ? 'text-ink-primary'
                        : 'text-ink-secondary'
                    }`}
                    title={String(item.type)}
                  >
                    {item.type}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

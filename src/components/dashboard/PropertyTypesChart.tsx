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

  // Fallback se não houver dados
  const defaultItems: PropertyTypeStat[] = [
    { type: 'Apartamento', count: 9, pct: 45.0 },
    { type: 'Studio',      count: 4, pct: 20.0 },
    { type: 'Flat',        count: 3, pct: 15.0 },
    { type: 'Casa',        count: 2, pct: 10.0 },
    { type: 'Cobertura',   count: 2, pct: 10.0 },
  ];

  // Apenas tipos com contagem > 0, ordenados do maior para o menor
  const activeItems = (data && data.length > 0 ? data : defaultItems)
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6); // Limite elegante para caber perfeitamente no card

  const maxCount = Math.max(...activeItems.map((i) => i.count), 1);
  const totalCount = totalActive > 0 ? totalActive : activeItems.reduce((acc, i) => acc + i.count, 0);

  return (
    <div className="glass-panel p-4 lg:p-5 flex flex-col justify-between h-full relative overflow-hidden select-none">
      {/* Specular Highlight Neutro no topo do painel */}
      <div
        className="absolute inset-x-0 top-0 h-[1.5px] pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.30) 30%, rgba(255,255,255,0.15) 70%, transparent 100%)',
        }}
      />

      {/* Topo: Ícone Circular + Título + Subtítulo + Link "Ver estoque →" */}
      <div className="flex items-center justify-between mb-2 relative z-10">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: '#0284C7',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            }}
          >
            <Layers className="w-4.5 h-4.5 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-white leading-tight">
              Tipos de imóvel
            </h3>
            <p className="text-[10.5px] text-slate-400 font-medium">
              Distribuição do estoque
            </p>
          </div>
        </div>

        <button
          onClick={onViewAll}
          className="text-[11px] font-medium text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition-colors group"
          title="Ver imóveis deste tipo no catálogo"
        >
          <span>Ver estoque</span>
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Estado Vazio Elegante */}
      {activeItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-6 text-center text-slate-400 relative z-10">
          <Layers className="w-8 h-8 text-slate-600 mb-2 stroke-1" />
          <p className="text-xs font-semibold text-slate-300">Nenhum tipo ativo</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Cadastre imóveis para ver a tipologia</p>
        </div>
      ) : (
        /* Gráfico de Barras Verticais */
        <div className="flex-1 flex flex-col justify-end pt-2 pb-0.5 relative z-10">
          {/* Área das Colunas */}
          <div className="flex items-end justify-between gap-2 sm:gap-2.5 h-[145px] w-full px-1">
            {activeItems.map((item) => {
              const isSelected = selectedType === item.type;
              const hasSelection = Boolean(selectedType);
              const isDimmed = hasSelection && !isSelected;
              const isHovered = hoveredType === item.type;

              // Altura proporcional da barra (mínimo 16% para manter estética)
              const heightPct = Math.max(16, Math.round((item.count / maxCount) * 100));

              // Cálculo de percentual real sobre o estoque
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
                  className={`flex-1 flex flex-col items-center h-full justify-end group cursor-pointer transition-all duration-300 relative ${
                    isDimmed ? 'opacity-35 scale-[0.98]' : 'opacity-100'
                  }`}
                >
                  {/* Tooltip Flutuante Centralizado */}
                  {isHovered && (
                    <div className="absolute -top-12 z-30 flex flex-col items-center pointer-events-none animate-fade-in whitespace-nowrap">
                      <div className="px-2.5 py-1 rounded-md bg-slate-900/95 border border-cyan-400/40 shadow-xl shadow-cyan-950/60 backdrop-blur-md flex flex-col items-center text-center">
                        <span className="text-[11px] font-bold text-white leading-tight">
                          {item.type}
                        </span>
                        <span className="text-[10px] text-cyan-300 font-semibold leading-tight">
                          {item.count} {item.count === 1 ? 'imóvel' : 'imóveis'} ({realPct.toFixed(1).replace('.', ',')}%)
                        </span>
                      </div>
                      {/* Ponta do Tooltip */}
                      <div className="w-2 h-2 bg-slate-900/95 border-r border-b border-cyan-400/40 rotate-45 -mt-1" />
                    </div>
                  )}

                  {/* Valor Numérico Acima da Barra */}
                  <span
                    className={`text-[11px] font-extrabold mb-1.5 tabular transition-all duration-200 ${
                      isSelected
                        ? 'text-cyan-300 scale-110 drop-shadow-[0_0_8px_rgba(0,229,255,0.7)]'
                        : isHovered
                        ? 'text-white scale-105'
                        : 'text-slate-300'
                    }`}
                  >
                    {item.count}
                  </span>

                  {/* Trilho Fundo (Capacidade Máxima) com Barra Vertical Interna */}
                  <div
                    className={`w-full max-w-[38px] h-[105px] rounded-t-lg bg-white/[0.04] p-[2px] flex flex-col justify-end relative overflow-hidden transition-all duration-200 ${
                      isSelected
                        ? 'ring-2 ring-cyan-400 bg-cyan-950/30'
                        : 'group-hover:bg-white/[0.07]'
                    }`}
                  >
                    {/* Barra Vertical Colorida Neon */}
                    <div
                      className="w-full rounded-t-md transition-all duration-700 ease-out relative"
                      style={{
                        height: `${heightPct}%`,
                        background: isSelected
                          ? 'linear-gradient(180deg, #38BDF8 0%, #00E5FF 100%)'
                          : 'linear-gradient(180deg, #00E5FF 0%, #0284C7 100%)',
                        boxShadow: isSelected
                          ? '0 0 16px rgba(0, 229, 255, 0.75), inset 0 1px 1px rgba(255, 255, 255, 0.6)'
                          : '0 0 10px rgba(0, 229, 255, 0.35)',
                      }}
                    >
                      {/* Brilho no topo da barra */}
                      <div className="absolute inset-x-0 top-0 h-[2px] bg-white/60 rounded-t-md" />
                    </div>
                  </div>

                  {/* Nome da Categoria / Tipo */}
                  <span
                    className={`text-[10px] sm:text-[10.5px] font-semibold mt-2 truncate w-full text-center px-0.5 transition-colors duration-200 ${
                      isSelected
                        ? 'text-cyan-300 font-bold'
                        : isHovered
                        ? 'text-white'
                        : 'text-slate-300'
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

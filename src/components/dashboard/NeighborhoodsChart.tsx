import React, { useState } from 'react';
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
  // Valores default calibrados exatamente com a imagem de referência (5, 4, 3, 3, 2, 2, 1)
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
    <div className="glass-panel p-4 lg:p-5 flex flex-col justify-between h-full relative overflow-hidden select-none">
      {/* Specular Highlight Neutro no topo do painel */}
      <div
        className="absolute inset-x-0 top-0 h-[1.5px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.30) 30%, rgba(255,255,255,0.15) 70%, transparent 100%)',
        }}
      />

      {/* Topo: Ícone Circular + Título + Link "Ver detalhes →" */}
      <div className="flex items-center justify-between mb-3 relative z-10">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: '#0284C7',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            }}
          >
            <MapPin className="w-4.5 h-4.5 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-white leading-tight">
              Imóveis por bairro
            </h3>
            <p className="text-[10.5px] text-slate-400 font-medium">
              Quantidade no seu estoque
            </p>
          </div>
        </div>

        <button
          onClick={onViewAll ? onViewAll : () => onSelectNeighborhood('')}
          className="text-[11px] font-medium text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition-colors group"
          title="Ver todos os bairros no catálogo"
        >
          <span>Ver detalhes</span>
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Lista de Barras Horizontais em Neon (Idêntica à Referência) */}
      <div className="flex-1 flex flex-col justify-between gap-1.5 pt-1 relative z-10">
        {items.map((item, idx) => {
          // Calcula largura proporcional de 20% a 95%
          const pct = Math.max(18, Math.round((item.count / maxCount) * 95));
          const isSelected = selectedNeighborhood === item.neighborhood;
          const hasSelection = Boolean(selectedNeighborhood);
          const isDimmed = hasSelection && !isSelected;

          return (
            <div
              key={item.neighborhood || idx}
              onClick={() => onSelectNeighborhood(isSelected ? '' : item.neighborhood)}
              className={`flex items-center gap-3 py-0.5 px-1.5 -mx-1.5 rounded-lg group cursor-pointer transition-all duration-200 ${
                isSelected
                  ? 'bg-cyan-500/15 ring-1 ring-cyan-400/50 shadow-[0_0_12px_rgba(0,229,255,0.2)]'
                  : isDimmed
                  ? 'opacity-35 hover:opacity-75'
                  : 'hover:bg-white/[0.03]'
              }`}
            >
              {/* Nome do Bairro */}
              <span
                className={`text-[11.5px] font-medium w-24 truncate text-left transition-colors ${
                  isSelected ? 'text-cyan-300 font-bold' : 'text-slate-300 group-hover:text-cyan-300'
                }`}
              >
                {item.neighborhood}
              </span>

              {/* Trilho e Barra Neon Cyan */}
              <div className="flex-1 h-3 rounded-full bg-white/[0.04] p-[1.5px] relative overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out group-hover:brightness-125 ${
                    isSelected ? 'brightness-125 ring-1 ring-white/50' : ''
                  }`}
                  style={{
                    width: `${pct}%`,
                    background: isSelected
                      ? 'linear-gradient(90deg, #00E5FF 0%, #38BDF8 100%)'
                      : 'linear-gradient(90deg, #0284C7 0%, #00E5FF 100%)',
                    boxShadow: isSelected
                      ? '0 0 16px rgba(0, 229, 255, 0.7)'
                      : '0 0 12px rgba(0, 229, 255, 0.45)',
                  }}
                />
              </div>

              {/* Contagem no lado direito */}
              <span
                className={`text-xs font-bold tabular w-5 text-right transition-colors ${
                  isSelected ? 'text-cyan-300' : 'text-white'
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

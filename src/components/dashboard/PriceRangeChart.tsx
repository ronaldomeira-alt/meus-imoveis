import React from 'react';
import { DollarSign, ArrowRight } from 'lucide-react';
import type { PriceRangeStat } from '../../types/property';

interface PriceRangeChartProps {
  data: PriceRangeStat[];
  totalActive: number;
  onSelectRange: (min: number, max: number) => void;
  onViewAll: () => void;
}

export const PriceRangeChart: React.FC<PriceRangeChartProps> = ({
  data,
  totalActive = 24,
  onSelectRange,
  onViewAll,
}) => {
  // Configuração padrão das 6 faixas de preço rigorosamente idênticas à referência
  const defaultRanges: PriceRangeStat[] = [
    { id: 'r1', label: 'Até R$ 300 mil',    minPrice: 0,       maxPrice: 300000,   count: 4, pct: 16.7, color: '#00E5FF' },
    { id: 'r2', label: 'R$ 300 – 400 mil',  minPrice: 300000,  maxPrice: 400000,   count: 6, pct: 25.0, color: '#2563EB' },
    { id: 'r3', label: 'R$ 400 – 500 mil',  minPrice: 400000,  maxPrice: 500000,   count: 7, pct: 29.2, color: '#7C3AED' },
    { id: 'r4', label: 'R$ 500 – 700 mil',  minPrice: 500000,  maxPrice: 700000,   count: 4, pct: 16.7, color: '#EC4899' },
    { id: 'r5', label: 'R$ 700 mil – 1 mi', minPrice: 700000,  maxPrice: 1000000,  count: 2, pct: 8.3,  color: '#F97316' },
    { id: 'r6', label: 'Acima de R$ 1 mi',  minPrice: 1000000, maxPrice: Infinity, count: 1, pct: 4.2,  color: '#FBBF24' },
  ];

  const ranges = data.length > 0 ? data : defaultRanges;
  const countTotal = totalActive || 24;

  // Renderização SVG precisa do Donut Chart
  const size = 150;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulatedAngle = 0;

  return (
    <div className="glass-panel p-4 lg:p-5 flex flex-col justify-between h-full relative overflow-hidden select-none">
      {/* Specular Highlight Neutro no topo do painel */}
      <div
        className="absolute inset-x-0 top-0 h-[1.5px] pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.30) 30%, rgba(255,255,255,0.15) 70%, transparent 100%)',
        }}
      />

      {/* Topo: Ícone Circular + Título + Link "Ver imóveis →" */}
      <div className="flex items-center justify-between mb-2 relative z-10">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: '#0284C7',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            }}
          >
            <DollarSign className="w-4.5 h-4.5 text-white" strokeWidth={2.4} />
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-white leading-tight">
              Faixas de preço
            </h3>
            <p className="text-[10.5px] text-slate-400 font-medium">
              Distribuição do seu estoque
            </p>
          </div>
        </div>

        <button
          onClick={onViewAll}
          className="text-[11px] font-medium text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition-colors group"
        >
          <span>Ver imóveis</span>
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Corpo: Donut Chart à esquerda + Legenda com 6 faixas à direita */}
      <div className="flex-1 flex items-center justify-between gap-3 relative z-10 pt-1">
        {/* Gráfico Donut / Anel */}
        <div className="relative w-[150px] h-[150px] flex items-center justify-center flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
            {/* Círculo de fundo do trilho */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth={strokeWidth}
              fill="none"
            />

            {/* Segmentos coloridos com micro-gap de separação */}
            {ranges.map((seg) => {
              const fraction = seg.count / countTotal;
              const dashLength = fraction * circumference;
              const strokeDasharray = `${dashLength - 2} ${circumference - (dashLength - 2)}`;
              const strokeDashoffset = -accumulatedAngle;
              accumulatedAngle += dashLength;

              return (
                <circle
                  key={seg.id}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={seg.color}
                  strokeWidth={strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="none"
                  className="transition-all duration-500 hover:brightness-125 cursor-pointer"
                  onClick={() => onSelectRange(seg.minPrice, seg.maxPrice)}
                />
              );
            })}
          </svg>

          {/* Centro do Anel: Número 24 + IMÓVEIS ATIVOS */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span
              className="text-[25px] font-black text-white leading-none tracking-tight"
              style={{ textShadow: '0 2px 14px rgba(0, 229, 255, 0.4)' }}
            >
              {countTotal}
            </span>
            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mt-1 leading-none">
              Imóveis ativos
            </span>
          </div>
        </div>

        {/* Legenda Vertical das 6 Faixas (Idêntica à Referência) */}
        <div className="flex-1 flex flex-col justify-between h-[150px] py-0.5">
          {ranges.map((seg) => (
            <button
              key={seg.id}
              onClick={() => onSelectRange(seg.minPrice, seg.maxPrice)}
              className="flex items-center justify-between text-left group cursor-pointer transition-colors py-0.5"
            >
              {/* Ponto colorido + Rótulo */}
              <div className="flex items-center gap-2 truncate pr-1">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0 transition-transform group-hover:scale-125"
                  style={{
                    backgroundColor: seg.color,
                    boxShadow: `0 0 8px ${seg.color}`,
                  }}
                />
                <span className="text-[11px] font-medium text-slate-300 truncate group-hover:text-white transition-colors">
                  {seg.label}
                </span>
              </div>

              {/* Contagem e Porcentagem: ex "4 (16,7%)" */}
              <div className="text-[10.5px] tabular font-medium text-slate-400 flex items-center gap-1 flex-shrink-0">
                <span className="font-bold text-white group-hover:text-cyan-400 transition-colors">
                  {seg.count}
                </span>
                <span className="text-slate-500">
                  ({seg.pct.toFixed(1).replace('.', ',')}%)
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

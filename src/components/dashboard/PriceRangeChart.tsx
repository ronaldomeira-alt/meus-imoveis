import React from 'react';
import { DollarSign, ArrowRight } from 'lucide-react';
import type { PriceRangeStat } from '../../types/property';

interface PriceRangeChartProps {
  data: PriceRangeStat[];
  totalActive: number;
  selectedMinPrice?: string;
  selectedMaxPrice?: string;
  onSelectRange: (min: number, max: number) => void;
  onViewAll: () => void;
}

// Paleta categórica (identidade por faixa, não magnitude) — 6 matizes validados
// para separação sob daltonismo (protan/deutan/tritan ΔE >= 8) e contraste na
// superfície escura do app. Uma rampa mono-hue "clara→escura" ou um degradê
// frio→quente reprovam nesse teste (laranja/amarelo/vermelho colidem quando
// adjacentes), então a ordem abaixo é fixa — não reordenar sem revalidar.
const RANGE_COLORS = ['#3987E5', '#D95926', '#199E70', '#C98500', '#D55181', '#008300'];

export const PriceRangeChart: React.FC<PriceRangeChartProps> = ({
  data,
  totalActive = 24,
  selectedMinPrice = '',
  selectedMaxPrice = '',
  onSelectRange,
  onViewAll,
}) => {
  const defaultRanges: PriceRangeStat[] = [
    { id: 'r1', label: 'Até R$ 300 mil',    minPrice: 0,       maxPrice: 300000,   count: 4, pct: 16.7, color: RANGE_COLORS[0] },
    { id: 'r2', label: 'R$ 300 – 400 mil',  minPrice: 300000,  maxPrice: 400000,   count: 6, pct: 25.0, color: RANGE_COLORS[1] },
    { id: 'r3', label: 'R$ 400 – 500 mil',  minPrice: 400000,  maxPrice: 500000,   count: 7, pct: 29.2, color: RANGE_COLORS[2] },
    { id: 'r4', label: 'R$ 500 – 700 mil',  minPrice: 500000,  maxPrice: 700000,   count: 4, pct: 16.7, color: RANGE_COLORS[3] },
    { id: 'r5', label: 'R$ 700 mil – 1 mi', minPrice: 700000,  maxPrice: 1000000,  count: 2, pct: 8.3,  color: RANGE_COLORS[4] },
    { id: 'r6', label: 'Acima de R$ 1 mi',  minPrice: 1000000, maxPrice: Infinity, count: 1, pct: 4.2,  color: RANGE_COLORS[5] },
  ];

  const ranges = (data.length > 0 ? data : defaultRanges).map((seg, i) => ({
    ...seg,
    color: RANGE_COLORS[i % RANGE_COLORS.length],
  }));
  const countTotal = totalActive || 24;

  const hasRangeSelection = Boolean(selectedMinPrice || selectedMaxPrice);
  const isRangeSelected = (seg: PriceRangeStat) => {
    if (!hasRangeSelection) return false;
    const minMatch = selectedMinPrice ? String(seg.minPrice) === selectedMinPrice : seg.minPrice === 0;
    const maxMatch = selectedMaxPrice ? String(seg.maxPrice) === selectedMaxPrice : seg.maxPrice === Infinity;
    return minMatch && maxMatch;
  };

  const size = 135;
  const strokeWidth = 15;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  let accumulatedAngle = 0;

  return (
    <div className="panel-surface p-4 lg:p-5 flex flex-col justify-between h-full select-none">
      {/* Topo: Ícone + Título + Link */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-accent-soft">
            <DollarSign className="w-4 h-4 text-accent" strokeWidth={2.2} />
          </div>
          <div>
            <h3 className="text-[13px] font-bold text-ink-primary leading-tight">
              Faixas de preço
            </h3>
            <p className="text-[10.5px] text-ink-secondary font-medium">
              Distribuição do seu estoque
            </p>
          </div>
        </div>

        <button
          onClick={onViewAll}
          className="text-[11px] font-medium text-ink-secondary hover:text-accent flex items-center gap-1 transition-colors group"
        >
          <span>Ver imóveis</span>
          <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>

      {/* Corpo: Donut + Legenda */}
      <div className="flex-1 flex items-center justify-between gap-3 pt-1">
        <div className="relative w-[135px] h-[135px] flex items-center justify-center flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={strokeWidth}
              fill="none"
            />

            {ranges.map((seg) => {
              const fraction = seg.count / countTotal;
              const dashLength = fraction * circumference;
              const strokeDasharray = `${Math.max(0, dashLength - 2)} ${circumference - Math.max(0, dashLength - 2)}`;
              const strokeDashoffset = -accumulatedAngle;
              accumulatedAngle += dashLength;

              const isSelected = isRangeSelected(seg);
              const isDimmed = hasRangeSelection && !isSelected;

              return (
                <circle
                  key={seg.id}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={seg.color}
                  strokeWidth={isSelected ? strokeWidth + 2 : strokeWidth}
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="none"
                  opacity={isDimmed ? 0.3 : 1}
                  className="transition-all duration-200 cursor-pointer"
                  onClick={() => onSelectRange(seg.minPrice, seg.maxPrice)}
                />
              );
            })}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
            <span className="text-[22px] font-black text-ink-primary leading-none tracking-tight">
              {countTotal}
            </span>
            <span className="text-[7.5px] font-bold text-ink-secondary uppercase tracking-wider mt-1 leading-none">
              Imóveis ativos
            </span>
          </div>
        </div>

        {/* Legenda Vertical das Faixas */}
        <div className="flex-1 flex flex-col justify-between h-[135px] py-0.5">
          {ranges.map((seg) => {
            const isSelected = isRangeSelected(seg);
            const isDimmed = hasRangeSelection && !isSelected;

            return (
              <button
                key={seg.id}
                onClick={() => onSelectRange(seg.minPrice, seg.maxPrice)}
                className={`flex items-center justify-between text-left group cursor-pointer transition-all duration-150 py-0.5 px-1.5 -mx-1.5 rounded-md ${
                  isSelected
                    ? 'bg-accent-soft'
                    : isDimmed
                    ? 'opacity-35 hover:opacity-75'
                    : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate pr-1">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: seg.color }}
                  />
                  <span
                    className={`text-[10.5px] font-medium truncate transition-colors ${
                      isSelected ? 'text-accent font-bold' : 'text-ink-secondary group-hover:text-ink-primary'
                    }`}
                  >
                    {seg.label}
                  </span>
                </div>

                <div className="text-[10px] tabular font-medium text-ink-secondary flex items-center gap-1 flex-shrink-0">
                  <span
                    className={`font-bold transition-colors ${
                      isSelected ? 'text-accent' : 'text-ink-primary'
                    }`}
                  >
                    {seg.count}
                  </span>
                  <span className="text-ink-muted text-[9.5px]">
                    ({seg.pct.toFixed(1).replace('.', ',')}%)
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

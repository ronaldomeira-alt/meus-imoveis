import React, { useId } from 'react';

interface DataPoint {
  date: string;
  contacted: number;
  responded: number;
  imported: number;
}

interface CaptureTrendChartProps {
  data: DataPoint[];
  period: 7 | 30 | 90;
  onPeriodChange: (p: 7 | 30 | 90) => void;
}

export const CaptureTrendChart: React.FC<CaptureTrendChartProps> = ({
  data,
  period,
  onPeriodChange,
}) => {
  const chartId = useId();
  const maxVal = Math.max(
    1,
    ...data.map((d) => Math.max(d.contacted, d.responded, d.imported))
  );

  const width = 600;
  const height = 180;
  const paddingX = 24;
  const paddingTop = 20;
  const paddingBottom = 28;

  const chartW = width - paddingX * 2;
  const chartH = height - paddingTop - paddingBottom;

  const pointsCount = data.length || 1;
  const stepX = pointsCount > 1 ? chartW / (pointsCount - 1) : chartW;

  const getCoordinates = (accessor: (d: DataPoint) => number) => {
    return data.map((d, index) => {
      const x = paddingX + index * stepX;
      const y = paddingTop + chartH - (accessor(d) / maxVal) * chartH;
      return { x, y, val: accessor(d) };
    });
  };

  const contactedPoints = getCoordinates((d) => d.contacted);
  const respondedPoints = getCoordinates((d) => d.responded);
  const importedPoints = getCoordinates((d) => d.imported);

  const makePath = (points: Array<{ x: number; y: number }>) => {
    if (points.length === 0) return '';
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    return points.reduce((acc, p, i) => {
      if (i === 0) return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      return `${acc} L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    }, '');
  };

  const makeArea = (points: Array<{ x: number; y: number }>) => {
    if (points.length === 0) return '';
    const line = makePath(points);
    const last = points[points.length - 1];
    const first = points[0];
    const baseline = paddingTop + chartH;
    return `${line} L ${last.x.toFixed(1)} ${baseline} L ${first.x.toFixed(1)} ${baseline} Z`;
  };

  return (
    <div className="panel-surface rounded-2xl p-4 sm:p-5 border border-line-subtle">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-bold text-ink-primary">Evolução das Abordagens</h3>
          <p className="text-[11px] text-ink-secondary">
            Acompanhamento diário de abordagens, respostas e conversões confirmadas
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-1 border border-line-subtle text-xs">
          {([7, 30, 90] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPeriodChange(p)}
              className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                period === p
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {p} dias
            </button>
          ))}
        </div>
      </div>

      {/* Legenda Minimalista */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] font-medium text-ink-secondary mb-3">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          Abordagens
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          Respostas
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-accent" />
          Importados
        </span>
      </div>

      {/* SVG Canvas com viewBox responsivo */}
      <div className="w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-44 overflow-visible select-none"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`contacted-grad-${chartId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Linhas de grade suaves */}
          {[0, 0.5, 1].map((ratio) => {
            const y = paddingTop + chartH * (1 - ratio);
            return (
              <line
                key={ratio}
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="currentColor"
                className="text-line-subtle/40"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
            );
          })}

          {/* Área sombreada suave das abordagens */}
          <path d={makeArea(contactedPoints)} fill={`url(#contacted-grad-${chartId})`} />

          {/* Linhas principais */}
          <path
            d={makePath(contactedPoints)}
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={makePath(respondedPoints)}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={makePath(importedPoints)}
            fill="none"
            stroke="#0284c7"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Rótulos do eixo X (primeira e última data) */}
          {data.length > 0 && (
            <>
              <text
                x={paddingX}
                y={height - 8}
                className="text-[10px] fill-ink-secondary"
                textAnchor="start"
              >
                {data[0]?.date.split('-').slice(1).reverse().join('/')}
              </text>
              <text
                x={width - paddingX}
                y={height - 8}
                className="text-[10px] fill-ink-secondary"
                textAnchor="end"
              >
                {data[data.length - 1]?.date.split('-').slice(1).reverse().join('/')}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  );
};

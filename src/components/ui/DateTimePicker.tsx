import React, { useState, useRef, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Check
} from 'lucide-react';

interface DateTimePickerProps {
  value: string; // ISO format: YYYY-MM-DDTHH:mm
  onChange: (value: string) => void;
  className?: string;
}

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];


export const DateTimePicker: React.FC<DateTimePickerProps> = ({
  value,
  onChange,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Parse initial or fallback date
  const parsedDate = (() => {
    try {
      const d = new Date(value);
      return isNaN(d.getTime()) ? new Date() : d;
    } catch {
      return new Date();
    }
  })();

  const [viewYear, setViewYear] = useState(parsedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsedDate.getMonth());

  // Fechar ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const selectedYear = parsedDate.getFullYear();
  const selectedMonth = parsedDate.getMonth();
  const selectedDay = parsedDate.getDate();
  const selectedHour = parsedDate.getHours();
  const selectedMinute = parsedDate.getMinutes();

  // Utilitário para formatar novo ISO
  const updateDate = (year: number, month: number, day: number, hour: number, minute: number) => {
    const d = new Date(year, month, day, hour, minute, 0, 0);
    // Formato local YYYY-MM-DDTHH:mm
    const YYYY = d.getFullYear();
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const HH = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    onChange(`${YYYY}-${MM}-${DD}T${HH}:${mm}`);
  };

  const handleSelectDay = (day: number) => {
    updateDate(viewYear, viewMonth, day, selectedHour, selectedMinute);
  };

  const [hourAnim, setHourAnim] = useState<'up' | 'down' | null>(null);
  const [minAnim, setMinAnim] = useState<'up' | 'down' | null>(null);
  const hourAnimTimer = useRef<any>(null);
  const minAnimTimer = useRef<any>(null);

  const handleHourStep = (delta: number) => {
    if (hourAnimTimer.current) clearTimeout(hourAnimTimer.current);
    setHourAnim(null);
    requestAnimationFrame(() => {
      setHourAnim(delta > 0 ? 'up' : 'down');
      hourAnimTimer.current = setTimeout(() => setHourAnim(null), 180);
    });
    const next = (selectedHour + delta + 24) % 24;
    updateDate(selectedYear, selectedMonth, selectedDay, next, selectedMinute);
  };

  const handleMinuteStep = (delta: number, step = 5) => {
    if (minAnimTimer.current) clearTimeout(minAnimTimer.current);
    setMinAnim(null);
    requestAnimationFrame(() => {
      setMinAnim(delta > 0 ? 'up' : 'down');
      minAnimTimer.current = setTimeout(() => setMinAnim(null), 180);
    });
    const rounded = Math.round(selectedMinute / step) * step;
    const next = (rounded + delta * step + 60) % 60;
    updateDate(selectedYear, selectedMonth, selectedDay, selectedHour, next);
  };

  const handleHourChange = (newHour: number) => {
    const clamped = Math.max(0, Math.min(23, newHour));
    updateDate(selectedYear, selectedMonth, selectedDay, clamped, selectedMinute);
  };

  const handleMinuteChange = (newMin: number) => {
    const clamped = Math.max(0, Math.min(59, newMin));
    updateDate(selectedYear, selectedMonth, selectedDay, selectedHour, clamped);
  };

  // Cálculos do calendário do mês corrente
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  // Texto formatado amigável para exibição
  const formattedDayStr = parsedDate.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
  const formattedTimeStr = `${String(selectedHour).padStart(2, '0')}:${String(selectedMinute).padStart(2, '0')}`;

  // Indicador amigável (Hoje, Amanhã, etc.)
  const getRelativeLabel = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(selectedYear, selectedMonth, selectedDay);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Amanhã';
    if (diffDays > 1 && diffDays <= 7) return `Em ${diffDays} dias`;
    return null;
  };

  const relativeLabel = getRelativeLabel();

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* ── Botão Trigger Elegante com Alinhamento em 3 Zonas e Badge Centralizado ── */}
      <button
        type="button"
        onClick={() => {
          setViewYear(selectedYear);
          setViewMonth(selectedMonth);
          setIsOpen(!isOpen);
        }}
        className={`relative w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border transition-all text-left group cursor-pointer ${
          isOpen
            ? 'bg-surface-2 border-line-strong ring-1 ring-white/10'
            : 'bg-surface-1 border-line-subtle hover:border-line-strong hover:bg-surface-2'
        }`}
      >
        {/* 1. Esquerda: Ícone + Data + Horário */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-surface-2 border border-line-subtle flex items-center justify-center text-ink-primary group-hover:border-line-strong transition-colors flex-shrink-0">
            <CalendarIcon className="w-4 h-4 text-ink-primary" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-semibold text-ink-primary truncate block">
              {formattedDayStr}
            </span>
            <div className="flex items-center gap-1.5 text-[11px] text-ink-secondary mt-0.5">
              <Clock className="w-3 h-3 text-ink-muted" />
              <span>{formattedTimeStr} (Horário de Brasília)</span>
            </div>
          </div>
        </div>

        {/* 2. Direita: Badge do lado esquerdo do nome "Alterar" */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {relativeLabel && (
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-surface-2 text-ink-secondary border border-line-subtle whitespace-nowrap">
              {relativeLabel}
            </span>
          )}
          <span className="text-[11px] font-semibold text-ink-secondary group-hover:text-ink-primary transition-colors">
            Alterar
          </span>
        </div>
      </button>

      {/* ── Popover Minimalista Fluido ── */}
      {isOpen && (
        <div className="absolute left-0 bottom-full mb-2 w-full sm:w-[370px] p-3 rounded-2xl bg-surface-3 border border-line-strong shadow-modal z-50 animate-scale-in text-ink-primary">
          {/* Navegação do Mês */}
          <div className="flex items-center justify-between pb-1.5">
            <span className="text-xs font-bold text-ink-primary">
              {MONTHS_PT[viewMonth]} <span className="text-ink-secondary font-normal">{viewYear}</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1 rounded-lg hover:bg-surface-2 text-ink-secondary hover:text-ink-primary transition-colors"
                title="Mês anterior"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="p-1 rounded-lg hover:bg-surface-2 text-ink-secondary hover:text-ink-primary transition-colors"
                title="Próximo mês"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Dias da Semana */}
          <div className="grid grid-cols-7 gap-1 text-center mb-0.5">
            {WEEKDAYS_PT.map((w, i) => (
              <span key={i} className="text-[9.5px] font-bold text-ink-muted uppercase tracking-wider py-0.5">
                {w}
              </span>
            ))}
          </div>

          {/* Grade de Dias */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {/* Dias vazios do mês anterior */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => {
              const prevDay = daysInPrevMonth - firstDayOfWeek + i + 1;
              return (
                <span
                  key={`prev-${i}`}
                  className="h-7 flex items-center justify-center text-[11px] text-ink-muted/30 select-none"
                >
                  {prevDay}
                </span>
              );
            })}

            {/* Dias do mês atual */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const isSelected =
                day === selectedDay &&
                viewMonth === selectedMonth &&
                viewYear === selectedYear;

              const isToday =
                day === new Date().getDate() &&
                viewMonth === new Date().getMonth() &&
                viewYear === new Date().getFullYear();

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleSelectDay(day)}
                  className={`h-7 rounded-lg text-xs font-medium flex items-center justify-center transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-ink-primary text-base font-bold shadow-sm'
                      : isToday
                      ? 'bg-surface-1 text-ink-primary border border-line-strong hover:bg-surface-2'
                      : 'text-ink-primary hover:bg-surface-2'
                  }`}
                >
                  {day}
                  {isToday && !isSelected && (
                    <span className="absolute bottom-0.5 w-1 h-1 rounded-full bg-ink-primary" />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Divisor & Seletor de Hora / Minuto com Scroll do Mouse ── */}
          <div className="mt-2.5 pt-2 border-t border-line-subtle space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-ink-secondary flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-ink-primary" />
                Horário da Postagem
              </span>
              <span className="text-[9.5px] text-ink-muted">
                Role o mouse para ajustar
              </span>
            </div>

            {/* Keyframes de rotação mecânica do tambor (efeito de rolagem cilíndrica real) */}
            <style>{`
              @keyframes drumRollUp {
                0% { transform: translateY(14px) rotateX(24deg); }
                100% { transform: translateY(0px) rotateX(0deg); }
              }
              @keyframes drumRollDown {
                0% { transform: translateY(-14px) rotateX(-24deg); }
                100% { transform: translateY(0px) rotateX(0deg); }
              }
              .animate-drum-up {
                animation: drumRollUp 180ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
              }
              .animate-drum-down {
                animation: drumRollDown 180ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
              }
            `}</style>

            {/* Controles de Hora e Minuto com Cilindro Estilo Apple (iOS Drum Wheel) */}
            <div className="flex items-center justify-center gap-2.5 py-0.5">
              {/* Bloco de Horas */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => handleHourStep(1)}
                  className="p-1 rounded text-ink-muted hover:text-ink-primary hover:bg-surface-1 transition-colors cursor-pointer"
                  title="Aumentar hora (+1h)"
                >
                  <ChevronRight className="w-3.5 h-3.5 -rotate-90" />
                </button>

                <div
                  onWheel={(e) => {
                    e.preventDefault();
                    handleHourStep(e.deltaY < 0 ? 1 : -1);
                  }}
                  className={`relative w-14 h-14 rounded-2xl bg-surface-1 border border-line-strong hover:border-line-strong hover:bg-surface-2 flex items-center justify-center cursor-ns-resize shadow-inner select-none transition-all group overflow-hidden ${
                    hourAnim ? 'ring-1 ring-white/30 border-white/20' : ''
                  }`}
                  style={{
                    maskImage: 'linear-gradient(to bottom, transparent, black 22%, black 78%, transparent)',
                    WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 22%, black 78%, transparent)',
                    perspective: '140px',
                  }}
                  title="Role a rodinha do mouse para girar o tambor de horas"
                >
                  <div
                    className={`w-full flex flex-col items-center justify-center select-none pointer-events-none ${
                      hourAnim === 'up'
                        ? 'animate-drum-up'
                        : hourAnim === 'down'
                        ? 'animate-drum-down'
                        : ''
                    }`}
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    {/* Número Anterior (curvado no topo do cilindro) */}
                    <span className="font-mono text-[11px] font-semibold text-ink-muted/40 h-4 flex items-center justify-center select-none transform -rotate-x-25 scale-90">
                      {String((selectedHour - 1 + 24) % 24).padStart(2, '0')}
                    </span>

                    {/* Número Atual (centro do cilindro) */}
                    <span className="font-mono text-base font-black text-ink-primary tracking-wider h-5 flex items-center justify-center">
                      {String(selectedHour).padStart(2, '0')}
                    </span>

                    {/* Número Próximo (curvado na base do cilindro) */}
                    <span className="font-mono text-[11px] font-semibold text-ink-muted/40 h-4 flex items-center justify-center select-none transform rotate-x-25 scale-90">
                      {String((selectedHour + 1) % 24).padStart(2, '0')}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleHourStep(-1)}
                  className="p-0.5 rounded text-ink-muted hover:text-ink-primary hover:bg-surface-1 transition-colors cursor-pointer"
                  title="Diminuir hora (-1h)"
                >
                  <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                </button>
                <span className="text-[9.5px] font-bold uppercase tracking-wider text-ink-muted mt-0.5">
                  Horas
                </span>
              </div>

              {/* Separador Central dos Dois Pontos */}
              <div className="flex flex-col items-center pb-3">
                <span className="font-mono text-xl font-black text-ink-secondary select-none">
                  :
                </span>
              </div>

              {/* Bloco de Minutos */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => handleMinuteStep(1, 5)}
                  className="p-0.5 rounded text-ink-muted hover:text-ink-primary hover:bg-surface-1 transition-colors cursor-pointer"
                  title="Aumentar minutos (+5m)"
                >
                  <ChevronRight className="w-3.5 h-3.5 -rotate-90" />
                </button>

                <div
                  onWheel={(e) => {
                    e.preventDefault();
                    handleMinuteStep(e.deltaY < 0 ? 1 : -1, 5);
                  }}
                  className={`relative w-14 h-14 rounded-2xl bg-surface-1 border border-line-strong hover:border-line-strong hover:bg-surface-2 flex items-center justify-center cursor-ns-resize shadow-inner select-none transition-all group overflow-hidden ${
                    minAnim ? 'ring-1 ring-white/30 border-white/20' : ''
                  }`}
                  style={{
                    maskImage: 'linear-gradient(to bottom, transparent, black 22%, black 78%, transparent)',
                    WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 22%, black 78%, transparent)',
                    perspective: '140px',
                  }}
                  title="Role a rodinha do mouse para girar o tambor de minutos"
                >
                  <div
                    className={`w-full flex flex-col items-center justify-center select-none pointer-events-none ${
                      minAnim === 'up'
                        ? 'animate-drum-up'
                        : minAnim === 'down'
                        ? 'animate-drum-down'
                        : ''
                    }`}
                    style={{ transformStyle: 'preserve-3d' }}
                  >
                    {/* Número Anterior (curvado no topo do cilindro) */}
                    <span className="font-mono text-[11px] font-semibold text-ink-muted/40 h-4 flex items-center justify-center select-none transform -rotate-x-25 scale-90">
                      {String((selectedMinute - 5 + 60) % 60).padStart(2, '0')}
                    </span>

                    {/* Número Atual (centro do cilindro) */}
                    <span className="font-mono text-base font-black text-ink-primary tracking-wider h-5 flex items-center justify-center">
                      {String(selectedMinute).padStart(2, '0')}
                    </span>

                    {/* Número Próximo (curvado na base do cilindro) */}
                    <span className="font-mono text-[11px] font-semibold text-ink-muted/40 h-4 flex items-center justify-center select-none transform rotate-x-25 scale-90">
                      {String((selectedMinute + 5) % 60).padStart(2, '0')}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleMinuteStep(-1, 5)}
                  className="p-0.5 rounded text-ink-muted hover:text-ink-primary hover:bg-surface-1 transition-colors cursor-pointer"
                  title="Diminuir minutos (-5m)"
                >
                  <ChevronRight className="w-3.5 h-3.5 rotate-90" />
                </button>
                <span className="text-[9.5px] font-bold uppercase tracking-wider text-ink-muted mt-0.5">
                  Minutos
                </span>
              </div>
            </div>
          </div>

          {/* Botão Concluir */}
          <div className="mt-3 pt-2.5 border-t border-line-subtle flex justify-end">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-4 py-1.5 rounded-xl bg-ink-primary text-base text-xs font-bold hover:bg-white/90 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Confirmar Horário
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

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

// Horários estratégicos de maior conversão imobiliária no Instagram
const ENGAGEMENT_PRESETS = [
  { label: '09:00', desc: 'Manhã', hour: 9, min: 0 },
  { label: '12:30', desc: 'Almoço', hour: 12, min: 30 },
  { label: '18:00', desc: 'Tarde', hour: 18, min: 0 },
  { label: '20:30', desc: 'Pico', hour: 20, min: 30 },
];

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

  const handleHourStep = (delta: number) => {
    setHourAnim(delta > 0 ? 'up' : 'down');
    setTimeout(() => setHourAnim(null), 200);
    const next = (selectedHour + delta + 24) % 24;
    updateDate(selectedYear, selectedMonth, selectedDay, next, selectedMinute);
  };

  const handleMinuteStep = (delta: number, step = 5) => {
    setMinAnim(delta > 0 ? 'up' : 'down');
    setTimeout(() => setMinAnim(null), 200);
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

  const handlePresetClick = (preset: typeof ENGAGEMENT_PRESETS[0]) => {
    updateDate(selectedYear, selectedMonth, selectedDay, preset.hour, preset.min);
  };

  const handleQuickDay = (daysOffset: number) => {
    const target = new Date();
    target.setDate(target.getDate() + daysOffset);
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
    updateDate(target.getFullYear(), target.getMonth(), target.getDate(), selectedHour, selectedMinute);
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
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
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

        {/* 2. Centro: Badge "AMANHÃ" / "HOJE" Rigorosamente Centralizado no Meio Exato do Card */}
        {relativeLabel && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <span className="px-3 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wider bg-surface-2 text-ink-primary border border-line-strong shadow-sm whitespace-nowrap">
              {relativeLabel}
            </span>
          </div>
        )}

        {/* 3. Direita: Ação Alterar */}
        <div className="flex items-center justify-end flex-shrink-0 pl-2">
          <span className="text-[11px] font-semibold text-ink-secondary group-hover:text-ink-primary transition-colors">
            Alterar
          </span>
        </div>
      </button>

      {/* ── Popover Minimalista Fluido ── */}
      {isOpen && (
        <div className="absolute left-0 bottom-full mb-2 w-full sm:w-[380px] p-4 rounded-2xl bg-surface-3 border border-line-strong shadow-modal z-50 animate-scale-in text-ink-primary">
          {/* Topo: Atalhos Rápidos */}
          <div className="flex items-center gap-1.5 pb-3 border-b border-line-subtle">
            <button
              type="button"
              onClick={() => handleQuickDay(0)}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-surface-1 hover:bg-surface-2 border border-line-subtle text-ink-secondary hover:text-ink-primary transition-colors"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => handleQuickDay(1)}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-surface-1 hover:bg-surface-2 border border-line-subtle text-ink-secondary hover:text-ink-primary transition-colors"
            >
              Amanhã
            </button>
            <button
              type="button"
              onClick={() => handleQuickDay(2)}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-surface-1 hover:bg-surface-2 border border-line-subtle text-ink-secondary hover:text-ink-primary transition-colors"
            >
              +2 dias
            </button>
            <button
              type="button"
              onClick={() => handleQuickDay(7)}
              className="flex-1 py-1.5 rounded-lg text-[11px] font-semibold bg-surface-1 hover:bg-surface-2 border border-line-subtle text-ink-secondary hover:text-ink-primary transition-colors"
            >
              +1 semana
            </button>
          </div>

          {/* Navegação do Mês */}
          <div className="flex items-center justify-between pt-3 pb-2">
            <span className="text-xs font-bold text-ink-primary">
              {MONTHS_PT[viewMonth]} <span className="text-ink-secondary font-normal">{viewYear}</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={prevMonth}
                className="p-1.5 rounded-lg hover:bg-surface-2 text-ink-secondary hover:text-ink-primary transition-colors"
                title="Mês anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                className="p-1.5 rounded-lg hover:bg-surface-2 text-ink-secondary hover:text-ink-primary transition-colors"
                title="Próximo mês"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Dias da Semana */}
          <div className="grid grid-cols-7 gap-1 text-center mb-1">
            {WEEKDAYS_PT.map((w, i) => (
              <span key={i} className="text-[10px] font-bold text-ink-muted uppercase tracking-wider py-1">
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
                  className="h-8 flex items-center justify-center text-xs text-ink-muted/30 select-none"
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
                  className={`h-8 rounded-lg text-xs font-medium flex items-center justify-center transition-all cursor-pointer relative ${
                    isSelected
                      ? 'bg-ink-primary text-base font-bold shadow-sm'
                      : isToday
                      ? 'bg-surface-1 text-ink-primary border border-line-strong hover:bg-surface-2'
                      : 'text-ink-primary hover:bg-surface-2'
                  }`}
                >
                  {day}
                  {isToday && !isSelected && (
                    <span className="absolute bottom-1 w-1 h-1 rounded-full bg-ink-primary" />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Divisor & Seletor de Hora / Minuto com Scroll do Mouse ── */}
          <div className="mt-3.5 pt-3 border-t border-line-subtle space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-ink-primary" />
                Horário da Postagem
              </span>
              <span className="text-[10px] text-ink-muted">
                Role o mouse para ajustar
              </span>
            </div>

            {/* Controles de Hora e Minuto Centralizados com onWheel */}
            <div className="flex items-center justify-center gap-2 py-1">
              {/* Bloco de Horas */}
              <div className="flex flex-col items-center">
                <button
                  type="button"
                  onClick={() => handleHourStep(1)}
                  className="p-0.5 rounded text-ink-muted hover:text-ink-primary hover:bg-surface-1 transition-colors cursor-pointer"
                  title="Aumentar hora (+1h)"
                >
                  <ChevronRight className="w-3.5 h-3.5 -rotate-90" />
                </button>

                <div
                  onWheel={(e) => {
                    e.preventDefault();
                    handleHourStep(e.deltaY < 0 ? 1 : -1);
                  }}
                  className={`w-12 h-10 rounded-xl bg-surface-1 border border-line-strong hover:border-line-strong hover:bg-surface-2 flex items-center justify-center cursor-ns-resize shadow-inner select-none transition-all group overflow-hidden ${
                    hourAnim ? 'ring-1 ring-white/20' : ''
                  }`}
                  title="Role a rodinha do mouse para cima ou para baixo"
                >
                  <span
                    className={`font-mono text-base font-black text-ink-primary tracking-wider text-center transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                      hourAnim === 'up'
                        ? '-translate-y-1 scale-105 text-white'
                        : hourAnim === 'down'
                        ? 'translate-y-1 scale-105 text-white'
                        : 'translate-y-0 scale-100'
                    }`}
                  >
                    {String(selectedHour).padStart(2, '0')}
                  </span>
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
              <div className="flex flex-col items-center pb-4">
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
                  className={`w-12 h-10 rounded-xl bg-surface-1 border border-line-strong hover:border-line-strong hover:bg-surface-2 flex items-center justify-center cursor-ns-resize shadow-inner select-none transition-all group overflow-hidden ${
                    minAnim ? 'ring-1 ring-white/20' : ''
                  }`}
                  title="Role a rodinha do mouse para cima ou para baixo"
                >
                  <span
                    className={`font-mono text-base font-black text-ink-primary tracking-wider text-center transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                      minAnim === 'up'
                        ? '-translate-y-1 scale-105 text-white'
                        : minAnim === 'down'
                        ? 'translate-y-1 scale-105 text-white'
                        : 'translate-y-0 scale-100'
                    }`}
                  >
                    {String(selectedMinute).padStart(2, '0')}
                  </span>
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

            {/* Presets estratégicos de horário */}
            <div className="grid grid-cols-4 gap-1.5">
              {ENGAGEMENT_PRESETS.map((preset) => {
                const isActive =
                  selectedHour === preset.hour && selectedMinute === preset.min;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handlePresetClick(preset)}
                    className={`py-1.5 px-2 rounded-lg text-center transition-all flex flex-col items-center justify-center border cursor-pointer ${
                      isActive
                        ? 'bg-surface-1 border-line-strong text-ink-primary shadow-sm ring-1 ring-white/10'
                        : 'bg-surface-2/40 border-line-subtle text-ink-secondary hover:text-ink-primary hover:bg-surface-2'
                    }`}
                  >
                    <span className="text-xs font-bold leading-tight">{preset.label}</span>
                    <span className="text-[9px] text-ink-muted leading-none mt-0.5">{preset.desc}</span>
                  </button>
                );
              })}
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

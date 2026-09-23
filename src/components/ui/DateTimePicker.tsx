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
      {/* ── Botão Trigger Elegante ── */}
      <button
        type="button"
        onClick={() => {
          setViewYear(selectedYear);
          setViewMonth(selectedMonth);
          setIsOpen(!isOpen);
        }}
        className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border transition-all text-left group cursor-pointer ${
          isOpen
            ? 'bg-surface-2 border-line-strong ring-1 ring-white/10'
            : 'bg-surface-1 border-line-subtle hover:border-line-strong hover:bg-surface-2'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-surface-2 border border-line-subtle flex items-center justify-center text-ink-primary group-hover:border-line-strong transition-colors flex-shrink-0">
            <CalendarIcon className="w-4 h-4 text-ink-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-ink-primary truncate">
                {formattedDayStr}
              </span>
              {relativeLabel && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-white/5 text-ink-secondary border border-line-subtle">
                  {relativeLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-ink-secondary">
              <Clock className="w-3 h-3 text-ink-muted" />
              <span>{formattedTimeStr} (Horário de Brasília)</span>
            </div>
          </div>
        </div>

        <span className="text-[11px] font-semibold text-ink-secondary group-hover:text-ink-primary transition-colors flex-shrink-0">
          Alterar
        </span>
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

          {/* ── Divisor & Seletor de Hora / Minuto ── */}
          <div className="mt-3.5 pt-3 border-t border-line-subtle space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-ink-primary" />
                Horário da Postagem
              </span>
              <div className="flex items-center gap-1 bg-surface-1 border border-line-subtle rounded-lg px-2 py-1">
                {/* Input de Hora */}
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={String(selectedHour).padStart(2, '0')}
                  onChange={(e) => handleHourChange(parseInt(e.target.value, 10) || 0)}
                  className="w-7 bg-transparent text-center text-xs font-bold text-ink-primary focus:outline-none"
                />
                <span className="text-ink-secondary font-bold">:</span>
                {/* Input de Minuto */}
                <input
                  type="number"
                  min={0}
                  max={59}
                  step={5}
                  value={String(selectedMinute).padStart(2, '0')}
                  onChange={(e) => handleMinuteChange(parseInt(e.target.value, 10) || 0)}
                  className="w-7 bg-transparent text-center text-xs font-bold text-ink-primary focus:outline-none"
                />
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

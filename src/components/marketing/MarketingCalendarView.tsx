import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import type { Property } from '../../types/property';
import type { MarketingPost } from '../../types/marketing';
import {
  getMarketingPosts,
  rescheduleMarketingPost
} from '../../lib/marketing-db';
import { PostEditorModal } from './PostEditorModal';

interface MarketingCalendarViewProps {
  properties: Property[];
  onOpenPiloto?: () => void;
}

const DAYS_OF_WEEK = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export const MarketingCalendarView: React.FC<MarketingCalendarViewProps> = ({
  properties,
  onOpenPiloto,
}) => {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [posts, setPosts] = useState<MarketingPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [draggedPostId, setDraggedPostId] = useState<string | null>(null);
  const [dragOverDateStr, setDragOverDateStr] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  // Editor Modal State
  const [editingPost, setEditingPost] = useState<MarketingPost | null>(null);
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const data = await getMarketingPosts();
      setPosts(data);
    } catch (err) {
      console.error('Erro ao buscar posts para o calendário:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();

    const handleUpdate = () => fetchPosts();
    window.addEventListener('marketing-posts-updated', handleUpdate);
    return () => window.removeEventListener('marketing-posts-updated', handleUpdate);
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  // Month navigation
  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Helper para formatar YYYY-MM-DD no horário local (evita desvio de UTC em calendários)
  const toLocalDateKey = (d: Date | string): string => {
    const dateObj = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(dateObj.getTime())) return '';
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Prepara matriz de dias do mês com preenchimento correto
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    // Monday = 0, Sunday = 6 in our UI
    let startDayOfWeek = firstDayOfMonth.getDay() - 1;
    if (startDayOfWeek === -1) startDayOfWeek = 6;
    const totalDays = lastDayOfMonth.getDate();

    const days: {
      date: Date;
      dateStr: string; // YYYY-MM-DD
      isCurrentMonth: boolean;
      isToday: boolean;
      isPast: boolean;
    }[] = [];

    const todayStr = toLocalDateKey(new Date());
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Dias do mês anterior
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevMonthLastDay - i);
      const dStr = toLocalDateKey(d);
      days.push({
        date: d,
        dateStr: dStr,
        isCurrentMonth: false,
        isToday: dStr === todayStr,
        isPast: d < todayStart,
      });
    }

    // Dias do mês atual
    for (let i = 1; i <= totalDays; i++) {
      const d = new Date(year, month, i);
      const dStr = toLocalDateKey(d);
      days.push({
        date: d,
        dateStr: dStr,
        isCurrentMonth: true,
        isToday: dStr === todayStr,
        isPast: d < todayStart,
      });
    }

    // Dias do próximo mês para fechar semanas completas (múltiplos de 7)
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      const dStr = toLocalDateKey(d);
      days.push({
        date: d,
        dateStr: dStr,
        isCurrentMonth: false,
        isToday: dStr === todayStr,
        isPast: d < todayStart,
      });
    }

    return days;
  }, [year, month]);

  // Agrupa posts por chave local YYYY-MM-DD (compatível com America/Fortaleza e fuso do cliente)
  const postsByDate = useMemo(() => {
    const map = new Map<string, MarketingPost[]>();
    posts.forEach((post) => {
      const timestamp = post.scheduled_at || post.published_at;
      if (timestamp) {
        const dateKey = toLocalDateKey(timestamp);
        if (dateKey) {
          const existing = map.get(dateKey) || [];
          existing.push(post);
          map.set(dateKey, existing);
        }
      }
    });
    return map;
  }, [posts]);

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, post: MarketingPost) => {
    if (!post.id) return;
    setDraggedPostId(post.id);
    e.dataTransfer.setData('text/plain', post.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, dayStr: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverDateStr !== dayStr) {
      setDragOverDateStr(dayStr);
    }
  };

  const handleDragLeave = () => {
    setDragOverDateStr(null);
  };

  const handleDrop = async (e: React.DragEvent, targetDay: { date: Date; dateStr: string; isPast: boolean }) => {
    e.preventDefault();
    setDragOverDateStr(null);
    const postId = draggedPostId || e.dataTransfer.getData('text/plain');
    if (!postId) return;

    // Regra estrita: não permitir agendar em datas passadas
    if (targetDay.isPast) {
      setAlertMessage({
        type: 'error',
        text: 'Não é permitido agendar publicações em datas passadas.',
      });
      setTimeout(() => setAlertMessage(null), 4000);
      setDraggedPostId(null);
      return;
    }

    const postToMove = posts.find((p) => p.id === postId);
    if (!postToMove) {
      setDraggedPostId(null);
      return;
    }

    // Preserve original time of post or default to 10:00
    let originalHours = 10;
    let originalMinutes = 0;
    if (postToMove.scheduled_at) {
      const oldDate = new Date(postToMove.scheduled_at);
      originalHours = oldDate.getHours();
      originalMinutes = oldDate.getMinutes();
    }

    const newDate = new Date(targetDay.date);
    newDate.setHours(originalHours, originalMinutes, 0, 0);
    const newISODate = newDate.toISOString();

    // Optimistic UI update
    const previousPosts = [...posts];
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, scheduled_at: newISODate, status: p.status === 'draft' ? 'approved' : p.status }
          : p
      )
    );

    try {
      await rescheduleMarketingPost(postId, newISODate);
      setAlertMessage({
        type: 'success',
        text: `Publicação reagendada para ${newDate.toLocaleDateString('pt-BR')} às ${String(
          originalHours
        ).padStart(2, '0')}:${String(originalMinutes).padStart(2, '0')}.`,
      });
      setTimeout(() => setAlertMessage(null), 3500);
    } catch (err: any) {
      // Rollback on error
      setPosts(previousPosts);
      setAlertMessage({
        type: 'error',
        text: `Erro ao reagendar post: ${err.message}. Alteração revertida.`,
      });
      setTimeout(() => setAlertMessage(null), 4500);
    } finally {
      setDraggedPostId(null);
    }
  };

  const handleCardClick = (post: MarketingPost) => {
    const snap = post.property_snapshot || {};
    const hasSnapshot = Boolean(post.property_snapshot && Object.keys(post.property_snapshot).length > 0);
    const live = properties.find((p) => p.id === post.listing_id);

    // Prioridade estrita para o SNAPSHOT congelado se existir (Criterion 10)
    const propertyForEditor = hasSnapshot
      ? {
          ...(live || {}),
          id: post.listing_id || 'mock-id',
          type: (snap as any).type || live?.type || ('Apartamento' as any),
          title: snap.title || live?.title || 'Imóvel',
          price: snap.price ?? live?.price ?? 0,
          neighborhood: snap.neighborhood || live?.neighborhood || 'Fortaleza',
          bedrooms: snap.bedrooms ?? live?.bedrooms ?? 0,
          suites: snap.suites ?? live?.suites ?? 0,
          bathrooms: snap.bathrooms ?? live?.bathrooms ?? 0,
          parking_spaces: snap.parking_spaces ?? live?.parking_spaces ?? 0,
          area_m2: snap.area_m2 ?? live?.area_m2 ?? 0,
          notes: snap.notes ?? live?.notes ?? '',
          photos:
            snap.photos && snap.photos.length > 0
              ? snap.photos
              : (post.media_urls || []).map((url, idx) => ({
                  id: `photo-${idx}`,
                  property_id: post.listing_id || '',
                  storage_path: url,
                  sort_order: idx,
                  is_cover: idx === 0,
                })),
        }
      : live || {
          id: post.listing_id || 'mock-id',
          type: 'Apartamento' as any,
          neighborhood: 'Fortaleza',
          bedrooms: 0,
          suites: 0,
          bathrooms: 0,
          parking_spaces: 0,
          area_m2: 0,
          price: 0,
          notes: '',
          photos: [],
          title: 'Imóvel',
        };

    setEditingProperty(propertyForEditor as any);
    setEditingPost(post);
    setIsEditorOpen(true);
  };

  const monthNames = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ];

  return (
    <div className="h-full flex flex-col space-y-4 animate-fade-in overflow-hidden">
      {/* ── Topo: Navegação do Mês & Ações ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-extrabold text-ink-primary flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-accent-soft text-accent shadow-md">
              <CalendarIcon className="w-4 h-4" />
            </div>
            Calendário Editorial
          </h2>
          <p className="text-xs text-ink-secondary">
            Visão temporal mensal. Arraste e solte os cards entre os dias para reagendar instantaneamente.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {/* Month Selector */}
          <div className="flex items-center gap-1 p-1 rounded-xl pill-surface">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-bold px-3 min-w-32 text-center text-ink-primary">
              {monthNames[month]} {year}
            </span>

            <button
              onClick={nextMonth}
              className="p-1.5 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-white/10 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <button
            onClick={goToToday}
            className="px-3 py-1.5 rounded-xl bg-white/5 border border-line-subtle text-ink-secondary hover:text-ink-primary text-xs font-semibold hover:bg-white/10 transition-colors"
          >
            Hoje
          </button>

          <button
            onClick={fetchPosts}
            className="p-2 rounded-xl bg-white/5 border border-line-subtle text-ink-secondary hover:text-ink-primary transition-colors"
            title="Recarregar"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Alert Notification Toast */}
      {alertMessage && (
        <div
          className={`px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-semibold animate-fade-in ${
            alertMessage.type === 'error'
              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          }`}
        >
          {alertMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{alertMessage.text}</span>
        </div>
      )}

      {/* ── Grade Mensal do Calendário ── */}
      <div className="flex-1 flex flex-col min-h-0 panel-surface rounded-2xl p-3 border border-line-subtle overflow-hidden">
        {/* Cabeçalho dos Dias da Semana */}
        <div className="grid grid-cols-7 gap-1.5 pb-2 border-b border-line-subtle text-center text-[11px] font-bold uppercase tracking-wider text-ink-tertiary">
          {DAYS_OF_WEEK.map((d) => (
            <div key={d} className="py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Células dos Dias */}
        <div className="flex-1 grid grid-cols-7 gap-1.5 pt-2 overflow-y-auto min-h-0">
          {calendarDays.map((day, idx) => {
            const dayPosts = postsByDate.get(day.dateStr) || [];
            const isDragOver = dragOverDateStr === day.dateStr;

            return (
              <div
                key={idx}
                onDragOver={(e) => handleDragOver(e, day.dateStr)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, day)}
                className={`flex flex-col min-h-24 p-1.5 rounded-xl border transition-all ${
                  day.isCurrentMonth
                    ? 'bg-white/[0.02] border-line-subtle/50'
                    : 'bg-black/20 border-transparent opacity-40'
                } ${
                  day.isToday ? 'ring-1 ring-accent bg-accent/[0.04]' : ''
                } ${
                  isDragOver ? 'ring-2 ring-accent bg-accent/20 border-accent' : ''
                }`}
              >
                {/* Número do Dia */}
                <div className="flex items-center justify-between px-1 mb-1">
                  <span
                    className={`text-[11px] font-bold ${
                      day.isToday
                        ? 'w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center font-extrabold'
                        : day.isCurrentMonth
                        ? 'text-ink-primary'
                        : 'text-ink-tertiary'
                    }`}
                  >
                    {day.date.getDate()}
                  </span>

                  {dayPosts.length > 0 && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-white/10 text-ink-tertiary">
                      {dayPosts.length}
                    </span>
                  )}
                </div>

                {/* Cards de Posts no Dia (Arrastáveis) */}
                <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
                  {dayPosts.map((post) => {
                    const isPublished = post.status === 'published';
                    const isFailed = post.status === 'failed';
                    const timeStr = post.scheduled_at
                      ? new Date(post.scheduled_at).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '';

                    return (
                      <div
                        key={post.id}
                        draggable={!isPublished}
                        onDragStart={(e) => handleDragStart(e, post)}
                        onClick={() => handleCardClick(post)}
                        className={`p-1.5 rounded-lg border text-left cursor-pointer transition-all select-none group ${
                          isPublished
                            ? 'bg-emerald-500/10 border-emerald-500/30 hover:border-emerald-400'
                            : isFailed
                            ? 'bg-red-500/10 border-red-500/30 hover:border-red-400'
                            : 'bg-slate-800/80 border-white/10 hover:border-accent hover:bg-slate-800'
                        } ${draggedPostId === post.id ? 'opacity-40 scale-95' : ''}`}
                      >
                        <div className="flex items-center gap-1.5">
                          {post.cover_url && (
                            <img
                              src={post.cover_url}
                              alt=""
                              className="w-5 h-5 rounded object-cover flex-shrink-0"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between text-[10px] leading-tight">
                              <span className="font-bold truncate text-ink-primary">
                                {post.property_snapshot?.neighborhood || 'Post'}
                              </span>
                              {timeStr && (
                                <span className="text-[9px] text-accent font-semibold flex items-center gap-0.5 ml-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  {timeStr}
                                </span>
                              )}
                            </div>
                            <p className="text-[9px] text-ink-secondary truncate">
                              {post.caption || 'Sem legenda'}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Modal Post Studio ── */}
      {isEditorOpen && editingProperty && (
        <PostEditorModal
          isOpen={isEditorOpen}
          onClose={() => {
            setIsEditorOpen(false);
            setEditingPost(null);
          }}
          property={editingProperty}
          existingPost={editingPost}
          onSaved={() => {
            fetchPosts();
          }}
        />
      )}
    </div>
  );
};

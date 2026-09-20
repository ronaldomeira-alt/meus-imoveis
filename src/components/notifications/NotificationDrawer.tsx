import React from 'react';
import { X, Bell, CheckCheck, Sparkles, Building2, Trash2 } from 'lucide-react';
import type { NotificationItem } from '../../types/property';

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAllAsRead: () => void;
  onSelectProperty: (propertyId: string) => void;
  onClearNotifications: () => void;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onSelectProperty,
  onClearNotifications,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-sm h-full glass-modal border-l border-white/10 flex flex-col shadow-2xl animate-slide-in-right"
        style={{
          background: 'rgba(6, 11, 26, 0.94)',
        }}
      >
        {/* Topo do Drawer */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-400/20">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Notificações</h3>
              <p className="text-[11px] text-slate-400">Atividades recentes no estoque</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Ações em lote */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
          <button
            onClick={onMarkAllAsRead}
            className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Marcar todas como lidas
          </button>

          <button
            onClick={onClearNotifications}
            className="text-[11px] font-semibold text-slate-500 hover:text-rose-400 flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpar
          </button>
        </div>

        {/* Lista de Notificações */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
              <Bell className="w-10 h-10 mb-2 opacity-30 stroke-1" />
              <p className="text-xs font-medium">Nenhuma notificação recente</p>
            </div>
          ) : (
            notifications.map((item) => (
              <div
                key={item.id}
                onClick={() => {
                  if (item.property_id) onSelectProperty(item.property_id);
                }}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                  item.read
                    ? 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/[0.04]'
                    : 'bg-cyan-500/[0.06] border-cyan-400/30 text-white hover:bg-cyan-500/[0.10]'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs font-bold leading-tight text-white flex items-center gap-1.5">
                    {!item.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                    )}
                    {item.title}
                  </span>
                  <span className="text-[10px] text-slate-500 whitespace-nowrap">{item.created_at}</span>
                </div>
                <p className="text-xs text-slate-300 leading-snug">{item.body}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { X, Bell, CheckCheck, Trash2 } from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 animate-fade-in">
      <div className="w-full max-w-sm h-full modal-surface border-l border-line-strong flex flex-col shadow-modal animate-slide-in-right">
        {/* Topo do Drawer */}
        <div className="flex items-center justify-between p-4 border-b border-line-subtle">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent-soft text-accent">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink-primary">Notificações</h3>
              <p className="text-[11px] text-ink-secondary">Atividades recentes no estoque</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Ações em lote */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-line-subtle bg-white/[0.02]">
          <button
            onClick={onMarkAllAsRead}
            className="text-[11px] font-semibold text-accent hover:text-accent-hover flex items-center gap-1.5"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Marcar todas como lidas
          </button>

          <button
            onClick={onClearNotifications}
            className="text-[11px] font-semibold text-ink-secondary hover:text-status-danger flex items-center gap-1.5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpar
          </button>
        </div>

        {/* Lista de Notificações */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
          {notifications.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-ink-secondary">
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
                className={`p-3.5 rounded-xl border transition-colors cursor-pointer ${
                  item.read
                    ? 'bg-white/[0.02] border-line-subtle text-ink-secondary hover:bg-white/[0.04]'
                    : 'bg-accent-soft border-accent/30 text-ink-primary hover:bg-accent/[0.14]'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className="text-xs font-bold leading-tight text-ink-primary flex items-center gap-1.5">
                    {!item.read && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                    )}
                    {item.title}
                  </span>
                  <span className="text-[10px] text-ink-muted whitespace-nowrap">{item.created_at}</span>
                </div>
                <p className="text-xs text-ink-secondary leading-snug">{item.body}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

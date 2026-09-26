import React, { useEffect, useState } from 'react';
import { Search, Bell, ChevronDown, User, Sparkles, LogOut, Menu, Check, PlusCircle, ShieldCheck } from 'lucide-react';
import type { AppUser } from '../../lib/currentUser';
import { getBrasiliaNow } from '../../lib/greeting';

interface HeaderProps {
  searchQuery: string;
  showGreeting?: boolean;
  sectionTitle?: string;
  sectionCount?: number;
  onAddProperty?: () => void;
  onSearchChange: (query: string) => void;
  unreadNotificationsCount: number;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onOpenMobileNav?: () => void;
  currentUser: AppUser;
  onChangeUser?: (id: AppUser['id']) => void;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  showGreeting = false,
  sectionTitle,
  sectionCount,
  onAddProperty,
  onSearchChange,
  unreadNotificationsCount = 1,
  onOpenNotifications,
  onOpenSettings,
  onOpenMobileNav,
  currentUser,
  onChangeUser,
  onLogout,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [now, setNow] = useState(() => getBrasiliaNow());

  useEffect(() => {
    const id = setInterval(() => setNow(getBrasiliaNow()), 30_000);
    return () => clearInterval(id);
  }, []);

  const firstName = currentUser.name.split(' ')[0];

  return (
    <header className={`app-header flex-shrink-0 select-none ${showGreeting ? 'mb-3' : 'mb-2'}`}>
      <div className="flex items-center justify-between gap-3">
        {/* ── Esquerda: Menu mobile + Data/Saudação ── */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onOpenMobileNav}
            className="md:hidden flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center btn-secondary"
            aria-label="Abrir menu"
          >
            <Menu className="w-4 h-4" />
          </button>

          {showGreeting ? <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-secondary block mb-0.5">
              {now.dateLabel}
            </span>

            <h2 className="text-[20px] lg:text-[24px] font-bold text-ink-primary tracking-tight leading-tight truncate">
              {now.greeting}, <span className="text-accent">{firstName}</span>
            </h2>
            <p className="text-[11px] text-ink-secondary font-medium hidden sm:block">
              Seu estoque de imóveis em um só lugar.
            </p>
          </div> : sectionTitle ? <div className="min-w-0 flex items-baseline gap-3">
            <h1 className="text-xl font-extrabold text-ink-primary truncate">{sectionTitle}</h1>
            {sectionCount !== undefined && <span className="text-xs text-ink-secondary whitespace-nowrap">{sectionCount} {sectionCount === 1 ? 'imóvel' : 'imóveis'}</span>}
          </div> : null}
        </div>

        {/* ── Direita: Busca (desktop), Notificações, Perfil ── */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {/* Busca — desktop/tablet */}
          <div className="relative hidden sm:block w-48 md:w-64 lg:w-72 pill-surface rounded-full">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary"
              style={{ width: '13px', height: '13px' }}
              strokeWidth={2}
            />
            <input
              type="text"
              placeholder="Buscar por bairro, quartos, preço..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-9 pr-14 py-2 bg-transparent rounded-full text-xs text-ink-primary placeholder-ink-secondary focus:outline-none"
            />
            <kbd className="hidden lg:inline-flex items-center absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[8.5px] font-semibold text-ink-secondary border border-line-subtle rounded">
              ⌘ K
            </kbd>
          </div>

          {onAddProperty && <button onClick={onAddProperty} className="btn-primary px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 whitespace-nowrap">
            <PlusCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Adicionar imóvel</span>
          </button>}

          {/* Notificações */}
          <button
            onClick={onOpenNotifications}
            className="relative flex-shrink-0 w-8.5 h-8.5 rounded-full flex items-center justify-center text-ink-secondary hover:text-ink-primary transition-colors pill-surface"
            aria-label="Notificações"
          >
            <Bell style={{ width: '14px', height: '14px' }} strokeWidth={2} />
            {unreadNotificationsCount > 0 && (
              <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-accent border-2 border-[var(--bg-base)]" />
            )}
          </button>

          {/* Perfil do Usuário */}
          <div className="relative flex-shrink-0">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 pill-surface pl-1.5 pr-2.5 py-1 rounded-full transition-all"
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] text-ink-primary flex-shrink-0 ${currentUser.avatarClassName}`}>
                {currentUser.initials}
              </div>

              <div className="hidden lg:block text-left">
                <p className="text-[11px] font-bold text-ink-primary leading-none">{currentUser.name}</p>
                <p className="text-[9px] text-ink-secondary mt-0.5">{currentUser.role}</p>
              </div>

              <ChevronDown
                className="text-ink-secondary ml-0.5"
                style={{ width: '12px', height: '12px' }}
                strokeWidth={2}
              />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-56 modal-surface rounded-xl py-2 z-50 animate-scale-in shadow-modal">
                <div className="px-4 py-2 border-b border-line-subtle">
                  <div className="flex items-center gap-2">
                    <p className="text-[12px] font-bold text-ink-primary leading-tight">{currentUser.name}</p>
                    <span className="px-1.5 py-0.5 rounded text-[8.5px] font-bold bg-accent/15 text-accent border border-accent/30">Admin</span>
                  </div>
                  <p className="text-[10px] text-ink-secondary truncate mt-0.5">{currentUser.email}</p>
                </div>

                <div className="py-1">
                  <button
                    onClick={() => { setDropdownOpen(false); onOpenSettings(); }}
                    className="w-full px-4 py-2 text-[11px] text-left text-ink-secondary hover:text-ink-primary hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <User style={{ width: '13px', height: '13px' }} strokeWidth={1.8} />
                    Perfil da Conta
                  </button>
                  <button
                    onClick={() => { setDropdownOpen(false); onOpenSettings(); }}
                    className="w-full px-4 py-2 text-[11px] text-left text-ink-secondary hover:text-ink-primary hover:bg-white/[0.05] flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <Sparkles style={{ width: '13px', height: '13px' }} className="text-accent" strokeWidth={1.8} />
                    Configurações
                  </button>
                </div>

                <div className="my-1 mx-3 h-px bg-line-subtle" />
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    if (onLogout) onLogout();
                  }}
                  className="w-full px-4 py-2 text-[11px] text-left text-status-danger hover:bg-status-danger/[0.08] flex items-center gap-2.5 transition-colors cursor-pointer"
                >
                  <LogOut style={{ width: '13px', height: '13px' }} strokeWidth={1.8} />
                  Sair do Cockpit
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Busca — mobile (linha própria, mesma função, sem inventar UI nova) */}
      <div className="relative sm:hidden mt-2.5 pill-surface rounded-full">
        <Search
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-secondary"
          style={{ width: '13px', height: '13px' }}
          strokeWidth={2}
        />
        <input
          type="text"
          placeholder="Buscar por bairro, quartos, preço..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-transparent rounded-full text-xs text-ink-primary placeholder-ink-secondary focus:outline-none"
        />
      </div>
    </header>
  );
};

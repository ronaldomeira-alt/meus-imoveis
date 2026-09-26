import React from 'react';
import {
  Home,
  Building2,
  Sparkles,
  PlusCircle,
  Users,
  Archive,
  BarChart3,
  Settings,
  X,
  Calendar,
} from 'lucide-react';
import { InstagramIcon } from '../ui/InstagramIcon';
import type { AppUser } from '../../lib/currentUser';

export type NavSection =
  | 'dashboard'
  | 'estoque'
  | 'match'
  | 'captar'
  | 'piloto'
  | 'calendario'
  | 'parceiros'
  | 'arquivados'
  | 'relatorios'
  | 'configuracoes';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  currentUser: AppUser;
}

const NAV_ITEMS = [
  { id: 'dashboard' as NavSection,     label: 'Dashboard',        icon: Home },
  { id: 'estoque' as NavSection,       label: 'Estoque',          icon: Building2 },
  { id: 'match' as NavSection,         label: 'Match',            icon: Sparkles },
  { id: 'captar' as NavSection,        label: 'Adicionar imóvel', icon: PlusCircle },
  { id: 'piloto' as NavSection,        label: 'Piloto Automático', icon: InstagramIcon },
  { id: 'calendario' as NavSection,    label: 'Calendário',       icon: Calendar },
  { id: 'parceiros' as NavSection,     label: 'Parceiros',        icon: Users },
  { id: 'arquivados' as NavSection,    label: 'Arquivados',       icon: Archive },
  { id: 'relatorios' as NavSection,    label: 'Relatórios',       icon: BarChart3 },
  { id: 'configuracoes' as NavSection, label: 'Configurações',    icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  isMobileOpen = false,
  onCloseMobile,
  currentUser,
}) => {
  return (
    <>
      {/* Backdrop do drawer mobile */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 md:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`group sidebar-surface w-[196px] md:w-[72px] md:hover:w-56 flex-shrink-0 flex flex-col justify-between h-full select-none z-50 fixed inset-y-0 left-0 overflow-hidden transition-[width,transform] duration-300 ease-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        {/* ── Topo: Marca ── */}
        <div className="min-w-0">
          <div className="app-sidebar-brand px-4 flex items-center gap-2.5 border-b border-line-subtle">
            <div
              className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0"
              title="RM Imóveis — Estoque Inteligente"
            >
              <Building2 className="w-3.5 h-3.5 text-accent" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 whitespace-nowrap opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150 md:delay-100">
              <h1 className="text-[12px] font-bold tracking-wide text-ink-primary uppercase leading-none truncate">
                RM Imóveis
              </h1>
              <p className="text-[8.5px] text-ink-secondary font-semibold tracking-[0.15em] uppercase mt-0.5 truncate">
                Estoque Inteligente
              </p>
            </div>

            <button
              onClick={onCloseMobile}
              className="md:hidden ml-auto text-ink-secondary hover:text-ink-primary flex-shrink-0"
              aria-label="Fechar menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Menu de Navegação (ícones; nomes revelados ao passar o mouse no desktop) ── */}
          <nav className="px-2.5 py-3 space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onSelectSection(item.id)}
                  title={item.label}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12.5px] font-medium transition-colors duration-150 text-left overflow-hidden ${
                    isActive
                      ? 'bg-accent-soft text-ink-primary'
                      : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon
                    className={`w-[17px] h-[17px] flex-shrink-0 ${isActive ? 'text-accent' : 'text-ink-secondary'}`}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                  <span className="leading-none truncate whitespace-nowrap opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150 md:delay-100">
                    {item.label}
                  </span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150 md:delay-100" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ── Rodapé: Perfil do Usuário ── */}
        <div className="p-2.5 border-t border-line-subtle overflow-hidden">
          <div
            className="rounded-lg p-2 flex items-center gap-2.5 pill-surface"
            title={`${currentUser.name} — ${currentUser.role}`}
          >
            <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] text-ink-primary flex-shrink-0 ${currentUser.avatarClassName}`}>
              {currentUser.initials}
            </div>
            <div className="min-w-0 text-left whitespace-nowrap opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-150 md:delay-100">
              <p className="text-[11px] font-bold text-ink-primary leading-tight truncate">{currentUser.name}</p>
              <p className="text-[9px] text-ink-secondary truncate mt-0.5">
                {currentUser.role}
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

import React from 'react';
import {
  Home,
  Building2,
  PlusCircle,
  Users,
  Archive,
  BarChart3,
  Settings,
  X,
} from 'lucide-react';

export type NavSection =
  | 'dashboard'
  | 'estoque'
  | 'captar'
  | 'parceiros'
  | 'arquivados'
  | 'relatorios'
  | 'configuracoes';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onOpenCapture: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

const NAV_ITEMS = [
  { id: 'dashboard' as NavSection,     label: 'Dashboard',        icon: Home },
  { id: 'estoque' as NavSection,       label: 'Estoque',          icon: Building2 },
  { id: 'captar' as NavSection,        label: 'Adicionar imóvel', icon: PlusCircle, isAction: true },
  { id: 'parceiros' as NavSection,     label: 'Parceiros',        icon: Users },
  { id: 'arquivados' as NavSection,    label: 'Arquivados',       icon: Archive },
  { id: 'relatorios' as NavSection,    label: 'Relatórios',       icon: BarChart3 },
  { id: 'configuracoes' as NavSection, label: 'Configurações',    icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  onOpenCapture,
  isMobileOpen = false,
  onCloseMobile,
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
        className={`sidebar-surface w-[196px] flex-shrink-0 flex flex-col justify-between h-full select-none z-50 fixed inset-y-0 left-0 transition-transform duration-200 ease-out md:static ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        {/* ── Topo: Marca ── */}
        <div>
          <div className="h-14 px-4 flex items-center justify-between border-b border-line-subtle">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-3.5 h-3.5 text-accent" strokeWidth={2.2} />
              </div>
              <div className="min-w-0">
                <h1 className="text-[12px] font-bold tracking-wide text-ink-primary uppercase leading-none truncate">
                  RM Imóveis
                </h1>
                <p className="text-[8.5px] text-ink-secondary font-semibold tracking-[0.15em] uppercase mt-0.5">
                  Estoque Inteligente
                </p>
              </div>
            </div>

            <button
              onClick={onCloseMobile}
              className="md:hidden text-ink-secondary hover:text-ink-primary flex-shrink-0"
              aria-label="Fechar menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* ── Menu de Navegação ── */}
          <nav className="px-2.5 py-3 space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.isAction) {
                      onOpenCapture();
                    } else {
                      onSelectSection(item.id);
                    }
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12.5px] font-medium transition-colors duration-150 text-left ${
                    isActive
                      ? 'bg-accent-soft text-ink-primary'
                      : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
                  }`}
                >
                  <Icon
                    className={`w-[15px] h-[15px] flex-shrink-0 ${isActive ? 'text-accent' : 'text-ink-secondary'}`}
                    strokeWidth={isActive ? 2.2 : 1.8}
                  />
                  <span className="leading-none truncate">{item.label}</span>
                  {isActive && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* ── Rodapé: Perfil do Usuário ── */}
        <div className="p-2.5 border-t border-line-subtle">
          <div className="rounded-lg p-2 flex items-center gap-2.5 pill-surface">
            <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] text-ink-primary flex-shrink-0 bg-accent">
              RM
            </div>
            <div className="min-w-0 text-left">
              <p className="text-[11px] font-bold text-ink-primary leading-tight truncate">Ronaldo Meira</p>
              <p className="text-[9px] text-ink-secondary truncate mt-0.5">
                Corretor de Imóveis
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};

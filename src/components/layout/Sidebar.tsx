import React from 'react';
import {
  Home,
  Building2,
  PlusCircle,
  Users,
  Archive,
  BarChart3,
  Settings,
  ChevronDown,
  Heart
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
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  onOpenCapture,
}) => {
  const navItems = [
    { id: 'dashboard' as NavSection,     label: 'Dashboard',      icon: Home },
    { id: 'estoque' as NavSection,       label: 'Estoque',        icon: Building2 },
    { id: 'captar' as NavSection,        label: 'Captar imóvel',  icon: PlusCircle, isAction: true },
    { id: 'parceiros' as NavSection,     label: 'Parceiros',      icon: Users },
    { id: 'arquivados' as NavSection,    label: 'Arquivados',     icon: Archive },
    { id: 'relatorios' as NavSection,    label: 'Relatórios',     icon: BarChart3 },
    { id: 'configuracoes' as NavSection, label: 'Configurações',  icon: Settings },
  ];

  return (
    <aside className="glass-sidebar w-[215px] lg:w-[225px] flex-shrink-0 hidden md:flex flex-col justify-between h-full select-none z-30">
      {/* ── Topo: Ícone Dourado de Edifícios + "RM IMÓVEIS" ── */}
      <div>
        <div className="pt-6 pb-5 px-5 flex flex-col items-center text-center">
          {/* Ícone Estilizado de Prédios em Linhas Douradas (Idêntico à Referência) */}
          <div className="mb-2.5">
            <svg
              viewBox="0 0 44 44"
              className="w-10 h-10"
              fill="none"
              stroke="#F59E0B"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 0 10px rgba(245, 158, 11, 0.4))' }}
            >
              {/* Prédio 1 (Esquerda) */}
              <path d="M 6 38 L 6 22 L 14 14 L 14 38" />
              {/* Prédio 2 (Centro mais alto) */}
              <path d="M 14 38 L 14 10 L 22 4 L 22 38" />
              {/* Prédio 3 (Centro-direita) */}
              <path d="M 22 38 L 22 16 L 30 10 L 30 38" />
              {/* Prédio 4 (Direita) */}
              <path d="M 30 38 L 30 24 L 38 18 L 38 38" />
              {/* Linha de base */}
              <line x1="4" y1="38" x2="40" y2="38" strokeWidth="2.5" />
            </svg>
          </div>

          <h1 className="text-[13.5px] font-black tracking-widest text-white uppercase leading-none">
            RM IMÓVEIS
          </h1>
          <p className="text-[8px] text-slate-400 font-bold tracking-[0.25em] uppercase mt-1">
            ESTOQUE INTELIGENTE
          </p>
        </div>

        {/* ── Menu de Navegação ── */}
        <nav className="px-3 space-y-1 mt-2">
          {navItems.map((item) => {
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
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[12px] font-medium tracking-wide transition-all duration-300 text-left group relative ${
                  isActive
                    ? 'text-white font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                }`}
                style={
                  isActive
                    ? {
                        background: 'linear-gradient(90deg, rgba(0, 115, 230, 0.45) 0%, rgba(0, 180, 255, 0.15) 100%)',
                        border: '1px solid rgba(0, 200, 255, 0.55)',
                        boxShadow: '0 0 20px rgba(0, 140, 255, 0.35), inset 0 1px 0 rgba(255,255,255,0.3)',
                      }
                    : {
                        border: '1px solid transparent',
                      }
                }
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-[15px] h-[15px] flex-shrink-0 transition-transform duration-300 ${
                      isActive
                        ? 'text-cyan-300 scale-105'
                        : 'text-slate-400 group-hover:text-slate-200'
                    }`}
                    strokeWidth={isActive ? 2.4 : 1.8}
                  />
                  <span className="leading-none">{item.label}</span>
                </div>

                {/* Ponto Ciano Luminoso no item ativo */}
                {isActive && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                    style={{ boxShadow: '0 0 8px #00E5FF' }}
                  />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Rodapé: Perfil do Usuário + Citação ── */}
      <div className="p-3 m-2 space-y-2.5">
        {/* Card do Usuário com Chevron Down */}
        <div
          className="rounded-2xl p-2.5 px-3 flex items-center justify-between cursor-pointer group"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.10)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7.5 h-7.5 rounded-full flex items-center justify-center font-bold text-[10.5px] text-white flex-shrink-0"
              style={{
                background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                boxShadow: '0 0 10px rgba(124, 58, 237, 0.4)',
              }}
            >
              RM
            </div>
            <div className="overflow-hidden text-left">
              <p className="text-[11px] font-bold text-white leading-tight">Ronaldo Meira</p>
              <p className="text-[9px] text-slate-400 truncate mt-0.5">
                Corretor de Imóveis
              </p>
            </div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200 transition-colors ml-1" />
        </div>

        {/* Citação Inspiracional com Ícone de Coração Dourado */}
        <div className="px-1 flex items-center gap-2">
          <Heart className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" strokeWidth={2.2} />
          <p className="text-[9.5px] italic text-slate-400 leading-tight">
            "Disciplina hoje, liberdade amanhã."
          </p>
        </div>
      </div>
    </aside>
  );
};

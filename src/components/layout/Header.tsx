import React, { useState } from 'react';
import { Search, Bell, ChevronDown, User, Sparkles, LogOut } from 'lucide-react';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  unreadNotificationsCount: number;
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  currentUser?: { name: string; email: string };
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  unreadNotificationsCount = 1,
  onOpenNotifications,
  onOpenSettings,
  currentUser = { name: 'Ronaldo Meira', email: 'ronaldomeira@gmail.com' },
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  return (
    <header className="flex-shrink-0 mb-3 select-none">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        {/* ── Esquerda: Data, Saudação e Subtítulo ── */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-[0.20em] text-slate-400 block mb-0.5">
            SÁB, 19 DE SETEMBRO
          </span>

          <h2 className="text-[23px] lg:text-[26px] font-bold text-white tracking-tight leading-tight">
            Boa noite,{' '}
            <span className="text-[#38BDF8] font-bold" style={{ textShadow: '0 0 16px rgba(56, 189, 248, 0.4)' }}>
              Ronaldo
            </span>
          </h2>
          <p className="text-[11px] text-slate-400 font-medium">
            Seu estoque de imóveis em um só lugar.
          </p>
        </div>

        {/* ── Direita: Busca, Notificações, Perfil e Citação ── */}
        <div className="flex flex-col items-end gap-1 w-full sm:w-auto">
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            {/* Cápsula de Busca Glass */}
            <div className="relative flex-1 sm:w-64 md:w-72 glass-pill rounded-full">
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                style={{ width: '13px', height: '13px' }}
                strokeWidth={2}
              />
              <input
                type="text"
                placeholder="Buscar por bairro, quartos, preço..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                className="w-full pl-9 pr-14 py-2 bg-transparent rounded-full text-xs text-white placeholder-slate-400 focus:outline-none"
              />
              <kbd
                className="hidden sm:inline-flex items-center absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-[8.5px] font-semibold text-slate-400"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.10)',
                  borderRadius: '4px',
                }}
              >
                ⌘ K
              </kbd>
            </div>

            {/* Notificações com Badge Vermelho */}
            <button
              onClick={onOpenNotifications}
              className="relative flex-shrink-0 w-8.5 h-8.5 rounded-full flex items-center justify-center text-slate-300 hover:text-white transition-colors"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
              }}
              aria-label="Notificações"
            >
              <Bell style={{ width: '14px', height: '14px' }} strokeWidth={2} />
              <span
                className="absolute top-1 right-1 w-3 h-3 rounded-full bg-rose-500 text-[8px] font-bold text-white flex items-center justify-center border-2 border-[#030611]"
                style={{ boxShadow: '0 0 8px rgba(244, 63, 94, 0.85)' }}
              >
                1
              </span>
            </button>

            {/* Perfil do Usuário */}
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 glass-pill pl-1.5 pr-3 py-1 rounded-full transition-all"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[10px] text-white flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%)',
                    boxShadow: '0 0 10px rgba(124, 58, 237, 0.4)',
                  }}
                >
                  RM
                </div>

                <div className="hidden lg:block text-left">
                  <p className="text-[11px] font-bold text-white leading-none">{currentUser.name}</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">Corretor de Imóveis</p>
                </div>

                <ChevronDown
                  className="text-slate-400 ml-0.5"
                  style={{ width: '12px', height: '12px' }}
                  strokeWidth={2}
                />
              </button>

              {dropdownOpen && (
                <div
                  className="absolute right-0 mt-2 w-52 glass-modal rounded-2xl py-1.5 z-50 animate-scale-in"
                  style={{ border: '1px solid rgba(255, 255, 255, 0.12)' }}
                >
                  <button
                    onClick={() => { setDropdownOpen(false); onOpenSettings(); }}
                    className="w-full px-4 py-2 text-[11px] text-left text-slate-300 hover:text-white hover:bg-white/[0.06] flex items-center gap-2.5 transition-colors"
                  >
                    <User style={{ width: '13px', height: '13px' }} className="text-slate-400" strokeWidth={1.8} />
                    Perfil da Conta
                  </button>
                  <button
                    onClick={() => { setDropdownOpen(false); onOpenSettings(); }}
                    className="w-full px-4 py-2 text-[11px] text-left text-slate-300 hover:text-white hover:bg-white/[0.06] flex items-center gap-2.5 transition-colors"
                  >
                    <Sparkles style={{ width: '13px', height: '13px' }} className="text-cyan-400" strokeWidth={1.8} />
                    Configurações & Fundo
                  </button>
                  <div className="my-1 mx-3" style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)' }} />
                  <button
                    onClick={() => setDropdownOpen(false)}
                    className="w-full px-4 py-2 text-[11px] text-left text-rose-400 hover:bg-rose-500/[0.08] flex items-center gap-2.5 transition-colors"
                  >
                    <LogOut style={{ width: '13px', height: '13px' }} strokeWidth={1.8} />
                    Sair da Conta
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Citação no canto superior direito */}
          <p className="text-[9px] text-slate-400 italic hidden sm:block">
            “Mais que imóveis. O seu próximo grande negócio.”
          </p>
        </div>
      </div>
    </header>
  );
};

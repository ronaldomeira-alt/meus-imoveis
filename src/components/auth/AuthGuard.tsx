import React, { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { LoginPage } from './LoginPage';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { user, loading, isAdmin } = useAuth();

  const [isRecoveryMode, setIsRecoveryMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const search = window.location.search;
      const hash = window.location.hash;
      return search.includes('mode=update-password') || hash.includes('type=recovery');
    }
    return false;
  });

  useEffect(() => {
    const checkRecovery = () => {
      const search = window.location.search;
      const hash = window.location.hash;
      if (search.includes('mode=update-password') || hash.includes('type=recovery')) {
        setIsRecoveryMode(true);
      }
    };
    checkRecovery();
    window.addEventListener('hashchange', checkRecovery);
    window.addEventListener('popstate', checkRecovery);
    return () => {
      window.removeEventListener('hashchange', checkRecovery);
      window.removeEventListener('popstate', checkRecovery);
    };
  }, []);

  useEffect(() => {
    if (isRecoveryMode) return;

    if (!loading && (!user || !isAdmin)) {
      if (window.location.pathname !== '/login') {
        window.history.replaceState(null, '', '/login');
      }
    } else if (!loading && user && isAdmin) {
      if (window.location.pathname === '/login') {
        window.history.replaceState(null, '', '/');
      }
    }
  }, [loading, user, isAdmin, isRecoveryMode]);

  // Enquanto a sessão está sendo verificada, NUNCA expõe o conteúdo do CRM
  if (loading) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-[var(--bg-base)] text-ink-primary select-none relative overflow-hidden">
        <div className="absolute w-80 h-80 bg-accent/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-accent/25 to-blue-500/20 border border-accent/40 flex items-center justify-center shadow-[0_0_32px_rgba(59,130,246,0.3)]">
            <span className="text-2xl font-black text-white tracking-tight">RM</span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-ink-secondary mt-2">
            <Loader2 className="w-4 h-4 animate-spin text-accent" />
            <span className="font-medium tracking-wide">Carregando Cockpit Imobiliário...</span>
          </div>
        </div>
      </div>
    );
  }

  // Se o usuário veio pelo link de recuperação de senha, EXIGE que ele defina a senha antes de entrar
  if (isRecoveryMode) {
    return (
      <LoginPage
        onSuccess={() => {
          setIsRecoveryMode(false);
          window.history.replaceState(null, '', '/');
        }}
      />
    );
  }

  // Se não autenticado ou não for Ronaldo Meira, exibe exclusivamente a tela de login
  if (!user || !isAdmin) {
    return <LoginPage />;
  }

  // Acesso autorizado
  return <>{children}</>;
};

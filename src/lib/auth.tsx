import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

const ALLOWED_ADMIN_EMAIL = 'ronaldomeira@gmail.com';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string; success?: boolean }>;
  updatePassword: (password: string) => Promise<{ error?: string; success?: boolean }>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Valida e aplica o usuário garantindo que apenas o e-mail autorizado tenha sessão ativa
  const validateAndSetSession = async (currentSession: Session | null) => {
    if (!currentSession?.user) {
      setSession(null);
      setUser(null);
      return;
    }

    const email = (currentSession.user.email || '').toLowerCase().trim();
    if (email !== ALLOWED_ADMIN_EMAIL) {
      if (supabase) {
        await supabase.auth.signOut();
      }
      setSession(null);
      setUser(null);
      return;
    }

    setSession(currentSession);
    setUser(currentSession.user);
  };

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    // 1. Carrega sessão inicial de forma assíncrona
    supabase.auth.getSession().then(({ data: { session: initialSession }, error }) => {
      if (!isMounted) return;
      if (error) {
        console.error('Falha ao verificar sessão inicial do Supabase:', error.message);
        setLoading(false);
        return;
      }
      validateAndSetSession(initialSession).finally(() => {
        if (isMounted) setLoading(false);
      });
    }).catch((err) => {
      if (!isMounted) return;
      console.error('Erro de rede ao buscar sessão:', err);
      setLoading(false);
    });

    // 2. Ouve eventos de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return;

      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      await validateAndSetSession(newSession);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error?: string }> => {
    if (!supabase) {
      return { error: 'Serviço de autenticação não configurado no servidor.' };
    }

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== ALLOWED_ADMIN_EMAIL) {
      return { error: 'Acesso restrito ao administrador Ronaldo Meira (ronaldomeira@gmail.com).' };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        if (error.message.includes('Invalid login credentials')) {
          return { error: 'E-mail ou senha incorretos. Verifique suas credenciais.' };
        }
        if (error.message.includes('Email not confirmed')) {
          return { error: 'E-mail ainda não confirmado. Verifique sua caixa de entrada.' };
        }
        return { error: error.message };
      }

      if (data.user?.email?.toLowerCase().trim() !== ALLOWED_ADMIN_EMAIL) {
        await supabase.auth.signOut();
        return { error: 'Acesso restrito ao administrador Ronaldo Meira.' };
      }

      setSession(data.session);
      setUser(data.user);
      return {};
    } catch {
      return { error: 'Falha de comunicação com o servidor de autenticação.' };
    }
  };

  const signOut = async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } finally {
      setSession(null);
      setUser(null);
      // Remove parâmetros de autenticação e redireciona para login
      if (window.location.pathname !== '/login') {
        window.history.pushState(null, '', '/login');
      }
    }
  };

  const resetPassword = async (email: string): Promise<{ error?: string; success?: boolean }> => {
    if (!supabase) {
      return { error: 'Serviço de autenticação não configurado.' };
    }

    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== ALLOWED_ADMIN_EMAIL) {
      return { error: 'E-mail não autorizado para recuperação de senha.' };
    }

    try {
      const redirectUrl = `${window.location.origin}/login?mode=update-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl,
      });

      if (error) {
        return { error: error.message };
      }

      return { success: true };
    } catch {
      return { error: 'Não foi possível solicitar a recuperação de senha.' };
    }
  };

  const updatePassword = async (newPassword: string): Promise<{ error?: string; success?: boolean }> => {
    if (!supabase) {
      return { error: 'Serviço de autenticação não configurado.' };
    }

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        return { error: error.message };
      }

      return { success: true };
    } catch {
      return { error: 'Não foi possível atualizar a senha.' };
    }
  };

  const isAdmin = useMemo(() => {
    return (user?.email || '').toLowerCase().trim() === ALLOWED_ADMIN_EMAIL;
  }, [user]);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      isAdmin,
      signIn,
      signOut,
      resetPassword,
      updatePassword,
    }),
    [user, session, loading, isAdmin]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider.');
  }
  return context;
};

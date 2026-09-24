import React, { useState, useEffect } from 'react';
import { Lock, Mail, Eye, EyeOff, ShieldCheck, ArrowRight, KeyRound, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';

interface LoginPageProps {
  onSuccess?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSuccess }) => {
  const { signIn, resetPassword, updatePassword } = useAuth();

  const [mode, setMode] = useState<'login' | 'forgot' | 'update'>('login');
  const [email, setEmail] = useState('ronaldomeira@gmail.com');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Detecta se a rota ou hash veio com fluxo de recuperação de senha do Supabase
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    if (params.get('mode') === 'update-password' || hash.includes('type=recovery')) {
      setMode('update');
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setErrorMessage('Informe o e-mail cadastrado.');
      return;
    }
    if (!password) {
      setErrorMessage('Informe sua senha de acesso.');
      return;
    }

    setLoading(true);
    try {
      const result = await signIn(email, password);
      if (result.error) {
        setErrorMessage(result.error);
      } else {
        if (onSuccess) {
          onSuccess();
        } else {
          window.history.pushState(null, '', '/');
        }
      }
    } catch {
      setErrorMessage('Erro inesperado ao conectar com o serviço de autenticação.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!email.trim()) {
      setErrorMessage('Informe o e-mail para receber as instruções de recuperação.');
      return;
    }

    setLoading(true);
    try {
      const result = await resetPassword(email);
      if (result.error) {
        setErrorMessage(result.error);
      } else {
        setSuccessMessage('Um link seguro de redefinição foi enviado para o seu e-mail.');
      }
    } catch {
      setErrorMessage('Não foi possível enviar o link de recuperação.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!newPassword || newPassword.length < 6) {
      setErrorMessage('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage('As senhas digitadas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      const result = await updatePassword(newPassword);
      if (result.error) {
        setErrorMessage(result.error);
      } else {
        setSuccessMessage('Senha atualizada com sucesso! Entrando no CRM...');
        setTimeout(() => {
          if (onSuccess) {
            onSuccess();
          } else {
            window.history.pushState(null, '', '/');
            window.location.reload();
          }
        }, 1200);
      }
    } catch {
      setErrorMessage('Não foi possível atualizar sua senha.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-[var(--bg-base)] px-4 py-8 relative overflow-hidden select-none">
      {/* Background ambient lighting */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-accent/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Header / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-accent/20 to-blue-500/20 border border-accent/30 shadow-[0_0_24px_rgba(59,130,246,0.25)] mb-4">
            <span className="text-xl font-black tracking-tight text-white">RM</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink-primary">
            {mode === 'login' ? 'Cockpit Imobiliário' : mode === 'forgot' ? 'Recuperação de Acesso' : 'Definir Nova Senha'}
          </h1>
          <p className="text-xs text-ink-secondary mt-1.5">
            {mode === 'login'
              ? 'Acesso restrito e exclusivo para Ronaldo Meira'
              : mode === 'forgot'
              ? 'Enviaremos um link de redefinição seguro para o seu e-mail'
              : 'Crie uma nova senha segura para o seu usuário'}
          </p>
        </div>

        {/* Card Principal */}
        <div className="modal-surface rounded-2xl p-6 sm:p-8 border border-line-subtle shadow-2xl backdrop-blur-xl relative">
          {/* Mensagens de Alerta */}
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-status-danger/10 border border-status-danger/25 text-rose-300 text-xs flex items-start gap-2.5 animate-fade-in">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-status-danger mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-status-success/10 border border-status-success/25 text-emerald-300 text-xs flex items-start gap-2.5 animate-fade-in">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-status-success mt-0.5" />
              <div className="flex-1 leading-relaxed">{successMessage}</div>
            </div>
          )}

          {/* MODO 1: LOGIN */}
          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-ink-secondary uppercase tracking-wider mb-1.5">
                  E-mail do Administrador
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ronaldomeira@gmail.com"
                    autoComplete="username"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-line-subtle text-ink-primary text-sm placeholder:text-ink-secondary/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[11px] font-semibold text-ink-secondary uppercase tracking-wider">
                    Senha
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    className="text-[11px] text-accent hover:text-accent/80 transition-colors"
                  >
                    Esqueci a senha
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Digite sua senha"
                    autoComplete="current-password"
                    required
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/[0.04] border border-line-subtle text-ink-primary text-sm placeholder:text-ink-secondary/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink-primary transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-accent/20 transition-all cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar no Cockpit</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* MODO 2: RECUPERAÇÃO DE SENHA */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-ink-secondary uppercase tracking-wider mb-1.5">
                  E-mail cadastrado
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="ronaldomeira@gmail.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-line-subtle text-ink-primary text-sm placeholder:text-ink-secondary/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-accent/20 transition-all cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Enviando link...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Enviar Link de Recuperação</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="w-full py-2 text-xs text-ink-secondary hover:text-ink-primary transition-colors text-center"
              >
                ← Voltar para o Login
              </button>
            </form>
          )}

          {/* MODO 3: ATUALIZAR NOVA SENHA */}
          {mode === 'update' && (
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold text-ink-secondary uppercase tracking-wider mb-1.5">
                  Nova Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo de 6 caracteres"
                    required
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/[0.04] border border-line-subtle text-ink-primary text-sm placeholder:text-ink-secondary/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink-primary transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-secondary uppercase tracking-wider mb-1.5">
                  Confirme a Nova Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    required
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-line-subtle text-ink-primary text-sm placeholder:text-ink-secondary/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-accent/20 transition-all cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Atualizando senha...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Salvar Senha e Entrar</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Rodapé de Segurança */}
          <div className="mt-6 pt-5 border-t border-line-subtle flex items-center justify-center gap-2 text-[10.5px] text-ink-secondary/60">
            <ShieldCheck className="w-3.5 h-3.5 text-accent" />
            <span>Autenticação criptografada via Supabase Auth</span>
          </div>
        </div>
      </div>
    </div>
  );
};

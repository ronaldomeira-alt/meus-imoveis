import React, { useState } from 'react';
import {
  Sparkles,
  Users,
  ShieldCheck,
  Eye,
  EyeOff,
  Download,
  Database,
  Plus,
  Zap,
  Cpu,
  KeyRound,
  Lock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Bell,
} from 'lucide-react';
import { GlobalAISettings } from './GlobalAISettings';
import { MarketingSettingsTab } from './MarketingSettingsTab';
import { NotificationsSettingsTab } from './NotificationsSettingsTab';
import { useAuth } from '../../lib/auth';

interface SettingsViewProps {
  onExportJSON: () => void;
  onExportCSV: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onExportJSON,
  onExportCSV,
}) => {
  const [activeTab, setActiveTab] = useState<'gemini' | 'usuarios' | 'conta' | 'marketing' | 'notificacoes'>('gemini');
  // ── Gestão de Senha do Administrador (Supabase Auth) ──
  const { updatePassword } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordStatus(null);

    if (!newPassword || newPassword.length < 6) {
      setPasswordError('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('As senhas digitadas não coincidem.');
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const result = await updatePassword(newPassword);
      if (result.error) {
        setPasswordError(result.error);
      } else {
        setPasswordStatus('Senha de acesso atualizada com sucesso no Supabase Auth!');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPasswordStatus(null), 5000);
      }
    } catch {
      setPasswordError('Falha de conexão ao atualizar a senha.');
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4 animate-fade-in overflow-hidden">
      {/* ── Topo: Título e Navegação em Abas ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 flex-shrink-0">
        <div>
          <h2 className="text-xl font-extrabold text-ink-primary flex items-center gap-2.5">
            <Cpu className="w-5 h-5 text-accent" />
            Configurações do Sistema
          </h2>
          <p className="text-xs text-ink-secondary">
            Inteligência artificial, usuários e dados do estoque
          </p>
        </div>

        {/* Abas */}
        <div className="w-full sm:w-auto max-w-full flex items-center gap-1.5 p-1 rounded-xl bg-surface-1 border border-line-subtle overflow-x-auto no-scrollbar scroll-smooth flex-nowrap shrink-0 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('gemini')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
              activeTab === 'gemini'
                ? 'bg-accent text-white shadow-sm font-bold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            <Sparkles className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'gemini' ? 'text-white' : 'text-accent'}`} />
            <span>Modelos & IA</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('usuarios')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
              activeTab === 'usuarios'
                ? 'bg-accent text-white shadow-sm font-bold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            <Users className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'usuarios' ? 'text-white' : 'text-ink-secondary'}`} />
            <span>Usuários</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('conta')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
              activeTab === 'conta'
                ? 'bg-accent text-white shadow-sm font-bold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            <ShieldCheck className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'conta' ? 'text-white' : 'text-emerald-400'}`} />
            <span>Conta & Dados</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('marketing')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
              activeTab === 'marketing'
                ? 'bg-accent text-white shadow-sm font-bold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            <Zap className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'marketing' ? 'text-white' : 'text-accent'}`} />
            <span>Inteligência de Marketing</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('notificacoes')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all duration-150 cursor-pointer ${
              activeTab === 'notificacoes'
                ? 'bg-accent text-white shadow-sm font-bold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            <Bell className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'notificacoes' ? 'text-white' : 'text-amber-400'}`} />
            <span>Notificações</span>
          </button>
        </div>
      </div>

      {/* ── Conteúdo da Aba Ativa ── */}
      <div className="flex-1 overflow-y-auto pr-1">
        {/* 2. ABA INTELIGÊNCIA ARTIFICIAL (GROQ & GEMINI) */}
        {activeTab === 'gemini' && <GlobalAISettings />}

        {activeTab === 'usuarios' && (
          <div className="space-y-5 pb-6">
            <div className="panel-surface p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-ink-primary flex items-center gap-2">
                    <Users className="w-4 h-4 text-accent" />
                    Usuários Autorizados
                  </h3>
                  <p className="text-xs text-ink-secondary">
                    Apenas administradores têm acesso à gestão do estoque inteligente e dados de proprietários
                  </p>
                </div>

                <button className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-accent/20 text-accent border border-accent/40 text-xs font-semibold hover:bg-accent/30 transition-colors">
                  <Plus className="w-3.5 h-3.5" />
                  Novo Administrador
                </button>
              </div>

              {/* Lista de Usuários */}
              <div className="space-y-3">
                {/* Usuário 1: Ronaldo Meira */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-line-subtle flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-sm text-ink-primary bg-accent"
                    >
                      RM
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-ink-primary">Ronaldo Meira</p>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-accent/10 text-accent border border-accent/30">
                          Operador Principal
                        </span>
                      </div>
                      <p className="text-xs text-ink-secondary">ronaldomeira@gmail.com</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-xs text-status-success flex items-center gap-1 font-medium">
                      <span className="w-2 h-2 rounded-full bg-status-success animate-pulse" /> Ativo
                    </span>
                    <span className="text-xs text-ink-secondary">Acesso Total</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Card de Alteração de Senha de Acesso */}
            <div className="panel-surface p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-ink-primary flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-accent" />
                    Segurança & Senha de Acesso
                  </h3>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    Defina ou altere a sua senha de login do CRM imobiliário
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-accent/10 text-accent border border-accent/25">
                  <ShieldCheck className="w-3 h-3" /> Supabase Auth
                </span>
              </div>

              {passwordError && (
                <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/25 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-status-danger flex-shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              {passwordStatus && (
                <div className="p-3 rounded-xl bg-status-success/10 border border-status-success/25 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-status-success flex-shrink-0" />
                  <span>{passwordStatus}</span>
                </div>
              )}

              <form onSubmit={handleUpdatePassword} className="space-y-4 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary uppercase tracking-wider mb-1.5">
                      Nova Senha
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        required
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/[0.04] border border-line-subtle text-ink-primary text-xs placeholder:text-ink-secondary/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer"
                        tabIndex={-1}
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary uppercase tracking-wider mb-1.5">
                      Confirmar Nova Senha
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a nova senha"
                        required
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-line-subtle text-ink-primary text-xs placeholder:text-ink-secondary/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isUpdatingPassword}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-accent/20 transition-all cursor-pointer"
                  >
                    {isUpdatingPassword ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Atualizando...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Atualizar Senha de Acesso</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 4. ABA CONTA & DADOS */}
        {activeTab === 'conta' && (
          <div className="space-y-5 pb-6">
            <div className="panel-surface p-5 space-y-4">
              <h3 className="text-sm font-bold text-ink-primary flex items-center gap-2">
                <Database className="w-4 h-4 text-accent" />
                Exportação, Backup e Dados do Estoque
              </h3>
              <p className="text-xs text-ink-secondary">
                Gere cópias de segurança do seu inventário de imóveis a qualquer momento
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-line-subtle space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-ink-primary">Exportação Completa (JSON)</h4>
                    <p className="text-[11px] text-ink-secondary mt-0.5">
                      Exporta todos os imóveis, fotos e dados estruturados em formato JSON nativo.
                    </p>
                  </div>
                  <button
                    onClick={onExportJSON}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/20 text-accent border border-accent/30 text-xs font-bold hover:bg-accent/30 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar Backup JSON
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-white/[0.03] border border-line-subtle space-y-3">
                  <div>
                    <h4 className="text-xs font-bold text-ink-primary">Planilha do Catálogo (CSV)</h4>
                    <p className="text-[11px] text-ink-secondary mt-0.5">
                      Exporta tabela compatível com Excel e Google Sheets com preços, bairros e tipologias.
                    </p>
                  </div>
                  <button
                    onClick={onExportCSV}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-ink-primary border border-line-strong text-xs font-bold hover:bg-white/20 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Baixar Planilha CSV
                  </button>
                </div>
              </div>
            </div>

            {/* Card de Alteração de Senha de Acesso */}
            <div className="panel-surface p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-ink-primary flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-accent" />
                    Segurança & Senha de Acesso
                  </h3>
                  <p className="text-xs text-ink-secondary mt-0.5">
                    Altere sua senha de login do CRM imobiliário com segurança no Supabase Auth
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-accent/10 text-accent border border-accent/25">
                  <ShieldCheck className="w-3 h-3" /> Supabase Auth
                </span>
              </div>

              {passwordError && (
                <div className="p-3 rounded-xl bg-status-danger/10 border border-status-danger/25 text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-status-danger flex-shrink-0" />
                  <span>{passwordError}</span>
                </div>
              )}

              {passwordStatus && (
                <div className="p-3 rounded-xl bg-status-success/10 border border-status-success/25 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-status-success flex-shrink-0" />
                  <span>{passwordStatus}</span>
                </div>
              )}

              <form onSubmit={handleUpdatePassword} className="space-y-4 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary uppercase tracking-wider mb-1.5">
                      Nova Senha
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        required
                        className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/[0.04] border border-line-subtle text-ink-primary text-xs placeholder:text-ink-secondary/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer"
                        tabIndex={-1}
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary uppercase tracking-wider mb-1.5">
                      Confirmar Nova Senha
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-secondary" />
                      <input
                        type={showNewPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a nova senha"
                        required
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-line-subtle text-ink-primary text-xs placeholder:text-ink-secondary/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    disabled={isUpdatingPassword}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-accent/20 transition-all cursor-pointer"
                  >
                    {isUpdatingPassword ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Atualizando...</span>
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-3.5 h-3.5" />
                        <span>Atualizar Senha de Acesso</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 4. ABA INTELIGÊNCIA DE MARKETING */}
        {activeTab === 'marketing' && <MarketingSettingsTab />}

        {/* 5. ABA NOTIFICAÇÕES WEB PUSH */}
        {activeTab === 'notificacoes' && <NotificationsSettingsTab />}
      </div>
    </div>
  );
};

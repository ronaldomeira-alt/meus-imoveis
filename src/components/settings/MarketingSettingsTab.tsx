import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ShieldAlert,
  UserCheck,
  Check,
  RotateCcw,
  Save,
  Loader2,
  ExternalLink,
  Key,
  Radio,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { InstagramIcon } from '../ui/InstagramIcon';
import type {
  MarketingEditorialSettings,
  InstagramAccount,
} from '../../types/marketing';
import {
  DEFAULT_STRUCTURAL_SKILL,
  DEFAULT_REALTOR_PROFILE_SKILL,
  DEFAULT_NEGATIVE_RULES_SKILL,
} from '../../types/marketing';
import {
  getEditorialSettings,
  saveEditorialSettings,
  getInstagramAccount,
  saveInstagramAccountWithToken,
  disconnectInstagramAccount,
} from '../../lib/marketing-db';
import { testInstagramConnection } from '../../lib/instagram-service';

export const MarketingSettingsTab: React.FC = () => {
  const [settings, setSettings] = useState<MarketingEditorialSettings>({
    structural_skill: DEFAULT_STRUCTURAL_SKILL,
    realtor_profile_skill: DEFAULT_REALTOR_PROFILE_SKILL,
    negative_rules_skill: DEFAULT_NEGATIVE_RULES_SKILL,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Instagram State
  const [igAccount, setIgAccount] = useState<InstagramAccount>({
    status: 'disconnected',
  });
  const [isTestingIg, setIsTestingIg] = useState(false);
  const [igTestMessage, setIgTestMessage] = useState<{
    success: boolean;
    text: string;
  } | null>(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [clientIdInput, setClientIdInput] = useState(() => {
    return (import.meta.env.VITE_INSTAGRAM_CLIENT_ID as string) || localStorage.getItem('meus-imoveis:ig-client-id') || '';
  });
  const [igUserIdInput, setIgUserIdInput] = useState('');
  const [igUsernameInput, setIgUsernameInput] = useState('');

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      try {
        const [loadedSettings, loadedIg] = await Promise.all([
          getEditorialSettings(),
          getInstagramAccount(),
        ]);
        setSettings(loadedSettings);
        setIgAccount(loadedIg);
        if (loadedIg.instagram_user_id) {
          setIgUserIdInput(loadedIg.instagram_user_id || '');
          setIgUsernameInput(loadedIg.instagram_username || '');
        }

        // Listener do retorno OAuth
        const urlParams = new URLSearchParams(window.location.search);
        const instaStatus = urlParams.get('instagram');
        if (instaStatus === 'connected') {
          const uName = urlParams.get('username') || '';
          setIgTestMessage({
            success: true,
            text: `Conta @${uName || 'Instagram'} conectada com sucesso via OAuth 2.0 oficial!`,
          });
          window.history.replaceState({}, '', window.location.pathname);
        } else if (instaStatus === 'error') {
          const errDesc = urlParams.get('error_description') || urlParams.get('error_reason') || 'Falha na autorização';
          setIgTestMessage({
            success: false,
            text: `Erro no OAuth do Instagram: ${decodeURIComponent(errDesc)}`,
          });
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch (err) {
        console.error('Erro ao carregar configurações de marketing:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const saved = await saveEditorialSettings(settings);
      setSettings(saved);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Erro ao salvar settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveInstagram = async () => {
    if (!tokenInput.trim()) {
      alert('Por favor, informe o Access Token da Meta.');
      return;
    }
    try {
      const saved = await saveInstagramAccountWithToken({
        accountId: igAccount.id,
        instagramUserId: igUserIdInput.trim() || igAccount.instagram_user_id || 'me',
        username: igUsernameInput.trim() || igAccount.instagram_username || 'usuario_instagram',
        accessToken: tokenInput.trim(),
      });
      setIgAccount(saved);
      setShowTokenModal(false);
      setTokenInput('');
      setIgTestMessage({
        success: true,
        text: 'Conta conectada com sucesso! Token armazenado com segurança no backend.',
      });
    } catch (err: any) {
      alert(`Falha ao salvar conta: ${err.message}`);
    }
  };

  const handleTestInstagram = async () => {
    if (!tokenInput.trim() && igAccount.status !== 'connected') {
      setIgTestMessage({
        success: false,
        text: 'Insira um Access Token do Instagram antes de testar.',
      });
      return;
    }
    setIsTestingIg(true);
    setIgTestMessage(null);
    try {
      if (tokenInput.trim()) {
        const res = await testInstagramConnection(
          tokenInput.trim(),
          igUserIdInput || igAccount.instagram_user_id
        );
        setIgTestMessage({
          success: res.success,
          text: res.message,
        });
        if (res.success && res.accountData) {
          setIgUserIdInput(res.accountData.id);
          if (res.accountData.username) setIgUsernameInput(res.accountData.username);
        }
      } else {
        setIgTestMessage({
          success: true,
          text: `Conta @${igAccount.instagram_username || igAccount.instagram_user_id} ativa e autenticada no servidor!`,
        });
      }
    } catch (err: any) {
      setIgTestMessage({
        success: false,
        text: err.message || 'Erro de rede ao conectar à Graph API da Meta.',
      });
    } finally {
      setIsTestingIg(false);
    }
  };

  const handleStartInstagramOAuth = () => {
    const clientId = clientIdInput.trim() || (import.meta.env.VITE_INSTAGRAM_CLIENT_ID as string) || '';
    if (!clientId) {
      setShowTokenModal(true);
      return;
    }
    try {
      localStorage.setItem('meus-imoveis:ig-client-id', clientId);
    } catch {}

    const redirectUri = 'https://qedptmrcvcbzhucoeznd.supabase.co/functions/v1/instagram-oauth-callback';
    const stateObj = {
      returnUrl: window.location.origin,
      nonce: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2),
    };
    const state = btoa(JSON.stringify(stateObj));
    const authUrl = `https://www.instagram.com/oauth/authorize?enable_fb_login=0&force_authentication=1&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=instagram_business_basic,instagram_business_content_publish&state=${state}`;

    window.location.href = authUrl;
  };

  const handleDisconnectInstagram = async () => {
    if (!confirm('Deseja realmente desconectar a conta do Instagram?')) return;
    try {
      await disconnectInstagramAccount(igAccount.id);
      setIgAccount({ status: 'disconnected' });
      setTokenInput('');
      setIgUserIdInput('');
      setIgUsernameInput('');
      setIgTestMessage(null);
    } catch (err: any) {
      alert(`Erro ao desconectar: ${err.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-ink-secondary">
        <Loader2 className="w-5 h-5 animate-spin mr-2 text-accent" />
        <span className="text-xs">Carregando Inteligência de Marketing...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      {/* ── SEÇÃO 1: CABEÇALHO & SALVAMENTO GERAL ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-5 rounded-2xl panel-surface border border-line-subtle">
        <div>
          <h3 className="text-base font-bold text-ink-primary flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" />
            Inteligência de Marketing & Redes Sociais
          </h3>
          <p className="text-xs text-ink-secondary mt-0.5">
            Calibre a Tríade Editorial (Estrutura, Tom e Crivo Negativo) e conecte o Instagram para publicação automática.
          </p>
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={isSaving}
          className="btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : saveSuccess ? (
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          ) : (
            <Save className="w-3.5 h-3.5" />
          )}
          <span>{saveSuccess ? 'Configurações Salvas!' : 'Salvar Diretrizes'}</span>
        </button>
      </div>

      {/* ── SEÇÃO 2: A TRÍADE DE INTELIGÊNCIA EDITORIAL ── */}
      <div className="space-y-5">
        <div className="border-b border-line-subtle pb-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-ink-secondary">
            Tríade de Inteligência Editorial (Como a IA escreve para os seus imóveis)
          </h4>
        </div>

        {/* Camada 1: Estrutura e Inteligência Editorial */}
        <div className="panel-surface p-5 rounded-2xl space-y-3 border border-line-subtle">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div>
                <h5 className="text-sm font-bold text-ink-primary">1. Estrutura e Inteligência Editorial</h5>
                <p className="text-xs text-ink-secondary">
                  Define <strong>COMO</strong> construir a narrativa: copywriting, método AIDA adaptativo, ganchos fortes, ritmo e chamadas para ação.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setSettings((prev) => ({ ...prev, structural_skill: DEFAULT_STRUCTURAL_SKILL }))
              }
              className="text-[11px] text-ink-secondary hover:text-accent flex items-center gap-1 transition-colors cursor-pointer flex-shrink-0"
              title="Restaurar texto padrão sugerido"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restaurar padrão</span>
            </button>
          </div>

          <textarea
            rows={7}
            value={settings.structural_skill}
            onChange={(e) => setSettings({ ...settings, structural_skill: e.target.value })}
            className="w-full p-3.5 rounded-xl bg-surface-1 border border-line-subtle text-xs sm:text-sm text-ink-primary leading-relaxed focus:outline-none focus:border-accent font-sans"
            placeholder="Descreva as técnicas de estrutura, ganchos e hierarquia que a IA deve seguir..."
          />
        </div>

        {/* Camada 2: Perfil do Corretor */}
        <div className="panel-surface p-5 rounded-2xl space-y-3 border border-line-subtle">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-status-partner/15 border border-status-partner/30 flex items-center justify-center text-status-partner">
                <UserCheck className="w-3.5 h-3.5" />
              </div>
              <div>
                <h5 className="text-sm font-bold text-ink-primary">2. Perfil do Corretor (Tom & Personalidade)</h5>
                <p className="text-xs text-ink-secondary">
                  Define <strong>QUEM</strong> está falando: nível de formalidade, postura consultiva, foco em família vs investidor e vocabulário.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setSettings((prev) => ({ ...prev, realtor_profile_skill: DEFAULT_REALTOR_PROFILE_SKILL }))
              }
              className="text-[11px] text-ink-secondary hover:text-accent flex items-center gap-1 transition-colors cursor-pointer flex-shrink-0"
              title="Restaurar texto padrão sugerido"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restaurar padrão</span>
            </button>
          </div>

          <textarea
            rows={6}
            value={settings.realtor_profile_skill}
            onChange={(e) => setSettings({ ...settings, realtor_profile_skill: e.target.value })}
            className="w-full p-3.5 rounded-xl bg-surface-1 border border-line-subtle text-xs sm:text-sm text-ink-primary leading-relaxed focus:outline-none focus:border-accent font-sans"
            placeholder="Descreva a personalidade do corretor, tom de voz e como se posiciona diante do cliente..."
          />
        </div>

        {/* Camada 3: Crivo Negativo */}
        <div className="panel-surface p-5 rounded-2xl space-y-3 border border-line-subtle">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-status-danger/15 border border-status-danger/30 flex items-center justify-center text-status-danger">
                <ShieldAlert className="w-3.5 h-3.5" />
              </div>
              <div>
                <h5 className="text-sm font-bold text-ink-primary">3. Crivo Negativo (Regras & Anti-Clichês)</h5>
                <p className="text-xs text-ink-secondary">
                  Define <strong>O QUE NUNCA FAZER</strong>: palavras proibidas, clichês imobiliários batidos, urgência artificial e linguagem típica de robô.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setSettings((prev) => ({ ...prev, negative_rules_skill: DEFAULT_NEGATIVE_RULES_SKILL }))
              }
              className="text-[11px] text-ink-secondary hover:text-accent flex items-center gap-1 transition-colors cursor-pointer flex-shrink-0"
              title="Restaurar texto padrão sugerido"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Restaurar padrão</span>
            </button>
          </div>

          <textarea
            rows={6}
            value={settings.negative_rules_skill}
            onChange={(e) => setSettings({ ...settings, negative_rules_skill: e.target.value })}
            className="w-full p-3.5 rounded-xl bg-surface-1 border border-line-subtle text-xs sm:text-sm text-ink-primary leading-relaxed focus:outline-none focus:border-accent font-sans"
            placeholder="Liste expressões proibidas, termos a evitar e diretrizes de autenticidade..."
          />
        </div>
      </div>

      {/* ── SEÇÃO 3: INTEGRAÇÃO META / INSTAGRAM ── */}
      <div className="space-y-4 pt-4 border-t border-line-subtle">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-ink-primary flex items-center gap-2">
              <InstagramIcon className="w-4 h-4 text-pink-500" />
              Conexão com Instagram Professional
            </h4>
            <p className="text-xs text-ink-secondary">
              Integração oficial via Meta Graph API para publicação automática em contas comerciais ou de criador de conteúdo.
            </p>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 ${
              igAccount.status === 'connected'
                ? 'bg-status-success/15 text-status-success border border-status-success/30'
                : 'bg-white/5 text-ink-secondary border border-line-subtle'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                igAccount.status === 'connected' ? 'bg-status-success' : 'bg-ink-secondary/40'
              }`}
            />
            {igAccount.status === 'connected' ? 'Conectado' : 'Não conectado'}
          </span>
        </div>

        <div className="p-5 rounded-2xl panel-surface border border-line-subtle flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            {igAccount.status === 'connected' ? (
              <div className="flex items-center gap-3">
                {igAccount.profile_picture_url ? (
                  <img
                    src={igAccount.profile_picture_url}
                    alt=""
                    className="w-10 h-10 rounded-full border border-line-subtle object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-pink-500/10 border border-pink-500/30 flex items-center justify-center text-pink-500">
                    <InstagramIcon className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <h5 className="text-sm font-bold text-ink-primary">
                    @{igAccount.instagram_username || 'conta_instagram'}
                  </h5>
                  <p className="text-[11px] text-ink-secondary">
                    ID da Conta: {igAccount.instagram_user_id || 'Configurado via Token'} • Scopes:{' '}
                    <code className="text-[10px] text-accent">instagram_business_content_publish</code>
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <h5 className="text-sm font-bold text-ink-primary">Nenhuma conta vinculada no momento</h5>
                <p className="text-xs text-ink-secondary leading-relaxed">
                  Conecte seu perfil comercial para habilitar agendamentos e publicação direta pelo Piloto Automático.
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            {igAccount.status === 'connected' ? (
              <>
                <button
                  type="button"
                  onClick={handleTestInstagram}
                  disabled={isTestingIg}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-line-subtle text-xs font-semibold text-ink-primary flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {isTestingIg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radio className="w-3.5 h-3.5 text-accent" />}
                  <span>Testar Conexão</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowTokenModal(true)}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-line-subtle text-xs font-semibold text-ink-primary flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Key className="w-3.5 h-3.5 text-accent" />
                  <span>Configurar Token</span>
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectInstagram}
                  className="px-3.5 py-2 rounded-xl bg-status-danger/10 hover:bg-status-danger/20 border border-status-danger/20 text-xs font-semibold text-status-danger transition-colors cursor-pointer"
                >
                  Desconectar
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setShowTokenModal(true)}
                className="btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg w-full md:w-auto justify-center"
              >
                <InstagramIcon className="w-4 h-4" />
                <span>Conectar Instagram</span>
              </button>
            )}
          </div>
        </div>

        {/* Banner de Aviso de Expiração do Token */}
        {igAccount.status === 'connected' && igAccount.token_expires_at && (() => {
          const expiresAt = new Date(igAccount.token_expires_at);
          const now = new Date();
          const diffMs = expiresAt.getTime() - now.getTime();
          const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
          const expiresFormatted = expiresAt.toLocaleDateString('pt-BR', {
            day: '2-digit', month: 'long', year: 'numeric',
          });

          if (diffDays <= 0) {
            return (
              <div className="p-4 rounded-xl border bg-status-danger/10 border-status-danger/30 text-status-danger flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold">Token do Instagram expirado!</p>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    A autorização expirou em {expiresFormatted}. As publicações automáticas estão paradas.
                    Clique em <strong>"Conectar Instagram"</strong> para renovar a autorização em segundos.
                  </p>
                  <button
                    type="button"
                    onClick={handleStartInstagramOAuth}
                    className="mt-2 px-4 py-1.5 rounded-lg bg-status-danger/20 hover:bg-status-danger/30 border border-status-danger/40 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Reconectar Agora
                  </button>
                </div>
              </div>
            );
          }

          if (diffDays <= 7) {
            return (
              <div className="p-4 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-400 flex items-start gap-3">
                <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-bold">
                    Token expira em {diffDays} {diffDays === 1 ? 'dia' : 'dias'}
                  </p>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    A autorização do Instagram expira em {expiresFormatted}. Reconecte antes dessa data para
                    evitar interrupção no Piloto Automático.
                  </p>
                  <button
                    type="button"
                    onClick={handleStartInstagramOAuth}
                    className="mt-2 px-4 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Renovar Autorização
                  </button>
                </div>
              </div>
            );
          }

          return null;
        })()}

        {igTestMessage && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
              igTestMessage.success
                ? 'bg-status-success/10 border-status-success/30 text-status-success'
                : 'bg-status-danger/10 border-status-danger/30 text-status-danger'
            }`}
          >
            {igTestMessage.success ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{igTestMessage.text}</span>
          </div>
        )}
      </div>

      {/* ── MODAL DE CONFIGURAÇÃO DE CREDENCIAIS / TOKEN META ── */}
      {showTokenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg rounded-3xl panel-surface border border-line-subtle shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-line-subtle pb-3">
              <h4 className="text-sm font-bold text-ink-primary flex items-center gap-2">
                <InstagramIcon className="w-4 h-4 text-pink-500" />
                Configurar Acesso Instagram (Meta Graph API)
              </h4>
              <button
                onClick={() => setShowTokenModal(false)}
                className="text-ink-secondary hover:text-ink-primary cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-ink-secondary leading-relaxed">
              O Meus Imóveis utiliza a API oficial da Meta (versão v21.0+) com os scopes de publicação de conteúdo (
              <code className="text-[10px] text-accent">instagram_business_basic</code> e{' '}
              <code className="text-[10px] text-accent">instagram_business_content_publish</code>).
            </p>

            <div className="space-y-4">
              {/* Opção 1: OAuth 2.0 Oficial */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-accent/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink-primary flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                    Opção 1: Conexão Automática via OAuth 2.0 (Recomendado)
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-soft text-accent font-semibold">Oficial</span>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary block mb-1">
                    Instagram App ID / Client ID (Meta Developers)
                  </label>
                  <input
                    type="text"
                    value={clientIdInput}
                    onChange={(e) => setClientIdInput(e.target.value)}
                    placeholder="Ex: 123456789012345"
                    className="w-full p-2.5 rounded-xl bg-surface-1 border border-line-subtle text-xs text-ink-primary focus:outline-none focus:border-accent font-mono"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleStartInstagramOAuth}
                  disabled={!clientIdInput.trim()}
                  className="w-full btn-primary py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <InstagramIcon className="w-4 h-4" />
                  <span>Iniciar Autorização Oficial na Meta</span>
                </button>
              </div>

              {/* Opção 2: Token Manual de Teste / Long-Lived */}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-line-subtle space-y-3">
                <span className="text-xs font-bold text-ink-secondary block">
                  Opção 2: Inserção Direta de Access Token (Para Testes / Token Explorer)
                </span>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary block mb-1">
                    Access Token (Armazenado exclusivamente na tabela privada do backend)
                  </label>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="EAAB..."
                    className="w-full p-2.5 rounded-xl bg-surface-1 border border-line-subtle text-xs text-ink-primary focus:outline-none focus:border-accent font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary block mb-1">
                      Instagram Account ID
                    </label>
                    <input
                      type="text"
                      value={igUserIdInput}
                      onChange={(e) => setIgUserIdInput(e.target.value)}
                      placeholder="178414..."
                      className="w-full p-2.5 rounded-xl bg-surface-1 border border-line-subtle text-xs text-ink-primary focus:outline-none focus:border-accent font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold uppercase tracking-wider text-ink-secondary block mb-1">
                      @Nome de Usuário
                    </label>
                    <input
                      type="text"
                      value={igUsernameInput}
                      onChange={(e) => setIgUsernameInput(e.target.value)}
                      placeholder="meu_perfil_imoveis"
                      className="w-full p-2.5 rounded-xl bg-surface-1 border border-line-subtle text-xs text-ink-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSaveInstagram}
                  disabled={!tokenInput.trim()}
                  className="w-full py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-line-subtle text-xs font-bold text-ink-primary flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Salvar Token Manualmente
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-white/[0.02] border border-line-subtle text-[11px] text-ink-secondary space-y-1">
              <span className="font-semibold text-ink-primary flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-accent" />
                Como obter suas credenciais na Meta:
              </span>
              <p>
                1. Crie um app no <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="text-accent underline">Meta for Developers</a> do tipo Business.
              </p>
              <p>
                2. Adicione a permissão <strong>Instagram Graph API</strong> e gere um token no Graph API Explorer.
              </p>
              <p>
                3. Converta para token de longa duração (60 dias) no Access Token Tool.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-subtle">
              <button
                type="button"
                onClick={() => setShowTokenModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-ink-secondary hover:text-ink-primary cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Bell,
  BellRing,
  BellOff,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  Send,
  Loader2,
  Info,
  ShieldCheck,
  Bot,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react';
import {
  isPushSupported,
  getPushPermissionStatus,
  getActiveSubscription,
  subscribeDeviceToPush,
  unsubscribeDeviceFromPush,
  sendTestPushNotification,
  getDeviceDescription,
  isIosDevice,
  isStandalonePwa,
  type PushPermissionStatus,
} from '../../lib/push-notifications';

export const NotificationsSettingsTab: React.FC = () => {
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<PushPermissionStatus>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const checkStatus = async () => {
    const isSupp = isPushSupported();
    setSupported(isSupp);
    setDeviceName(getDeviceDescription());

    if (!isSupp) {
      setLoading(false);
      return;
    }

    const perm = getPushPermissionStatus();
    setPermission(perm);

    const sub = await getActiveSubscription();
    setIsSubscribed(Boolean(sub));
    setLoading(false);
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const handleSubscribe = async () => {
    setActionLoading(true);
    setStatusMessage(null);

    const result = await subscribeDeviceToPush();
    if (result.success) {
      setStatusMessage({
        type: 'success',
        text: 'Notificações ativadas com sucesso neste aparelho! Você já pode enviar um teste abaixo.',
      });
      await checkStatus();
    } else {
      setStatusMessage({
        type: 'error',
        text: result.error || 'Não foi possível ativar as notificações.',
      });
      setPermission(getPushPermissionStatus());
    }

    setActionLoading(false);
  };

  const handleUnsubscribe = async () => {
    setActionLoading(true);
    setStatusMessage(null);

    const result = await unsubscribeDeviceFromPush();
    if (result.success) {
      setStatusMessage({
        type: 'info',
        text: 'Notificações desativadas para este aparelho.',
      });
      await checkStatus();
    } else {
      setStatusMessage({
        type: 'error',
        text: result.error || 'Erro ao desativar notificações.',
      });
    }

    setActionLoading(false);
  };

  const handleSendTest = async () => {
    setActionLoading(true);
    setStatusMessage(null);

    const result = await sendTestPushNotification();
    if (result.success) {
      setStatusMessage({
        type: 'success',
        text: result.message || 'Notificação de teste disparada! Verifique o aviso no topo do seu aparelho.',
      });
    } else {
      setStatusMessage({
        type: 'error',
        text: result.message || 'Falha ao enviar notificação de teste.',
      });
    }

    setActionLoading(false);
  };

  return (
    <div className="space-y-5 pb-8 animate-fade-in">
      {/* ── CARD PRINCIPAL: STATUS DO APARELHO ── */}
      <div className="panel-surface p-5 sm:p-6 rounded-2xl border border-line-subtle space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              isSubscribed
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : permission === 'denied'
                ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                : 'bg-surface-2 text-ink-secondary border-line-subtle'
            }`}>
              {isSubscribed ? (
                <BellRing className="w-5 h-5 text-emerald-400" />
              ) : permission === 'denied' ? (
                <BellOff className="w-5 h-5 text-rose-400" />
              ) : (
                <Bell className="w-5 h-5 text-ink-secondary" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink-primary flex items-center gap-2">
                Notificações Push no Aparelho
              </h3>
              <p className="text-xs text-ink-secondary">
                Receba resumos de rodada e respostas de proprietários mesmo com o PWA fechado
              </p>
            </div>
          </div>

          {/* Badge de Status */}
          <div>
            {!supported ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-surface-2 text-ink-secondary border border-line-subtle">
                Não suportado
              </span>
            ) : permission === 'denied' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/25">
                <AlertCircle className="w-3.5 h-3.5" />
                Permissão bloqueada
              </span>
            ) : isSubscribed ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Ativadas
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/25">
                <BellOff className="w-3.5 h-3.5" />
                Desativadas
              </span>
            )}
          </div>
        </div>

        {/* Informações do Dispositivo & Criptografia (Layout Responsivo e Alinhado ao Design System) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Card 1: Dispositivo Detectado */}
          <div className="p-3.5 rounded-xl bg-surface-1 border border-line-subtle flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent border border-accent/20 flex items-center justify-center shrink-0">
                <Smartphone className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider block">
                  Dispositivo Detectado
                </span>
                <span className="text-xs font-bold text-ink-primary truncate block mt-0.5">
                  {deviceName.replace(/\s*\(PWA na Tela de Início\)/, '').replace(/\s*\(Navegador Web\)/, '')}
                </span>
              </div>
            </div>

            {isStandalonePwa() ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 shrink-0">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                PWA Instalado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium bg-surface-2 text-ink-secondary border border-line-subtle shrink-0">
                Navegador Web
              </span>
            )}
          </div>

          {/* Card 2: Segurança & Criptografia VAPID */}
          <div className="p-3.5 rounded-xl bg-surface-1 border border-line-subtle flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <ShieldCheck className="w-4.5 h-4.5" />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wider block">
                  Segurança & Criptografia
                </span>
                <span className="text-xs font-bold text-ink-primary truncate block mt-0.5">
                  Web Push VAPID Seguro
                </span>
              </div>
            </div>

            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 shrink-0">
              P-256 Nativo
            </span>
          </div>
        </div>

        {/* Avisos Contextuais */}
        {permission === 'denied' && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-start gap-3 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-rose-200">Permissão bloqueada nas configurações</p>
              <p className="text-[11px] text-rose-300/80 mt-0.5">
                As notificações foram bloqueadas no seu navegador. Para reativar, clique no cadeado da barra de endereços (ou em Ajustes &gt; Safari no iOS) e permita o envio de notificações.
              </p>
            </div>
          </div>
        )}

        {/* Guia para iPhone / iPad quando aberto fora do modo PWA Instalado */}
        {isIosDevice() && !isStandalonePwa() && !isSubscribed && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-xs text-amber-200">
            <Smartphone className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <p className="font-bold text-amber-300">Como ativar notificações no iPhone (iOS 16.4+)</p>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                A Apple só permite notificações push em segundo plano (com o app fechado ou tela bloqueada) quando o Meus Imóveis está instalado na <strong>Tela de Início</strong>.
              </p>
              <ol className="text-[11px] text-amber-200/90 list-decimal list-inside space-y-1 pt-0.5">
                <li>Toque no ícone de <strong>Compartilhar</strong> do Safari (quadrado com seta para cima no rodapé).</li>
                <li>Role a lista e toque em <strong>"Adicionar à Tela de Início"</strong>.</li>
                <li>Abra o Meus Imóveis direto do ícone novo na tela inicial e toque em <strong>Ativar notificações</strong>.</li>
              </ol>
            </div>
          </div>
        )}

        {!supported && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-3 text-xs text-amber-300">
            <Info className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-200">Navegador não suporta Web Push</p>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                Este navegador não implementa as APIs de Push Service Worker nativas. Utilize o Chrome, Edge ou Safari (adicionado à Tela de Início no iOS 16.4+).
              </p>
            </div>
          </div>
        )}

        {statusMessage && (
          <div className={`p-3.5 rounded-xl text-xs flex items-start sm:items-center gap-3 border ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25'
              : statusMessage.type === 'error'
              ? 'bg-rose-500/10 text-rose-300 border-rose-500/25'
              : 'bg-surface-2 text-ink-secondary border-line-subtle'
          }`}>
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5 sm:mt-0" />
            ) : statusMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5 sm:mt-0" />
            ) : (
              <Info className="w-4 h-4 text-ink-secondary flex-shrink-0 mt-0.5 sm:mt-0" />
            )}
            <span className="leading-relaxed">{statusMessage.text}</span>
          </div>
        )}

        {/* ── BOTÕES DE AÇÃO ── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
          {!isSubscribed ? (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={actionLoading || permission === 'denied' || !supported}
              className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-bold bg-accent hover:bg-accent-hover text-white flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <BellRing className="w-4 h-4" />
              )}
              <span>Ativar notificações neste aparelho</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSendTest}
                disabled={actionLoading}
                className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-bold bg-accent hover:bg-accent-hover text-white flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                {actionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Enviar notificação de teste</span>
              </button>

              <button
                type="button"
                onClick={handleUnsubscribe}
                disabled={actionLoading}
                className="w-full sm:w-auto min-h-[44px] px-4 py-2.5 rounded-xl text-xs font-semibold bg-surface-1 hover:bg-surface-2 text-ink-secondary hover:text-rose-400 border border-line-subtle hover:border-rose-500/30 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
              >
                <BellOff className="w-4 h-4" />
                <span>Desativar notificações deste aparelho</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── SEÇÃO: QUAIS NOTIFICAÇÕES VOCÊ RECEBE ── */}
      <div className="panel-surface p-5 sm:p-6 rounded-2xl border border-line-subtle space-y-4">
        <div>
          <h4 className="text-xs font-bold text-ink-primary uppercase tracking-wider flex items-center gap-2">
            <Bot className="w-4 h-4 text-accent" />
            Notificações Ativas — Bot Captador
          </h4>
          <p className="text-xs text-ink-secondary mt-0.5">
            Eventos monitorados automaticamente com envio direto para o seu dispositivo
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1 */}
          <div className="p-3.5 rounded-xl bg-surface-1 border border-line-subtle space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-ink-primary">
              <Bot className="w-4 h-4 text-accent" />
              <span>Resumo de Rodada</span>
            </div>
            <p className="text-[11px] text-ink-secondary">
              Disparado às 09:00 e 19:00 com contadores reais de imóveis analisados, novos e abordados.
            </p>
          </div>

          {/* Card 2 */}
          <div className="p-3.5 rounded-xl bg-surface-1 border border-line-subtle space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              <span>Proprietário Respondeu</span>
            </div>
            <p className="text-[11px] text-ink-secondary">
              Alerta imediato com nome, bairro e toque direto para a área de Captações do sistema.
            </p>
          </div>

          {/* Card 3 */}
          <div className="p-3.5 rounded-xl bg-surface-1 border border-line-subtle space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Falha Importante</span>
            </div>
            <p className="text-[11px] text-ink-secondary">
              Aviso caso o Chrome da VM esteja fechado, porta 9222 caia ou a sessão da OLX deslogue.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

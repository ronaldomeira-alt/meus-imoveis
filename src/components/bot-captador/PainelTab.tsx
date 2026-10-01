import React, { useState } from 'react';
import {
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Send,
  MessageSquare,
  Building,
  RotateCcw,
  Sparkles,
  Loader2,
  Calendar,
  Layers,
} from 'lucide-react';
import type {
  BotSettings,
  BotDashboardMetrics,
  BotExecutionRound,
} from '../../types/bot-captador';
import { CaptureTrendChart } from './CaptureTrendChart';

interface PainelTabProps {
  settings: BotSettings | null;
  metrics: BotDashboardMetrics;
  rounds: BotExecutionRound[];
  period: 7 | 30 | 90;
  onPeriodChange: (p: 7 | 30 | 90) => void;
  onToggleBotActive: (active: boolean) => Promise<void>;
  onRunNow: () => Promise<void>;
  onOpenSimulation: () => void;
  isRunningNow: boolean;
}

export const PainelTab: React.FC<PainelTabProps> = ({
  settings,
  metrics,
  rounds,
  period,
  onPeriodChange,
  onToggleBotActive,
  onRunNow,
  onOpenSimulation,
  isRunningNow,
}) => {
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  const isActive = Boolean(settings?.is_active);
  const healthStatus = settings?.health_status || (isActive ? 'active' : 'paused');

  const handleToggleClick = async () => {
    if (isActive) {
      setShowPauseConfirm(true);
    } else {
      setIsToggling(true);
      try {
        await onToggleBotActive(true);
      } finally {
        setIsToggling(false);
      }
    }
  };

  const confirmPause = async () => {
    setIsToggling(true);
    setShowPauseConfirm(false);
    try {
      await onToggleBotActive(false);
    } finally {
      setIsToggling(false);
    }
  };

  const formatDateTime = (iso?: string | null) => {
    if (!iso) return 'Nenhuma rodada realizada';
    try {
      const date = new Date(iso);
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-5 animate-fade-in pb-12">
      {/* ── Bloco Superior: Saúde do Bot & Botão Mestre ── */}
      <div className="panel-surface rounded-2xl p-4 sm:p-5 border border-line-subtle flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 border ${
              healthStatus === 'active'
                ? 'bg-status-success/15 border-status-success/30 text-status-success'
                : healthStatus === 'attention' || healthStatus === 'error'
                ? 'bg-status-warning/15 border-status-warning/30 text-status-warning'
                : 'bg-white/[0.04] border-line-subtle text-ink-secondary'
            }`}
          >
            {healthStatus === 'active' ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : healthStatus === 'attention' || healthStatus === 'error' ? (
              <AlertTriangle className="w-5 h-5" />
            ) : (
              <Pause className="w-5 h-5" />
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm sm:text-base font-bold text-ink-primary">
                BOT CAPTADOR
              </h2>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {isActive ? 'Ativo' : 'Pausado'}
              </span>
            </div>

            <p className="text-xs text-ink-secondary mt-0.5">
              Última rodada: <span className="font-medium text-ink-primary">{formatDateTime(settings?.last_round_at)}</span>
              {isActive && settings?.next_round_at && (
                <> · Próxima rodada: <span className="font-medium text-ink-primary">{formatDateTime(settings.next_round_at)}</span></>
              )}
            </p>

            {settings?.last_round_summary && (
              <p className="text-[11px] text-ink-muted mt-0.5">
                Resultado: {settings.last_round_summary}
              </p>
            )}
          </div>
        </div>

        {/* Botões de Ação do Topo */}
        <div className="flex flex-wrap items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-line-subtle">
          <button
            type="button"
            onClick={onOpenSimulation}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/[0.04] hover:bg-white/[0.08] text-ink-secondary hover:text-ink-primary border border-line-subtle flex items-center gap-1.5 transition-all"
            title="Valida os filtros comerciais cadastrados com dados simulados (Zero Mensagens)"
          >
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            Testar Filtros
          </button>

          <button
            type="button"
            onClick={onRunNow}
            disabled={isRunningNow || isToggling}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-surface-1 hover:bg-surface-2 text-ink-primary border border-line-subtle flex items-center gap-1.5 transition-all disabled:opacity-50"
            title="Dispara rodada em Modo Seguro: Envio Real Bloqueado nesta versão (real_sending_enabled = false)"
          >
            {isRunningNow ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5 text-accent" />
            )}
            Rodar Agora
          </button>

          <button
            type="button"
            onClick={handleToggleClick}
            disabled={isToggling || isRunningNow}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 ${
              isActive
                ? 'bg-status-danger/15 hover:bg-status-danger/25 text-status-danger border border-status-danger/30'
                : 'bg-accent hover:bg-accent-hover text-white'
            }`}
          >
            {isToggling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isActive ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            {isActive ? 'Pausar Bot Captador' : 'Ativar Bot Captador'}
          </button>
        </div>
      </div>

      {/* ── 4 Cards de Métricas Operacionais ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Abordagens */}
        <div className="panel-surface rounded-2xl p-4 border border-line-subtle">
          <div className="flex items-center justify-between text-ink-secondary mb-2">
            <span className="text-xs font-semibold">Abordagens</span>
            <Send className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-extrabold text-ink-primary tracking-tight">
            {metrics.totalContacted}
          </p>
          <p className="text-[11px] text-ink-secondary mt-1">
            Únicas no período ({period}d)
          </p>
        </div>

        {/* Respostas */}
        <div className="panel-surface rounded-2xl p-4 border border-line-subtle">
          <div className="flex items-center justify-between text-ink-secondary mb-2">
            <span className="text-xs font-semibold">Respostas</span>
            <MessageSquare className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-extrabold text-ink-primary tracking-tight">
            {metrics.totalResponded}
          </p>
          <p className="text-[11px] text-emerald-400 font-medium mt-1">
            {metrics.responseRate.toFixed(1)}% taxa de resposta
          </p>
        </div>

        {/* Imóveis Importados (Conversão Confirmada) */}
        <div className="panel-surface rounded-2xl p-4 border border-line-subtle">
          <div className="flex items-center justify-between text-ink-secondary mb-2">
            <span className="text-xs font-semibold">Importados</span>
            <Building className="w-4 h-4 text-accent" />
          </div>
          <p className="text-2xl font-extrabold text-ink-primary tracking-tight">
            {metrics.totalImported}
          </p>
          <p className="text-[11px] text-accent font-medium mt-1">
            {metrics.conversionRate.toFixed(1)}% de conversão
          </p>
        </div>

        {/* Na Fila / Aguardando */}
        <div className="panel-surface rounded-2xl p-4 border border-line-subtle">
          <div className="flex items-center justify-between text-ink-secondary mb-2">
            <span className="text-xs font-semibold">Aguardando</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-extrabold text-ink-primary tracking-tight">
            {metrics.waitingCount}
          </p>
          <p className="text-[11px] text-ink-secondary mt-1">
            Respostas pendentes
          </p>
        </div>
      </div>

      {/* ── Gráfico de Linha Operacional ── */}
      <CaptureTrendChart
        data={metrics.trendSeries}
        period={period}
        onPeriodChange={onPeriodChange}
      />

      {/* ── Histórico das Últimas Rodadas ── */}
      <div className="panel-surface rounded-2xl p-4 sm:p-5 border border-line-subtle">
        <div className="flex items-center justify-between mb-3.5">
          <div>
            <h3 className="text-sm font-bold text-ink-primary">Histórico das Rodadas</h3>
            <p className="text-[11px] text-ink-secondary">
              Auditoria de execução, volume de anúncios analisados e abordagens
            </p>
          </div>
          <span className="text-[10px] text-ink-muted uppercase font-bold tracking-wider">
            Últimas {rounds.length}
          </span>
        </div>

        {rounds.length === 0 ? (
          <div className="py-8 text-center text-ink-secondary text-xs">
            Seu Bot Captador ainda não realizou nenhuma rodada de prospecção.
          </div>
        ) : (
          <div className="space-y-2 overflow-x-auto">
            {rounds.map((round) => (
              <div
                key={round.id}
                className="p-3 rounded-xl bg-surface-1 border border-line-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      round.status === 'COMPLETED'
                        ? 'bg-status-success'
                        : round.status === 'FAILED'
                        ? 'bg-status-danger'
                        : 'bg-amber-400'
                    }`}
                  />
                  <div>
                    <span className="font-semibold text-ink-primary">
                      {formatDateTime(round.started_at)}
                    </span>
                    <span className="text-ink-secondary text-[11px] ml-2">
                      · {round.trigger_type === 'SIMULATION' ? 'Simulação' : round.trigger_type === 'MANUAL' ? 'Manual' : 'Agendada'}
                      {round.campaign_type !== 'both' && ` (${round.campaign_type})`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[11px] text-ink-secondary">
                  <span>{round.analyzed_count} analisados</span>
                  <span>{round.eligible_count} elegíveis</span>
                  <span className="font-semibold text-ink-primary">
                    {round.contacted_count} abordados
                  </span>
                  {round.error_count > 0 && (
                    <span className="text-status-danger font-semibold">
                      {round.error_count} erros
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Confirmação Cirúrgico ao Pausar */}
      {showPauseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 animate-fade-in">
          <div className="modal-surface rounded-2xl max-w-sm w-full p-5 border border-line-strong shadow-modal animate-scale-in space-y-4">
            <div className="flex items-center gap-3 text-status-warning">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <h3 className="text-sm font-bold text-ink-primary">Pausar Bot Captador?</h3>
            </div>
            <p className="text-xs text-ink-secondary leading-relaxed">
              Enquanto pausado, nenhuma nova abordagem será realizada. A fila existente e os tombstones de proteção continuam preservados.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPauseConfirm(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmPause}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-status-danger hover:bg-status-danger/90 text-white"
              >
                Sim, Pausar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  ListFilter,
  Sliders,
  Sparkles,
  Loader2,
  X,
  CheckCircle2,
  AlertTriangle,
  Building,
} from 'lucide-react';
import type {
  BotSettings,
  BotCampaign,
  BotMessageTemplate,
  BotCapture,
  BotExecutionRound,
  BotDashboardMetrics,
  DiscoveredAdCandidate,
} from '../../types/bot-captador';
import {
  getBotSettings,
  updateBotSettings,
  getBotCampaigns,
  saveBotCampaign,
  getBotMessageTemplates,
  createBotMessageTemplate,
  updateBotMessageTemplate,
  deleteBotMessageTemplate,
  getBotCaptures,
  updateBotCaptureStatus,
  getBotDashboardMetrics,
  getBotExecutionRounds,
} from '../../lib/bot-captador/database';
import { runBotRound, RoundExecutionReport } from '../../lib/bot-captador/runner';
import { PainelTab } from './PainelTab';
import { CaptacoesTab } from './CaptacoesTab';
import { ConfiguracoesTab } from './ConfiguracoesTab';

type MainSectionTab = 'painel' | 'captacoes' | 'configuracoes';

interface BotCaptadorViewProps {
  onNavigateToAddProperty: (url: string, captureId?: string) => void;
}

export const BotCaptadorView: React.FC<BotCaptadorViewProps> = ({
  onNavigateToAddProperty,
}) => {
  const [activeTab, setActiveTab] = useState<MainSectionTab>('painel');
  const [loading, setLoading] = useState(true);

  // Dados do sistema
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [campaigns, setCampaigns] = useState<BotCampaign[]>([]);
  const [templates, setTemplates] = useState<BotMessageTemplate[]>([]);
  const [captures, setCaptures] = useState<BotCapture[]>([]);
  const [rounds, setRounds] = useState<BotExecutionRound[]>([]);
  const [metricsPeriod, setMetricsPeriod] = useState<7 | 30 | 90>(30);
  const [metrics, setMetrics] = useState<BotDashboardMetrics>({
    totalContacted: 0,
    totalResponded: 0,
    totalImported: 0,
    responseRate: 0,
    conversionRate: 0,
    waitingCount: 0,
    archivedCount: 0,
    trendSeries: [],
  });

  // Estado da execução manual e simulação
  const [isRunningNow, setIsRunningNow] = useState(false);
  const [simulationReport, setSimulationReport] = useState<RoundExecutionReport | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const loadAllData = useCallback(async () => {
    try {
      const [
        fetchedSettings,
        fetchedCampaigns,
        fetchedTemplates,
        fetchedCaptures,
        fetchedRounds,
        fetchedMetrics,
      ] = await Promise.all([
        getBotSettings(),
        getBotCampaigns(),
        getBotMessageTemplates(),
        getBotCaptures({ limit: 100 }),
        getBotExecutionRounds(10),
        getBotDashboardMetrics(metricsPeriod),
      ]);

      setSettings(fetchedSettings);
      setCampaigns(fetchedCampaigns);
      setTemplates(fetchedTemplates);
      setCaptures(fetchedCaptures);
      setRounds(fetchedRounds);
      setMetrics(fetchedMetrics);
    } catch (err) {
      console.error('Erro ao carregar dados do Bot Captador:', err);
    } finally {
      setLoading(false);
    }
  }, [metricsPeriod]);

  useEffect(() => {
    void loadAllData();
  }, [loadAllData]);

  // Ações do Painel
  const handleToggleBotActive = async (active: boolean) => {
    const updated = await updateBotSettings({
      is_active: active,
      health_status: active ? 'active' : 'paused',
      health_reason: active ? null : 'Bot pausado pelo usuário',
    });
    if (updated) setSettings(updated);
  };

  const handleRunNow = async () => {
    setIsRunningNow(true);
    try {
      const report = await runBotRound({ triggerType: 'MANUAL', targetCampaignType: 'both' });
      alert(report.summaryMessage);
      await loadAllData();
    } catch (err: any) {
      alert(`Falha na execução: ${err?.message || 'Erro desconhecido'}`);
    } finally {
      setIsRunningNow(false);
    }
  };

  const handleRunSimulation = async () => {
    setIsSimulating(true);
    try {
      const report = await runBotRound({ triggerType: 'SIMULATION', targetCampaignType: 'both' });
      setSimulationReport(report);
    } catch (err: any) {
      alert(`Falha no teste de filtros: ${err?.message || 'Erro desconhecido'}`);
    } finally {
      setIsSimulating(false);
    }
  };

  // Ações de Captações
  const handleImportCapture = (capture: BotCapture) => {
    onNavigateToAddProperty(capture.url, capture.id);
  };

  const handleArchiveCapture = async (captureId: string) => {
    await updateBotCaptureStatus(captureId, 'ARCHIVED');
    setCaptures((prev) =>
      prev.map((c) => (c.id === captureId ? { ...c, status: 'ARCHIVED' } : c))
    );
  };

  const handleMarkAsResponded = async (captureId: string) => {
    await updateBotCaptureStatus(captureId, 'RESPONDED');
    setCaptures((prev) =>
      prev.map((c) => (c.id === captureId ? { ...c, status: 'RESPONDED' } : c))
    );
  };

  // Ações de Configuração
  const handleSaveCampaign = async (campaign: BotCampaign) => {
    const saved = await saveBotCampaign(campaign);
    if (saved) {
      setCampaigns((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
    }
  };

  const handleSaveSettings = async (updates: Partial<BotSettings>) => {
    const saved = await updateBotSettings(updates);
    if (saved) setSettings(saved);
  };

  const handleCreateTemplate = async (title: string, content: string) => {
    const created = await createBotMessageTemplate(title, content);
    if (created) setTemplates((prev) => [...prev, created]);
  };

  const handleUpdateTemplate = async (id: string, title: string, content: string) => {
    const updated = await updateBotMessageTemplate(id, title, content);
    if (updated) setTemplates((prev) => prev.map((t) => (t.id === id ? updated : t)));
  };

  const handleDeleteTemplate = async (id: string) => {
    await deleteBotMessageTemplate(id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-ink-secondary">
        <Loader2 className="w-8 h-8 animate-spin text-accent mb-3" />
        <p className="text-xs font-medium">Carregando módulo Bot Captador...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 space-y-5 min-w-0 overflow-x-hidden">
      {/* ── Topo do Módulo: Título e Subnavegação em Tabs ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line-subtle pb-4 min-w-0">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-ink-primary tracking-tight">
            Bot Captador
          </h1>
          <p className="text-xs text-ink-secondary mt-0.5">
            Prospecção autônoma de proprietários particulares com abordagem única e controle do corretor
          </p>
        </div>

        {/* 3 Tabs Principais do Módulo */}
        <div className="grid grid-cols-3 sm:flex items-center gap-1 p-1 rounded-xl bg-surface-1 border border-line-subtle text-xs w-full sm:w-auto shrink-0 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('painel')}
            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
              activeTab === 'painel'
                ? 'bg-accent text-white shadow-sm font-bold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 shrink-0" />
            <span>Painel</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('captacoes')}
            className={`flex items-center justify-center gap-1.5 px-2 sm:px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
              activeTab === 'captacoes'
                ? 'bg-accent text-white shadow-sm font-bold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5 shrink-0" />
            <span>Captações</span>
            {metrics.waitingCount > 0 && (
              <span
                className={`ml-0.5 inline-flex items-center justify-center px-1.5 py-0.5 min-w-[18px] text-[10px] font-bold rounded-full leading-none transition-colors ${
                  activeTab === 'captacoes'
                    ? 'bg-white/20 text-white'
                    : 'bg-amber-400/20 text-amber-300'
                }`}
              >
                {metrics.waitingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('configuracoes')}
            className={`flex items-center justify-center gap-1.5 px-2 sm:px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all duration-150 cursor-pointer ${
              activeTab === 'configuracoes'
                ? 'bg-accent text-white shadow-sm font-bold'
                : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 shrink-0" />
            <span>Configurações</span>
          </button>
        </div>
      </div>

      {/* ── Conteúdo das Seções ── */}
      {activeTab === 'painel' && (
        <PainelTab
          settings={settings}
          metrics={metrics}
          rounds={rounds}
          period={metricsPeriod}
          onPeriodChange={(p) => setMetricsPeriod(p)}
          onToggleBotActive={handleToggleBotActive}
          onRunNow={handleRunNow}
          onOpenSimulation={handleRunSimulation}
          isRunningNow={isRunningNow}
        />
      )}

      {activeTab === 'captacoes' && (
        <CaptacoesTab
          captures={captures}
          onImportCapture={handleImportCapture}
          onArchiveCapture={handleArchiveCapture}
          onMarkAsResponded={handleMarkAsResponded}
        />
      )}

      {activeTab === 'configuracoes' && (
        <ConfiguracoesTab
          settings={settings}
          campaigns={campaigns}
          templates={templates}
          onSaveCampaign={handleSaveCampaign}
          onSaveSettings={handleSaveSettings}
          onCreateTemplate={handleCreateTemplate}
          onUpdateTemplate={handleUpdateTemplate}
          onDeleteTemplate={handleDeleteTemplate}
        />
      )}

      {/* ── Modal do Modo de Simulação / Testar Filtros ── */}
      {simulationReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 animate-fade-in">
          <div className="modal-surface rounded-2xl max-w-2xl w-full p-5 border border-line-strong shadow-modal animate-scale-in space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-line-subtle">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-accent/15 text-accent border border-accent/25">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-ink-primary">Resultado do Teste de Filtros</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/25 uppercase">
                      Simulação
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-secondary">
                    Validação com dados simulados de referência · Zero mensagens enviadas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSimulationReport(null)}
                className="p-1 rounded-lg text-ink-secondary hover:text-ink-primary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Resumo da Simulação */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="p-3 rounded-xl bg-surface-1 border border-line-subtle">
                <span className="text-[10px] text-ink-secondary font-semibold uppercase">Analisados</span>
                <p className="text-xl font-extrabold text-ink-primary mt-0.5">{simulationReport.analyzedCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-surface-1 border border-line-subtle">
                <span className="text-[10px] text-ink-secondary font-semibold uppercase">Elegíveis</span>
                <p className="text-xl font-extrabold text-emerald-400 mt-0.5">{simulationReport.eligibleCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-surface-1 border border-line-subtle">
                <span className="text-[10px] text-ink-secondary font-semibold uppercase">Duplicados</span>
                <p className="text-xl font-extrabold text-amber-400 mt-0.5">{simulationReport.duplicateCount}</p>
              </div>
              <div className="p-3 rounded-xl bg-surface-1 border border-line-subtle">
                <span className="text-[10px] text-ink-secondary font-semibold uppercase">Envios</span>
                <p className="text-xl font-extrabold text-accent mt-0.5">0 (MODO TESTE)</p>
              </div>
            </div>

            {/* Lista dos Candidatos Encontrados */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <h4 className="text-xs font-bold text-ink-primary sticky top-0 bg-surface-base py-1">
                Candidatos Elegíveis Detectados:
              </h4>
              {simulationReport.discoveredCandidates?.map((cand, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-surface-1 border border-line-subtle text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-primary truncate">{cand.title}</p>
                    <p className="text-[11px] text-ink-secondary mt-0.5">
                      {cand.neighborhood} · {cand.price ? `R$ ${cand.price.toLocaleString('pt-BR')}` : 'Preço a consultar'}
                      {cand.bedrooms && ` · ${cand.bedrooms} quartos`}
                      {cand.areaM2 && ` · ${cand.areaM2}m²`}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 self-start sm:self-center">
                    <CheckCircle2 className="w-3 h-3" /> Particular Elegível
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-line-subtle flex justify-end">
              <button
                type="button"
                onClick={() => setSimulationReport(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-accent text-white"
              >
                Concluir Teste
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

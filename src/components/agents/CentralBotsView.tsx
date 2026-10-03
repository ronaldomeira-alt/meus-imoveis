import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowUp,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  List,
  Menu,
  Mic,
  Plus,
  RefreshCw,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react';
import {
  centralRequest,
  audioBase64,
  type AgentBot,
  type CentralData,
  type ConversationData,
} from '../../lib/central-bots';
import { AudioRecorder } from '../../lib/audio-recorder';
import { BotAvatar } from './BotAvatar';
import { CreateBotModal } from './CreateBotModal';
import './central-bots.css';

const date = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Ainda não registrado';
const errorText = (error: unknown) =>
  error instanceof Error && error.name !== 'AbortError'
    ? error.message
    : 'A consulta foi interrompida. Tente novamente.';
const labels: Record<string, string> = {
  running: 'Em andamento',
  completed: 'Concluído',
  failed: 'Falhou',
  chat: 'Conversa',
  schedule: 'Agendamento',
  inspection: 'Inspeção',
  approval: 'Aprovação',
  tool_completed: 'Consulta concluída',
  tool_failed: 'Consulta indisponível',
  incident_opened: 'Ocorrência detectada',
  incident_resolved: 'Ocorrência resolvida',
  analysis_completed: 'Análise concluída',
  inspection_completed: 'Inspeção concluída',
  approval_decided: 'Decisão registrada',
  bot_created: 'Bot criado',
  voice_transcribed: 'Áudio transcrito',
  push_attempted: 'Tentativa de notificação',
  push_failed: 'Notificação não enviada',
};
type Props = { onOpenMenu: () => void; onOpenCaptador: () => void };

export default function CentralBotsView({ onOpenMenu, onOpenCaptador }: Props) {
  const root = useRef<HTMLDivElement>(null),
    end = useRef<HTMLDivElement>(null),
    recorder = useRef<AudioRecorder | null>(null);
  const mounted = useRef(true),
    selectedRef = useRef(''),
    recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    busyRef = useRef(false);
  const [data, setData] = useState<CentralData | null>(null),
    [conversation, setConversation] = useState<ConversationData | null>(null);
  const [selected, setSelected] = useState(''),
    [tab, setTab] = useState(() =>
      new URLSearchParams(location.search).has('incident')
        ? 'incidents'
        : 'chat',
    ),
    [draft, setDraft] = useState('');
  const [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [recording, setRecording] = useState(false);
  const [drawer, setDrawer] = useState(false),
    [create, setCreate] = useState(false),
    [pendingText, setPendingText] = useState('');
  const bot = data?.bots.find((b) => b.id === selected);
  const approvals =
      data?.approvals.filter(
        (a) => a.bot_id === selected && a.status === 'pending',
      ) || [],
    incidents = data?.incidents.filter((i) => i.bot_id === selected) || [];
  const approvalHistory =
    data?.approvals.filter(
      (a) => a.bot_id === selected && a.status !== 'pending',
    ) || [];

  const refresh = useCallback(async () => {
    const result = await centralRequest<CentralData>({ action: 'list' });
    if (!mounted.current) return;
    setData(result);
    setSelected((current) =>
      result.bots.some((b) => b.id === current)
        ? current
        : (
            result.bots.find(
              (b) => b.slug === new URLSearchParams(location.search).get('bot'),
            ) || result.bots[0]
          )?.id || '',
    );
  }, []);
  const loadConversation = useCallback(
    async (id: string, signal?: AbortSignal) => {
      const result = await centralRequest<ConversationData>(
        { action: 'conversation', bot_id: id },
        signal,
      );
      if (mounted.current && selectedRef.current === id && !signal?.aborted)
        setConversation(result);
    },
    [],
  );
  useEffect(() => {
    mounted.current = true;
    refresh()
      .catch((e) => {
        if (mounted.current) setError(errorText(e));
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && !busyRef.current)
        refresh()
          .then(() =>
            selectedRef.current
              ? loadConversation(selectedRef.current)
              : undefined,
          )
          .catch(() => {});
    }, 60000);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      recorder.current?.cancel();
      if (recordingTimer.current) clearTimeout(recordingTimer.current);
    };
  }, [refresh, loadConversation]);
  useEffect(() => {
    selectedRef.current = selected;
    if (!selected) return;
    const controller = new AbortController();
    loadConversation(selected, controller.signal).catch((e) => {
      if (!controller.signal.aborted) setError(errorText(e));
    });
    return () => controller.abort();
  }, [selected, loadConversation]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () =>
      root.current?.style.setProperty(
        '--agent-height',
        `${viewport?.height || window.innerHeight}px`,
      );
    resize();
    viewport?.addEventListener('resize', resize);
    window.addEventListener('resize', resize);
    return () => {
      viewport?.removeEventListener('resize', resize);
      window.removeEventListener('resize', resize);
    };
  }, []);
  useEffect(() => {
    if (tab === 'chat') end.current?.scrollIntoView({ block: 'end' });
  }, [conversation?.messages.length, pendingText, tab]);
  useEffect(() => {
    const pop = () => {
      const match = data?.bots.find(
        (b) => b.slug === new URLSearchParams(location.search).get('bot'),
      );
      if (
        match &&
        !busyRef.current &&
        !recorder.current &&
        match.id !== selectedRef.current
      ) {
        setConversation(null);
        setDraft('');
        setError('');
        setSelected(match.id);
      }
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, [data]);

  function choose(next: AgentBot) {
    if (busy || recording) return;
    if (selectedRef.current !== next.id) {
      setConversation(null);
      setDraft('');
      setError('');
    }
    setSelected(next.id);
    setTab('chat');
    setDrawer(false);
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('bot', next.slug);
    history.replaceState(history.state, '', url);
  }
  async function action(body: Record<string, unknown>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      await centralRequest(body);
      await refresh();
      if (selectedRef.current) await loadConversation(selectedRef.current);
      return true;
    } catch (e) {
      if (mounted.current) setError(errorText(e));
      return false;
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busyRef.current || recording || !bot) return;
    const content = draft.trim();
    setDraft('');
    setPendingText(content);
    const sent = await action({
      action: 'chat',
      bot_id: bot.id,
      content,
      request_id: crypto.randomUUID(),
    });
    if (mounted.current) {
      setPendingText('');
      if (!sent) setDraft(content);
    }
  }
  async function stopRecording() {
    if (!recorder.current) return;
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    setRecording(false);
    busyRef.current = true;
    setBusy(true);
    try {
      const blob = await recorder.current.stop();
      const spoken = recorder.current.getSpokenText();
      if (blob.size > 2500000)
        throw new Error('Áudio acima de 2,5 MB. Grave uma mensagem menor.');
      const text =
        spoken ||
        (
          await centralRequest<{ text: string }>({
            action: 'transcribe',
            bot_id: selectedRef.current,
            mime: blob.type,
            audio: await audioBase64(blob),
          })
        ).text;
      if (mounted.current)
        setDraft((current) => `${current} ${text}`.trim().slice(0, 4000));
    } catch (e) {
      if (mounted.current) setError(errorText(e));
    } finally {
      recorder.current = null;
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function voice() {
    if (recording) return stopRecording();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    const next = new AudioRecorder();
    recorder.current = next;
    try {
      await next.start();
      if (!mounted.current) {
        next.cancel();
        return;
      }
      setRecording(true);
      recordingTimer.current = setTimeout(() => void stopRecording(), 90000);
    } catch (e) {
      next.cancel();
      recorder.current = null;
      if (mounted.current) setError(errorText(e));
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function cancelRecording() {
    recorder.current?.cancel();
    recorder.current = null;
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    setRecording(false);
  }
  async function downloadIncident(id: string) {
    try {
      const result = await centralRequest<{ dossier: unknown }>({
        action: 'incident',
        incident_id: id,
      });
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(result.dossier, null, 2)], {
          type: 'application/json',
        }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `dossie-${id}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(errorText(e));
    }
  }

  return (
    <div className="agent-workspace" ref={root}>
      {drawer && (
        <button
          className="agent-drawer-backdrop"
          aria-label="Fechar lista de bots"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        className={`agent-sidebar ${drawer ? 'is-open' : ''}`}
        aria-label="Meus bots"
      >
        <header>
          <button
            className="agent-icon agent-mobile"
            title="Menu principal"
            aria-label="Menu principal"
            onClick={onOpenMenu}
          >
            <Menu size={19} />
          </button>
          <h1>Central de Bots</h1>
          <button
            className="agent-icon agent-mobile"
            aria-label="Fechar lista"
            onClick={() => setDrawer(false)}
          >
            <X size={19} />
          </button>
        </header>
        <div className="agent-sidebar-heading">
          <span>MEUS BOTS</span>
          <button
            className="agent-icon"
            title="Adicionar bot"
            aria-label="Adicionar bot"
            disabled={!data || busy || recording}
            onClick={() => setCreate(true)}
          >
            <Plus size={18} />
          </button>
        </div>
        <nav>
          {data?.bots.map((item) => (
            <button
              key={item.id}
              className="agent-bot-item"
              aria-current={selected === item.id ? 'page' : undefined}
              disabled={busy || recording}
              onClick={() => choose(item)}
            >
              <BotAvatar name={item.avatar} />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {!item.active
                    ? 'Desativado'
                    : item.last_run?.status === 'running'
                      ? 'Consultando'
                      : item.kind === 'sentinela'
                        ? 'Monitoramento'
                        : item.work_mode === 'scheduled'
                          ? 'Agendado'
                          : 'Disponível'}
                </small>
              </span>
              {data.approvals.some(
                (a) => a.bot_id === item.id && a.status === 'pending',
              ) && (
                <span className="agent-dot" aria-label="Aprovação pendente" />
              )}
            </button>
          ))}
        </nav>
        <div className="agent-sidebar-bottom">
          <button className="agent-command" onClick={onOpenCaptador}>
            <ExternalLink size={16} />
            Captador operacional
          </button>
          <small>
            Última verificação
            <br />
            {date(data?.settings.last_tick_at)}
          </small>
        </div>
      </aside>
      <section
        className="agent-main"
        aria-label={bot ? `Conversa com ${bot.name}` : 'Central de Bots'}
      >
        <header className="agent-topbar">
          <button
            className="agent-icon agent-mobile"
            title="Menu principal"
            aria-label="Menu principal"
            onClick={onOpenMenu}
          >
            <Menu size={20} />
          </button>
          <button
            className="agent-icon agent-mobile"
            title="Meus bots"
            aria-label="Meus bots"
            onClick={() => setDrawer(true)}
          >
            <List size={20} />
          </button>
          {bot && <BotAvatar name={bot.avatar} />}
          <div>
            <h2>{bot?.name || 'Central de Bots'}</h2>
            <p>
              {bot?.last_run?.status === 'running'
                ? 'Consulta em andamento'
                : bot?.active
                  ? 'Somente consultas autorizadas'
                  : 'Aguardando conexão'}
            </p>
          </div>
          <button
            className="agent-icon"
            title="Atualizar"
            aria-label="Atualizar"
            disabled={busy || recording}
            onClick={() => void action({ action: 'list' })}
          >
            <RefreshCw size={18} />
          </button>
        </header>
        {bot && (
          <nav className="agent-tabs" aria-label="Visões do bot">
            {[
              ['chat', 'Conversa'],
              ['activity', 'Atividade'],
              [
                'incidents',
                `Ocorrências${incidents.length ? ` (${incidents.length})` : ''}`,
              ],
              [
                'approvals',
                `Aprovações${approvals.length ? ` (${approvals.length})` : ''}`,
              ],
            ].map(([id, label]) => (
              <button
                key={id}
                aria-current={tab === id ? 'page' : undefined}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        )}
        {error && (
          <div className="agent-error" role="alert">
            <span>{error}</span>
            <button
              className="agent-icon"
              aria-label="Fechar aviso"
              onClick={() => setError('')}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {data && !data.provider_configured && (
          <div className="agent-warning" role="status">
            IA não configurada no servidor. Consultas e transcrição
            indisponíveis.
          </div>
        )}
        <div className="agent-scroll" aria-busy={loading || busy}>
          {loading && (
            <p className="agent-empty" role="status">
              Conectando à Central...
            </p>
          )}
          {!loading && !data && (
            <div className="agent-empty">
              <h3>Central indisponível</h3>
              <button
                className="agent-command"
                onClick={() => void action({ action: 'list' })}
              >
                <RefreshCw size={16} />
                Tentar novamente
              </button>
              <button className="agent-command" onClick={onOpenCaptador}>
                <ArrowLeft size={16} />
                Abrir Captador operacional
              </button>
            </div>
          )}
          {bot && tab === 'chat' && (
            <div className="agent-thread">
              {!conversation && !error && (
                <p role="status">Carregando conversa...</p>
              )}
              {conversation?.messages.length === 0 && (
                <div className="agent-empty">
                  <BotAvatar name={bot.avatar} size={80} />
                  <h3>{bot.name}</h3>
                  <p>{bot.mission}</p>
                </div>
              )}
              {conversation?.messages.map((message) => (
                <article
                  key={message.id}
                  className={`agent-message agent-message-${message.role}`}
                >
                  <div className="agent-message-meta">
                    {message.role === 'assistant' && (
                      <BotAvatar name={bot.avatar} size={24} />
                    )}
                    <strong>
                      {message.role === 'user' ? 'Você' : bot.name}
                    </strong>
                    <time>{date(message.created_at)}</time>
                  </div>
                  <p>{message.content}</p>
                  {message.sources?.length > 0 && (
                    <details>
                      <summary>
                        Fontes consultadas <ChevronDown size={13} />
                      </summary>
                      {message.sources.map((source, i) => (
                        <div className="agent-source" key={i}>
                          <strong>
                            {data?.tools.find((t) => t.name === source.tool)
                              ?.description || source.tool}
                          </strong>
                          <small>{date(source.observed_at)}</small>
                          <pre>{JSON.stringify(source.data, null, 2)}</pre>
                        </div>
                      ))}
                    </details>
                  )}
                </article>
              ))}
              {pendingText && (
                <article className="agent-message agent-message-user">
                  <div className="agent-message-meta">
                    <strong>Você</strong>
                  </div>
                  <p>{pendingText}</p>
                  <small role="status">Consultando fontes...</small>
                </article>
              )}
              <div ref={end} />
            </div>
          )}
          {bot && tab === 'activity' && (
            <div className="agent-records">
              <div className="agent-section-title">
                <h3>Execuções</h3>
                {bot.kind === 'sentinela' && (
                  <button
                    className="agent-command"
                    disabled={busy || recording}
                    onClick={() =>
                      void action({
                        action: 'inspect',
                        bot_id: bot.id,
                        deep: true,
                      })
                    }
                  >
                    <ShieldCheck size={16} />
                    Inspecionar
                  </button>
                )}
              </div>
              <p className="agent-muted">
                Próxima execução:{' '}
                {bot.schedule?.enabled
                  ? date(bot.schedule.next_run_at)
                  : 'Sob demanda'}
              </p>
              {conversation?.runs.length === 0 && (
                <p className="agent-empty">Nenhuma execução registrada.</p>
              )}
              {conversation?.runs.map((run) => (
                <details className="agent-record" key={run.id}>
                  <summary>
                    <Activity size={16} />
                    <strong>
                      {labels[run.trigger_type] || run.trigger_type}
                    </strong>
                    <span data-status={run.status}>
                      {labels[run.status] || run.status}
                    </span>
                    <time>{date(run.started_at)}</time>
                  </summary>
                  {run.error && <p className="agent-error">{run.error}</p>}
                  <pre>{JSON.stringify(run.result || {}, null, 2)}</pre>
                </details>
              ))}
              <h3>Eventos</h3>
              {conversation?.events.length === 0 && (
                <p className="agent-muted">Nenhum evento registrado.</p>
              )}
              {conversation?.events.map((event) => (
                <div className="agent-event" key={event.id}>
                  <span>
                    {labels[event.type] || event.type}
                    {event.tool ? `: ${event.tool}` : ''}
                  </span>
                  <time>{date(event.created_at)}</time>
                </div>
              ))}
            </div>
          )}
          {bot && tab === 'incidents' && (
            <div className="agent-records">
              {incidents.length === 0 && (
                <p className="agent-empty">
                  Nenhuma ocorrência aberta para este bot.
                </p>
              )}
              {incidents.map((incident) => (
                <article className="agent-incident" key={incident.id}>
                  <header>
                    <h3>{incident.component}</h3>
                    <span data-status={incident.impact}>
                      {
                        (
                          {
                            high: 'Alta',
                            medium: 'Média',
                            low: 'Baixa',
                          } as Record<string, string>
                        )[incident.impact]
                      }{' '}
                      prioridade
                    </span>
                  </header>
                  <p>{incident.observed}</p>
                  <dl>
                    <dt>Esperado</dt>
                    <dd>{incident.expected}</dd>
                    <dt>Confiança</dt>
                    <dd>{Math.round(incident.confidence * 100)}%</dd>
                    <dt>Última observação</dt>
                    <dd>{date(incident.last_seen_at)}</dd>
                  </dl>
                  <details>
                    <summary>Evidências e hipóteses</summary>
                    <pre>{JSON.stringify(incident.dossier, null, 2)}</pre>
                  </details>
                  <button
                    className="agent-command"
                    onClick={() => void downloadIncident(incident.id)}
                  >
                    <Download size={16} />
                    Dossiê
                  </button>
                </article>
              ))}
            </div>
          )}
          {bot && tab === 'approvals' && (
            <div className="agent-records">
              {approvals.length === 0 && (
                <p className="agent-empty">Nenhuma aprovação pendente.</p>
              )}
              {approvals.map((approval) => (
                <article className="agent-incident" key={approval.id}>
                  <h3>
                    {approval.action === 'investigate_incident'
                      ? 'Investigação de ocorrência'
                      : 'Relatório agendado'}
                  </h3>
                  <p>{approval.reason}</p>
                  <small>{date(approval.created_at)}</small>
                  <details>
                    <summary>Escopo da autorização</summary>
                    <p>
                      Consulta de dados e elaboração de relatório. Nenhuma
                      alteração na operação.
                    </p>
                    <pre>{JSON.stringify(approval.context, null, 2)}</pre>
                  </details>
                  <div className="agent-actions">
                    <button
                      className="agent-command"
                      disabled={busy || recording}
                      onClick={() =>
                        void action({
                          action: 'approval',
                          approval_id: approval.id,
                          decision: 'deny',
                        })
                      }
                    >
                      <X size={16} />
                      Negar
                    </button>
                    <button
                      className="agent-command agent-primary"
                      disabled={busy || recording}
                      onClick={() =>
                        void action({
                          action: 'approval',
                          approval_id: approval.id,
                          decision: 'approve',
                        })
                      }
                    >
                      <Check size={16} />
                      Autorizar consulta
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
        {bot && tab === 'approvals' && approvalHistory.length > 0 && (
          <div className="agent-approval-history">
            <details>
              <summary>Decisões recentes ({approvalHistory.length})</summary>
              {approvalHistory.map((approval) => (
                <details key={approval.id} className="agent-record">
                  <summary>
                    {approval.reason} ·{' '}
                    {(
                      {
                        approved: 'Autorizada',
                        denied: 'Negada',
                        executed: 'Concluída',
                        failed: 'Não concluída',
                      } as Record<string, string>
                    )[approval.status] || approval.status}{' '}
                    · {date(approval.decided_at)}
                  </summary>
                  <pre>{JSON.stringify(approval.result || {}, null, 2)}</pre>
                </details>
              ))}
            </details>
          </div>
        )}
        {bot && tab === 'chat' && (
          <form className="agent-composer" onSubmit={send}>
            {recording && (
              <div className="agent-recording" role="status">
                <span className="agent-dot" />
                Gravando áudio
                <button
                  type="button"
                  className="agent-icon"
                  title="Cancelar gravação"
                  aria-label="Cancelar gravação"
                  onClick={cancelRecording}
                >
                  <X size={17} />
                </button>
              </div>
            )}
            <div className="agent-composer-row">
              <textarea
                aria-label={`Mensagem para ${bot.name}`}
                placeholder="Mensagem"
                rows={2}
                maxLength={4000}
                value={draft}
                disabled={busy || recording}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing &&
                    !matchMedia('(pointer: coarse)').matches
                  ) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button
                type="button"
                className={`agent-icon ${recording ? 'agent-recording-button' : ''}`}
                title={recording ? 'Concluir gravação' : 'Gravar áudio'}
                aria-label={recording ? 'Concluir gravação' : 'Gravar áudio'}
                disabled={busy}
                onClick={() => void voice()}
              >
                {recording ? <Square size={18} /> : <Mic size={20} />}
              </button>
              <button
                className="agent-icon agent-primary"
                title="Enviar mensagem"
                aria-label="Enviar mensagem"
                disabled={
                  busy ||
                  recording ||
                  !draft.trim() ||
                  !data?.provider_configured
                }
              >
                <ArrowUp size={20} />
              </button>
            </div>
            <div className="agent-composer-meta">
              <span>
                {busy ? 'Processando...' : 'Histórico: últimos 30 dias'}
              </span>
              <span>{draft.length}/4000</span>
            </div>
          </form>
        )}
      </section>
      {create && data && (
        <CreateBotModal
          tools={data.tools}
          onClose={() => setCreate(false)}
          onCreated={(created) => {
            setCreate(false);
            setConversation(null);
            setDraft('');
            setError('');
            setSelected(created.id);
            setDrawer(false);
            setTab('chat');
            void refresh().catch((e) => setError(errorText(e)));
          }}
        />
      )}
    </div>
  );
}

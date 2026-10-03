import { useEffect, useRef, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import {
  centralRequest,
  type AgentBot,
  type BotAvatarName,
  type CentralData,
} from '../../lib/central-bots';
import { BotAvatar } from './BotAvatar';

export function CreateBotModal({
  tools,
  onClose,
  onCreated,
}: {
  tools: CentralData['tools'];
  onClose: () => void;
  onCreated: (bot: AgentBot) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({
    name: '',
    mission: '',
    avatar: 'jade' as BotAvatarName,
    work_mode: 'on_demand',
    autonomy: 'read_only',
    interval_minutes: 1440,
    notifications: true,
    notify_results: false,
    tools: ['getOperationalSummary'],
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { bot } = await centralRequest<{ bot: AgentBot }>({
        action: 'create_bot',
        bot: form,
      });
      onCreated(bot);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Não foi possível criar o bot.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="agent-modal"
      aria-labelledby="new-bot-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <header>
          <h2 id="new-bot-title">Adicionar bot</h2>
          <button
            type="button"
            className="agent-icon"
            title="Fechar"
            aria-label="Fechar"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        <div className="agent-modal-body">
          <fieldset className="agent-avatar-picker">
            <legend>Avatar</legend>
            {(
              [
                'gestor',
                'captador',
                'sentinela',
                'jade',
                'coral',
                'silver',
              ] as BotAvatarName[]
            ).map((avatar) => (
              <button
                key={avatar}
                type="button"
                aria-label={`Avatar ${avatar}`}
                aria-pressed={form.avatar === avatar}
                onClick={() => setForm({ ...form, avatar })}
              >
                <BotAvatar name={avatar} size={44} />
                {form.avatar === avatar && <Check size={14} />}
              </button>
            ))}
          </fieldset>
          <label>
            Nome
            <input
              required
              autoFocus
              minLength={2}
              maxLength={60}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            Missão
            <textarea
              required
              minLength={5}
              maxLength={4000}
              rows={3}
              value={form.mission}
              onChange={(e) => setForm({ ...form, mission: e.target.value })}
            />
          </label>
          <div className="agent-form-grid">
            <label>
              Modo de trabalho
              <select
                value={form.work_mode}
                onChange={(e) =>
                  setForm({ ...form, work_mode: e.target.value })
                }
              >
                <option value="on_demand">Sob demanda</option>
                <option value="scheduled">Agendado</option>
                <option value="monitoring">Monitoramento</option>
              </select>
            </label>
            <label>
              Autonomia
              <select
                value={form.autonomy}
                onChange={(e) => setForm({ ...form, autonomy: e.target.value })}
              >
                <option value="read_only">Somente leitura</option>
                <option value="propose">Propor ações</option>
                <option value="approval">Exigir aprovação</option>
                <option value="allowed_auto">
                  Automático: consultas autorizadas
                </option>
              </select>
            </label>
          </div>
          {form.work_mode !== 'on_demand' && (
            <label>
              Frequência
              <select
                value={form.interval_minutes}
                onChange={(e) =>
                  setForm({ ...form, interval_minutes: Number(e.target.value) })
                }
              >
                {[
                  [60, 'A cada hora'],
                  [180, 'A cada 3 horas'],
                  [360, 'A cada 6 horas'],
                  [1440, 'Diariamente'],
                  [10080, 'Semanalmente'],
                ].map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <fieldset className="agent-tool-picker">
            <legend>Ferramentas autorizadas</legend>
            {tools.map((tool) => (
              <label key={tool.name}>
                <input
                  type="checkbox"
                  checked={form.tools.includes(tool.name)}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      tools: e.target.checked
                        ? [...form.tools, tool.name]
                        : form.tools.filter((t) => t !== tool.name),
                    })
                  }
                />
                <span>{tool.description}</span>
              </label>
            ))}
          </fieldset>
          <label className="agent-check">
            <input
              type="checkbox"
              checked={form.notifications}
              onChange={(e) =>
                setForm({ ...form, notifications: e.target.checked })
              }
            />
            Notificações de ocorrências e aprovações
          </label>
          <label className="agent-check">
            <input
              type="checkbox"
              checked={form.notify_results}
              onChange={(e) =>
                setForm({ ...form, notify_results: e.target.checked })
              }
            />
            Notificar relatórios concluídos
          </label>
          {error && (
            <p role="alert" className="agent-error">
              {error}
            </p>
          )}
        </div>
        <footer>
          <button
            type="button"
            className="agent-command"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="agent-command agent-primary"
            disabled={busy || !form.tools.length}
          >
            <Plus size={16} />
            {busy ? 'Criando...' : 'Criar bot'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

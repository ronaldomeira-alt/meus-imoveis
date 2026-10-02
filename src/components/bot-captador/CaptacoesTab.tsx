import React, { useState } from 'react';
import {
  ExternalLink,
  PlusCircle,
  Archive,
  Clock,
  CheckCircle,
  Building,
  AlertCircle,
  Search,
  Filter,
  Check,
  ChevronRight,
} from 'lucide-react';
import type { BotCapture, CaptureStatus } from '../../types/bot-captador';

interface CaptacoesTabProps {
  captures: BotCapture[];
  onImportCapture: (capture: BotCapture) => void;
  onArchiveCapture: (captureId: string) => Promise<void>;
  onMarkAsResponded: (captureId: string) => Promise<void>;
}

export const CaptacoesTab: React.FC<CaptacoesTabProps> = ({
  captures,
  onImportCapture,
  onArchiveCapture,
  onMarkAsResponded,
}) => {
  const [statusFilter, setStatusFilter] = useState<CaptureStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredCaptures = captures.filter((c) => {
    if (statusFilter !== 'ALL' && c.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchTitle = c.title.toLowerCase().includes(term);
      const matchNeigh = (c.neighborhood || '').toLowerCase().includes(term);
      const matchOwner = (c.owner_name || '').toLowerCase().includes(term);
      if (!matchTitle && !matchNeigh && !matchOwner) return false;
    }
    return true;
  });

  const getStatusBadge = (status: CaptureStatus) => {
    switch (status) {
      case 'WAITING_RESPONSE':
      case 'QUEUED':
      case 'RESERVED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/25">
            <Clock className="w-3 h-3" />
            AGUARDANDO
          </span>
        );
      case 'RESPONDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
            <CheckCircle className="w-3 h-3" />
            RESPONDEU
          </span>
        );
      case 'IMPORTED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/25">
            <Building className="w-3 h-3" />
            IMPORTADO
          </span>
        );
      case 'ARCHIVED':
      case 'EXPIRED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-surface-3 text-ink-secondary border border-line-subtle">
            <Archive className="w-3 h-3" />
            ARQUIVADO
          </span>
        );
      case 'POSSIBLE_DUPLICATE':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-600/15 text-amber-300 border border-amber-500/30">
            <AlertCircle className="w-3 h-3" />
            POSSÍVEL DUPLICADO
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/25">
            <AlertCircle className="w-3 h-3" />
            ERRO
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-3 text-ink-secondary border border-line-subtle">
            {status}
          </span>
        );
    }
  };

  const formatCurrency = (val?: number | null) => {
    if (!val) return 'Sob consulta';
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  };

  const formatContactedDate = (iso?: string | null) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="space-y-4 animate-fade-in pb-16">
      {/* ── Filtros e Busca de Captações ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 panel-surface p-3 sm:p-4 rounded-2xl border border-line-subtle">
        {/* Barra de Busca */}
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-ink-secondary absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar por imóvel, bairro ou proprietário..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-surface-1 border border-line-subtle text-ink-primary placeholder:text-ink-secondary focus:outline-none focus:border-accent/50"
          />
        </div>

        {/* Abas de Status */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-xs">
          {[
            { id: 'ALL', label: 'Todos' },
            { id: 'WAITING_RESPONSE', label: 'Aguardando' },
            { id: 'RESPONDED', label: 'Respondeu' },
            { id: 'IMPORTED', label: 'Importados' },
            { id: 'ARCHIVED', label: 'Arquivados' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl font-semibold whitespace-nowrap transition-all ${
                statusFilter === tab.id
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Lista de Captações ── */}
      {filteredCaptures.length === 0 ? (
        <div className="panel-surface rounded-2xl p-12 text-center border border-line-subtle">
          <p className="text-xs text-ink-secondary font-medium">
            {searchTerm || statusFilter !== 'ALL'
              ? 'Nenhuma captação encontrada para os filtros selecionados.'
              : 'Nenhuma captação aguardando resposta no momento.'}
          </p>
        </div>
      ) : (
        <>
          {/* VISUALIZAÇÃO DESKTOP: TABELA OPERACIONAL */}
          <div className="hidden md:block panel-surface rounded-2xl border border-line-subtle overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-1/70 border-b border-line-subtle text-[11px] font-bold text-ink-secondary uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Imóvel</th>
                  <th className="py-3 px-3">Finalidade</th>
                  <th className="py-3 px-3">Bairro</th>
                  <th className="py-3 px-3">Proprietário</th>
                  <th className="py-3 px-3">Abordagem</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle/40">
                {filteredCaptures.map((item) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                    {/* Imóvel */}
                    <td className="py-3.5 px-4 font-semibold text-ink-primary max-w-xs truncate">
                      <div title={item.title}>{item.title}</div>
                      <div className="text-[11px] font-normal text-ink-secondary mt-0.5">
                        {formatCurrency(item.price)}
                        {item.area_m2 && ` · ${item.area_m2}m²`}
                        {item.bedrooms && ` · ${item.bedrooms}q`}
                      </div>
                    </td>

                    {/* Finalidade */}
                    <td className="py-3.5 px-3">
                      <span className="uppercase text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-surface-1 text-ink-secondary border border-line-subtle">
                        {item.campaign_type}
                      </span>
                    </td>

                    {/* Bairro */}
                    <td className="py-3.5 px-3 text-ink-secondary">
                      {item.neighborhood || 'Não informado'}
                    </td>

                    {/* Proprietário */}
                    <td className="py-3.5 px-3 text-ink-secondary">
                      {item.owner_name ? (
                        <span className="text-ink-primary font-medium">{item.owner_name}</span>
                      ) : (
                        <span className="text-ink-muted italic">Não identificado</span>
                      )}
                    </td>

                    {/* Abordagem */}
                    <td className="py-3.5 px-3 text-ink-secondary">
                      {formatContactedDate(item.contacted_at || item.created_at)}
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-3">
                      {getStatusBadge(item.status)}
                    </td>

                    {/* Ações */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Se aguardando, permite marcar manualmente como respondeu caso corretor identifique */}
                        {item.status === 'WAITING_RESPONSE' && (
                          <button
                            type="button"
                            onClick={() => onMarkAsResponded(item.id)}
                            className="p-1.5 rounded-lg text-ink-secondary hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            title="Marcar como Respondeu"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Ver Resposta na plataforma de origem */}
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-surface-1 hover:bg-surface-2 text-ink-secondary hover:text-ink-primary border border-line-subtle flex items-center gap-1 transition-all"
                          title="Abrir anúncio / conversa na plataforma de origem"
                        >
                          <ExternalLink className="w-3 h-3 text-accent" />
                          <span>Ver resposta</span>
                        </a>

                        {/* Importar (só ativo se respondeu ou elegível) */}
                        <button
                          type="button"
                          onClick={() => onImportCapture(item)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-accent hover:bg-accent-hover text-white flex items-center gap-1 transition-all shadow-sm"
                          title="Navega para Adicionar Imóvel com a URL pré-preenchida"
                        >
                          <PlusCircle className="w-3 h-3" />
                          <span>Importar</span>
                        </button>

                        {/* Arquivar */}
                        {item.status !== 'ARCHIVED' && (
                          <button
                            type="button"
                            onClick={() => onArchiveCapture(item.id)}
                            className="p-1.5 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-white/[0.04] transition-colors"
                            title="Arquivar captação"
                          >
                            <Archive className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* VISUALIZAÇÃO MOBILE: CARDS RESPONSIVOS (Otimizado para iPhone / PWA) */}
          <div className="md:hidden space-y-3">
            {filteredCaptures.map((item) => (
              <div
                key={item.id}
                className="panel-surface rounded-2xl p-4 border border-line-subtle space-y-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                      {item.campaign_type} · {item.neighborhood || 'Bairro a confirmar'}
                    </span>
                    <h4 className="text-xs font-bold text-ink-primary line-clamp-2 mt-0.5">
                      {item.title}
                    </h4>
                    <p className="text-[11px] text-ink-secondary font-medium mt-1">
                      {formatCurrency(item.price)}
                      {item.area_m2 && ` · ${item.area_m2}m²`}
                      {item.bedrooms && ` · ${item.bedrooms}q`}
                    </p>
                  </div>
                  <div className="flex-shrink-0">{getStatusBadge(item.status)}</div>
                </div>

                <div className="pt-2 border-t border-line-subtle flex items-center justify-between text-[11px] text-ink-secondary">
                  <span>
                    Proprietário: <span className="text-ink-primary font-medium">{item.owner_name || 'Não identificado'}</span>
                  </span>
                  <span>{formatContactedDate(item.contacted_at || item.created_at)}</span>
                </div>

                {/* Ações Mobile */}
                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2 rounded-xl text-xs font-semibold bg-surface-1 hover:bg-surface-2 text-ink-primary border border-line-subtle flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-accent" />
                    Ver resposta
                  </a>

                  <button
                    type="button"
                    onClick={() => onImportCapture(item)}
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-accent hover:bg-accent-hover text-white flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Importar
                  </button>

                  {item.status !== 'ARCHIVED' && (
                    <button
                      type="button"
                      onClick={() => onArchiveCapture(item.id)}
                      className="p-2 rounded-xl text-ink-secondary hover:text-ink-primary bg-surface-1 border border-line-subtle"
                      title="Arquivar"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

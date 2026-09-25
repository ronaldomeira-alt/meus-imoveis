import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Flame, Sparkles, CheckCircle2, AlertCircle, Clock, ShieldCheck } from 'lucide-react';
import type { MatchRecord } from '../../lib/match/types';
import { WACRM_BASE_URL } from '../../lib/match/service';

interface LeadDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  match: MatchRecord | null;
  onSendWhatsApp?: (match: MatchRecord) => void;
}

export const LeadDetailDrawer: React.FC<LeadDetailDrawerProps> = ({
  isOpen,
  onClose,
  match,
  onSendWhatsApp,
}) => {
  if (!isOpen || !match) return null;

  const lead = match.lead;
  const property = match.property;
  const breakdown = match.scoreBreakdown;

  const temperatureLabel =
    (lead?.aiScore ?? 0) >= 8
      ? { text: 'Lead Quente 🔥', color: 'text-amber-400 bg-amber-500/15 border-amber-500/30' }
      : (lead?.aiScore ?? 0) >= 5
      ? { text: 'Lead Morno ⚡', color: 'text-blue-400 bg-blue-500/15 border-blue-500/30' }
      : { text: 'Lead Frio ❄️', color: 'text-slate-400 bg-slate-500/15 border-slate-500/30' };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end">
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="w-full max-w-md h-full bg-[#11141b] border-l border-line-subtle shadow-2xl flex flex-col"
        >
          {/* Top Header */}
          <div className="px-5 py-4 border-b border-line-subtle flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-sm font-bold text-accent">
                {lead?.initials || 'CL'}
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink-primary">
                  {lead?.name || 'Cliente'}
                </h3>
                <span className="text-[11px] text-ink-secondary">
                  {lead?.phone || 'Telefone não informado'}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-ink-secondary hover:text-ink-primary hover:bg-white/[0.05] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Drawer Body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Badges Principais (Maturidade, Temperatura, Match) */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-line-subtle text-center">
                <span className="text-[10px] text-ink-muted uppercase font-bold tracking-wider block mb-0.5">
                  Match
                </span>
                <span className="text-base font-extrabold text-accent">
                  {match.matchScore}%
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-line-subtle text-center">
                <span className="text-[10px] text-ink-muted uppercase font-bold tracking-wider block mb-0.5">
                  Maturidade
                </span>
                <span className="text-base font-extrabold text-ink-primary">
                  {match.profileMaturity}%
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/[0.02] border border-line-subtle text-center">
                <span className="text-[10px] text-ink-muted uppercase font-bold tracking-wider block mb-0.5">
                  Score
                </span>
                <span className="text-base font-extrabold text-amber-400">
                  {lead?.aiScore ?? 0}/10
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${temperatureLabel.color}`}>
                {temperatureLabel.text}
              </span>
              <span className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-white/[0.04] text-ink-secondary border border-line-subtle">
                Prioridade: {match.commercialPriority}
              </span>
            </div>

            {/* Imóvel em Avaliação */}
            {property && (
              <div className="p-3 rounded-xl bg-white/[0.02] border border-line-subtle">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-1">
                  Imóvel Avaliado
                </span>
                <div className="text-xs font-bold text-ink-primary">
                  {property.title}
                </div>
                <div className="text-[11px] text-ink-secondary flex items-center justify-between mt-1">
                  <span>{property.neighborhood}, {property.city}</span>
                  <span className="text-emerald-400 font-semibold">
                    {property.priceMin.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            )}

            {/* Breakdown dos 7 Critérios */}
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-primary block mb-2">
                Composição do Match (100%)
              </span>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-white/[0.03]">
                  <span className="text-ink-secondary">Preço (25%)</span>
                  <span className="font-semibold text-ink-primary">{breakdown.price} pts</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/[0.03]">
                  <span className="text-ink-secondary">Localização (20%)</span>
                  <span className="font-semibold text-ink-primary">{breakdown.location} pts</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/[0.03]">
                  <span className="text-ink-secondary">Tipologia (15%)</span>
                  <span className="font-semibold text-ink-primary">{breakdown.propertyType} pts</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/[0.03]">
                  <span className="text-ink-secondary">Quartos / Configuração (15%)</span>
                  <span className="font-semibold text-ink-primary">{breakdown.bedrooms} pts</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/[0.03]">
                  <span className="text-ink-secondary">Finalidade (10%)</span>
                  <span className="font-semibold text-ink-primary">{breakdown.purpose} pts</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-white/[0.03]">
                  <span className="text-ink-secondary">Pronto / Planta / Prazo (10%)</span>
                  <span className="font-semibold text-ink-primary">{breakdown.delivery} pts</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-ink-secondary">Metragem (5%)</span>
                  <span className="font-semibold text-ink-primary">{breakdown.area} pts</span>
                </div>
              </div>
            </div>

            {/* Motivos e Penalidades */}
            {breakdown.reasons?.length > 0 && (
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 block mb-1.5">
                  Pontos Positivos
                </span>
                <ul className="space-y-1 text-[11px] text-ink-secondary">
                  {breakdown.reasons.map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {breakdown.penalties?.length > 0 && (
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 block mb-1.5">
                  Ressalvas / Penalidades
                </span>
                <ul className="space-y-1 text-[11px] text-ink-secondary">
                  {breakdown.penalties.map((p, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* FASE 8: Proveniência das Informações (Azul CTWA vs Verde Conversa) */}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-line-subtle">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted block mb-2">
                Proveniência dos Dados (WACRM)
              </span>
              <div className="flex items-center gap-3 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                  <span className="text-ink-secondary">Anúncio CTWA</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                  <span className="text-ink-secondary">Confirmado na Conversa</span>
                </div>
              </div>
            </div>

            {/* Histórico com Este Imóvel */}
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-ink-primary block mb-2">
                Histórico com este Imóvel
              </span>
              {match.shares && match.shares.length > 0 ? (
                <div className="space-y-2">
                  {match.shares.map((s) => (
                    <div key={s.id} className="p-2.5 rounded-lg bg-white/[0.02] border border-line-subtle text-xs">
                      <div className="flex items-center justify-between text-ink-secondary mb-1">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-ink-muted" />
                          Enviado em {new Date(s.sentAt).toLocaleDateString('pt-BR')} às {new Date(s.sentAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04]">
                          {s.openCount} {s.openCount === 1 ? 'abertura' : 'aberturas'}
                        </span>
                      </div>
                      {s.isInterested && (
                        <div className="text-[11px] font-bold text-emerald-400 mt-1 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Demonstrou interesse no imóvel!
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-ink-muted italic">
                  Ainda não foi enviado para este lead.
                </div>
              )}
            </div>
          </div>

          {/* Drawer Footer Actions */}
          <div className="p-4 border-t border-line-subtle bg-white/[0.02] flex items-center gap-2.5">
            <a
              href={`${WACRM_BASE_URL}/contacts?search=${encodeURIComponent(lead?.phone || lead?.name || '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2 px-3 rounded-xl border border-line-subtle text-xs font-semibold text-ink-primary hover:bg-white/[0.04] transition-colors flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="w-3.5 h-3.5 text-accent" />
              Abrir no WACRM
            </a>
            {onSendWhatsApp && (
              <button
                onClick={() => {
                  onClose();
                  onSendWhatsApp(match);
                }}
                className="btn-primary py-2 px-4 rounded-xl text-xs font-bold cursor-pointer"
              >
                Enviar Imóvel
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

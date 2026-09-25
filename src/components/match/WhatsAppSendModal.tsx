import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, ExternalLink, Sparkles, Check, Phone } from 'lucide-react';
import type { MatchRecord } from '../../lib/match/types';
import { createPropertyShareAndSend } from '../../lib/match/service';
import { getPhotoUrl } from '../../lib/supabase';

interface WhatsAppSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  match: MatchRecord;
  onSentSuccess?: (updatedMatch: MatchRecord) => void;
}

export const WhatsAppSendModal: React.FC<WhatsAppSendModalProps> = ({
  isOpen,
  onClose,
  match,
  onSentSuccess,
}) => {
  const [customText, setCustomText] = useState(
    'Encontrei uma opção que combina com o que você está procurando. Dá uma olhada e me diz o que achou:'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);

  if (!isOpen) return null;

  const lead = match.lead;
  const property = match.property;
  const coverUrl = property?.coverUrl
    ? getPhotoUrl(property.coverUrl)
    : 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80';

  const cleanPhone = (lead?.phone || '').replace(/\D/g, '');

  const handleSend = async () => {
    setIsSubmitting(true);
    try {
      const result = await createPropertyShareAndSend({
        leadId: match.leadId,
        propertyId: match.propertyId,
        matchId: match.id,
        messageText: customText.trim(),
      });

      if (result.success && result.waLink) {
        setSentSuccess(true);
        // Abre o WhatsApp Pessoal em nova aba/janela
        window.open(result.waLink, '_blank', 'noopener,noreferrer');

        const updated: MatchRecord = {
          ...match,
          matchStatus: 'enviado',
          sentAt: new Date().toISOString(),
        };

        if (onSentSuccess) {
          onSentSuccess(updated);
        }

        setTimeout(() => {
          setIsSubmitting(false);
          setSentSuccess(false);
          onClose();
        }, 1200);
      } else {
        setIsSubmitting(false);
      }
    } catch (err) {
      console.error('[WhatsAppSendModal] Erro ao enviar:', err);
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          className="relative w-full max-w-lg rounded-2xl bg-[#131722] border border-white/[0.08] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-line-subtle flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Send className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink-primary">
                  Enviar Imóvel via WhatsApp Pessoal
                </h3>
                <p className="text-[11px] text-ink-secondary">
                  Gera token individual e transiciona para status Enviado
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-secondary hover:text-ink-primary hover:bg-white/[0.05] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Destinatário (Lead) */}
            <div className="p-3 rounded-xl bg-white/[0.02] border border-line-subtle flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-xs font-bold text-accent">
                  {lead?.initials || 'CL'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-ink-primary">
                      {lead?.name || 'Cliente'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 font-semibold">
                      {match.matchScore}% Match
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-secondary flex items-center gap-1 mt-0.5">
                    <Phone className="w-3 h-3 text-ink-muted" />
                    {lead?.phone || 'Telefone não informado'}
                  </span>
                </div>
              </div>
            </div>

            {/* Preview do Imóvel (Capa Real + Dados) */}
            <div className="rounded-xl overflow-hidden border border-line-subtle bg-white/[0.01]">
              <div className="relative h-36 w-full bg-black/40 overflow-hidden">
                <img
                  src={coverUrl}
                  alt={property?.title || 'Imóvel'}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-2.5 left-3 right-3 text-white">
                  <div className="text-xs font-bold truncate">
                    {property?.title || 'Imóvel selecionado'}
                  </div>
                  <div className="text-[10.5px] text-gray-300 flex items-center justify-between mt-0.5">
                    <span>{property?.neighborhood}, {property?.city}</span>
                    <span className="font-semibold text-emerald-400">
                      {property?.priceMin
                        ? property.priceMin.toLocaleString('pt-BR', {
                            style: 'currency',
                            currency: 'BRL',
                            maximumFractionDigits: 0,
                          })
                        : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mensagem Editável */}
            <div>
              <label className="block text-[11px] font-bold text-ink-primary uppercase tracking-wider mb-1.5">
                Texto do Envio (Editável antes de disparar)
              </label>
              <textarea
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl bg-black/30 border border-line-subtle text-xs text-ink-primary focus:outline-none focus:border-accent transition-colors resize-none leading-relaxed"
                placeholder="Digite sua mensagem de apresentação..."
              />
              <p className="text-[10px] text-ink-muted mt-1">
                O link seguro com token exclusivo de visualização será adicionado automaticamente ao final da mensagem.
              </p>
            </div>

            {/* Aviso de Privacidade */}
            <div className="p-2.5 rounded-lg bg-emerald-500/[0.06] border border-emerald-500/20 text-[11px] text-emerald-300/90 flex items-start gap-2">
              <Sparkles className="w-3.5 h-3.5 flex-shrink-0 text-emerald-400 mt-0.5" />
              <span>
                <strong>Token Opaco Individual:</strong> Aberturas e navegações do cliente serão registradas em tempo real sem expor dados pessoais (zero PII) na URL.
              </span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="px-5 py-3.5 border-t border-line-subtle bg-white/[0.02] flex items-center justify-between">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-ink-secondary hover:text-ink-primary transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              onClick={handleSend}
              disabled={isSubmitting}
              className={`px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                sentSuccess
                  ? 'bg-emerald-600'
                  : 'bg-emerald-500 hover:bg-emerald-600 shadow-lg shadow-emerald-500/20'
              }`}
            >
              {sentSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Enviado!
                </>
              ) : isSubmitting ? (
                'Gerando envio...'
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> Enviar pelo WhatsApp Pessoal
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

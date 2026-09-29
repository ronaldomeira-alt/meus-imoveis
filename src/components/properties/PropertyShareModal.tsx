import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Copy,
  Check,
  ExternalLink,
  Share2,
  Smartphone,
  MessageCircle,
  AlertCircle,
} from 'lucide-react';
import type { Property } from '../../types/property';
import { getPhotoUrl } from '../../lib/supabase';
import {
  getPropertyPublicUrl,
  buildPropertyWhatsAppUrl,
  sharePropertyUniversal,
} from '../../lib/propertyShare';

interface PropertyShareModalProps {
  property: Property | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PropertyShareModal: React.FC<PropertyShareModalProps> = ({
  property,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  if (!isOpen || !property) return null;

  const publicUrl = getPropertyPublicUrl(property.id);
  const isAvailable = property.status === 'Ativo';

  const coverPhoto = property.photos?.find((p) => p.is_cover) || property.photos?.[0];
  const coverUrl = coverPhoto ? getPhotoUrl(coverPhoto.storage_path) : '';

  const formatPrice = (val: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(val);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setFeedbackMessage('Link público copiado com sucesso!');
      setTimeout(() => {
        setCopied(false);
        setFeedbackMessage(null);
      }, 2500);
    } catch {
      setFeedbackMessage('Não foi possível copiar automaticamente.');
      setTimeout(() => setFeedbackMessage(null), 3000);
    }
  };

  const handleWhatsApp = () => {
    const waUrl = buildPropertyWhatsAppUrl(property, publicUrl);
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleNativeShare = async () => {
    const result = await sharePropertyUniversal(property);
    if (result.method === 'clipboard' && result.success) {
      setCopied(true);
      setFeedbackMessage('Link público copiado!');
      setTimeout(() => {
        setCopied(false);
        setFeedbackMessage(null);
      }, 2500);
    } else if (result.message && result.method !== 'native') {
      setFeedbackMessage(result.message);
      setTimeout(() => setFeedbackMessage(null), 3000);
    }
  };

  const handleOpenPublicPage = () => {
    window.open(publicUrl, '_blank', 'noopener,noreferrer');
  };

  const hasNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 pointer-events-auto">
        {/* Backdrop escuro */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/75 backdrop-blur-[2px]"
        />

        {/* Modal / Bottom Sheet */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.98 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-lg rounded-t-3xl sm:rounded-2xl overflow-hidden z-10 modal-surface shadow-2xl flex flex-col pointer-events-auto border border-line-strong max-h-[92vh] pb-[max(16px,env(safe-area-inset-bottom))]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-5 border-b border-line-subtle">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-accent-soft flex items-center justify-center text-accent">
                <Share2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-primary leading-tight">
                  Compartilhar Imóvel
                </h3>
                <p className="text-[11px] text-ink-muted">
                  Página comercial pública e segura para envio a clientes
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="Fechar"
              className="w-8 h-8 rounded-full flex items-center justify-center text-ink-secondary hover:text-ink-primary hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
            {/* Aviso de imóvel indisponível caso não esteja ativo */}
            {!isAvailable && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-status-warning/15 border border-status-warning/30 text-status-warning text-xs">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>
                  Este imóvel está marcado como <strong>{property.status}</strong>. O link exibirá a mensagem de indisponibilidade com sugestão de outros imóveis.
                </span>
              </div>
            )}

            {/* Preview Compacto do Imóvel */}
            <div className="flex gap-3 p-3 rounded-xl bg-surface-2 border border-line-subtle">
              <div className="relative w-20 h-20 rounded-lg overflow-hidden bg-black/40 flex-shrink-0">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={property.neighborhood}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-ink-muted bg-white/5">
                    Sem foto
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1 flex flex-col justify-center">
                <div className="text-[11px] font-bold uppercase tracking-wider text-accent">
                  {property.type}
                </div>
                <h4 className="text-sm font-bold text-ink-primary truncate">
                  {property.condominium_name
                    ? `${property.condominium_name} · ${property.neighborhood}`
                    : property.neighborhood}
                </h4>
                <div className="text-xs text-ink-secondary mt-0.5">
                  {property.bedrooms > 0 && `${property.bedrooms} qtos · `}
                  {property.area_m2 > 0 && `${property.area_m2} m² · `}
                  <strong className="text-ink-primary">{formatPrice(property.price)}</strong>
                </div>
              </div>
            </div>

            {/* Feedback Message */}
            {feedbackMessage && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs text-center font-medium"
              >
                {feedbackMessage}
              </motion.div>
            )}

            {/* Ações Principais de Compartilhamento */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* WhatsApp */}
              <button
                type="button"
                onClick={handleWhatsApp}
                className="flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm shadow-md transition-all active:scale-[0.98] cursor-pointer"
              >
                <MessageCircle className="w-4 h-4 fill-white" />
                <span>Enviar pelo WhatsApp</span>
              </button>

              {/* Copiar Link */}
              <button
                type="button"
                onClick={handleCopyLink}
                className={`flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl font-semibold text-xs sm:text-sm border transition-all active:scale-[0.98] cursor-pointer ${
                  copied
                    ? 'bg-status-success/20 border-status-success text-status-success'
                    : 'bg-white/5 hover:bg-white/10 border-line-subtle text-ink-primary'
                }`}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4 text-ink-muted" />}
                <span>{copied ? 'Link Copiado!' : 'Copiar Link'}</span>
              </button>
            </div>

            {/* Ações Secundárias */}
            <div className="space-y-1.5 pt-1">
              {/* Compartilhamento Nativo (quando disponível, ex: iPhone/Android) */}
              {hasNativeShare && (
                <button
                  type="button"
                  onClick={handleNativeShare}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-ink-secondary hover:text-ink-primary text-xs font-medium transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Smartphone className="w-4 h-4 text-accent" />
                    <span>Mais opções de compartilhamento (Share Sheet)</span>
                  </div>
                  <Share2 className="w-3.5 h-3.5 text-ink-muted" />
                </button>
              )}

              {/* Visualizar Página Pública */}
              <button
                type="button"
                onClick={handleOpenPublicPage}
                className="w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-white/5 text-ink-secondary hover:text-ink-primary text-xs font-medium transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <ExternalLink className="w-4 h-4 text-accent" />
                  <span>Visualizar página comercial pública</span>
                </div>
                <span className="text-[11px] text-ink-muted">Abrir em nova aba ↗</span>
              </button>
            </div>

            {/* Caixa com o link direto */}
            <div className="pt-2">
              <label className="block text-[11px] font-semibold text-ink-muted mb-1">
                Link público permanente:
              </label>
              <div className="flex items-center gap-2 p-2 rounded-xl bg-surface-1 border border-line-subtle text-xs font-mono text-ink-secondary">
                <span className="truncate flex-1 select-all">{publicUrl}</span>
                <button
                  type="button"
                  onClick={handleCopyLink}
                  title="Copiar link"
                  className="p-1 rounded-lg hover:bg-white/10 text-ink-muted hover:text-ink-primary transition-colors cursor-pointer flex-shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

import React, { useEffect } from 'react';
import {
  X,
  ArrowRight,
  Bed,
  Maximize2,
  Car,
  Images,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Property } from '../../types/property';
import { getPhotoUrl } from '../../lib/supabase';

interface PropertySummaryModalProps {
  property: Property | null;
  onClose: () => void;
  onOpenDetail: (property: Property) => void;
}

export const PropertySummaryModal: React.FC<PropertySummaryModalProps> = ({
  property,
  onClose,
  onOpenDetail,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!property) return null;

  const photos = property.photos && property.photos.length > 0 ? property.photos : [];
  const coverPhoto = photos.find((p) => p.is_cover) || photos[0];
  const photoUrl = coverPhoto ? getPhotoUrl(coverPhoto.storage_path) : '';

  const formatPrice = (val: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 pointer-events-auto">
        {/* Backdrop escuro sólido (sem blur) */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/75"
        />

        {/* Modal Compacto */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-[440px] rounded-2xl overflow-hidden z-10 modal-surface shadow-modal flex flex-col pointer-events-auto"
        >
          {/* 1. Foto Principal */}
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-black/40 flex-shrink-0">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={property.neighborhood}
                className="w-full h-full object-cover select-none"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-surface-2 text-ink-secondary">
                Sem fotografia disponível
              </div>
            )}

            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(to top, rgba(6, 10, 22, 0.85) 0%, rgba(6, 10, 22, 0.1) 50%, rgba(0, 0, 0, 0.35) 100%)',
              }}
            />

            {photos.length > 1 && (
              <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-semibold text-ink-primary/90 bg-black/55 border border-line-strong flex items-center gap-1.5">
                <Images className="w-3.5 h-3.5 text-accent" />
                <span>{photos.length} fotos</span>
              </div>
            )}

            <button
              onClick={onClose}
              aria-label="Fechar"
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center bg-black/55 hover:bg-black/75 text-ink-primary/80 hover:text-ink-primary border border-line-strong transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 2. Informações Essenciais */}
          <div className="p-4 sm:p-5 flex flex-col justify-between space-y-3.5 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xl sm:text-2xl font-black text-ink-primary tracking-tight truncate">
                  {property.neighborhood}
                </h3>
                <p className="text-xs text-ink-secondary mt-0.5 truncate font-medium">
                  {property.type} · {property.bedrooms} {property.bedrooms === 1 ? 'quarto' : 'quartos'} · {property.area_m2} m²
                  {property.condominium_name ? ` · ${property.condominium_name}` : ''}
                </p>
              </div>

              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/[0.05] text-ink-secondary border border-line-subtle">
                  {property.source_type}
                </span>
                {property.status !== 'Ativo' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-status-warning/15 text-status-warning border border-status-warning/30">
                    {property.status}
                  </span>
                )}
              </div>
            </div>

            {/* Preço Principal em Destaque */}
            <div className="flex items-baseline justify-between border-y border-line-subtle py-2.5">
              <div>
                {property.internal_name && (
                  <span className="inline-flex max-w-full truncate mb-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-accent/10 border border-accent/20 text-accent">
                    {property.internal_name}
                  </span>
                )}
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent block">
                  Valor de {property.purpose === 'Locação' ? 'Aluguel' : 'Venda'}
                </span>
                <div className="text-2xl font-black text-ink-primary tabular tracking-tight">
                  {formatPrice(property.price)}
                </div>
              </div>

              {property.condo_fee ? (
                <div className="text-right">
                  <span className="text-[10px] uppercase font-semibold text-ink-secondary block">
                    Condomínio
                  </span>
                  <span className="text-xs font-bold text-ink-primary">
                    {formatPrice(property.condo_fee)}/mês
                  </span>
                </div>
              ) : null}
            </div>

            {/* Grade Compacta de Métricas */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-line-subtle flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-accent-soft text-accent flex items-center justify-center flex-shrink-0">
                  <Bed className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] uppercase font-bold text-ink-secondary block leading-tight">Quartos</span>
                  <p className="text-xs font-bold text-ink-primary truncate">
                    {property.bedrooms} {property.suites > 0 ? `(${property.suites}s)` : ''}
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-line-subtle flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-accent-soft text-accent flex items-center justify-center flex-shrink-0">
                  <Maximize2 className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] uppercase font-bold text-ink-secondary block leading-tight">Área</span>
                  <p className="text-xs font-bold text-ink-primary truncate">{property.area_m2} m²</p>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-line-subtle flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-accent-soft text-accent flex items-center justify-center flex-shrink-0">
                  <Car className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] uppercase font-bold text-ink-secondary block leading-tight">Vagas</span>
                  <p className="text-xs font-bold text-ink-primary truncate">{property.parking_spaces_type === 'Rotativas' ? 'Rotativas' : `${property.parking_spaces} vaga(s)`}</p>
                </div>
              </div>
            </div>

            {/* 3. Botão de Navegação */}
            <div className="pt-1">
              <button
                onClick={() => onOpenDetail(property)}
                className="btn-secondary w-full py-3 px-5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer group"
              >
                <span>Abrir imóvel</span>
                <ArrowRight className="w-4 h-4 text-accent stroke-[2] transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

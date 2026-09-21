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
  // Atalho Esc para fechar
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
        {/* Backdrop escuro com desfoque profundo */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-xl"
        />

        {/* Modal Compacto Estável — Sem Scroll Vertical */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 16 }}
          transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          className="relative w-full max-w-[440px] rounded-3xl overflow-hidden z-10 border border-white/15 shadow-2xl flex flex-col pointer-events-auto"
          style={{
            background: 'linear-gradient(180deg, rgba(10, 17, 34, 0.94) 0%, rgba(6, 10, 22, 0.98) 100%)',
            boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.8), 0 0 40px rgba(0, 229, 255, 0.08)',
          }}
        >
          {/* 1. Foto Principal Protagonista */}
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-black/60 flex-shrink-0">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={property.neighborhood}
                className="w-full h-full object-cover select-none"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-500">
                Sem fotografia disponível
              </div>
            )}

            {/* Gradiente sutil para garantir contraste visual */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(to top, rgba(6, 10, 22, 0.9) 0%, rgba(6, 10, 22, 0.1) 50%, rgba(0, 0, 0, 0.4) 100%)',
              }}
            />

            {/* Badge discreto de quantidade de fotos */}
            {photos.length > 1 && (
              <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-semibold text-white/90 bg-black/50 backdrop-blur-md border border-white/15 flex items-center gap-1.5 shadow-md">
                <Images className="w-3.5 h-3.5 text-cyan-400" />
                <span>{photos.length} fotos</span>
              </div>
            )}

            {/* Botão Fechar no Topo Direito */}
            <button
              onClick={onClose}
              aria-label="Fechar"
              className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center bg-black/50 hover:bg-black/80 text-white/80 hover:text-white border border-white/15 backdrop-blur-md transition-all cursor-pointer shadow-md active:scale-90"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 2. Informações Essenciais (Layout Compacto Sem Scroll) */}
          <div className="p-4 sm:p-5 flex flex-col justify-between space-y-3.5 flex-1">
            {/* Título do Bairro & Subtítulo */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight truncate">
                  {property.neighborhood}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 truncate font-medium">
                  {property.type} · {property.bedrooms} {property.bedrooms === 1 ? 'quarto' : 'quartos'} · {property.area_m2} m²
                  {property.condominium_name ? ` · ${property.condominium_name}` : ''}
                </p>
              </div>

              {/* Badges de Origem & Status */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-white/[0.08] text-slate-300 border border-white/12">
                  {property.source_type}
                </span>
                {property.status !== 'Ativo' && (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold bg-white/10 text-slate-300 border border-white/15">
                    {property.status}
                  </span>
                )}
              </div>
            </div>

            {/* Preço Principal em Destaque */}
            <div className="flex items-baseline justify-between border-y border-white/10 py-2.5">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 block">
                  Valor de {property.purpose === 'Locação' ? 'Aluguel' : 'Venda'}
                </span>
                <div className="text-2xl font-black text-white tabular tracking-tight">
                  {formatPrice(property.price)}
                </div>
              </div>

              {property.condo_fee ? (
                <div className="text-right">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">
                    Condomínio
                  </span>
                  <span className="text-xs font-bold text-slate-200">
                    {formatPrice(property.condo_fee)}/mês
                  </span>
                </div>
              ) : null}
            </div>

            {/* Grade Bento Compacta de Métricas Essenciais */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center flex-shrink-0">
                  <Bed className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">Quartos</span>
                  <p className="text-xs font-bold text-white truncate">
                    {property.bedrooms} {property.suites > 0 ? `(${property.suites}s)` : ''}
                  </p>
                </div>
              </div>

              <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center flex-shrink-0">
                  <Maximize2 className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">Área</span>
                  <p className="text-xs font-bold text-white truncate">{property.area_m2} m²</p>
                </div>
              </div>

              <div className="p-2.5 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-cyan-500/15 text-cyan-400 flex items-center justify-center flex-shrink-0">
                  <Car className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block leading-tight">Vagas</span>
                  <p className="text-xs font-bold text-white truncate">{property.parking_spaces} vaga(s)</p>
                </div>
              </div>
            </div>

            {/* 3. Botão Inferior de Navegação: [ Abrir imóvel → ] */}
            <div className="pt-1">
              <button
                onClick={() => onOpenDetail(property)}
                className="w-full py-3 px-5 rounded-2xl text-xs sm:text-sm font-semibold text-white bg-white/[0.08] hover:bg-cyan-500/15 border border-white/15 hover:border-cyan-400/40 flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg active:scale-[0.98] group"
              >
                <span>Abrir imóvel</span>
                <ArrowRight className="w-4 h-4 text-cyan-400 stroke-[2] transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

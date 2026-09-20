import React, { useRef } from 'react';
import { Clock, ArrowRight, ChevronRight, ChevronLeft, Heart } from 'lucide-react';
import type { Property } from '../../types/property';
import { getPhotoUrl } from '../../lib/supabase';

interface RecentCarouselProps {
  properties: Property[];
  onSelectProperty: (property: Property) => void;
  onViewAll: () => void;
}

export const RecentCarousel: React.FC<RecentCarouselProps> = ({
  properties,
  onSelectProperty,
  onViewAll,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 270 : -270, behavior: 'smooth' });
  };

  const formatPrice = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="flex flex-col justify-between select-none">
      {/* ── Topo da Seção ── */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2.5">
          {/* Botão circular azul com relógio branco (idêntico à referência) */}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
            style={{
              background: '#0284C7',
              boxShadow: '0 0 14px rgba(2, 132, 199, 0.6)',
            }}
          >
            <Clock className="text-white" style={{ width: '14px', height: '14px' }} strokeWidth={2.4} />
          </div>
          <h3 className="text-[13px] font-bold text-white tracking-tight">
            Adicionados recentemente
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onViewAll}
            className="text-[11px] font-medium text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition-colors"
          >
            <span>Ver todos</span>
            <ArrowRight style={{ width: '12px', height: '12px' }} />
          </button>

          {/* Botões circulares de Navegação < e > */}
          <div className="flex items-center gap-1 pl-1.5 border-l border-white/[0.08]">
            <button
              onClick={() => scroll('left')}
              className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-all"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
              }}
              aria-label="Anterior"
            >
              <ChevronLeft style={{ width: '12px', height: '12px' }} strokeWidth={2.4} />
            </button>
            <button
              onClick={() => scroll('right')}
              className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-all"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
              }}
              aria-label="Próximo"
            >
              <ChevronRight style={{ width: '12px', height: '12px' }} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Carrossel Horizontal com 4 Cards Visíveis ── */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto pb-0.5 pt-0.5 snap-x snap-mandatory scroll-smooth no-scrollbar"
        >
          {properties.slice(0, 10).map((property, idx) => {
            const coverPhoto = property.photos?.find((p) => p.is_cover) || property.photos?.[0];
            const imageUrl = coverPhoto ? getPhotoUrl(coverPhoto.storage_path) : '';

            return (
              <div
                key={property.id || idx}
                onClick={() => onSelectProperty(property)}
                className="w-[230px] sm:w-[240px] lg:w-[250px] flex-shrink-0 snap-start glass-property-card overflow-hidden cursor-pointer group flex flex-col justify-between"
                style={{ padding: '7px 7px 9px' }}
              >
                {/* Foto com Overlay Escuro */}
                <div
                  className="relative aspect-[16/10] overflow-hidden bg-black/60"
                  style={{ borderRadius: '13px' }}
                >
                  <img
                    src={imageUrl}
                    alt={property.neighborhood}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />

                  {/* Dark gradient overlay na base da foto */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'linear-gradient(to top, rgba(4, 8, 18, 0.85) 0%, transparent 45%)',
                    }}
                  />

                  {/* Botão Circular de Favorito (Coração) no Canto Superior Direito */}
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="absolute top-2 right-2 w-6.5 h-6.5 rounded-full flex items-center justify-center text-white/90 hover:text-white transition-colors backdrop-blur-md"
                    style={{
                      background: 'rgba(0, 0, 0, 0.45)',
                      border: '1px solid rgba(255, 255, 255, 0.20)',
                    }}
                  >
                    <Heart style={{ width: '11px', height: '11px' }} strokeWidth={2} />
                  </button>
                </div>

                {/* Informações: Bairro, Metragem, Preço e Badge Próprio/Parceiro */}
                <div className="px-1 pt-2">
                  <h4 className="font-bold text-[13px] text-white truncate group-hover:text-cyan-300 transition-colors leading-tight">
                    {property.neighborhood}
                  </h4>

                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                    {property.type === 'Studio'
                      ? `Studio • ${property.area_m2} m²`
                      : `${property.bedrooms} quartos • ${property.area_m2} m²`}
                  </p>

                  <div
                    className="flex items-center justify-between mt-2 pt-1.5"
                    style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}
                  >
                    <span className="font-black text-[13px] text-white tabular tracking-tight">
                      {formatPrice(property.price)}
                    </span>

                    {/* Selo Próprio (Âmbar) ou Parceiro (Azul) idêntico à referência */}
                    <span
                      className="px-2.5 py-0.5 rounded-full text-[9px] font-bold"
                      style={
                        property.source_type === 'Próprio'
                          ? {
                              background: 'rgba(245, 158, 11, 0.15)',
                              border: '1px solid rgba(245, 158, 11, 0.40)',
                              color: '#FCD34D',
                            }
                          : {
                              background: 'rgba(2, 132, 199, 0.18)',
                              border: '1px solid rgba(2, 132, 199, 0.45)',
                              color: '#38BDF8',
                            }
                      }
                    >
                      {property.source_type}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

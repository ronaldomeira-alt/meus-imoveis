import React from 'react';
import type { Property } from '../../types/property';
import { getPhotoUrl } from '../../lib/supabase';
import { Heart } from 'lucide-react';

interface PropertyCardProps {
  property: Property;
  onClick: () => void;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({ property, onClick }) => {
  const formatPrice = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

  const coverPhoto = property.photos?.find((p) => p.is_cover) || property.photos?.[0];
  const imageUrl = coverPhoto ? getPhotoUrl(coverPhoto.storage_path) : '';

  return (
    <div
      onClick={onClick}
      className="glass-property-card overflow-hidden cursor-pointer group flex flex-col justify-between"
      style={{ padding: '8px 8px 10px' }}
    >
      {/* Foto com Overlay Escuro */}
      <div
        className="relative aspect-[16/11] overflow-hidden bg-black/60"
        style={{ borderRadius: '14px' }}
      >
        <img
          src={imageUrl}
          alt={property.neighborhood}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-106"
          loading="lazy"
        />

        {/* Gradiente escuro inferior */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(6, 10, 22, 0.85) 0%, transparent 45%)',
          }}
        />

        {/* Status se não for ativo */}
        {property.status !== 'Ativo' && (
          <span
            className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-bold backdrop-blur-md"
            style={{
              background: 'rgba(245, 158, 11, 0.20)',
              border: '1px solid rgba(245, 158, 11, 0.40)',
              color: '#FCD34D',
            }}
          >
            {property.status}
          </span>
        )}

        {/* Favorito */}
        <button
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors backdrop-blur-md"
          style={{
            background: 'rgba(0, 0, 0, 0.40)',
            border: '1px solid rgba(255, 255, 255, 0.14)',
          }}
        >
          <Heart style={{ width: '10px', height: '10px' }} strokeWidth={2} />
        </button>
      </div>

      {/* Informações */}
      <div className="px-1 pt-2">
        <h4
          className="font-bold text-[12.5px] text-white truncate group-hover:text-cyan-300 transition-colors leading-tight"
          style={{ letterSpacing: '-0.01em' }}
        >
          {property.neighborhood}
        </h4>

        <p className="text-[10px] text-slate-400 mt-0.5 truncate">
          {property.type === 'Studio'
            ? `Studio · ${property.area_m2} m²`
            : `${property.bedrooms} quartos · ${property.suites} suíte${property.suites > 1 ? 's' : ''} · ${property.area_m2} m²`}
        </p>

        {/* Preço + Origem */}
        <div
          className="flex items-center justify-between mt-2 pt-1.5"
          style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}
        >
          <span
            className="font-black text-[12.5px] text-white tabular"
            style={{ letterSpacing: '-0.03em' }}
          >
            {formatPrice(property.price)}
          </span>

          <span className="px-2 py-0.5 rounded-lg text-[10px] font-medium bg-white/[0.08] text-slate-300 border border-white/12">
            {property.source_type}
          </span>
        </div>
      </div>
    </div>
  );
};

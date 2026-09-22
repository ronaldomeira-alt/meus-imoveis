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
      className="card-surface overflow-hidden cursor-pointer group flex flex-col justify-between"
      style={{ padding: '8px 8px 10px' }}
    >
      {/* Foto com Overlay Escuro */}
      <div className="relative aspect-[16/11] overflow-hidden bg-black/40 rounded-lg">
        <img
          src={imageUrl}
          alt={property.neighborhood}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          loading="lazy"
        />

        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(6, 10, 22, 0.75) 0%, transparent 45%)' }}
        />

        {/* Status se não for ativo */}
        {property.status !== 'Ativo' && (
          <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-[9px] font-bold bg-status-warning/20 border border-status-warning/40 text-status-warning">
            {property.status}
          </span>
        )}

        {/* Favorito */}
        <button
          onClick={(e) => e.stopPropagation()}
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-ink-primary/70 hover:text-ink-primary transition-colors bg-black/45 border border-line-strong"
        >
          <Heart style={{ width: '10px', height: '10px' }} strokeWidth={2} />
        </button>
      </div>

      {/* Informações */}
      <div className="px-1 pt-2">
        <h4
          className="font-bold text-[12.5px] text-ink-primary truncate group-hover:text-accent transition-colors leading-tight"
          style={{ letterSpacing: '-0.01em' }}
        >
          {property.neighborhood}
        </h4>

        <p className="text-[10px] text-ink-secondary mt-0.5 truncate">
          {property.type === 'Studio'
            ? `Studio · ${property.area_m2} m²`
            : `${property.bedrooms} quartos · ${property.suites} suíte${property.suites > 1 ? 's' : ''} · ${property.area_m2} m²`}
        </p>

        {/* Preço + Origem */}
        <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-line-subtle">
          <span
            className="font-black text-[12.5px] text-ink-primary tabular"
            style={{ letterSpacing: '-0.03em' }}
          >
            {formatPrice(property.price)}
          </span>

          <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white/[0.05] text-ink-secondary border border-line-subtle">
            {property.source_type}
          </span>
        </div>
      </div>
    </div>
  );
};

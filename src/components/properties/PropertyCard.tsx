import React from 'react';
import type { Property } from '../../types/property';
import { getPhotoUrl } from '../../lib/supabase';
import { PropertyShareMenu } from './PropertyShareMenu';
import { InstagramIcon } from '../ui/InstagramIcon';

interface PropertyCardProps {
  property: Property;
  onClick: () => void;
  onUpdateProperty: (property: Property) => void;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({ property, onClick, onUpdateProperty }) => {
  const formatPrice = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

  const coverPhoto = property.photos?.find((p) => p.is_cover) || property.photos?.[0];
  const imageUrl = coverPhoto ? getPhotoUrl(coverPhoto.storage_path) : '';

  const instagramStatus = property.social_publications?.instagram?.status || 'not_published';
  const isInstaPublished = instagramStatus === 'published';

  const areaText =
    property.area_range && (property.area_range.min || property.area_range.max)
      ? `${property.area_range.min}–${property.area_range.max} m²`
      : `${property.area_m2} m²`;

  const bedroomsText =
    property.bedrooms_options && property.bedrooms_options.length > 0
      ? `${property.bedrooms_options.join(', ')} qts`
      : property.type === 'Studio'
      ? 'Studio'
      : `${property.bedrooms} quartos · ${property.suites} suíte${property.suites > 1 ? 's' : ''}`;

  return (
    <div
      onClick={onClick}
      className="card-surface overflow-hidden cursor-pointer group flex flex-col justify-between transition-all duration-200 hover:border-accent/40 p-1.5 pb-2 sm:p-2 sm:pb-2.5"
    >
      {/* Foto quadrada para capas verticais e horizontais */}
      <div className="relative aspect-square overflow-hidden bg-black/40 rounded-lg">
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

        <PropertyShareMenu property={property} onUpdate={onUpdateProperty} />
      </div>

      {/* Informações */}
      <div className="px-1 pt-3">
        <div className="flex items-center justify-between gap-1">
          <h4
            className="font-bold text-[13px] text-ink-primary truncate group-hover:text-accent transition-colors leading-tight"
            style={{ letterSpacing: '-0.01em' }}
          >
            {property.neighborhood}
          </h4>
          {property.is_development && (
            <span className="px-1.5 py-0.2 rounded text-[8.5px] font-bold uppercase tracking-wider bg-accent/15 text-accent border border-accent/30 flex-shrink-0">
              Planta
            </span>
          )}
        </div>

        <p className="text-[11px] text-ink-secondary mt-1 truncate">
          {bedroomsText} · {areaText}
        </p>

        {/* Badge discreto de rede social */}
        <div className="mt-1.5">
          {property.internal_name && (
            <span className="inline-flex max-w-full truncate mb-1 px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-accent/10 border border-accent/20 text-accent" title={property.internal_name}>
              {property.internal_name}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-semibold tracking-tight border ${
              isInstaPublished
                ? 'bg-status-success/15 border-status-success/35 text-status-success'
                : 'bg-white/[0.03] border-line-subtle text-ink-secondary/70'
            }`}
          >
            <InstagramIcon className="w-2.5 h-2.5 flex-shrink-0" />
            <span>{isInstaPublished ? 'Instagram · Publicado' : 'Instagram · Não publicado'}</span>
          </span>
        </div>

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

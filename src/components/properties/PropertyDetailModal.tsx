import React, { useState, useEffect } from 'react';
import { 
  X, 
  Share2, 
  Archive, 
  Trash2, 
  CheckCircle2, 
  Phone, 
  User, 
  ChevronLeft, 
  ChevronRight,
  Sparkles,
  MapPin,
  Building,
  Compass,
  Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Property } from '../../types/property';
import { getPhotoUrl } from '../../lib/supabase';
import { sharePropertySafely } from '../../lib/share-sanitizer';

interface PropertyDetailModalProps {
  property: Property | null;
  onClose: () => void;
  onArchive: (id: string) => Promise<void>;
  onMarkAsSold: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const PropertyDetailModal: React.FC<PropertyDetailModalProps> = ({
  property,
  onClose,
  onArchive,
  onMarkAsSold,
  onDelete,
}) => {
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [shareSuccess, setShareSuccess] = useState(false);

  useEffect(() => {
    setSelectedPhotoIndex(0);
    setShareSuccess(false);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [property, onClose]);

  if (!property) return null;

  const photos = property.photos && property.photos.length > 0 ? property.photos : [];
  const currentPhoto = photos[selectedPhotoIndex];
  const currentPhotoUrl = currentPhoto ? getPhotoUrl(currentPhoto.storage_path) : '';

  const formatPrice = (val: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val);

  const handleShare = async () => {
    const success = await sharePropertySafely(property);
    if (success) {
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 3000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/80 backdrop-blur-2xl"
      />

      {/* Janela Principal Glassmorphic */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        transition={{ type: 'spring', damping: 26, stiffness: 260 }}
        className="relative w-full max-w-4xl glass-modal rounded-3xl overflow-hidden z-10 my-auto border border-white/15 max-h-[92vh] flex flex-col"
      >
        {/* Barra Superior */}
        <div className="p-4 px-6 border-b border-white/10 flex items-center justify-between bg-black/30 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-bold border ${
                property.source_type === 'Próprio'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
              }`}
            >
              {property.source_type}
            </span>
            <span className="text-xs text-slate-400">· {property.type}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                shareSuccess
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'glass-pill text-cyan-300 hover:text-white'
              }`}
            >
              {shareSuccess ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
              {shareSuccess ? 'Copiado sem dados confidenciais!' : 'Compartilhar'}
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="overflow-y-auto p-5 sm:p-6 space-y-5 flex-1">
          {/* Foto Principal */}
          {currentPhotoUrl && (
            <div className="relative aspect-[16/9] w-full rounded-2xl overflow-hidden bg-black/50 border border-white/10">
              <img
                src={currentPhotoUrl}
                alt={property.neighborhood}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Miniaturas de Fotos se houver mais de uma */}
          {photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((p, idx) => (
                <button
                  key={p.id || idx}
                  onClick={() => setSelectedPhotoIndex(idx)}
                  className={`relative w-20 h-14 rounded-xl overflow-hidden flex-shrink-0 border-2 transition-all ${
                    idx === selectedPhotoIndex ? 'border-cyan-400 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={getPhotoUrl(p.storage_path)} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Título e Preço */}
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 pt-1 border-b border-white/10 pb-4">
            <div>
              <h3 className="text-2xl font-black text-white tracking-tight">{property.neighborhood}</h3>
              {property.address && (
                <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-cyan-400" />
                  {property.address}{property.number ? `, ${property.number}` : ''}
                </p>
              )}
            </div>

            <div className="text-left sm:text-right">
              <span className="text-2xl font-black text-white tabular tracking-tight block">
                {formatPrice(property.price)}
              </span>
              {property.condo_fee ? (
                <span className="text-xs text-slate-400 font-medium">
                  Condomínio: {formatPrice(property.condo_fee)}
                </span>
              ) : null}
            </div>
          </div>

          {/* Grid de Especificações Bento */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="glass-pill p-3 rounded-2xl">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Quartos</span>
              <p className="text-sm font-bold text-white mt-0.5">
                {property.bedrooms} {property.suites > 0 ? `(${property.suites} suíte)` : ''}
              </p>
            </div>

            <div className="glass-pill p-3 rounded-2xl">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Área Útil</span>
              <p className="text-sm font-bold text-white mt-0.5">{property.area_m2} m²</p>
            </div>

            <div className="glass-pill p-3 rounded-2xl">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Vagas de Garagem</span>
              <p className="text-sm font-bold text-white mt-0.5">{property.parking_spaces} vaga(s)</p>
            </div>

            <div className="glass-pill p-3 rounded-2xl">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Posição Solar</span>
              <p className="text-sm font-bold text-white mt-0.5">{property.position || 'Não informada'}</p>
            </div>
          </div>

          {/* Características */}
          {property.apartment_features && property.apartment_features.length > 0 && (
            <div>
              <span className="text-xs font-bold text-slate-300 block mb-2">Características do Imóvel</span>
              <div className="flex flex-wrap gap-1.5">
                {property.apartment_features.map((feat) => (
                  <span key={feat} className="px-3 py-1 rounded-full text-xs font-semibold glass-pill text-cyan-300">
                    {feat}
                  </span>
                ))}
              </div>
            </div>
          )}

          {property.building_features && property.building_features.length > 0 && (
            <div>
              <span className="text-xs font-bold text-slate-300 block mb-2">Estrutura do Condomínio</span>
              <div className="flex flex-wrap gap-1.5">
                {property.building_features.map((feat) => (
                  <span key={feat} className="px-3 py-1 rounded-full text-xs font-semibold glass-pill text-slate-300">
                    {feat}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Informações Confidenciais Internas (Apenas Usuários Autenticados) */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400 block">
              🔒 Informações Confidenciais (Uso Interno)
            </span>
            {property.source_type === 'Próprio' ? (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Proprietário: <strong className="text-white">{property.owner_name || 'Não informado'}</strong></span>
                {property.owner_phone && (
                  <a href={`tel:${property.owner_phone}`} className="text-cyan-400 hover:underline flex items-center gap-1 font-semibold">
                    <Phone className="w-3 h-3" /> {property.owner_phone}
                  </a>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Parceiro: <strong className="text-white">{property.partner_name || 'Não informado'}</strong></span>
                {property.partner_phone && (
                  <a href={`tel:${property.partner_phone}`} className="text-cyan-400 hover:underline flex items-center gap-1 font-semibold">
                    <Phone className="w-3 h-3" /> {property.partner_phone}
                  </a>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Barra Inferior de Ações */}
        <div className="p-4 px-6 border-t border-white/10 bg-black/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onArchive(property.id)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white glass-pill flex items-center gap-1.5 transition-all"
            >
              <Archive className="w-3.5 h-3.5" />
              Arquivar
            </button>

            {property.status !== 'Vendido' && (
              <button
                onClick={() => onMarkAsSold(property.id)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-1.5 transition-all"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                Marcar como Vendido
              </button>
            )}
          </div>

          <button
            onClick={() => {
              if (confirm('Tem certeza que deseja excluir este imóvel permanentemente?')) {
                onDelete(property.id);
              }
            }}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 flex items-center gap-1.5 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Excluir
          </button>
        </div>
      </motion.div>
    </div>
  );
};

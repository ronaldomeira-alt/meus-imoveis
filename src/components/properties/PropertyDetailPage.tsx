import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Share2,
  Edit3,
  Archive,
  Trash2,
  CheckCircle2,
  Phone,
  MessageCircle,
  MapPin,
  Building,
  Bed,
  Maximize2,
  Car,
  Compass,
  Sparkles,
  Check,
  Maximize,
  X,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Home,
  MoreHorizontal,
} from 'lucide-react';
import { InstagramIcon } from '../ui/InstagramIcon';
import { motion, AnimatePresence } from 'framer-motion';
import type { Property } from '../../types/property';
import { getPhotoUrl } from '../../lib/supabase';
import { sharePropertySafely } from '../../lib/share-sanitizer';
import { PostEditorModal } from '../marketing/PostEditorModal';
import { PropertyMatchSummary } from '../match/PropertyMatchSummary';

interface PropertyDetailPageProps {
  property: Property;
  onBack: () => void;
  onEdit: (property: Property) => void;
  onUpdateProperty?: (property: Property) => void;
  onArchive: (id: string) => Promise<void>;
  onMarkAsSold: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const PropertyDetailPage: React.FC<PropertyDetailPageProps> = ({
  property,
  onBack,
  onEdit,
  onUpdateProperty,
  onArchive,
  onMarkAsSold,
  onDelete,
}) => {
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isPostEditorOpen, setIsPostEditorOpen] = useState(false);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  // Fecha o menu de ações ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) {
        setIsActionMenuOpen(false);
      }
    };
    if (isActionMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isActionMenuOpen]);

  // Garante que o scroll suba ao topo ao abrir
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [property.id]);

  const photos = property.photos && property.photos.length > 0 ? property.photos : [];
  const currentPhoto = photos[selectedPhotoIndex];
  const currentPhotoUrl = currentPhoto ? getPhotoUrl(currentPhoto.storage_path) : '';

  // Navegação de fotos por teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) setIsFullscreen(false);
      } else if (e.key === 'ArrowLeft') {
        if (photos.length > 1) {
          setSelectedPhotoIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
        }
      } else if (e.key === 'ArrowRight') {
        if (photos.length > 1) {
          setSelectedPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [photos.length, isFullscreen]);

  const formatPrice = (val: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(val);

  const handleShare = async () => {
    const success = await sharePropertySafely(property);
    if (success) {
      setShareSuccess(true);
      setTimeout(() => setShareSuccess(false), 3000);
    }
  };

  const cleanPhone = (phone?: string) => (phone ? phone.replace(/\D/g, '') : '');

  const instagramStatus = property.social_publications?.instagram?.status || 'not_published';
  const isInstaPublished = instagramStatus === 'published';

  const handleToggleInstagramStatus = () => {
    const nextStatus = isInstaPublished ? 'not_published' : 'published';
    const updated: Property = {
      ...property,
      social_publications: {
        ...(property.social_publications || {}),
        instagram: {
          status: nextStatus,
          published_at: nextStatus === 'published' ? new Date().toISOString() : undefined,
        },
      },
    };
    if (onUpdateProperty) {
      onUpdateProperty(updated);
    }
  };

  return (
    <div className="property-detail-shell flex-1 flex flex-col min-h-0 overflow-y-auto animate-fade-in custom-scrollbar">
      {/* ── 1. HEADER SUPERIOR DE NAVEGAÇÃO & AÇÕES ── */}
      <div className="property-detail-header sticky top-0 z-20 pl-2 pr-2 sm:pl-4 sm:pr-6 py-2.5 border-b border-line-subtle bg-[var(--surface-1)] shadow-lg shadow-black/10 flex items-center justify-between md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-1.5 sm:gap-3 min-w-0">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-full hidden w-5 border-b border-line-subtle bg-[var(--surface-1)] md:block lg:w-6"
        />
        <button
          onClick={onBack}
            className="shrink-0 justify-self-start flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold text-ink-secondary hover:text-ink-primary bg-white/5 hover:bg-white/10 border border-line-subtle transition-all cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span className="sm:hidden">Voltar</span>
          <span className="hidden sm:inline">Voltar ao estoque</span>
        </button>

        {/* Grupo de Ações do Imóvel */}
        <div className="justify-self-center flex items-center justify-end gap-1 md:gap-2 min-w-0 flex-1 md:flex-none">
          {/* Criar Post Instagram com IA */}
          <button
            onClick={() => setIsPostEditorOpen(true)}
            className="h-9 w-9 md:w-auto md:h-auto md:px-3 md:py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-purple-600 via-pink-600 to-amber-600 shadow-md shadow-pink-500/20 hover:opacity-95 flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98]"
            title="Criar publicação no Instagram com IA"
          >
            <InstagramIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Criar Post IA</span>
          </button>

          {/* Editar */}
          <button
            onClick={() => onEdit(property)}
            className="h-9 w-9 md:w-auto md:h-auto md:px-3 md:py-1.5 rounded-xl text-xs font-semibold text-accent hover:text-ink-primary bg-accent/10 hover:bg-accent/20 border border-accent/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm active:scale-[0.98]"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Editar imóvel</span>
          </button>

          {/* Status Instagram */}
          <button
            onClick={handleToggleInstagramStatus}
            title={isInstaPublished ? 'Clique para marcar como não publicado no Instagram' : 'Clique para marcar como publicado no Instagram'}
            className={`hidden sm:flex px-3 py-1.5 rounded-xl text-xs font-semibold items-center gap-1.5 transition-all cursor-pointer border active:scale-[0.98] ${
              isInstaPublished
                ? 'bg-status-success/15 border-status-success/40 text-status-success hover:bg-status-success/25'
                : 'bg-white/5 hover:bg-white/10 text-ink-secondary hover:text-ink-primary border-line-subtle'
            }`}
          >
            <InstagramIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {isInstaPublished ? 'Instagram · Publicado' : 'Instagram · Não publicado'}
            </span>
          </button>

          {/* Compartilhar */}
          <button
            onClick={handleShare}
            className={`h-9 w-9 md:w-auto md:h-auto md:px-3 md:py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] ${
              shareSuccess
                ? 'bg-status-success/20 text-status-success border border-status-success/40'
                : 'pill-surface text-ink-primary hover:text-ink-primary'
            }`}
          >
            {shareSuccess ? <Check className="w-3.5 h-3.5 text-status-success" /> : <Share2 className="w-3.5 h-3.5 text-accent" />}
            <span className="hidden md:inline">{shareSuccess ? 'Copiado!' : 'Compartilhar'}</span>
          </button>

          {/* Menu de Ações Secundárias (•••) */}
          <div className="relative" ref={actionMenuRef}>
            <button
              onClick={() => setIsActionMenuOpen((prev) => !prev)}
              aria-label="Mais ações do imóvel"
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 border ${
                isActionMenuOpen
                  ? 'bg-white/15 text-ink-primary border-line-strong shadow-md'
                  : 'bg-white/5 hover:bg-white/10 text-ink-secondary hover:text-ink-primary border-line-subtle'
              }`}
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>

            {isActionMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-48 rounded-2xl bg-surface-3 border border-line-strong shadow-2xl py-1.5 z-30 animate-fade-in">
                {/* Arquivar / Reativar */}
                <button
                  onClick={() => {
                    setIsActionMenuOpen(false);
                    onArchive(property.id);
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-ink-primary hover:text-ink-primary hover:bg-white/10 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5 text-status-warning" />
                  <span>{property.status === 'Arquivado' ? 'Reativar imóvel' : 'Arquivar imóvel'}</span>
                </button>

                {/* Marcar como Vendido */}
                {property.status !== 'Vendido' && (
                  <button
                    onClick={() => {
                      setIsActionMenuOpen(false);
                      onMarkAsSold(property.id);
                    }}
                    className="w-full px-3.5 py-2 text-left text-xs font-medium text-status-success hover:text-status-success hover:bg-status-success/10 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-status-success" />
                    <span>Marcar como vendido</span>
                  </button>
                )}

                <div className="my-1 border-t border-line-subtle" />

                {/* Excluir */}
                <button
                  onClick={() => {
                    setIsActionMenuOpen(false);
                    if (window.confirm('Tem certeza que deseja excluir este imóvel permanentemente?')) {
                      onDelete(property.id);
                    }
                  }}
                  className="w-full px-3.5 py-2 text-left text-xs font-medium text-status-danger hover:text-status-danger hover:bg-status-danger/10 flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-status-danger" />
                  <span>Excluir imóvel</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. CONTEÚDO PRINCIPAL DA PÁGINA ── */}
      <div className="property-detail-content max-w-7xl mx-auto w-full min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Título, Badges e Preço no Topo */}
        <div className="property-detail-hero flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-line-subtle pb-5">
          <div className="property-detail-intro space-y-2">
            <div className="hidden sm:flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white/[0.08] text-ink-secondary border border-line-strong">
                {property.source_type}
              </span>

              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/5 text-ink-secondary border border-line-subtle">
                {property.type}
              </span>

              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  property.status === 'Ativo'
                    ? 'bg-status-success/15 text-status-success border-status-success/30'
                    : property.status === 'Vendido'
                    ? 'bg-accent/15 text-accent border-accent/30'
                    : 'bg-status-warning/15 text-status-warning border-status-warning/30'
                }`}
              >
                {property.status}
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-ink-primary tracking-tight">
              {property.neighborhood}
            </h1>

            {property.internal_name && (
              <span className="inline-flex max-w-full truncate mt-2 px-2 py-1 rounded-lg bg-accent/10 border border-accent/20 text-[11px] font-semibold text-accent" title="Nome interno / Empreendimento">
                Interno: {property.internal_name}
              </span>
            )}

            {(property.address || property.condominium_name) && (
              <p className="property-detail-address-desktop hidden md:flex text-sm text-ink-secondary items-center gap-1.5">
                <MapPin className="w-4 h-4 text-accent flex-shrink-0" />
                <span>
                  {property.condominium_name ? `${property.condominium_name} · ` : ''}
                  {property.address}
                  {property.number ? `, ${property.number}` : ''}
                  {property.complement ? ` · ${property.complement}` : ''}
                  {' · João Pessoa - PB'}
                </span>
              </p>
            )}
          </div>

          <div className="property-detail-summary text-left md:text-right flex-shrink-0 bg-white/[0.03] p-3 md:p-4 rounded-2xl border border-line-subtle">
            <span className="hidden md:block text-xs uppercase font-bold text-accent tracking-wider">
              Valor de {property.purpose === 'Locação' ? 'Aluguel' : 'Venda'}
            </span>
            <div className="text-3xl sm:text-4xl font-black text-ink-primary tabular tracking-tight">
              {formatPrice(property.price)}
            </div>
            {(property.condo_fee || property.iptu) && (
              <div className="text-xs text-ink-secondary mt-1 space-x-3">
                {property.condo_fee && <span>Condomínio: <strong>{formatPrice(property.condo_fee)}/mês</strong></span>}
                {property.iptu && <span>IPTU: <strong>{formatPrice(property.iptu)}/ano</strong></span>}
              </div>
            )}
            {(property.address || property.condominium_name) && (
              <p className="mt-2 text-xs text-ink-secondary flex items-start gap-1.5 text-left md:hidden">
                <MapPin className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
                <span>
                  {property.condominium_name ? `${property.condominium_name} · ` : ''}
                  {property.address}
                  {property.number ? `, ${property.number}` : ''}
                  {property.complement ? ` · ${property.complement}` : ''}
                  {' · João Pessoa - PB'}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* ── 3. GALERIA COMPLETA DE FOTOGRAFIAS ── */}
        <div className="property-detail-gallery space-y-3">
          {/* Foto Principal em Destaque Widescreen */}
          <div className="relative aspect-[16/9] sm:aspect-[21/9] w-full rounded-3xl overflow-hidden bg-black/60 border border-line-subtle shadow-2xl group">
            {currentPhotoUrl ? (
              currentPhoto?.media_type === 'video' || /\.(mp4|webm|mov)$/i.test(currentPhotoUrl) ? (
                <video
                  src={currentPhotoUrl}
                  controls
                  className="w-full h-full object-contain bg-black"
                />
              ) : (
                <img
                  src={currentPhotoUrl}
                  alt={property.neighborhood}
                  className="w-full h-full object-cover"
                />
              )
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-ink-secondary bg-surface-2">
                <Home className="w-12 h-12 mb-2 opacity-40" />
                <p className="text-sm">Nenhuma imagem disponível para este imóvel</p>
              </div>
            )}

            {/* Gradiente sutil */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/60 via-transparent to-black/20" />

            {/* Controles de Navegação Anterior / Próxima */}
            {photos.length > 1 && (
              <>
                <button
                  onClick={() => setSelectedPhotoIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1))}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-ink-primary border border-line-strong flex items-center justify-center transition-all opacity-80 hover:opacity-100 cursor-pointer shadow-lg active:scale-95"
                  aria-label="Foto anterior"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setSelectedPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-ink-primary border border-line-strong flex items-center justify-center transition-all opacity-80 hover:opacity-100 cursor-pointer shadow-lg active:scale-95"
                  aria-label="Próxima foto"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Botão de Tela Cheia & Indicador */}
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              {photos.length > 0 && (
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 text-ink-primary text-xs font-semibold border border-line-strong flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95"
                >
                  <Maximize className="w-3.5 h-3.5" />
                  <span>Tela Cheia</span>
                </button>
              )}
            </div>

            {photos.length > 1 && (
              <div className="absolute bottom-4 left-4 px-3 py-1 rounded-full text-xs font-semibold text-ink-primary bg-black/60 border border-line-strong">
                Foto {selectedPhotoIndex + 1} de {photos.length}
              </div>
            )}
          </div>

          {/* Miniaturas das Fotos */}
          {photos.length > 1 && (
            <div className="flex gap-2.5 overflow-x-auto pb-2 custom-scrollbar">
              {photos.map((p, idx) => {
                const thumbUrl = getPhotoUrl(p.storage_path);
                const isSelected = idx === selectedPhotoIndex;
                return (
                  <button
                    key={p.id || idx}
                    onClick={() => setSelectedPhotoIndex(idx)}
                    className={`relative w-24 sm:w-28 h-16 sm:h-20 rounded-2xl overflow-hidden flex-shrink-0 border-2 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-accent scale-105 shadow-[0_0_12px_rgba(0,229,255,0.4)]'
                        : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── 4. GRADE BENTO DE ESPECIFICAÇÕES TÉCNICAS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {/* Quartos */}
          <div className="panel-surface p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-ink-secondary flex items-center gap-1">
              <Bed className="w-3 h-3 text-accent" /> Quartos
            </span>
            <div className="text-base font-black text-ink-primary mt-1">
              {property.bedrooms}
              {property.suites > 0 ? (
                <span className="text-xs font-normal text-ink-secondary block">
                  ({property.suites} suíte{property.suites > 1 ? 's' : ''})
                </span>
              ) : null}
            </div>
          </div>

          {/* Área Útil */}
          <div className="panel-surface p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-ink-secondary flex items-center gap-1">
              <Maximize2 className="w-3 h-3 text-accent" /> Área Útil
            </span>
            <div className="text-base font-black text-ink-primary mt-1">
              {property.area_m2} <span className="text-xs font-normal text-ink-secondary">m²</span>
            </div>
          </div>

          {/* Vagas */}
          <div className="panel-surface p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-ink-secondary flex items-center gap-1">
              <Car className="w-3 h-3 text-accent" /> Garagem
            </span>
            <div className="text-base font-black text-ink-primary mt-1">
              {property.parking_spaces_type === 'Rotativas' ? 'Rotativas' : <>{property.parking_spaces} <span className="text-xs font-normal text-ink-secondary">vaga(s)</span></>}
            </div>
          </div>

          {/* Banheiros */}
          <div className="panel-surface p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-ink-secondary">Banheiros</span>
            <div className="text-base font-black text-ink-primary mt-1">
              {property.bathrooms || 1}
            </div>
          </div>

          {/* Posição Solar */}
          <div className="panel-surface p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-ink-secondary flex items-center gap-1">
              <Compass className="w-3 h-3 text-accent" /> Posição
            </span>
            <div className="text-sm font-black text-ink-primary mt-1 truncate">
              {property.position || 'Não informada'}
            </div>
          </div>

          {/* Andar */}
          <div className="panel-surface p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-ink-secondary">Andar</span>
            <div className="text-sm font-black text-ink-primary mt-1">
              {property.floor !== null && property.floor !== undefined ? `${property.floor}º andar` : '—'}
            </div>
          </div>

          {/* Mobiliado */}
          <div className="panel-surface p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-ink-secondary">Mobiliado</span>
            <div className="text-sm font-black text-ink-primary mt-1">
              {property.furnished ? 'Sim' : 'Não'}
            </div>
          </div>

          {/* Condição */}
          <div className="panel-surface p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-ink-secondary">Condição</span>
            <div className="text-sm font-black text-ink-primary mt-1">
              {property.condition || 'Usado'}
            </div>
          </div>
        </div>

        {/* ── 5. DETALHAMENTO EM DUAS COLUNAS NO DESKTOP ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Esquerda (2/3): Match e Características */}
          <div className="lg:col-span-2 space-y-6">
            {/* Inteligência de Match com WACRM */}
            <PropertyMatchSummary property={property} />

            {/* Características do Imóvel */}
            {property.apartment_features && property.apartment_features.length > 0 && (
              <div className="panel-surface p-5 rounded-3xl space-y-3">
                <h3 className="text-sm font-extrabold text-ink-primary flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-accent" />
                  Características do Imóvel
                </h3>
                <div className="flex flex-wrap gap-2">
                  {property.apartment_features.map((feat) => (
                    <span
                      key={feat}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-accent/10 text-accent border border-accent/20"
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Estrutura do Condomínio */}
            {property.building_features && property.building_features.length > 0 && (
              <div className="panel-surface p-5 rounded-3xl space-y-3">
                <h3 className="text-sm font-extrabold text-ink-primary flex items-center gap-2">
                  <Building className="w-4 h-4 text-accent" />
                  Estrutura e Lazer do Condomínio
                </h3>
                <div className="flex flex-wrap gap-2">
                  {property.building_features.map((feat) => (
                    <span
                      key={feat}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 text-ink-secondary border border-line-subtle"
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Descrição e Notas do Imóvel */}
            <div className="panel-surface p-5 sm:p-6 rounded-3xl space-y-3">
              <h3 className="text-sm font-extrabold text-ink-primary">Descrição do Imóvel</h3>
              <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed whitespace-pre-line">
                {property.notes ||
                  `Excelente ${property.type.toLowerCase()} localizado no bairro ${property.neighborhood}, com ${property.area_m2} m² de área privativa, ${property.bedrooms} quartos${property.suites > 0 ? ` (${property.suites} suíte)` : ''} e ${property.parking_spaces_type === 'Rotativas' ? 'vagas rotativas' : `${property.parking_spaces} vaga(s) de garagem`}.`}
              </p>
            </div>
          </div>

          {/* Coluna Direita (1/3): Informações Confidenciais do Corretor */}
          <div className="space-y-6">
            {/* Card Exclusivo do Corretor (Cofre / Dados Internos) */}
            <div
              className="p-5 sm:p-6 rounded-3xl space-y-4"
              style={{
                background: 'linear-gradient(180deg, rgba(212, 175, 55, 0.07) 0%, var(--surface-1) 45%)',
                border: '1px solid rgba(212, 175, 55, 0.22)',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider font-bold text-[#E5C984] flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#D4AF37]" /> Informações do Corretor
                </span>
                <span
                  className="px-2.5 py-0.5 rounded-lg text-[10px] font-medium flex items-center gap-1"
                  style={{
                    background: 'rgba(212, 175, 55, 0.08)',
                    color: '#E5C984',
                    border: '1px solid rgba(212, 175, 55, 0.22)',
                  }}
                >
                  🔒 Confidencial
                </span>
              </div>

              <p className="text-[11px] text-ink-secondary leading-normal">
                Estes dados são reservados para uso interno e <strong>nunca</strong> são expostos em compartilhamentos com clientes.
              </p>

              <div className="space-y-3 pt-2 border-t border-line-subtle">
                {property.source_type === 'Próprio' ? (
                  <>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-ink-secondary block">Proprietário</span>
                      <strong className="text-sm font-bold text-ink-primary block mt-0.5">
                        {property.owner_name || 'Nome não cadastrado'}
                      </strong>
                    </div>

                    {property.owner_phone ? (
                      <div className="flex flex-col gap-2 pt-1">
                        <span className="text-[10px] uppercase font-bold text-ink-secondary block">Contato Direto</span>
                        <div className="flex items-center gap-2">
                          <a
                            href={`tel:${cleanPhone(property.owner_phone)}`}
                            className="flex-1 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-line-subtle text-xs font-semibold text-ink-primary flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5 text-accent" />
                            <span>Ligar</span>
                          </a>

                          <a
                            href={`https://wa.me/55${cleanPhone(property.owner_phone)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2 px-3 rounded-xl bg-status-success/15 hover:bg-status-success/25 border border-status-success/30 text-xs font-semibold text-status-success flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-status-success" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                        <span className="text-xs font-mono text-ink-secondary text-center">{property.owner_phone}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-secondary italic block">Telefone não informado</span>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-ink-secondary block">Corretor / Imobiliária Parceira</span>
                      <strong className="text-sm font-bold text-ink-primary block mt-0.5">
                        {property.partner_name || 'Parceiro não informado'}
                      </strong>
                    </div>

                    {property.partner_phone ? (
                      <div className="flex flex-col gap-2 pt-1">
                        <span className="text-[10px] uppercase font-bold text-ink-secondary block">Contato Parceria</span>
                        <div className="flex items-center gap-2">
                          <a
                            href={`tel:${cleanPhone(property.partner_phone)}`}
                            className="flex-1 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-line-subtle text-xs font-semibold text-ink-primary flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5 text-accent" />
                            <span>Ligar</span>
                          </a>

                          <a
                            href={`https://wa.me/55${cleanPhone(property.partner_phone)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2 px-3 rounded-xl bg-status-success/15 hover:bg-status-success/25 border border-status-success/30 text-xs font-semibold text-status-success flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-status-success" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                        <span className="text-xs font-mono text-ink-secondary text-center">{property.partner_phone}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-ink-secondary italic block">Telefone não informado</span>
                    )}
                  </>
                )}
              </div>

              {/* Data de Cadastro */}
              <div className="pt-3 border-t border-line-subtle text-[11px] text-ink-secondary flex items-center justify-between">
                <span>Cadastrado em:</span>
                <span className="font-medium text-ink-secondary">
                  {new Date(property.created_at).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 6. MODAL FULLSCREEN / LIGHTBOX DE FOTOS ── */}
      <AnimatePresence>
        {isFullscreen && currentPhotoUrl && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4">
            {/* Fechar */}
            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-ink-primary flex items-center justify-center transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Imagem em tamanho grande */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-6xl max-h-[85vh] w-full h-full flex items-center justify-center"
            >
              <img
                src={currentPhotoUrl}
                alt=""
                className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
              />

              {photos.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPhotoIndex((prev) => (prev > 0 ? prev - 1 : photos.length - 1));
                    }}
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 text-ink-primary border border-line-strong flex items-center justify-center transition-all cursor-pointer"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 text-ink-primary border border-line-strong flex items-center justify-center transition-all cursor-pointer"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </motion.div>

            {/* Indicador no rodapé */}
            <div className="absolute bottom-4 px-4 py-1.5 rounded-full bg-black/60 border border-line-strong text-xs text-ink-primary">
              {selectedPhotoIndex + 1} / {photos.length}
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Post Studio Instagram */}
      {isPostEditorOpen && (
        <PostEditorModal
          isOpen={isPostEditorOpen}
          onClose={() => setIsPostEditorOpen(false)}
          property={property}
          onSaved={() => {
            window.dispatchEvent(new CustomEvent('marketing-posts-updated'));
          }}
        />
      )}
    </div>
  );
};

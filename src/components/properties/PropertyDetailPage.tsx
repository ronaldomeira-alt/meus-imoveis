import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Property } from '../../types/property';
import { getPhotoUrl } from '../../lib/supabase';
import { sharePropertySafely } from '../../lib/share-sanitizer';

interface PropertyDetailPageProps {
  property: Property;
  onBack: () => void;
  onEdit: (property: Property) => void;
  onArchive: (id: string) => Promise<void>;
  onMarkAsSold: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const PropertyDetailPage: React.FC<PropertyDetailPageProps> = ({
  property,
  onBack,
  onEdit,
  onArchive,
  onMarkAsSold,
  onDelete,
}) => {
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shareSuccess, setShareSuccess] = useState(false);

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

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto animate-fade-in custom-scrollbar">
      {/* ── 1. HEADER SUPERIOR DE NAVEGAÇÃO & AÇÕES ── */}
      <div className="sticky top-0 z-20 px-4 sm:px-6 py-3 border-b border-white/10 bg-[#060a16]/90 backdrop-blur-xl flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          <span>Voltar para estoque</span>
        </button>

        {/* Grupo de Ações do Imóvel */}
        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Editar */}
          <button
            onClick={() => onEdit(property)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-cyan-300 hover:text-white bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Editar imóvel</span>
          </button>

          {/* Compartilhar */}
          <button
            onClick={handleShare}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              shareSuccess
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'glass-pill text-slate-200 hover:text-white'
            }`}
          >
            {shareSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5 text-cyan-400" />}
            <span>{shareSuccess ? 'Copiado sem dados confidenciais!' : 'Compartilhar'}</span>
          </button>

          {/* Arquivar / Reativar */}
          <button
            onClick={() => onArchive(property.id)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white glass-pill flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">
              {property.status === 'Arquivado' ? 'Reativar' : 'Arquivar'}
            </span>
          </button>

          {/* Marcar como Vendido */}
          {property.status !== 'Vendido' && (
            <button
              onClick={() => onMarkAsSold(property.id)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-300 hover:text-white bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Vendido</span>
            </button>
          )}

          {/* Excluir */}
          <button
            onClick={() => {
              if (window.confirm('Tem certeza que deseja excluir este imóvel permanentemente?')) {
                onDelete(property.id);
              }
            }}
            aria-label="Excluir imóvel"
            className="p-1.5 sm:px-3 sm:py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/15 border border-rose-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Excluir</span>
          </button>
        </div>
      </div>

      {/* ── 2. CONTEÚDO PRINCIPAL DA PÁGINA ── */}
      <div className="max-w-7xl mx-auto w-full p-4 sm:p-6 lg:p-8 space-y-6">
        {/* Título, Badges e Preço no Topo */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-white/10 pb-5">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-bold border ${
                  property.source_type === 'Próprio'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                    : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                }`}
              >
                {property.source_type}
              </span>

              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-white/5 text-slate-300 border border-white/10">
                {property.type}
              </span>

              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                  property.status === 'Ativo'
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    : property.status === 'Vendido'
                    ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                }`}
              >
                {property.status}
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {property.neighborhood}
            </h1>

            {(property.address || property.condominium_name) && (
              <p className="text-sm text-slate-400 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-cyan-400 flex-shrink-0" />
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

          <div className="text-left md:text-right flex-shrink-0 bg-white/[0.03] p-4 rounded-2xl border border-white/10">
            <span className="text-xs uppercase font-bold text-cyan-400 tracking-wider block">
              Valor de {property.purpose === 'Locação' ? 'Aluguel' : 'Venda'}
            </span>
            <div className="text-3xl sm:text-4xl font-black text-white tabular tracking-tight">
              {formatPrice(property.price)}
            </div>
            {(property.condo_fee || property.iptu) && (
              <div className="text-xs text-slate-400 mt-1 space-x-3">
                {property.condo_fee && <span>Condomínio: <strong>{formatPrice(property.condo_fee)}/mês</strong></span>}
                {property.iptu && <span>IPTU: <strong>{formatPrice(property.iptu)}/ano</strong></span>}
              </div>
            )}
          </div>
        </div>

        {/* ── 3. GALERIA COMPLETA DE FOTOGRAFIAS ── */}
        <div className="space-y-3">
          {/* Foto Principal em Destaque Widescreen */}
          <div className="relative aspect-[16/9] sm:aspect-[21/9] w-full rounded-3xl overflow-hidden bg-black/60 border border-white/10 shadow-2xl group">
            {currentPhotoUrl ? (
              <img
                src={currentPhotoUrl}
                alt={property.neighborhood}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-slate-900/60">
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
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 backdrop-blur-md flex items-center justify-center transition-all opacity-80 hover:opacity-100 cursor-pointer shadow-lg active:scale-95"
                  aria-label="Foto anterior"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setSelectedPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/80 text-white border border-white/20 backdrop-blur-md flex items-center justify-center transition-all opacity-80 hover:opacity-100 cursor-pointer shadow-lg active:scale-95"
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
                  className="px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 text-white text-xs font-semibold backdrop-blur-md border border-white/20 flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95"
                >
                  <Maximize className="w-3.5 h-3.5" />
                  <span>Tela Cheia</span>
                </button>
              )}
            </div>

            {photos.length > 1 && (
              <div className="absolute bottom-4 left-4 px-3 py-1 rounded-full text-xs font-semibold text-white bg-black/60 backdrop-blur-md border border-white/15">
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
                        ? 'border-cyan-400 scale-105 shadow-[0_0_12px_rgba(0,229,255,0.4)]'
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
          <div className="glass-panel p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
              <Bed className="w-3 h-3 text-cyan-400" /> Quartos
            </span>
            <div className="text-base font-black text-white mt-1">
              {property.bedrooms}
              {property.suites > 0 ? (
                <span className="text-xs font-normal text-slate-400 block">
                  ({property.suites} suíte{property.suites > 1 ? 's' : ''})
                </span>
              ) : null}
            </div>
          </div>

          {/* Área Útil */}
          <div className="glass-panel p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
              <Maximize2 className="w-3 h-3 text-cyan-400" /> Área Útil
            </span>
            <div className="text-base font-black text-white mt-1">
              {property.area_m2} <span className="text-xs font-normal text-slate-400">m²</span>
            </div>
          </div>

          {/* Vagas */}
          <div className="glass-panel p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
              <Car className="w-3 h-3 text-cyan-400" /> Garagem
            </span>
            <div className="text-base font-black text-white mt-1">
              {property.parking_spaces} <span className="text-xs font-normal text-slate-400">vaga(s)</span>
            </div>
          </div>

          {/* Banheiros */}
          <div className="glass-panel p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400">Banheiros</span>
            <div className="text-base font-black text-white mt-1">
              {property.bathrooms || 1}
            </div>
          </div>

          {/* Posição Solar */}
          <div className="glass-panel p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
              <Compass className="w-3 h-3 text-cyan-400" /> Posição
            </span>
            <div className="text-sm font-black text-white mt-1 truncate">
              {property.position || 'Não informada'}
            </div>
          </div>

          {/* Andar */}
          <div className="glass-panel p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400">Andar</span>
            <div className="text-sm font-black text-white mt-1">
              {property.floor !== null && property.floor !== undefined ? `${property.floor}º andar` : '—'}
            </div>
          </div>

          {/* Mobiliado */}
          <div className="glass-panel p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400">Mobiliado</span>
            <div className="text-sm font-black text-white mt-1">
              {property.furnished ? 'Sim' : 'Não'}
            </div>
          </div>

          {/* Condição */}
          <div className="glass-panel p-3.5 rounded-2xl flex flex-col justify-between">
            <span className="text-[10px] uppercase font-bold text-slate-400">Condição</span>
            <div className="text-sm font-black text-white mt-1">
              {property.condition || 'Usado'}
            </div>
          </div>
        </div>

        {/* ── 5. DETALHAMENTO EM DUAS COLUNAS NO DESKTOP ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Esquerda (2/3): Características e Descrição */}
          <div className="lg:col-span-2 space-y-6">
            {/* Características do Imóvel */}
            {property.apartment_features && property.apartment_features.length > 0 && (
              <div className="glass-panel p-5 rounded-3xl space-y-3">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  Características do Imóvel
                </h3>
                <div className="flex flex-wrap gap-2">
                  {property.apartment_features.map((feat) => (
                    <span
                      key={feat}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/20"
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Estrutura do Condomínio */}
            {property.building_features && property.building_features.length > 0 && (
              <div className="glass-panel p-5 rounded-3xl space-y-3">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <Building className="w-4 h-4 text-cyan-400" />
                  Estrutura e Lazer do Condomínio
                </h3>
                <div className="flex flex-wrap gap-2">
                  {property.building_features.map((feat) => (
                    <span
                      key={feat}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white/5 text-slate-300 border border-white/10"
                    >
                      {feat}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Descrição e Notas do Imóvel */}
            <div className="glass-panel p-5 sm:p-6 rounded-3xl space-y-3">
              <h3 className="text-sm font-extrabold text-white">Descrição do Imóvel</h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                {property.notes ||
                  `Excelente ${property.type.toLowerCase()} localizado no bairro ${property.neighborhood}, com ${property.area_m2} m² de área privativa, ${property.bedrooms} quartos${property.suites > 0 ? ` (${property.suites} suíte)` : ''} e ${property.parking_spaces} vaga(s) de garagem.`}
              </p>
            </div>
          </div>

          {/* Coluna Direita (1/3): Informações Confidenciais do Corretor */}
          <div className="space-y-6">
            {/* Card Exclusivo do Corretor (Protegido com 🔒) */}
            <div className="p-5 sm:p-6 rounded-3xl bg-amber-500/[0.04] border border-amber-500/30 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider font-extrabold text-amber-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> Informações do Corretor
                </span>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  🔒 Confidencial
                </span>
              </div>

              <p className="text-[11px] text-slate-400 leading-normal">
                Estes dados são reservados para uso interno e <strong>nunca</strong> são expostos em compartilhamentos com clientes.
              </p>

              <div className="space-y-3 pt-2 border-t border-white/10">
                {property.source_type === 'Próprio' ? (
                  <>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Proprietário</span>
                      <strong className="text-sm font-bold text-white block mt-0.5">
                        {property.owner_name || 'Nome não cadastrado'}
                      </strong>
                    </div>

                    {property.owner_phone ? (
                      <div className="flex flex-col gap-2 pt-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Contato Direto</span>
                        <div className="flex items-center gap-2">
                          <a
                            href={`tel:${cleanPhone(property.owner_phone)}`}
                            className="flex-1 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Ligar</span>
                          </a>

                          <a
                            href={`https://wa.me/55${cleanPhone(property.owner_phone)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-300 flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                        <span className="text-xs font-mono text-slate-400 text-center">{property.owner_phone}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic block">Telefone não informado</span>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Corretor / Imobiliária Parceira</span>
                      <strong className="text-sm font-bold text-white block mt-0.5">
                        {property.partner_name || 'Parceiro não informado'}
                      </strong>
                    </div>

                    {property.partner_phone ? (
                      <div className="flex flex-col gap-2 pt-1">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Contato Parceria</span>
                        <div className="flex items-center gap-2">
                          <a
                            href={`tel:${cleanPhone(property.partner_phone)}`}
                            className="flex-1 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <Phone className="w-3.5 h-3.5 text-cyan-400" />
                            <span>Ligar</span>
                          </a>

                          <a
                            href={`https://wa.me/55${cleanPhone(property.partner_phone)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-300 flex items-center justify-center gap-1.5 transition-colors"
                          >
                            <MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                            <span>WhatsApp</span>
                          </a>
                        </div>
                        <span className="text-xs font-mono text-slate-400 text-center">{property.partner_phone}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500 italic block">Telefone não informado</span>
                    )}
                  </>
                )}
              </div>

              {/* Data de Cadastro */}
              <div className="pt-3 border-t border-white/10 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Cadastrado em:</span>
                <span className="font-medium text-slate-300">
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4">
            {/* Fechar */}
            <button
              onClick={() => setIsFullscreen(false)}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer"
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
                    className="absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 flex items-center justify-center transition-all cursor-pointer"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPhotoIndex((prev) => (prev < photos.length - 1 ? prev + 1 : 0));
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-black/60 hover:bg-black/80 text-white border border-white/20 flex items-center justify-center transition-all cursor-pointer"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </>
              )}
            </motion.div>

            {/* Indicador no rodapé */}
            <div className="absolute bottom-4 px-4 py-1.5 rounded-full bg-black/60 border border-white/15 text-xs text-white">
              {selectedPhotoIndex + 1} / {photos.length}
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

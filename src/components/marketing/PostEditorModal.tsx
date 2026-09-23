import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  RefreshCw,
  Calendar,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  Image as ImageIcon,
  ChevronDown,
  Clock,
  ChevronLeft,
  ChevronRight,
  Eye
} from 'lucide-react';
import { InstagramIcon } from '../ui/InstagramIcon';
import { DateTimePicker } from '../ui/DateTimePicker';
import type { Property } from '../../types/property';
import type {
  MarketingPost,
  RegenerationOption,
  PostStatus,
  PostType
} from '../../types/marketing';
import {
  generateEditorialCaption,
  REGENERATION_OPTIONS
} from '../../lib/editorial-ai';
import {
  saveMarketingPost,
  getInstagramAccount
} from '../../lib/marketing-db';
import { publishMarketingPostNow } from '../../lib/marketing-scheduler';
import { getPhotoUrl } from '../../lib/supabase';

interface PostEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  property: Property;
  existingPost?: MarketingPost | null;
  onSaved?: (post: MarketingPost) => void;
}

const extractPhotoUrls = (photos?: any[]): string[] => {
  if (!photos || !Array.isArray(photos)) return [];
  return photos
    .map((p) => {
      if (typeof p === 'string') return getPhotoUrl(p);
      if (p && p.storage_path) return getPhotoUrl(p.storage_path);
      return '';
    })
    .filter(Boolean);
};

export const PostEditorModal: React.FC<PostEditorModalProps> = ({
  isOpen,
  onClose,
  property,
  existingPost,
  onSaved,
}) => {
  const normalizedPhotos = extractPhotoUrls(property.photos);
  const [caption, setCaption] = useState(existingPost?.caption || '');
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>(
    existingPost?.media_urls && existingPost.media_urls.length > 0
      ? existingPost.media_urls
      : normalizedPhotos
  );
  const [selectedCover, setSelectedCover] = useState<string>(
    existingPost?.cover_url || normalizedPhotos[0] || ''
  );
  const [scheduledDate, setScheduledDate] = useState(() => {
    if (existingPost?.scheduled_at) {
      return new Date(existingPost.scheduled_at).toISOString().slice(0, 16);
    }
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    return tomorrow.toISOString().slice(0, 16);
  });

  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [regenDropdownOpen, setRegenDropdownOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [previewPhotoIndex, setPreviewPhotoIndex] = useState(0);
  const isLockedPublishing = existingPost?.status === 'publishing';

  // Initialize or reset when modal opens
  useEffect(() => {
    if (isOpen) {
      if (existingPost) {
        setCaption(existingPost.caption);
        setSelectedPhotos(existingPost.media_urls || []);
        setSelectedCover(existingPost.cover_url || (existingPost.media_urls?.[0] || ''));
        if (existingPost.scheduled_at) {
          setScheduledDate(new Date(existingPost.scheduled_at).toISOString().slice(0, 16));
        }
      } else {
        const norm = extractPhotoUrls(property.photos);
        setSelectedPhotos(norm);
        setSelectedCover(norm[0] || '');
        // If caption is empty, auto-generate initial caption
        if (!caption) {
          handleGenerateCaption('default');
        }
      }
      setStatusMessage(null);
    }
  }, [isOpen, property.id, existingPost?.id]);

  if (!isOpen) return null;

  const togglePhoto = (url: string) => {
    if (selectedPhotos.includes(url)) {
      if (selectedPhotos.length === 1) return; // Keep at least one
      const updated = selectedPhotos.filter((p) => p !== url);
      setSelectedPhotos(updated);
      if (selectedCover === url) {
        setSelectedCover(updated[0] || '');
      }
    } else {
      setSelectedPhotos([...selectedPhotos, url]);
      if (!selectedCover) setSelectedCover(url);
    }
  };

  const handleGenerateCaption = async (option: RegenerationOption = 'default') => {
    setIsGenerating(true);
    setStatusMessage(null);
    try {
      const generated = await generateEditorialCaption({
        property,
        option,
      });
      setCaption(generated);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: `Erro ao gerar legenda: ${err.message || 'Falha na IA'}`,
      });
    } finally {
      setIsGenerating(false);
      setRegenDropdownOpen(false);
    }
  };

  const buildPostPayload = (status: PostStatus, scheduleISO?: string): MarketingPost => {
    const postType: PostType = selectedPhotos.length > 1 ? 'carousel' : 'feed';
    const snapshot = (existingPost?.property_snapshot && Object.keys(existingPost.property_snapshot).length > 0)
      ? existingPost.property_snapshot
      : {
          title: property.title || `${property.type} em ${property.neighborhood}`,
          price: property.price,
          neighborhood: property.neighborhood,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          suites: property.suites,
          parking_spaces: property.parking_spaces,
          area_m2: property.area_m2,
          notes: property.notes,
          photos: property.photos,
        };

    return {
      id: existingPost?.id,
      listing_id: property.id,
      property_snapshot: snapshot,
      caption,
      media_urls: selectedPhotos,
      cover_url: selectedCover || selectedPhotos[0] || '',
      post_type: postType,
      channel: 'instagram',
      status,
      scheduled_at: scheduleISO || null,
      published_at: existingPost?.published_at || null,
      provider: 'instagram',
      external_media_id: existingPost?.external_media_id || null,
      last_error: null,
      retry_count: 0,
      publishing_lock_until: null,
    };
  };

  const handleSaveDraft = async () => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const payload = buildPostPayload('draft');
      const saved = await saveMarketingPost(payload);
      setStatusMessage({ type: 'success', text: 'Rascunho salvo com sucesso!' });
      onSaved?.(saved);
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Erro ao salvar rascunho: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSchedulePost = async () => {
    if (!scheduledDate) {
      setStatusMessage({ type: 'error', text: 'Selecione data e horário para a programação.' });
      return;
    }
    const scheduleTime = new Date(scheduledDate).getTime();
    if (isNaN(scheduleTime)) {
      setStatusMessage({ type: 'error', text: 'Data de agendamento inválida.' });
      return;
    }
    if (scheduleTime <= Date.now() + 60000) {
      setStatusMessage({ type: 'error', text: 'A data de programação deve estar no mínimo 2 minutos no futuro.' });
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);
    try {
      const scheduleISO = new Date(scheduledDate).toISOString();
      const payload = buildPostPayload('approved', scheduleISO);
      const saved = await saveMarketingPost(payload);
      setStatusMessage({
        type: 'success',
        text: `Post aprovado e programado com sucesso para ${new Date(scheduledDate).toLocaleString('pt-BR')}!`,
      });
      onSaved?.(saved);
      setTimeout(() => onClose(), 1500);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Erro ao programar: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublishNow = async () => {
    const account = await getInstagramAccount();
    if (!account || account.status !== 'connected' || !account.instagram_user_id) {
      setStatusMessage({
        type: 'error',
        text: 'Instagram não conectado! Configure sua conta em Configurações > Inteligência de Marketing.',
      });
      return;
    }

    if (!confirm('Deseja publicar este post no Instagram agora imediatamente?')) {
      return;
    }

    setIsPublishing(true);
    setStatusMessage(null);
    try {
      // First save as approved
      const payload = buildPostPayload('approved');
      const saved = await saveMarketingPost(payload);

      // Now invoke publisher
      const result = await publishMarketingPostNow(saved);
      if (result.success) {
        setStatusMessage({
          type: 'success',
          text: `Publicado com sucesso no Instagram! ID: ${result.mediaId}`,
        });
        onSaved?.({
          ...saved,
          status: 'published',
          published_at: new Date().toISOString(),
          external_media_id: result.mediaId,
        });
        setTimeout(() => onClose(), 2000);
      } else {
        setStatusMessage({
          type: 'error',
          text: `Falha na publicação: ${result.error}`,
        });
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Erro na publicação: ${err.message}` });
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-3xl bg-surface-3 border border-line-strong shadow-modal overflow-hidden text-ink-primary">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-line-subtle bg-surface-2/90">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-600 to-amber-500 text-white shadow-md">
              <InstagramIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-ink-primary">
                  Post Studio · Instagram
                </h2>
                <span className="text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-surface-1 text-ink-secondary border border-line-subtle">
                  {selectedPhotos.length > 1 ? `Carrossel (${selectedPhotos.length})` : 'Foto Única'}
                </span>
              </div>
              <p className="text-xs text-ink-secondary truncate max-w-md mt-0.5">
                {property.title} · {property.neighborhood || 'Bairro'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-ink-secondary hover:text-ink-primary hover:bg-surface-1 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Alert Banner */}
        {statusMessage && (
          <div
            className={`px-6 py-3 flex items-center gap-3 text-xs font-semibold ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 text-emerald-300 border-b border-emerald-500/20'
                : 'bg-red-500/10 text-red-300 border-b border-red-500/20'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {isLockedPublishing && (
          <div className="px-6 py-3 flex items-center gap-3 text-xs font-semibold bg-amber-500/10 text-amber-300 border-b border-amber-500/20">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Este post está sendo publicado no momento e está bloqueado contra edições concorrentes.</span>
          </div>
        )}

        {/* Content Body: Two Columns (Editor & Live Preview) */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Form & Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {/* 1. Mídia Selector */}
            <div className="bg-surface-1 border border-line-subtle p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-primary flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-ink-secondary" />
                  Mídias do Imóvel ({selectedPhotos.length} selecionada{selectedPhotos.length !== 1 ? 's' : ''})
                </span>
                <span className="text-[11px] text-ink-secondary">
                  Clique para marcar/desmarcar
                </span>
              </div>

              {normalizedPhotos && normalizedPhotos.length > 0 ? (
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 max-h-36 overflow-y-auto p-1">
                  {normalizedPhotos.map((photo: string, index: number) => {
                    const isSelected = selectedPhotos.includes(photo);
                    const isCover = selectedCover === photo;
                    return (
                      <div
                        key={index}
                        onClick={() => togglePhoto(photo)}
                        className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all group ${
                          isSelected
                            ? 'border-ink-primary shadow-sm'
                            : 'border-transparent opacity-40 hover:opacity-75'
                        }`}
                      >
                        <img
                          src={photo}
                          alt={`Foto ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-ink-primary flex items-center justify-center text-[10px] text-base font-bold">
                            ✓
                          </div>
                        )}
                        {isCover && (
                          <div className="absolute bottom-0 inset-x-0 bg-base text-[9px] text-ink-primary font-bold text-center py-0.5 uppercase tracking-tighter border-t border-line-strong">
                            Capa
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-dashed border-line-subtle text-center text-xs text-ink-secondary">
                  Nenhuma foto cadastrada neste imóvel.
                </div>
              )}
            </div>

            {/* 2. Legenda e IA Prompt Engine */}
            <div className="bg-surface-1 border border-line-subtle p-4 rounded-2xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-primary flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-ink-secondary" />
                  Legenda do Post
                </span>

                {/* Regenerate Dropdown */}
                <div className="relative">
                  <div className="inline-flex rounded-xl bg-surface-2 border border-line-subtle overflow-hidden">
                    <button
                      onClick={() => handleGenerateCaption('default')}
                      disabled={isGenerating}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-ink-primary hover:bg-surface-3 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${isGenerating ? 'animate-spin' : ''}`} />
                      {isGenerating ? 'Criando...' : 'Regenerar'}
                    </button>
                    <button
                      onClick={() => setRegenDropdownOpen(!regenDropdownOpen)}
                      className="px-2 py-1.5 text-ink-secondary hover:text-ink-primary border-l border-line-subtle hover:bg-surface-3 transition-colors cursor-pointer"
                      title="Opções de Refinamento de Tom"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Dropdown Menu */}
                  {regenDropdownOpen && (
                    <div className="absolute right-0 mt-1.5 w-64 rounded-2xl bg-surface-2 border border-line-strong shadow-modal p-1.5 z-20 animate-scale-in space-y-1">
                      <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-secondary">
                        Estilos & Ângulos
                      </div>
                      {REGENERATION_OPTIONS.map((opt: { id: RegenerationOption; label: string; desc: string }) => (
                        <button
                          key={opt.id}
                          onClick={() => handleGenerateCaption(opt.id)}
                          className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-surface-3 text-ink-primary transition-colors flex flex-col cursor-pointer"
                        >
                          <span className="font-semibold">{opt.label}</span>
                          <span className="text-[10px] text-ink-secondary">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Textarea */}
              <div className="relative">
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={9}
                  placeholder="Escreva ou gere com IA a legenda perfeita..."
                  className="w-full p-3.5 rounded-xl bg-surface-2 border border-line-subtle text-xs text-ink-primary placeholder:text-ink-muted focus:border-line-strong focus:ring-1 focus:ring-white/10 outline-none leading-relaxed transition-all resize-none"
                />
                <div className="flex items-center justify-between text-[11px] text-ink-secondary px-1 pt-1">
                  <span>
                    Dica: Baseada nos dados do imóvel, observações e na sua Skill Editorial.
                  </span>
                  <span className={caption.length > 2200 ? 'text-status-danger font-bold' : ''}>
                    {caption.length}/2200 caracteres
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Programação Temporal Minimalista e Fluida */}
            <div className="bg-surface-1 border border-line-subtle p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-ink-primary flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-ink-secondary" />
                  Data e Horário de Publicação
                </span>
                <span className="text-[11px] text-ink-secondary">
                  Fuso horário de Brasília (UTC-3)
                </span>
              </div>

              {/* DateTimePicker customizado aderente ao Design System */}
              <DateTimePicker
                value={scheduledDate}
                onChange={setScheduledDate}
              />
            </div>
          </div>

          {/* Right Column: Instagram Live Preview (5 cols) */}
          <div className="lg:col-span-5 flex flex-col items-center">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-primary flex items-center gap-1.5 mb-3 self-start">
              <Eye className="w-3.5 h-3.5 text-ink-secondary" />
              Pré-visualização do Feed
            </span>

            {/* Instagram Mockup Card */}
            <div className="w-full max-w-[340px] rounded-3xl bg-black border border-line-subtle shadow-modal overflow-hidden flex flex-col text-white">
              {/* Instagram Card Header */}
              <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-white/5">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-500 to-amber-500 p-0.5">
                    <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-[10px] font-black">
                      MI
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold leading-none">meusimoveis</span>
                    <span className="text-[10px] text-white/50 leading-none mt-0.5">
                      {property.neighborhood || 'Bairro'}
                    </span>
                  </div>
                </div>
                <span className="text-white/40 text-xs">•••</span>
              </div>

              {/* Photo Viewport */}
              <div className="relative aspect-square bg-[#050505] flex items-center justify-center overflow-hidden">
                {selectedPhotos.length > 0 ? (
                  <>
                    <img
                      src={selectedPhotos[previewPhotoIndex] || selectedPhotos[0]}
                      alt="Visualização"
                      className="w-full h-full object-cover transition-all"
                    />
                    {selectedPhotos.length > 1 && (
                      <>
                        <button
                          onClick={() =>
                            setPreviewPhotoIndex(
                              (prev) => (prev > 0 ? prev - 1 : selectedPhotos.length - 1)
                            )
                          }
                          className="absolute left-2 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() =>
                            setPreviewPhotoIndex(
                              (prev) => (prev < selectedPhotos.length - 1 ? prev + 1 : 0)
                            )
                          }
                          className="absolute right-2 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/70 text-[10px] font-bold tracking-wider">
                          {previewPhotoIndex + 1}/{selectedPhotos.length}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-white/40">Sem imagem selecionada</span>
                )}
              </div>

              {/* Caption & Actions */}
              <div className="p-3.5 space-y-2 text-xs bg-black">
                <div className="flex items-center justify-between text-white/70">
                  <div className="flex items-center gap-3">
                    <span>❤️</span>
                    <span>💬</span>
                    <span>✈️</span>
                  </div>
                  <span>🔖</span>
                </div>

                <div className="text-[11px] leading-relaxed max-h-36 overflow-y-auto pr-1">
                  <span className="font-bold mr-1">meusimoveis</span>
                  <span className="text-white/80 whitespace-pre-wrap">
                    {caption || 'A legenda gerada aparecerá aqui...'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-line-subtle bg-surface-2/90">
          <button
            onClick={handleSaveDraft}
            disabled={isSaving || isPublishing || isLockedPublishing}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-1 border border-line-subtle text-xs font-bold text-ink-primary hover:bg-surface-3 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4 text-ink-secondary" />
            Salvar Rascunho
          </button>

          <div className="w-full sm:w-auto flex items-center gap-2.5">
            <button
              onClick={handleSchedulePost}
              disabled={isSaving || isPublishing || isLockedPublishing}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-surface-1 hover:bg-surface-3 border border-line-strong text-ink-primary text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              <Calendar className="w-4 h-4 text-ink-secondary" />
              Aprovar & Programar
            </button>

            <button
              onClick={handlePublishNow}
              disabled={isSaving || isPublishing || isLockedPublishing}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-600 to-amber-600 text-white font-bold text-xs shadow-md hover:opacity-95 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Send className={`w-4 h-4 ${isPublishing ? 'animate-bounce' : ''}`} />
              {isPublishing ? 'Publicando...' : 'Publicar Agora'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

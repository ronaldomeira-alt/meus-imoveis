import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Sparkles,
  PenSquare,
  Mic,
  X,
  Check,
  Send,
  Loader2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { AudioRecorder } from '../../lib/audio-recorder';
import { processImageFile, ProcessedImage } from '../../lib/image-processor';
import { ExtractedPropertyData, validatePropertyExtraction } from '../../lib/gemini';
import { validateRequiredPropertyFields } from '../../lib/property-validation';
import {
  transcribeAudioMultiProvider,
  extractPropertyMultiProvider,
  PreferredAIProvider,
} from '../../lib/ai-provider';
import type { Property, PropertyPhoto } from '../../types/property';
import { PropertyGallery } from './PropertyGallery';
import { uploadPropertyMedia, deletePropertyMedia } from '../../lib/r2-media';
import { PropertyFicha } from './PropertyFicha';
import { AudioWaveform } from '../ui/AudioWaveform';

const emptyReviewData: ExtractedPropertyData = {
  purpose: null,
  type: null,
  neighborhood: null,
  address: null,
  number: null,
  complement: null,
  condominium_name: null,
  internal_name: null,
  bedrooms: null,
  suites: null,
  bathrooms: null,
  parking_spaces: null,
  parking_spaces_type: null,
  area_m2: null,
  is_approximate_area: false,
  price: null,
  is_approximate_price: false,
  condo_fee: null,
  condo_included: false,
  condo_not_applicable: false,
  iptu: null,
  floor: null,
  position: null,
  furnished: null,
  condition: null,
  building_features: [],
  apartment_features: [],
  source_type: 'Próprio',
  owner_name: null,
  owner_phone: null,
  partner_name: null,
  partner_phone: null,
  notes: '',
  missing_mandatory: [],
  missing_desirable: [],
  field_states: {},
  ambiguous_fields: [],
};

// Campos acompanhados no indicador de progresso: os 5 obrigatórios + 5 desejáveis
// mais relevantes para o negócio. O botão Salvar só depende dos 5 obrigatórios
// (validateRequiredPropertyFields) — este indicador é só uma visão mais completa da ficha.
const TRACKED_LABELS: Record<string, string> = {
  type: 'Tipo',
  neighborhood: 'Bairro',
  area_m2: 'Área',
  bedrooms: 'Quartos',
  price: 'Preço',
  suites: 'Suítes',
  bathrooms: 'Banheiros',
  parking_spaces: 'Vagas',
  condo: 'Condomínio',
  amenities: 'Área de lazer',
};

const getTrackedResolution = (data: ExtractedPropertyData): Record<string, boolean> => ({
  type: Boolean(data.type),
  neighborhood: Boolean(data.neighborhood),
  area_m2: data.area_m2 != null,
  bedrooms: data.bedrooms != null,
  price: data.price != null,
  suites: data.suites != null,
  bathrooms: data.bathrooms != null,
  parking_spaces: data.parking_spaces != null || data.parking_spaces_type === 'Rotativas',
  condo: data.condo_fee != null || Boolean(data.condo_included) || Boolean(data.condo_not_applicable),
  amenities: (data.building_features?.length ?? 0) > 0 || data.field_states?.building_features === 'informed',
});

interface AddPropertyPageProps {
  onSaveProperty: (property: Property) => void;
  onBack: () => void;
  geminiApiKey?: string;
  groqApiKey?: string;
  preferredAIProvider?: PreferredAIProvider;
}

export const AddPropertyPage: React.FC<AddPropertyPageProps> = ({
  onSaveProperty,
  onBack,
  geminiApiKey,
  groqApiKey,
  preferredAIProvider,
}) => {
  // 'ai' apenas decide se a barra de entrada por voz/texto fica visível —
  // a ficha em si é sempre a mesma e sempre editável diretamente (célula a célula).
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');

  const [textInput, setTextInput] = useState('');
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showValidationErrors, setShowValidationErrors] = useState(false);
  const [reviewData, setReviewData] = useState<ExtractedPropertyData>(emptyReviewData);

  const [showClearModal, setShowClearModal] = useState(false);

  const recorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Autoexpansão vertical suave do composer: 1 a 4 linhas sem scroll; a partir da 5ª linha, mantém altura máxima com scroll interno
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maxHeight = 92; // ~4 linhas de texto
    const scrollH = textarea.scrollHeight;
    if (scrollH > maxHeight) {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.height = `${Math.max(26, scrollH)}px`;
      textarea.style.overflowY = 'hidden';
    }
  }, [textInput, mode]);

  const handleClearFicha = () => {
    images.forEach((image) => {
      if (image.previewUrl.startsWith('blob:')) URL.revokeObjectURL(image.previewUrl);
    });
    setImages([]);
    setReviewData(emptyReviewData);
    setTextInput('');
    setErrorMessage(null);
    setProcessingStatus('');
    setIsProcessingImages(false);
    setIsProcessingAI(false);
    handleCancelRecording();
    setShowValidationErrors(false);
    setShowClearModal(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current) {
        recorderRef.current.cancel();
        recorderRef.current = null;
      }
    };
  }, []);

  // ── Gravação de Áudio ──
  const handleStartRecording = async () => {
    try {
      setErrorMessage(null);
      if (recorderRef.current) {
        recorderRef.current.cancel();
        recorderRef.current = null;
      }
      const recorder = new AudioRecorder();
      await recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch (err: any) {
      console.error('Erro ao iniciar gravação de áudio:', err);
      setErrorMessage(err.message || 'Não foi possível acessar o microfone. Verifique as permissões do navegador.');
      setIsRecording(false);
    }
  };

  const handleCancelRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recorderRef.current) {
      recorderRef.current.cancel();
      recorderRef.current = null;
    }
    setIsRecording(false);
  };

  const handleStopAndTranscribeRecording = async () => {
    if (!recorderRef.current) return;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setIsRecording(false);
    setIsTranscribing(true);
    setProcessingStatus('Transcrevendo áudio com IA...');
    setErrorMessage(null);

    try {
      const audioBlob = await recorder.stop();
      const spokenText = recorder.getSpokenText();
      const result = await transcribeAudioMultiProvider({
        audioBlob,
        groqApiKey,
        geminiApiKey,
        preferredProvider: preferredAIProvider,
        spokenTextFallback: spokenText,
      });
      setTextInput((prev) => {
        const trimmed = prev.trim();
        if (!trimmed) return result.text;
        return `${trimmed}\n\n${result.text}`;
      });
    } catch (err: any) {
      console.error('Erro ao transcrever áudio:', err);
      setErrorMessage(err.message || 'Não foi possível transcrever o áudio. Tente falar novamente ou digite as informações.');
    } finally {
      setIsTranscribing(false);
      setProcessingStatus('');
    }
  };

  const propertyIdRef = useRef<string>('');
  if (!propertyIdRef.current) {
    propertyIdRef.current = `prop-${Date.now()}`;
  }

  // ── Mídias ──
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsProcessingImages(true);

    const propId = propertyIdRef.current;
    const selectedFiles = Array.from(e.target.files);

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const processed = await processImageFile(file);
      const isFirst = images.length === 0 && i === 0;
      processed.isCover = isFirst;
      processed.isUploading = true;
      processed.uploadProgress = 0;

      const tempId = `temp-${Date.now()}-${i}`;
      processed.id = tempId;
      setImages((prev) => [...prev, processed]);

      if (processed.file) {
        try {
          const uploaded = await uploadPropertyMedia(propId, processed.file, {
            sortOrder: images.length + i,
            isCover: isFirst,
            onProgress: (p) => {
              setImages((prev) =>
                prev.map((img) =>
                  img.id === tempId ? { ...img, uploadProgress: p.pct } : img
                )
              );
            },
          });

          setImages((prev) =>
            prev.map((img) =>
              img.id === tempId
                ? {
                    ...img,
                    id: uploaded.id,
                    objectKey: uploaded.object_key,
                    storagePath: uploaded.object_key,
                    storageProvider: 'r2',
                    previewUrl: uploaded.public_url || img.previewUrl,
                    isUploading: false,
                    uploadProgress: 100,
                  }
                : img
            )
          );
        } catch (uploadErr) {
          console.error('Erro no upload para R2:', uploadErr);
          setImages((prev) =>
            prev.map((img) =>
              img.id === tempId
                ? {
                    ...img,
                    isUploading: false,
                    uploadError: 'Falha no upload',
                  }
                : img
            )
          );
        }
      }
    }

    setIsProcessingImages(false);
    e.target.value = '';
  };

  const handleRemoveImage = (index: number) => {
    const target = images[index];
    if (target) {
      const propId = propertyIdRef.current;
      const keyOrPath = target.objectKey || target.storagePath;
      if (keyOrPath && (keyOrPath.startsWith('properties/') || target.storageProvider === 'r2')) {
        deletePropertyMedia(propId, { mediaId: target.id, objectKey: keyOrPath }).catch((err) =>
          console.error('Erro ao deletar mídia do R2/Supabase:', err)
        );
      }
    }
    setImages((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length > 0 && !updated.some((img) => img.isCover)) {
        updated[0].isCover = true;
      }
      return updated;
    });
  };

  const handleSetCover = (index: number) => {
    setImages((prev) => prev.map((img, i) => ({ ...img, isCover: i === index })));
  };

  // ── Atualização reativa de campo (usada pela ficha, IA e edição manual por igual) ──
  const handleUpdateReviewField = (field: keyof ExtractedPropertyData, value: any) => {
    setReviewData((prev) => {
      const updated = { ...prev, [field]: value };
      const validation = validatePropertyExtraction(updated);
      updated.missing_mandatory = validation.missing_mandatory;
      updated.missing_desirable = validation.missing_desirable;
      return updated;
    });
  };

  // ── Extração via IA ──
  const handleSendToAI = async () => {
    if (!textInput.trim()) {
      setErrorMessage('Fale ou escreva os dados do imóvel para prosseguir.');
      return;
    }

    setIsProcessingAI(true);
    setProcessingStatus('Extraindo características, valores e dados com IA...');
    setErrorMessage(null);

    try {
      const result = await extractPropertyMultiProvider({
        text: textInput,
        groqApiKey,
        geminiApiKey,
        preferredProvider: preferredAIProvider,
      });

      setReviewData((prev) => {
        const hasExistingData = Boolean(prev.type || prev.neighborhood || prev.price || prev.area_m2);
        if (!hasExistingData) return result.data;

        const merged: ExtractedPropertyData = { ...prev };
        (Object.keys(result.data) as (keyof ExtractedPropertyData)[]).forEach((key) => {
          const val = result.data[key];

          // field_states é mesclado (não substituído) para não "esquecer" campos já
          // resolvidos em falas anteriores que esta nova frase não voltou a mencionar.
          if (key === 'field_states') {
            merged.field_states = { ...(prev.field_states || {}), ...((val as any) || {}) };
            return;
          }

          // Descrição: cada frase nova complementa a anterior, não substitui.
          if (key === 'notes') {
            const prevNotes = (prev.notes || '').trim();
            const newNotes = typeof val === 'string' ? val.trim() : '';
            if (newNotes) merged.notes = prevNotes ? `${prevNotes} ${newNotes}` : newNotes;
            return;
          }

          // Arrays (comodidades etc.): um array vazio nesta frase significa "não
          // mencionado agora", não "limpar o que já tínhamos" — só substitui se vier
          // algo de fato novo.
          if (Array.isArray(val)) {
            if (val.length > 0) (merged as any)[key] = val;
            return;
          }

          if (val !== null && val !== undefined && val !== '') {
            (merged as any)[key] = val;
          }
        });

        const validation = validatePropertyExtraction(merged);
        merged.missing_mandatory = validation.missing_mandatory;
        merged.missing_desirable = validation.missing_desirable;
        return merged;
      });

      setTextInput('');
    } catch (err) {
      console.error('Erro na extração de IA:', err);
      setErrorMessage('Houve um erro ao processar as informações com IA. Suas anotações e fotos foram preservadas para tentar novamente.');
    } finally {
      setIsProcessingAI(false);
      setProcessingStatus('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (typeof window !== 'undefined' && window.innerWidth > 640 && textInput.trim() && !isProcessingAI && !isRecording && !isTranscribing) {
        e.preventDefault();
        handleSendToAI();
      }
    }
  };

  // ── Salvar ──
  const requiredValidation = validateRequiredPropertyFields(reviewData);
  const trackedResolution = getTrackedResolution(reviewData);
  const pendingKeys = Object.keys(trackedResolution).filter((k) => !trackedResolution[k]);
  const pendingLabels = pendingKeys.map((k) => TRACKED_LABELS[k]);
  const progressPct = Math.round(((10 - pendingKeys.length) / 10) * 100);

  const handleConfirmSave = () => {
    if (!requiredValidation.valid) {
      setShowValidationErrors(true);
      setErrorMessage(`Preencha os campos obrigatórios antes de salvar: ${requiredValidation.missingLabels.join(', ')}.`);
      return;
    }

    const newPropertyId = propertyIdRef.current;
    const photos: PropertyPhoto[] = images.map((img, idx) => ({
      id: img.id || `photo-${idx}`,
      property_id: newPropertyId,
      storage_path: img.objectKey || img.storagePath || img.previewUrl,
      sort_order: idx,
      is_cover: img.isCover,
      object_key: img.objectKey,
      storage_provider: img.storageProvider || (img.objectKey ? 'r2' : 'external'),
    }));

    if (photos.length === 0) {
      photos.push({
        id: 'photo-0',
        property_id: newPropertyId,
        storage_path: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80',
        sort_order: 0,
        is_cover: true,
      });
    }

    const newProp: Property = {
      id: newPropertyId,
      purpose: reviewData.purpose || 'Venda',
      type: reviewData.type || 'Apartamento',
      neighborhood: reviewData.neighborhood || '',
      address: reviewData.address || undefined,
      number: reviewData.number || undefined,
      complement: reviewData.complement || undefined,
      condominium_name: reviewData.condominium_name || undefined,
      internal_name: reviewData.internal_name || undefined,
      bedrooms: reviewData.bedrooms ?? 0,
      suites: reviewData.suites ?? 0,
      bathrooms: reviewData.bathrooms ?? 0,
      parking_spaces: reviewData.parking_spaces ?? 0,
      parking_spaces_type: reviewData.parking_spaces_type === 'Rotativas' ? 'Rotativas' : undefined,
      area_m2: reviewData.area_m2 ?? 0,
      is_development: reviewData.is_development,
      area_range: reviewData.area_range,
      bedrooms_options: reviewData.bedrooms_options,
      social_publications: reviewData.social_publications || {
        instagram: { status: 'not_published' },
      },
      price: reviewData.price ?? 0,
      condo_fee: reviewData.condo_included || reviewData.condo_not_applicable ? 0 : (reviewData.condo_fee ?? 0),
      iptu: reviewData.iptu ?? undefined,
      floor: reviewData.floor ?? null,
      position: reviewData.position ?? undefined,
      furnished: Boolean(reviewData.furnished),
      condition: reviewData.condition ?? undefined,
      building_features: reviewData.building_features || [],
      apartment_features: reviewData.apartment_features || [],
      source_type: reviewData.source_type || 'Próprio',
      owner_name: reviewData.owner_name || undefined,
      owner_phone: reviewData.owner_phone || undefined,
      partner_name: reviewData.partner_name || undefined,
      partner_phone: reviewData.partner_phone || undefined,
      notes: reviewData.notes || '',
      status: 'Ativo',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      photos,
    };

    onSaveProperty(newProp);

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#3B82F6', '#60A5FA', '#93C5FD', '#10B981'],
    });

    onBack();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden animate-fade-in">
      {/* ── Header da página ── */}
      <div className="flex-shrink-0 mb-4">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary hover:text-ink-primary transition-colors mb-2 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary block mb-0.5">
              Estoque / Adicionar imóvel
            </span>
            <h1 className="text-xl lg:text-2xl font-bold text-ink-primary tracking-tight">Adicionar imóvel</h1>
            <p className="text-xs text-ink-secondary mt-0.5">Cadastre um novo imóvel com IA ou manualmente.</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              title="Limpar todas as informações da ficha, inclusive as fotos"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-ink-secondary hover:text-ink-primary hover:bg-white/[0.05] border border-line-subtle transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Limpar informações</span>
            </button>

            <div className="p-1 bg-surface-1 border border-line-subtle rounded-xl inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMode('ai')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                  mode === 'ai' ? 'bg-accent/20 text-accent border border-accent/40 font-bold' : 'text-ink-secondary hover:text-ink-primary border border-transparent font-medium'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Com IA</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleCancelRecording();
                  setMode('manual');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                  mode === 'manual' ? 'bg-accent/20 text-accent border border-accent/40 font-bold' : 'text-ink-secondary hover:text-ink-primary border border-transparent font-medium'
                }`}
              >
                <PenSquare className="w-3.5 h-3.5" />
                <span>Manual</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleConfirmSave}
              disabled={!requiredValidation.valid}
              title={!requiredValidation.valid ? `Faltam: ${requiredValidation.missingLabels.join(', ')}` : 'Salvar imóvel'}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed ${
                requiredValidation.valid
                  ? 'bg-status-success hover:bg-status-success/90 text-white'
                  : 'bg-white/[0.05] text-ink-secondary border border-line-subtle'
              }`}
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>{requiredValidation.valid ? 'Salvar imóvel' : `Faltam ${requiredValidation.missing.length}`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Modal de Confirmação para Limpar Ficha ── */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in">
          <div className="w-full max-w-sm modal-surface rounded-2xl p-5 border border-line-subtle shadow-modal space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-status-warning/15 border border-status-warning/30 flex items-center justify-center text-status-warning flex-shrink-0">
                <RotateCcw className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink-primary">Limpar informações?</h3>
                <p className="text-xs text-ink-secondary mt-0.5">
                  Todos os dados da ficha, inclusive as fotos e vídeos adicionados, serão removidos.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-subtle">
              <button
                type="button"
                onClick={() => setShowClearModal(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-ink-secondary hover:text-ink-primary hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleClearFicha}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-status-warning/20 hover:bg-status-warning/30 border border-status-warning/40 text-status-warning transition-colors cursor-pointer"
              >
                Sim, limpar ficha
              </button>
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="flex-shrink-0 mb-3 p-3 rounded-xl bg-status-warning/10 border border-status-warning/25 flex items-center justify-between gap-3 text-status-warning text-xs animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button type="button" onClick={() => setErrorMessage(null)} className="p-1 hover:text-ink-primary rounded-lg hover:bg-white/10 transition-colors cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Canvas único: mídias + ficha ── */}
      <div className="flex-1 min-h-0 overflow-y-auto panel-surface rounded-2xl p-4 lg:p-5 space-y-5">
        <PropertyGallery
          images={images}
          onFilesSelected={handleFilesSelected}
          onRemoveImage={handleRemoveImage}
          onSetCover={handleSetCover}
          onReorderImages={(newImages) => setImages(newImages)}
          isProcessing={isProcessingImages}
        />

        <div className="h-px bg-line-subtle/50" />

        <PropertyFicha
          data={reviewData}
          onUpdateField={handleUpdateReviewField}
          requiredValidation={requiredValidation}
          pendingLabels={pendingLabels}
          progressPct={progressPct}
          showValidationErrors={showValidationErrors}
        />
      </div>

      {/* ── Entrada por texto/voz (modo IA) com base ancorada e expansão suave ── */}
      {mode === 'ai' && (
        <div className="flex-shrink-0 mt-3">
          <div
            className={`w-full rounded-xl border flex items-end gap-2 px-3 py-1.5 transition-all duration-200 ${
              isRecording
                ? 'bg-white/[0.04] border-accent/40'
                : isTranscribing || isProcessingAI
                ? 'bg-white/[0.04] border-accent/30'
                : 'bg-white/[0.025] border-line-subtle focus-within:border-accent/40 focus-within:bg-white/[0.04]'
            }`}
          >
            {isRecording ? (
              <div className="flex-1 flex items-center gap-2 py-1 px-1">
                <AudioWaveform variant="wide" />
                <span className="flex items-center gap-1.5 whitespace-nowrap text-status-danger text-[10px] font-semibold uppercase tracking-wider animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-status-danger" />
                  REC
                </span>
              </div>
            ) : isTranscribing ? (
              <div className="flex-1 flex items-center gap-2 py-1 px-1 text-ink-secondary">
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                <span className="text-xs sm:text-sm italic">Transcrevendo áudio com IA...</span>
              </div>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-accent/80 flex-shrink-0 mb-2" />
                <textarea
                  ref={textareaRef}
                  value={textInput}
                  onChange={(e) => {
                    setTextInput(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={isProcessingAI}
                  rows={1}
                  placeholder="Fale ou escreva os dados do imóvel..."
                  className="flex-1 bg-transparent text-ink-primary placeholder-ink-secondary/60 text-xs sm:text-sm focus:outline-none resize-none py-1 disabled:opacity-50 transition-[height] duration-150 ease-out leading-relaxed"
                />
              </>
            )}

            <div className="flex items-center gap-1.5 flex-shrink-0 mb-1">
              {isRecording ? (
                <>
                  <button
                    type="button"
                    onClick={handleCancelRecording}
                    title="Cancelar gravação"
                    className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-line-subtle text-ink-secondary hover:text-ink-primary flex items-center justify-center transition-all cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleStopAndTranscribeRecording}
                    title="Finalizar gravação"
                    className="w-7 h-7 rounded-lg bg-accent hover:bg-accent-hover text-white flex items-center justify-center transition-all cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </>
              ) : !isTranscribing ? (
                <>
                  <button
                    type="button"
                    onClick={handleStartRecording}
                    disabled={isProcessingAI}
                    title="Gravar áudio narrando os detalhes"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-secondary hover:text-ink-primary hover:bg-white/10 transition-all cursor-pointer disabled:opacity-40"
                  >
                    <Mic className="w-3.5 h-3.5 text-accent" />
                  </button>
                  <button
                    type="button"
                    onClick={handleSendToAI}
                    disabled={isProcessingAI || !textInput.trim()}
                    title="Enviar para análise da IA"
                    className="btn-primary w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isProcessingAI ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3 h-3" />}
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {processingStatus && (
            <p className="text-[10px] text-ink-secondary mt-1 text-center">{processingStatus}</p>
          )}
        </div>
      )}
    </div>
  );
};

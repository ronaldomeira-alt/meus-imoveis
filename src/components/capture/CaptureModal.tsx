import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  Mic,
  Plus,
  Star,
  Check,
  ArrowLeft,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  HelpCircle,
  Send,
  PenSquare,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { AudioRecorder } from '../../lib/audio-recorder';
import { processImageFile, ProcessedImage } from '../../lib/image-processor';
import { ExtractedPropertyData, validatePropertyExtraction } from '../../lib/gemini';
import {
  validateRequiredPropertyFields,
  MANDATORY_FIELD_LABELS,
  MandatoryPropertyFieldKey,
} from '../../lib/property-validation';
import {
  transcribeAudioMultiProvider,
  extractPropertyMultiProvider,
  PreferredAIProvider,
} from '../../lib/ai-provider';
import type {
  Property,
  PropertyType,
  PropertyPurpose,
  PropertyPosition,
  PropertyCondition,
} from '../../types/property';
import { ManualPropertyForm } from './ManualPropertyForm';

const emptyReviewData: ExtractedPropertyData = {
  purpose: null,
  type: null,
  neighborhood: null,
  address: null,
  number: null,
  complement: null,
  condominium_name: null,
  bedrooms: null,
  suites: null,
  bathrooms: null,
  parking_spaces: null,
  area_m2: null,
  is_approximate_area: false,
  price: null,
  is_approximate_price: false,
  condo_fee: null,
  condo_included: false,
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

interface CaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveProperty: (property: Property) => void;
  geminiApiKey?: string;
  groqApiKey?: string;
  preferredAIProvider?: PreferredAIProvider;
}

export const CaptureModal: React.FC<CaptureModalProps> = ({
  isOpen,
  onClose,
  onSaveProperty,
  geminiApiKey,
  groqApiKey,
  preferredAIProvider,
}) => {
  // ── Modo de Captação: 'ai' ou 'manual' (Padrão: Com IA) ──
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');

  // Estados do Step (para o fluxo de IA)
  const [step, setStep] = useState<'composer' | 'review'>('composer');

  // Estados do Composer
  const [textInput, setTextInput] = useState('');
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs de mídia e textarea
  const recorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Estados dos dados extraídos para revisão (inicialmente sem defaults inventados)
  const [reviewData, setReviewData] = useState<ExtractedPropertyData>(emptyReviewData);

  useEffect(() => {
    if (isOpen) {
      setMode('ai');
      setStep('composer');
      setErrorMessage(null);
      setReviewData(emptyReviewData);
      setTextInput('');
      setImages([]);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current) {
        recorderRef.current.cancel();
        recorderRef.current = null;
      }
    };
  }, []);

  if (!isOpen) return null;

  // ── Gravação de Áudio Nativo ──
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
      setRecordingSeconds(0);

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Erro ao iniciar gravação de áudio:', err);
      setErrorMessage(err.message || 'Não foi possível acessar o microfone. Verifique as permissões do navegador.');
      setIsRecording(false);
      setRecordingSeconds(0);
    }
  };

  // Cancelar gravação e descartar áudio (volta ao normal sem transcrever nem enviar)
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
    setRecordingSeconds(0);
  };

  // Finalizar gravação de áudio e transcrever para dentro do textarea do mesmo composer (NÃO envia à IA ainda)
  const handleStopAndTranscribeRecording = async () => {
    if (!recorderRef.current) return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

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

      const transcription = result.text;

      // Coloca o texto transcrito diretamente dentro do textarea do mesmo composer
      setTextInput((prev) => {
        const trimmed = prev.trim();
        if (!trimmed) return transcription;
        return `${trimmed}\n\n${transcription}`;
      });
    } catch (err: any) {
      console.error('Erro ao transcrever áudio:', err);
      setErrorMessage(err.message || 'Não foi possível transcrever o áudio. Tente falar novamente ou digite as informações.');
    } finally {
      setIsTranscribing(false);
      setProcessingStatus('');
      setRecordingSeconds(0);
    }
  };

  const handleModalClose = () => {
    handleCancelRecording();
    setMode('ai');
    setStep('composer');
    onClose();
  };

  // ── Upload e Processamento de Imagens ──
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsProcessing(true);
    setProcessingStatus('Processando e convertendo imagens...');

    const newImages: ProcessedImage[] = [];
    for (let i = 0; i < e.target.files.length; i++) {
      const file = e.target.files[i];
      const processed = await processImageFile(file);
      if (images.length === 0 && newImages.length === 0) {
        processed.isCover = true;
      }
      newImages.push(processed);
    }

    setImages((prev) => [...prev, ...newImages]);
    setIsProcessing(false);
    setProcessingStatus('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      if (updated.length > 0 && !updated.some((img) => img.isCover)) {
        updated[0].isCover = true;
      }
      return updated;
    });
  };

  const handleSetCover = (index: number) => {
    setImages((prev) =>
      prev.map((img, i) => ({
        ...img,
        isCover: i === index,
      }))
    );
  };

  // Atualização reativa de campo no review com recálculo imediato de obrigatoriedade
  const handleUpdateReviewField = (field: keyof ExtractedPropertyData, value: any) => {
    setReviewData((prev) => {
      const updated = { ...prev, [field]: value };
      const validation = validatePropertyExtraction(updated);
      updated.missing_mandatory = validation.missing_mandatory;
      updated.missing_desirable = validation.missing_desirable;
      return updated;
    });
  };

  // ── Extração Inteligente com IA (Acionado SOMENTE no clique do botão "Enviar") ──
  const handleSendToAI = async () => {
    if (!textInput.trim() && images.length === 0) {
      setErrorMessage('Escreva os dados do imóvel ou grave um áudio para prosseguir.');
      return;
    }

    setIsProcessing(true);
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
        // Verifica se já existiam dados confirmados anteriormente (atualização incremental)
        const hasExistingData = Boolean(prev.type || prev.neighborhood || prev.price || prev.area_m2);
        if (!hasExistingData) {
          return result.data;
        }

        // Merge incremental: preserva o que já tínhamos confirmado e só substitui se a nova extração trouxe valor explícito não-nulo
        const merged: ExtractedPropertyData = { ...prev };
        (Object.keys(result.data) as (keyof ExtractedPropertyData)[]).forEach((key) => {
          const val = result.data[key];
          if (val !== null && val !== undefined && val !== '') {
            (merged as any)[key] = val;
          }
        });

        // Recalcula validações para os dados mesclados
        const validation = validatePropertyExtraction(merged);
        merged.missing_mandatory = validation.missing_mandatory;
        merged.missing_desirable = validation.missing_desirable;
        return merged;
      });

      setStep('review');
    } catch (err) {
      console.error('Erro na extração de IA:', err);
      setErrorMessage('Houve um erro ao processar as informações com IA. Suas anotações e fotos foram preservadas para tentar novamente.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // Envio pelo teclado com Enter no desktop (Shift+Enter para quebra de linha)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (typeof window !== 'undefined' && window.innerWidth > 640 && (textInput.trim() || images.length > 0) && !isProcessing && !isRecording && !isTranscribing) {
        e.preventDefault();
        handleSendToAI();
      }
    }
  };

  // ── Finalização e Salvar no Estoque ──
  const handleConfirmSave = () => {
    const validation = validateRequiredPropertyFields(reviewData);
    if (!validation.valid) {
      setErrorMessage(
        `Preencha os campos obrigatórios antes de salvar: ${validation.missingLabels.join(', ')}.`
      );
      return;
    }

    const newPropertyId = `prop-${Date.now()}`;
    const photos = images.map((img, idx) => ({
      id: `photo-${idx}`,
      property_id: newPropertyId,
      storage_path: img.previewUrl,
      sort_order: idx,
      is_cover: img.isCover,
    }));

    // Se nenhuma foto foi enviada, usa placeholder moderno
    if (photos.length === 0) {
      photos.push({
        id: `photo-0`,
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
      bedrooms: reviewData.bedrooms ?? 0,
      suites: reviewData.suites ?? 0,
      bathrooms: reviewData.bathrooms ?? 0,
      parking_spaces: reviewData.parking_spaces ?? 0,
      area_m2: reviewData.area_m2 ?? 0,
      price: reviewData.price ?? 0,
      condo_fee: reviewData.condo_included ? 0 : (reviewData.condo_fee ?? 0),
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

    // Efeito de celebração
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#3B82F6', '#60A5FA', '#93C5FD', '#10B981'],
    });

    onClose();
    // Reset
    setStep('composer');
    setTextInput('');
    setImages([]);
    setReviewData(emptyReviewData);
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const requiredValidation = validateRequiredPropertyFields(reviewData);
  const missingMandatoryKeys: MandatoryPropertyFieldKey[] = requiredValidation.missing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 animate-fade-in">
      <div
        className={`relative w-full modal-surface rounded-3xl flex flex-col overflow-hidden border border-line-strong transition-all duration-300 ease-in-out ${
          mode === 'manual'
            ? 'max-w-5xl h-[750px] max-h-[90vh]'
            : 'max-w-3xl h-[580px] max-h-[92vh]'
        }`}
      >
        {/* ── HEADER DO MODAL ── */}
        <div className="px-6 pt-5 pb-3 flex items-start justify-between flex-shrink-0">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-ink-primary tracking-tight flex items-center gap-2">
              Adicionar imóvel
            </h2>
            <p className="text-xs text-ink-secondary mt-0.5">
              Adicione um imóvel do jeito que preferir.
            </p>
          </div>

          <button
            type="button"
            onClick={handleModalClose}
            className="p-2 -mr-2 -mt-1 rounded-xl text-ink-secondary hover:text-ink-primary hover:bg-white/10 transition-colors cursor-pointer"
            title="Fechar"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── SELETOR DE MODO: SEGMENTED CONTROL COMPACTO ── */}
        <div className="px-6 pb-3 flex-shrink-0 border-b border-line-subtle">
          <div className="p-1 bg-surface-1 border border-line-subtle rounded-2xl inline-flex items-center gap-1 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setMode('ai')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-1.5 rounded-xl text-xs transition-all duration-200 cursor-pointer ${
                mode === 'ai'
                  ? 'bg-accent/20 text-accent border border-accent/40 shadow-[0_0_15px_rgba(0,229,255,0.15)] font-bold'
                  : 'text-ink-secondary hover:text-ink-primary hover:bg-white/5 border border-transparent font-medium'
              }`}
            >
              <Sparkles className={`w-3.5 h-3.5 ${mode === 'ai' ? 'text-accent' : 'text-ink-secondary'}`} />
              <span>Com IA</span>
            </button>

            <button
              type="button"
              onClick={() => {
                handleCancelRecording();
                setMode('manual');
              }}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-1.5 rounded-xl text-xs transition-all duration-200 cursor-pointer ${
                mode === 'manual'
                  ? 'bg-accent/20 text-accent border border-accent/40 shadow-[0_0_15px_rgba(0,229,255,0.15)] font-bold'
                  : 'text-ink-secondary hover:text-ink-primary hover:bg-white/5 border border-transparent font-medium'
              }`}
            >
              <PenSquare className={`w-3.5 h-3.5 ${mode === 'manual' ? 'text-accent' : 'text-ink-secondary'}`} />
              <span>Manual</span>
            </button>
          </div>
        </div>

        {/* ── CONTEÚDO: MODO IA OU MODO MANUAL ── */}
        {mode === 'ai' ? (
          step === 'composer' ? (
          /* ── ESPAÇO PRINCIPAL COM UM ÚNICO AI COMPOSER ── */
          <div className="flex-1 flex flex-col justify-end p-4 sm:p-6 relative overflow-hidden">
            {/* Input de arquivos oculto (ativado pelo botão [+] do composer) */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.heic,.heif"
              onChange={handleFilesSelected}
              className="hidden"
            />

            {/* Mensagem de Erro / Alerta com botão de fechar */}
            {errorMessage && (
              <div className="mb-3 p-3 rounded-xl bg-status-warning/10 border border-status-warning/25 flex items-center justify-between gap-3 text-status-warning text-xs animate-fade-in flex-shrink-0">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-status-warning flex-shrink-0" />
                  <span>{errorMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="p-1 text-status-warning hover:text-ink-primary rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* ── UM ÚNICO AI COMPOSER: Altura travada em 112px em todos os estados ── */}
            <div
              className={`w-full h-[112px] rounded-2xl border flex flex-col overflow-hidden transition-all duration-200 ${
                isRecording
                  ? 'bg-white/[0.04] border-accent/40 shadow-[0_0_20px_rgba(0,229,255,0.08)]'
                  : isTranscribing
                  ? 'bg-white/[0.04] border-accent/30'
                  : isProcessing
                  ? 'bg-white/[0.04] border-accent/40'
                  : 'bg-white/[0.03] border-line-strong focus-within:border-accent/50 focus-within:bg-white/[0.05]'
              }`}
            >
              {/* CONTEÚDO SUPERIOR DO COMPOSER: Altura 70px */}
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
                {isRecording ? (
                  /* Estado RECORDING: 'Ouvindo...' em ciano suave com tipografia premium */
                  <div className="flex-1 px-4 py-3 select-none animate-fade-in flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-accent animate-pulse shadow-[0_0_8px_rgba(0,229,255,0.7)]" />
                    <span className="text-accent/90 italic text-sm font-normal tracking-wide">
                      Ouvindo...
                    </span>
                  </div>
                ) : isTranscribing ? (
                  /* Estado TRANSCRIBING: processando áudio para colocar no textarea */
                  <div className="flex-1 px-4 py-3 select-none animate-fade-in flex items-center gap-2.5 text-accent">
                    <Loader2 className="w-4 h-4 animate-spin text-accent" />
                    <span className="text-sm italic font-normal text-ink-secondary">Transcrevendo áudio com IA...</span>
                  </div>
                ) : (
                  /* Estado NORMAL / DIGITAÇÃO: Anexos de fotos + Textarea */
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative">
                    {/* Overlay de processamento de envio à IA */}
                    {isProcessing && (
                      <div className="absolute inset-0 bg-surface-2 z-20 flex items-center justify-center gap-2 text-accent text-xs font-medium animate-fade-in">
                        <Loader2 className="w-4 h-4 animate-spin text-accent" />
                        <span>{processingStatus || 'Analisando com IA...'}</span>
                      </div>
                    )}

                    {/* Anexos de Fotos DENTRO do Composer */}
                    {images.length > 0 && (
                      <div className="flex items-center gap-2 px-3 pt-2 pb-1 overflow-x-auto scrollbar-none flex-shrink-0">
                        {images.map((img, idx) => (
                          <div
                            key={idx}
                            className="relative flex-shrink-0 w-10 h-10 rounded-lg overflow-hidden group border border-line-strong bg-surface-2 shadow-md"
                          >
                            <img
                              src={img.previewUrl}
                              alt={`Foto ${idx + 1}`}
                              className="w-full h-full object-cover"
                            />
                            {img.isCover && (
                              <span className="absolute top-0.5 left-0.5 px-1 py-0.2 rounded bg-accent text-[7px] font-bold text-white flex items-center gap-0.5 shadow">
                                <Star className="w-1.5 h-1.5 fill-current" />
                              </span>
                            )}
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                              {!img.isCover && (
                                <button
                                  type="button"
                                  onClick={() => handleSetCover(idx)}
                                  title="Definir como capa"
                                  className="p-0.5 rounded bg-white/20 hover:bg-accent hover:text-white text-ink-primary transition-colors cursor-pointer"
                                >
                                  <Star className="w-2.5 h-2.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleRemoveImage(idx)}
                                title="Remover foto"
                                className="p-0.5 rounded bg-white/20 hover:bg-surface-2 text-ink-primary transition-colors cursor-pointer"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          title="Adicionar mais fotos"
                          className="flex-shrink-0 w-10 h-10 rounded-lg border border-dashed border-line-strong hover:border-accent/50 hover:bg-accent/5 flex items-center justify-center text-ink-secondary hover:text-accent transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Campo de Texto Principal */}
                    <textarea
                      ref={textareaRef}
                      value={textInput}
                      onChange={(e) => {
                        setTextInput(e.target.value);
                        if (errorMessage) setErrorMessage(null);
                      }}
                      onKeyDown={handleKeyDown}
                      disabled={isProcessing}
                      placeholder={
                        Boolean(reviewData.neighborhood || reviewData.price || reviewData.type)
                          ? "Fale ou digite informações complementares (ex: 'Valor de venda 420 mil')..."
                          : "Escreva os dados do imóvel..."
                      }
                      className="w-full flex-1 px-3 py-2 bg-transparent text-ink-primary placeholder-ink-secondary text-sm focus:outline-none resize-none leading-relaxed overflow-y-auto disabled:opacity-50"
                    />
                  </div>
                )}
              </div>

              {/* BARRA DE CONTROLES INFERIOR DO COMPOSER: Altura travada em 42px */}
              <div className="h-[42px] px-3 sm:px-3.5 flex items-center justify-between gap-2 border-t border-line-subtle flex-shrink-0">
                {isRecording ? (
                  /* Controles da Gravação: [ + ] na esquerda | [ dots ciano ] [ ✕ ] [ ✓ ] na direita */
                  <>
                    <div className="flex items-center">
                      <button
                        type="button"
                        disabled
                        className="w-8 h-8 rounded-xl flex items-center justify-center text-ink-muted bg-white/[0.02] border border-line-subtle opacity-40 cursor-not-allowed"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Dotted Waveform Ciano */}
                      <div className="flex items-center gap-1 sm:gap-1.5 mr-1 sm:mr-2 select-none" aria-hidden="true">
                        {[...Array(15)].map((_, i) => (
                          <span
                            key={i}
                            className="w-1 h-1 rounded-full bg-accent/80 shadow-[0_0_6px_rgba(0,229,255,0.45)] animate-pulse"
                            style={{
                              animationDelay: `${(i % 5) * 0.16}s`,
                              animationDuration: '1.1s',
                            }}
                          />
                        ))}
                      </div>

                      {/* Botão Cancelar [ ✕ ] */}
                      <button
                        type="button"
                        onClick={handleCancelRecording}
                        title="Cancelar gravação"
                        aria-label="Cancelar gravação"
                        className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-line-subtle text-ink-secondary hover:text-ink-primary flex items-center justify-center transition-all cursor-pointer active:scale-95"
                      >
                        <X className="w-4 h-4" />
                      </button>

                      {/* Botão Finalizar [ ✓ ] - Gradiente Ciano com brilho característico */}
                      <button
                        type="button"
                        onClick={handleStopAndTranscribeRecording}
                        title="Finalizar gravação e transcrever"
                        aria-label="Finalizar gravação"
                        className="w-8 h-8 rounded-xl bg-accent hover:bg-accent-hover text-white font-bold flex items-center justify-center transition-all cursor-pointer shadow-md shadow-accent/25 active:scale-95"
                      >
                        <Check className="w-4 h-4 stroke-[2.5]" />
                      </button>
                    </div>
                  </>
                ) : isTranscribing ? (
                  /* Durante a transcrição */
                  <div className="flex items-center justify-between w-full h-8 px-1">
                    <button
                      type="button"
                      disabled
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-ink-muted bg-transparent opacity-40 cursor-not-allowed"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2 text-xs text-accent font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                      <span>Transcrevendo áudio...</span>
                    </div>
                  </div>
                ) : (
                  /* Controles normais: [ + ] [ 🎙 ] ... [ ➤ Enviar ] */
                  <>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isProcessing}
                        title="Anexar fotos do imóvel"
                        aria-label="Anexar fotos"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-secondary hover:text-ink-primary bg-white/5 hover:bg-white/10 border border-line-subtle transition-all cursor-pointer group disabled:opacity-40"
                      >
                        <Plus className="w-3.5 h-3.5 text-ink-secondary group-hover:text-accent transition-colors" />
                      </button>

                      <button
                        type="button"
                        onClick={handleStartRecording}
                        disabled={isProcessing}
                        title="Gravar áudio narrando os detalhes"
                        aria-label="Gravar áudio"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-secondary hover:text-ink-primary bg-white/5 hover:bg-white/10 border border-line-subtle transition-all cursor-pointer group disabled:opacity-40"
                      >
                        <Mic className="w-3.5 h-3.5 text-accent group-hover:scale-110 transition-transform" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleSendToAI}
                      disabled={isProcessing || (!textInput.trim() && images.length === 0)}
                      title="Enviar para análise e extração com IA"
                      aria-label="Enviar dados do imóvel"
                      className="btn-primary h-7 px-3.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Analisando...</span>
                        </>
                      ) : (
                        <>
                          <span>Enviar</span>
                          <Send className="w-3 h-3" />
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* ── ETAPA DE REVISÃO (STEP REVIEW) ── */
          <>
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 custom-scrollbar">
              {/* Indicador Geral de Campos Obrigatórios (Topo) */}
              {!requiredValidation.valid ? (
                <div className="p-4 rounded-2xl bg-status-danger/10 border border-status-danger/30 space-y-2.5">
                  <div className="flex items-center gap-2 text-status-danger text-xs font-bold">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    <span>
                      Faltam {missingMandatoryKeys.length}{' '}
                      {missingMandatoryKeys.length === 1
                        ? 'informação obrigatória'
                        : 'informações obrigatórias'}{' '}
                      para adicionar este imóvel.
                    </span>
                  </div>
                  <p className="text-xs text-status-danger/90 leading-relaxed">
                    Para garantir a confiabilidade dos dados no estoque, preencha os 5 campos essenciais destacados abaixo ou retorne ao composer para falar/digitar:
                  </p>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    {missingMandatoryKeys.map((key: MandatoryPropertyFieldKey) => (
                      <span
                        key={key}
                        className="px-2.5 py-1 rounded-lg bg-status-danger/20 text-status-danger border border-status-danger/40 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                      >
                        <AlertCircle className="w-3.5 h-3.5 text-status-danger" />
                        {MANDATORY_FIELD_LABELS[key]}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-status-success/10 border border-status-success/30 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-status-success flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-status-success">
                      Todas as informações obrigatórias foram preenchidas!
                    </p>
                    <p className="text-[11px] text-status-success/80">
                      O imóvel atende a todos os requisitos do estoque e está pronto para ser salvo.
                    </p>
                  </div>
                </div>
              )}

              {/* Aviso de campos ambíguos na fala */}
              {reviewData.ambiguous_fields && reviewData.ambiguous_fields.length > 0 && (
                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-400/20 flex items-center gap-2.5 text-xs text-purple-200">
                  <HelpCircle className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <span>
                    Campos com fala ambígua ou incerta:{' '}
                    <strong className="text-ink-primary">{reviewData.ambiguous_fields.join(', ')}</strong>. Por favor confira os valores.
                  </span>
                </div>
              )}

              {/* Fotos Anexadas no Composer (exibidas na revisão para conferência) */}
              {images.length > 0 && (
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-line-subtle space-y-2.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-ink-secondary block">
                    Fotos Anexadas ({images.length})
                  </label>
                  <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
                    {images.map((img, idx) => (
                      <div
                        key={idx}
                        className="relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-line-strong shadow-md"
                      >
                        <img
                          src={img.previewUrl}
                          alt={`Foto ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {img.isCover && (
                          <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-accent text-[8px] font-bold text-white flex items-center gap-0.5 shadow">
                            <Star className="w-2 h-2 fill-current" /> Capa
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── SEÇÃO 1: INFORMAÇÕES ESSENCIAIS (Obrigatórias) ── */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-line-subtle space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-line-subtle">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-primary flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_rgba(0,229,255,0.8)]" />
                      Informações Essenciais
                      <span className="text-[11px] text-status-danger font-normal lowercase">(obrigatórias)</span>
                    </h3>
                    <p className="text-[11px] text-ink-secondary mt-0.5">
                      Os 5 dados fundamentais exigidos para salvar no estoque.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* 1. Tipo de Imóvel * */}
                  <div>
                    <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                      <span>Tipo do Imóvel <span className="text-status-danger">*</span></span>
                      {!requiredValidation.errors.type ? (
                        <span className="text-[10px] text-status-success font-semibold flex items-center gap-1">
                          <Check className="w-3 h-3" /> Preenchido
                        </span>
                      ) : (
                        <span className="text-[10px] text-status-danger font-bold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Obrigatório
                        </span>
                      )}
                    </label>
                    <select
                      value={reviewData.type || ''}
                      onChange={(e) => handleUpdateReviewField('type', (e.target.value || null) as PropertyType)}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${
                        requiredValidation.errors.type
                          ? 'border-2 border-status-danger/70 text-status-danger bg-status-danger/5 focus:border-status-danger'
                          : 'border border-line-subtle text-ink-primary bg-surface-1 focus:border-accent'
                      }`}
                    >
                      <option value="" disabled>Selecione o tipo do imóvel...</option>
                      <option value="Apartamento">Apartamento</option>
                      <option value="Casa">Casa</option>
                      <option value="Flat">Flat</option>
                      <option value="Studio">Studio</option>
                      <option value="Cobertura">Cobertura</option>
                      <option value="Terreno">Terreno</option>
                      <option value="Comercial">Comercial</option>
                      <option value="Outro">Outro</option>
                    </select>
                  </div>

                  {/* 2. Bairro * */}
                  <div>
                    <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                      <span>Bairro <span className="text-status-danger">*</span></span>
                      {!requiredValidation.errors.neighborhood ? (
                        <span className="text-[10px] text-status-success font-semibold flex items-center gap-1">
                          <Check className="w-3 h-3" /> Preenchido
                        </span>
                      ) : (
                        <span className="text-[10px] text-status-danger font-bold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Obrigatório
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Bessa, Manaíra, Cabo Branco..."
                      value={reviewData.neighborhood || ''}
                      onChange={(e) => handleUpdateReviewField('neighborhood', e.target.value || null)}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${
                        requiredValidation.errors.neighborhood
                          ? 'border-2 border-status-danger/70 text-ink-primary placeholder-rose-400/50 bg-status-danger/5 focus:border-status-danger'
                          : 'border border-line-subtle text-ink-primary bg-surface-1 focus:border-accent'
                      }`}
                    />
                  </div>

                  {/* 3. Valor do Imóvel * */}
                  <div>
                    <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                      <span>
                        {reviewData.purpose === 'Locação' ? 'Valor do Aluguel (R$)' : 'Valor do Imóvel (R$)'}{' '}
                        <span className="text-status-danger">*</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        {reviewData.is_approximate_price && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-status-warning/20 text-status-warning border border-status-warning/30">
                            ~ Aproximado
                          </span>
                        )}
                        {!requiredValidation.errors.price ? (
                          <span className="text-[10px] text-status-success font-semibold flex items-center gap-1">
                            <Check className="w-3 h-3" /> Preenchido
                          </span>
                        ) : (
                          <span className="text-[10px] text-status-danger font-bold flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Obrigatório
                          </span>
                        )}
                      </div>
                    </label>
                    <input
                      type="number"
                      placeholder="Ex: 450000"
                      value={reviewData.price ?? ''}
                      onChange={(e) =>
                        handleUpdateReviewField('price', e.target.value !== '' ? parseFloat(e.target.value) : null)
                      }
                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold focus:outline-none transition-colors ${
                        requiredValidation.errors.price
                          ? 'border-2 border-status-danger/70 text-ink-primary placeholder-rose-400/50 bg-status-danger/5 focus:border-status-danger'
                          : 'border border-line-subtle text-accent bg-surface-1 focus:border-accent'
                      }`}
                    />
                  </div>

                  {/* 4. Quartos * (aceita 0, ex: studio/comercial) */}
                  <div>
                    <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                      <span>Quartos <span className="text-status-danger">*</span></span>
                      {!requiredValidation.errors.bedrooms ? (
                        <span className="text-[10px] text-status-success font-semibold flex items-center gap-1">
                          <Check className="w-3 h-3" /> Preenchido
                        </span>
                      ) : (
                        <span className="text-[10px] text-status-danger font-bold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Obrigatório
                        </span>
                      )}
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Ex: 2 (ou 0 para studio/sala)"
                      value={reviewData.bedrooms ?? ''}
                      onChange={(e) =>
                        handleUpdateReviewField(
                          'bedrooms',
                          e.target.value !== '' ? parseInt(e.target.value, 10) : null
                        )
                      }
                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${
                        requiredValidation.errors.bedrooms
                          ? 'border-2 border-status-danger/70 text-ink-primary placeholder-rose-400/50 bg-status-danger/5 focus:border-status-danger'
                          : 'border border-line-subtle text-ink-primary bg-surface-1 focus:border-accent'
                      }`}
                    />
                    <p className="text-[10px] text-ink-secondary mt-1">
                      Informe 0 para salas comerciais ou studios.
                    </p>
                  </div>

                  {/* 5. Área Privativa (m²) * */}
                  <div>
                    <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                      <span>Área (m²) <span className="text-status-danger">*</span></span>
                      <div className="flex items-center gap-1.5">
                        {reviewData.is_approximate_area && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-status-warning/20 text-status-warning border border-status-warning/30">
                            ~ Aproximado
                          </span>
                        )}
                        {!requiredValidation.errors.area_m2 ? (
                          <span className="text-[10px] text-status-success font-semibold flex items-center gap-1">
                            <Check className="w-3 h-3" /> Preenchido
                          </span>
                        ) : (
                          <span className="text-[10px] text-status-danger font-bold flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Obrigatório
                          </span>
                        )}
                      </div>
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="Ex: 65"
                      value={reviewData.area_m2 ?? ''}
                      onChange={(e) =>
                        handleUpdateReviewField(
                          'area_m2',
                          e.target.value !== '' ? parseFloat(e.target.value) : null
                        )
                      }
                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs focus:outline-none transition-colors ${
                        requiredValidation.errors.area_m2
                          ? 'border-2 border-status-danger/70 text-ink-primary placeholder-rose-400/50 bg-status-danger/5 focus:border-status-danger'
                          : 'border border-line-subtle text-ink-primary bg-surface-1 focus:border-accent'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* ── SEÇÃO 2: INFORMAÇÕES ADICIONAIS (Opcionais) ── */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.02] border border-line-subtle space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-line-subtle">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-secondary flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-ink-muted" />
                      Informações Adicionais
                      <span className="text-[11px] text-ink-secondary font-normal lowercase">(opcionais)</span>
                    </h3>
                    <p className="text-[11px] text-ink-secondary mt-0.5">
                      Campos complementares que enriquecem o anúncio do imóvel.
                    </p>
                  </div>
                </div>

                {/* Finalidade, Condomínio e IPTU */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Finalidade (Venda / Locação) */}
                  <div>
                    <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block mb-1.5">
                      Finalidade
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateReviewField('purpose', 'Venda')}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          reviewData.purpose === 'Venda' || !reviewData.purpose
                            ? 'bg-accent/20 border-accent text-accent font-bold shadow-[0_0_12px_rgba(0,229,255,0.2)]'
                            : 'bg-surface-1 border-line-subtle text-ink-secondary hover:text-ink-primary'
                        }`}
                      >
                        Venda
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateReviewField('purpose', 'Locação')}
                        className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          reviewData.purpose === 'Locação'
                            ? 'bg-accent/20 border-accent text-accent font-bold shadow-[0_0_12px_rgba(0,229,255,0.2)]'
                            : 'bg-surface-1 border-line-subtle text-ink-secondary hover:text-ink-primary'
                        }`}
                      >
                        Locação
                      </button>
                    </div>
                  </div>

                  {/* Condomínio e Condomínio Incluso */}
                  <div>
                    <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                      <span>Condomínio (R$)</span>
                      {reviewData.condo_included ? (
                        <span className="text-[10px] text-accent font-semibold">Incluso</span>
                      ) : reviewData.condo_fee ? (
                        <span className="text-[10px] text-status-success font-semibold">
                          R$ {reviewData.condo_fee}
                        </span>
                      ) : (
                        <span className="text-[10px] text-ink-secondary">Opcional</span>
                      )}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        disabled={reviewData.condo_included}
                        placeholder={reviewData.condo_included ? 'Incluso no valor' : 'Opcional'}
                        value={reviewData.condo_included ? '' : (reviewData.condo_fee ?? '')}
                        onChange={(e) =>
                          handleUpdateReviewField(
                            'condo_fee',
                            e.target.value !== '' ? parseFloat(e.target.value) : null
                          )
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-surface-1 border border-line-subtle text-ink-primary text-xs focus:outline-none focus:border-accent disabled:opacity-50 disabled:bg-surface-2"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const nextIncluded = !reviewData.condo_included;
                          handleUpdateReviewField('condo_included', nextIncluded);
                          if (nextIncluded) handleUpdateReviewField('condo_fee', null);
                        }}
                        className={`px-3 py-2.5 rounded-xl text-[11px] font-bold border whitespace-nowrap transition-colors cursor-pointer ${
                          reviewData.condo_included
                            ? 'bg-accent/20 border-accent text-accent'
                            : 'bg-white/5 border-line-subtle text-ink-secondary hover:text-ink-primary'
                        }`}
                        title="Marcar condomínio incluso"
                      >
                        Incluso
                      </button>
                    </div>
                  </div>

                  {/* IPTU Anual (R$) */}
                  <div>
                    <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                      <span>IPTU Anual (R$)</span>
                      <span className="text-[10px] text-ink-secondary">Opcional</span>
                    </label>
                    <input
                      type="number"
                      placeholder="Opcional"
                      value={reviewData.iptu ?? ''}
                      onChange={(e) =>
                        handleUpdateReviewField('iptu', e.target.value !== '' ? parseFloat(e.target.value) : null)
                      }
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-1 border border-line-subtle text-ink-primary text-xs focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                {/* Cômodos Complementares: Suítes, Banheiros, Vagas */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block mb-1">
                      Suítes <span className="text-ink-secondary font-normal">(Opcional)</span>
                    </label>
                    <input
                      type="number"
                      placeholder="Não informado"
                      value={reviewData.suites ?? ''}
                      onChange={(e) =>
                        handleUpdateReviewField('suites', e.target.value !== '' ? parseInt(e.target.value, 10) : null)
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-1 border border-line-subtle text-ink-primary text-xs focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block mb-1">
                      Banheiros <span className="text-ink-secondary font-normal">(Opcional)</span>
                    </label>
                    <input
                      type="number"
                      placeholder="Não informado"
                      value={reviewData.bathrooms ?? ''}
                      onChange={(e) =>
                        handleUpdateReviewField('bathrooms', e.target.value !== '' ? parseInt(e.target.value, 10) : null)
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-1 border border-line-subtle text-ink-primary text-xs focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block mb-1">
                      Vagas <span className="text-ink-secondary font-normal">(Opcional)</span>
                    </label>
                    <input
                      type="number"
                      placeholder="Não informado"
                      value={reviewData.parking_spaces ?? ''}
                      onChange={(e) =>
                        handleUpdateReviewField('parking_spaces', e.target.value !== '' ? parseInt(e.target.value, 10) : null)
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-1 border border-line-subtle text-ink-primary text-xs focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>

                {/* Posição Solar, Condição e Mobiliado */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block mb-1">
                      Posição Solar
                    </label>
                    <select
                      value={reviewData.position || ''}
                      onChange={(e) =>
                        handleUpdateReviewField('position', (e.target.value || null) as PropertyPosition)
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-1 border border-line-subtle text-ink-primary text-xs focus:outline-none focus:border-accent"
                    >
                      <option value="">Não informada</option>
                      <option value="Nascente">Nascente</option>
                      <option value="Poente">Poente</option>
                      <option value="Norte">Norte</option>
                      <option value="Sul">Sul</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block mb-1">
                      Condição
                    </label>
                    <select
                      value={reviewData.condition || ''}
                      onChange={(e) =>
                        handleUpdateReviewField('condition', (e.target.value || null) as PropertyCondition)
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-1 border border-line-subtle text-ink-primary text-xs focus:outline-none focus:border-accent"
                    >
                      <option value="">Não informada</option>
                      <option value="Novo">Novo</option>
                      <option value="Usado">Usado</option>
                      <option value="Reformado">Reformado</option>
                      <option value="Em construção">Em construção</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-ink-secondary uppercase tracking-wider block mb-1">
                      Mobiliado
                    </label>
                    <select
                      value={reviewData.furnished === true ? 'true' : reviewData.furnished === false ? 'false' : ''}
                      onChange={(e) =>
                        handleUpdateReviewField(
                          'furnished',
                          e.target.value === 'true' ? true : e.target.value === 'false' ? false : null
                        )
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-surface-1 border border-line-subtle text-ink-primary text-xs focus:outline-none focus:border-accent"
                    >
                      <option value="">Não informado</option>
                      <option value="true">Sim (Mobiliado)</option>
                      <option value="false">Não (Sem mobília)</option>
                    </select>
                  </div>
                </div>

                {/* Origem do Imóvel & Contatos */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-line-subtle space-y-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-ink-secondary block">
                    Origem do Imóvel
                  </label>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleUpdateReviewField('source_type', 'Próprio')}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        reviewData.source_type === 'Próprio' || !reviewData.source_type
                          ? 'bg-accent text-white shadow-lg shadow-accent/20 font-bold'
                          : 'bg-white/5 text-ink-secondary hover:text-ink-primary'
                      }`}
                    >
                      Captação Própria
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateReviewField('source_type', 'Parceiro')}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        reviewData.source_type === 'Parceiro'
                          ? 'bg-status-partner text-ink-primary shadow-lg shadow-violet-500/20 font-bold'
                          : 'bg-white/5 text-ink-secondary hover:text-ink-primary'
                      }`}
                    >
                      Parceria com Corretor
                    </button>
                  </div>

                  {reviewData.source_type === 'Parceiro' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-[11px] text-ink-secondary block mb-1">Nome do Parceiro</label>
                        <input
                          type="text"
                          placeholder="Ex: Corretor Marcos Santos"
                          value={reviewData.partner_name || ''}
                          onChange={(e) => handleUpdateReviewField('partner_name', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-surface-1 border border-line-subtle text-ink-primary text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-ink-secondary block mb-1">Telefone do Parceiro</label>
                        <input
                          type="text"
                          placeholder="(83) 98888-1111"
                          value={reviewData.partner_phone || ''}
                          onChange={(e) => handleUpdateReviewField('partner_phone', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-surface-1 border border-line-subtle text-ink-primary text-xs"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="text-[11px] text-ink-secondary block mb-1">Nome do Proprietário</label>
                        <input
                          type="text"
                          placeholder="Ex: Roberto Silva"
                          value={reviewData.owner_name || ''}
                          onChange={(e) => handleUpdateReviewField('owner_name', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-surface-1 border border-line-subtle text-ink-primary text-xs"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-ink-secondary block mb-1">Telefone do Proprietário</label>
                        <input
                          type="text"
                          placeholder="(83) 99999-0000"
                          value={reviewData.owner_phone || ''}
                          onChange={(e) => handleUpdateReviewField('owner_phone', e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-surface-1 border border-line-subtle text-ink-primary text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ── RODAPÉ DA ETAPA DE REVISÃO: Altura fixa estrutural de 68px ── */}
            <div className="h-[68px] flex items-center justify-between px-6 border-t border-line-subtle bg-surface-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setStep('composer')}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-accent hover:text-accent hover:bg-accent/10 transition-colors flex items-center gap-2 cursor-pointer border border-accent/20"
                title="Voltar ao composer para adicionar mais detalhes por voz ou texto"
              >
                <ArrowLeft className="w-4 h-4" />
                Complementar com IA / Áudio
              </button>

              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={!requiredValidation.valid}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  !requiredValidation.valid
                    ? 'bg-ink-muted'
                    : 'bg-status-success hover:bg-status-success/90'
                }`}
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>
                  {!requiredValidation.valid
                    ? `Preencha ${missingMandatoryKeys.length} obrigatório(s)`
                    : 'Salvar no Estoque'}
                </span>
              </button>
            </div>
          </>
        )) : (
          /* ── MODO MANUAL: FORMULÁRIO COMPLETO COM UPLOAD DEDICADO DE FOTOS ── */
          <ManualPropertyForm
            onSaveProperty={(newProp) => {
              onSaveProperty(newProp);
              onClose();
            }}
            onCancel={handleModalClose}
          />
        )}
      </div>
    </div>
  );
};

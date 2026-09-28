import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Sparkles,
  Mic,
  X,
  Check,
  Send,
  Loader2,
  AlertCircle,
  RotateCcw,
  Link2,
  Building2,
  Layers,
  FileText,
  FileUp,
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
import { extractTextFromDocument } from '../../lib/pdf-parser';
import type { Property, PropertyPhoto } from '../../types/property';
import { PropertyGallery } from './PropertyGallery';
import { uploadPropertyMedia, deletePropertyMedia } from '../../lib/r2-media';
import { PropertyFicha } from './PropertyFicha';
import { AudioWaveform } from '../ui/AudioWaveform';
import { supabase } from '../../lib/supabase';
import { prepareInstagramProperty, type InstagramPost } from '../../lib/instagram-import';

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
  const [textInput, setTextInput] = useState('');
  const [instagramUrl, setInstagramUrl] = useState('');
  const [isImportingInstagram, setIsImportingInstagram] = useState(false);
  const [importProgress, setImportProgress] = useState('');
  const [isImportingDocument, setIsImportingDocument] = useState(false);
  const [documentProgress, setDocumentProgress] = useState('');
  const documentInputRef = useRef<HTMLInputElement>(null);
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
  const [showSwitchModeModal, setShowSwitchModeModal] = useState(false);
  const [showMissingFieldsModal, setShowMissingFieldsModal] = useState(false);

  const isDevelopment = Boolean(reviewData.is_development);

  const handleSelectPropertyMode = (targetIsDev: boolean) => {
    if (targetIsDev === isDevelopment) return;
    if (!targetIsDev && reviewData.typologies && reviewData.typologies.length > 0) {
      setShowSwitchModeModal(true);
      return;
    }
    applyModeSwitch(targetIsDev);
  };

  const applyModeSwitch = (targetIsDev: boolean) => {
    setReviewData((prev) => {
      const next = { ...prev, is_development: targetIsDev };
      if (targetIsDev) {
        if (prev.area_m2 && !prev.area_range) {
          next.area_range = { min: prev.area_m2, max: prev.area_m2 };
        }
        if (prev.bedrooms !== null && prev.bedrooms !== undefined && (!prev.bedrooms_options || prev.bedrooms_options.length === 0)) {
          next.bedrooms_options = [prev.bedrooms];
        }
        if (prev.price && (!prev.price_from || prev.price_from === 0)) {
          next.price_from = prev.price;
        }
      } else {
        if (prev.area_range?.min && !prev.area_m2) {
          next.area_m2 = prev.area_range.min;
        }
        if (prev.bedrooms_options?.length && prev.bedrooms === null) {
          next.bedrooms = prev.bedrooms_options[0];
        }
        if (prev.price_from && !prev.price) {
          next.price = prev.price_from;
        }
      }
      return next;
    });
    setShowSwitchModeModal(false);
  };

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
  }, [textInput]);

  const handleClearFicha = () => {
    if (isImportingInstagram || isImportingDocument || isProcessingImages) return;
    images.forEach((image) => {
      if (image.previewUrl.startsWith('blob:')) URL.revokeObjectURL(image.previewUrl);
      if (image.storageProvider === 'r2' && image.objectKey) {
        deletePropertyMedia(propertyIdRef.current, { mediaId: image.id, objectKey: image.objectKey })
          .catch((error) => console.error('Erro ao remover foto descartada:', error));
      }
    });
    setImages([]);
    setReviewData(emptyReviewData);
    setTextInput('');
    setInstagramUrl('');
    setImportProgress('');
    setIsImportingDocument(false);
    setDocumentProgress('');
    setErrorMessage(null);
    setProcessingStatus('');
    setIsProcessingImages(false);
    setIsProcessingAI(false);
    handleCancelRecording();
    setShowValidationErrors(false);
    setShowClearModal(false);
  };

  const handleLeaveWithoutSaving = () => {
    handleClearFicha();
    onBack();
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

  const handleImportInstagram = async () => {
    if (!instagramUrl.trim() || isImportingInstagram || isProcessingImages || isProcessingAI || isRecording || isTranscribing) return;
    if (images.length || textInput.trim() || reviewData.type || reviewData.neighborhood || reviewData.price || reviewData.instagram_source_url) {
      setErrorMessage('Para importar uma publicação, comece com a ficha vazia. Use “Limpar informações” antes de prosseguir.');
      return;
    }
    setIsImportingInstagram(true);
    setImportProgress('Lendo a publicação do Instagram...');
    setErrorMessage(null);
    try {
      const { data: { session } } = await supabase!.auth.getSession();
      if (!session?.access_token) throw new Error('Sua sessão expirou. Entre novamente para importar.');
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` };
      const response = await fetch('/api/instagram-import', {
        method: 'POST', headers, body: JSON.stringify({ action: 'post', url: instagramUrl.trim() }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Não foi possível ler a publicação.');
      const post = body.post as InstagramPost;

      setImportProgress('Organizando os dados do imóvel...');
      const extraction = post.caption.trim()
        ? await extractPropertyMultiProvider({ text: post.caption, groqApiKey, geminiApiKey, preferredProvider: preferredAIProvider })
        : { data: { ...emptyReviewData } };
      setReviewData(prepareInstagramProperty(post, extraction.data));
      setInstagramUrl(post.url);

      let importedCount = 0;
      for (let i = 0; i < post.images.length; i++) {
        setImportProgress(`Importando foto ${i + 1} de ${post.images.length}...`);
        try {
          const imageResponse = await fetch('/api/instagram-import', {
            method: 'POST', headers, body: JSON.stringify({ action: 'image', url: post.images[i] }),
          });
          if (!imageResponse.ok) throw new Error('Foto indisponível.');
          const blob = await imageResponse.blob();
          const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
          const processed = await processImageFile(new File([blob], `instagram-${i + 1}.${extension}`, { type: blob.type }));
          const tempId = `instagram-${Date.now()}-${i}`;
          processed.id = tempId;
          processed.isCover = images.length === 0 && importedCount === 0;
          processed.isUploading = true;
          setImages((previous) => [...previous, processed]);
          try {
            const uploaded = await uploadPropertyMedia(propertyIdRef.current, processed.file!, {
              sortOrder: images.length + importedCount,
              isCover: processed.isCover,
              onProgress: (progress) => setImages((previous) => previous.map((image) =>
                image.id === tempId ? { ...image, uploadProgress: progress.pct } : image)),
            });
            setImages((previous) => previous.map((image) => image.id === tempId ? {
              ...image, id: uploaded.id, objectKey: uploaded.object_key,
              storagePath: uploaded.object_key, storageProvider: 'r2',
              previewUrl: uploaded.public_url || image.previewUrl,
              isUploading: false, uploadProgress: 100,
            } : image));
            importedCount++;
          } catch (uploadError) {
            setImages((previous) => previous.filter((image) => image.id !== tempId));
            URL.revokeObjectURL(processed.previewUrl);
            console.error('Falha ao salvar foto importada:', uploadError);
          }
        } catch (imageError) {
          console.error('Falha ao ler foto do Instagram:', imageError);
        }
      }
      if (post.images.length > importedCount) {
        setErrorMessage(`${post.images.length - importedCount} foto(s) não puderam ser importadas. Confira a galeria antes de salvar.`);
      } else if (!post.images.length) {
        setErrorMessage('Os dados foram lidos, mas esta publicação não disponibilizou fotos. Adicione-as antes de salvar.');
      }
      setImportProgress(`Ficha preenchida. ${importedCount} foto(s) importada(s). Confira os dados antes de salvar.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Não foi possível importar a publicação.');
      setImportProgress('');
    } finally {
      setIsImportingInstagram(false);
    }
  };

  // ── Importação de Documentos do Empreendimento (PDF, TXT, MD) ──
  const handleImportDocument = async (file: File) => {
    if (!file || isImportingDocument || isImportingInstagram || isProcessingImages || isProcessingAI || isRecording || isTranscribing) return;
    setIsImportingDocument(true);
    setDocumentProgress(`Lendo e extraindo conteúdo de "${file.name}"...`);
    setErrorMessage(null);

    try {
      const result = await extractTextFromDocument(file);
      if (result.isScanned) {
        setErrorMessage(
          result.message ||
            'Este PDF é composto por imagens escaneadas sem camada de texto pesquisável. Para cadastrar, copie e cole o resumo ou utilize a narração por voz da IA.'
        );
        setDocumentProgress('');
        return;
      }

      if (!result.success || !result.text) {
        setErrorMessage(result.message || 'Não foi possível extrair o texto deste documento.');
        setDocumentProgress('');
        return;
      }

      setDocumentProgress('Interpretando informações com IA...');
      const extraction = await extractPropertyMultiProvider({
        text: result.text,
        groqApiKey,
        geminiApiKey,
        preferredProvider: preferredAIProvider,
      });

      const shouldBeDev = isDevelopment || Boolean(extraction.data.is_development);

      setReviewData((prev) => {
        const hasExisting = Boolean(prev.type || prev.neighborhood || prev.price || prev.condominium_name);
        const extracted = { ...extraction.data };
        if (shouldBeDev) {
          extracted.is_development = true;
        }

        if (!hasExisting) {
          const validated = validatePropertyExtraction(extracted);
          extracted.missing_mandatory = validated.missing_mandatory;
          extracted.missing_desirable = validated.missing_desirable;
          return extracted;
        }

        const merged: ExtractedPropertyData = { ...prev };
        (Object.keys(extracted) as (keyof ExtractedPropertyData)[]).forEach((key) => {
          const val = extracted[key];
          if (key === 'field_states') {
            merged.field_states = { ...(prev.field_states || {}), ...((val as any) || {}) };
            return;
          }
          if (key === 'notes') {
            const prevNotes = (prev.notes || '').trim();
            const newNotes = typeof val === 'string' ? val.trim() : '';
            if (newNotes) merged.notes = prevNotes ? `${prevNotes}\n\n${newNotes}` : newNotes;
            return;
          }
          if (Array.isArray(val)) {
            if (val.length > 0) (merged as any)[key] = val;
            return;
          }
          if (val !== null && val !== undefined && val !== '') {
            (merged as any)[key] = val;
          }
        });

        if (shouldBeDev) {
          merged.is_development = true;
        }

        const validation = validatePropertyExtraction(merged);
        merged.missing_mandatory = validation.missing_mandatory;
        merged.missing_desirable = validation.missing_desirable;
        return merged;
      });

      setDocumentProgress(`Material processado (${result.extractedPages || 1} pág). Dados preenchidos na ficha para sua conferência.`);
    } catch (err: any) {
      console.error('Erro ao importar documento do empreendimento:', err);
      setErrorMessage(err.message || 'Não foi possível processar o documento.');
      setDocumentProgress('');
    } finally {
      setIsImportingDocument(false);
    }
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
      setErrorMessage(`Fale ou escreva os dados do ${isDevelopment ? 'empreendimento' : 'imóvel'} para prosseguir.`);
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
        const shouldBeDev = isDevelopment || Boolean(result.data.is_development);
        const hasExistingData = Boolean(prev.type || prev.neighborhood || prev.price || prev.area_m2 || prev.condominium_name);
        if (!hasExistingData) {
          const newData = { ...result.data };
          if (shouldBeDev) newData.is_development = true;
          const validated = validatePropertyExtraction(newData);
          newData.missing_mandatory = validated.missing_mandatory;
          newData.missing_desirable = validated.missing_desirable;
          return newData;
        }

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

        if (shouldBeDev) {
          merged.is_development = true;
        }

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
  const requiredValidation = validateRequiredPropertyFields(reviewData, isDevelopment);
  const trackedResolution = getTrackedResolution(reviewData);
  const pendingKeys = Object.keys(trackedResolution).filter((k) => !trackedResolution[k]);
  const pendingLabels = pendingKeys.map((k) => TRACKED_LABELS[k]);
  const progressPct = Math.round(((10 - pendingKeys.length) / 10) * 100);

  const handleConfirmSave = () => {
    if (isImportingInstagram || isProcessingImages || isProcessingAI || images.some((image) => image.isUploading || image.uploadError)) {
      setErrorMessage('Aguarde o fim da importação e confira as fotos antes de salvar.');
      return;
    }
    if (!requiredValidation.valid) {
      setShowValidationErrors(true);
      setShowMissingFieldsModal(true);
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

    const resolvedPrice = reviewData.price || reviewData.price_from || 0;
    const resolvedArea = reviewData.area_m2 || (reviewData.area_range?.min ? reviewData.area_range.min : 0);
    const resolvedBedrooms = reviewData.bedrooms ?? (reviewData.bedrooms_options?.length ? reviewData.bedrooms_options[0] : 0);
    const resolvedType = reviewData.type || (reviewData.development_types?.length ? reviewData.development_types[0] : 'Apartamento');

    const newProp: Property = {
      id: newPropertyId,
      purpose: reviewData.purpose || 'Venda',
      type: resolvedType,
      neighborhood: reviewData.neighborhood || '',
      address: reviewData.address || undefined,
      number: reviewData.number || undefined,
      complement: reviewData.complement || undefined,
      condominium_name: reviewData.condominium_name || reviewData.internal_name || reviewData.title || undefined,
      internal_name: reviewData.internal_name || undefined,
      title: reviewData.title || reviewData.condominium_name || undefined,
      bedrooms: resolvedBedrooms,
      suites: reviewData.suites ?? 0,
      bathrooms: reviewData.bathrooms ?? 0,
      parking_spaces: reviewData.parking_spaces ?? 0,
      parking_spaces_type: reviewData.parking_spaces_type === 'Rotativas' ? 'Rotativas' : undefined,
      area_m2: resolvedArea,
      is_development: isDevelopment,
      area_range: reviewData.area_range || null,
      bedrooms_options: reviewData.bedrooms_options || null,
      stage: reviewData.stage || (isDevelopment ? 'Lançamento' : undefined),
      delivery_date: reviewData.delivery_date || undefined,
      incorporation_registration: reviewData.incorporation_registration || undefined,
      development_types: reviewData.development_types || undefined,
      suites_options: reviewData.suites_options || null,
      bathrooms_options: reviewData.bathrooms_options || null,
      parking_options: reviewData.parking_options || null,
      price_from: reviewData.price_from || resolvedPrice,
      price_to: reviewData.price_to || undefined,
      condo_status: reviewData.condo_status || undefined,
      iptu_status: reviewData.iptu_status || undefined,
      typologies: reviewData.typologies || undefined,
      social_publications: reviewData.social_publications || {
        instagram: { status: 'not_published' },
      },
      price: resolvedPrice,
      condo_fee: reviewData.condo_included || reviewData.condo_not_applicable ? 0 : (reviewData.condo_fee ?? 0),
      iptu: reviewData.iptu ?? undefined,
      floor: isDevelopment ? null : (reviewData.floor ?? null),
      position: isDevelopment ? undefined : (reviewData.position ?? undefined),
      furnished: isDevelopment ? false : Boolean(reviewData.furnished),
      condition: isDevelopment ? undefined : (reviewData.condition ?? undefined),
      building_features: reviewData.building_features || [],
      apartment_features: isDevelopment ? [] : (reviewData.apartment_features || []),
      source_type: reviewData.source_type || 'Próprio',
      owner_name: reviewData.owner_name || undefined,
      owner_phone: reviewData.owner_phone || undefined,
      partner_name: reviewData.partner_name || undefined,
      partner_phone: reviewData.partner_phone || undefined,
      instagram_source_url: reviewData.instagram_source_url || undefined,
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
    <div className="add-property-page-shell flex-1 flex flex-col h-full overflow-hidden animate-fade-in">
      {/* ── Header da página ── */}
      <div className="flex-shrink-0 mb-4">
        <button
          type="button"
          onClick={handleLeaveWithoutSaving}
          disabled={isImportingInstagram}
          className="flex items-center gap-1.5 text-xs font-semibold text-ink-secondary hover:text-ink-primary transition-colors mb-2 cursor-pointer disabled:opacity-40"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Voltar
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-ink-secondary block mb-0.5">
              {isDevelopment ? 'Estoque / Adicionar empreendimento' : 'Estoque / Adicionar imóvel'}
            </span>
            <h1 className="text-xl lg:text-2xl font-bold text-ink-primary tracking-tight">
              {isDevelopment ? 'Adicionar empreendimento' : 'Adicionar imóvel'}
            </h1>
            <p className="text-xs text-ink-secondary mt-0.5">
              {isDevelopment
                ? 'Cadastre um novo empreendimento com IA ou preenchimento direto.'
                : 'Cadastre um novo imóvel com IA ou preenchimento direto.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              disabled={isImportingInstagram || isProcessingImages}
              title="Limpar todas as informações da ficha, inclusive as fotos"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-ink-secondary hover:text-ink-primary hover:bg-white/[0.05] border border-line-subtle transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Limpar informações</span>
            </button>

            {/* Seletor Segmentado: Imóvel Pronto x Na Planta */}
            <div className="p-1 bg-surface-1 border border-line-subtle rounded-xl inline-flex items-center gap-1 shadow-sm">
              <button
                type="button"
                onClick={() => handleSelectPropertyMode(false)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                  !isDevelopment
                    ? 'bg-accent/20 text-accent border border-accent/40 font-bold shadow-sm'
                    : 'text-ink-secondary hover:text-ink-primary border border-transparent font-medium'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Imóvel pronto</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectPropertyMode(true)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                  isDevelopment
                    ? 'bg-accent/20 text-accent border border-accent/40 font-bold shadow-sm'
                    : 'text-ink-secondary hover:text-ink-primary border border-transparent font-medium'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Em construção</span>
              </button>
            </div>

            {/* Botão Acionável "Faltam X" / "Salvar" */}
            <button
              type="button"
              onClick={() => {
                if (requiredValidation.valid) {
                  handleConfirmSave();
                } else {
                  setShowMissingFieldsModal(true);
                }
              }}
              disabled={isImportingInstagram || isImportingDocument || isProcessingImages || isProcessingAI || images.some((image) => image.isUploading || image.uploadError)}
              title={!requiredValidation.valid ? 'Clique para conferir os campos obrigatórios pendentes' : (isDevelopment ? 'Salvar empreendimento' : 'Salvar imóvel')}
              className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer ${
                requiredValidation.valid
                  ? 'bg-status-success hover:bg-status-success/90 text-white shadow-sm'
                  : 'bg-white/[0.05] hover:bg-white/[0.08] text-ink-secondary hover:text-ink-primary border border-line-subtle'
              }`}
            >
              <Check className="w-4 h-4 stroke-[2.5]" />
              <span>
                {requiredValidation.valid
                  ? (isDevelopment ? 'Salvar empreendimento' : 'Salvar imóvel')
                  : `Faltam ${requiredValidation.missing.length}`}
              </span>
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

      {/* ── Canvas único: mídias + ficha (com blocos de importação integrados ao fluxo rolável) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto panel-surface rounded-2xl p-4 lg:p-5 space-y-5">
        {/* ── Importação de Publicação do Instagram ── */}
        <div className="rounded-xl border border-line-subtle bg-white/[0.025] p-3">
          <label htmlFor="instagram-import-url" className="flex items-center gap-1.5 text-xs font-semibold text-ink-primary mb-2">
            <Link2 className="w-3.5 h-3.5 text-accent" /> Importar publicação do Instagram
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              id="instagram-import-url"
              type="url"
              value={instagramUrl}
              onChange={(event) => setInstagramUrl(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void handleImportInstagram(); } }}
              placeholder="Cole o link da publicação de um parceiro ou do seu perfil"
              disabled={isImportingInstagram || isImportingDocument}
              className="flex-1 min-w-0 rounded-lg border border-line-subtle bg-surface-1 px-3 py-2 text-xs text-ink-primary placeholder:text-ink-secondary focus:outline-none focus:border-accent/50 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleImportInstagram()}
              disabled={isImportingInstagram || isImportingDocument || isProcessingImages || isProcessingAI || isRecording || isTranscribing || !instagramUrl.trim()}
              className="btn-primary rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isImportingInstagram ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              Importar dados e fotos
            </button>
          </div>
          <p className="text-[10px] text-ink-secondary mt-1.5">
            Publicações públicas. A ficha fica editável e o {isDevelopment ? 'empreendimento' : 'imóvel'} só entra no estoque ao salvar.
          </p>
          {importProgress && <p role="status" className="text-[10px] text-accent mt-1.5">{importProgress}</p>}
        </div>

        {/* ── Importação de Material do Empreendimento (PDF, TXT, MD) - Exclusivo para Em construção ── */}
        {isDevelopment && (
          <div className="rounded-xl border border-line-subtle bg-white/[0.025] p-3">
            <input
              ref={documentInputRef}
              type="file"
              accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImportDocument(file);
                  event.target.value = '';
                }
              }}
              className="hidden"
            />
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-primary">
                <FileText className="w-3.5 h-3.5 text-accent" /> Importar material do empreendimento
              </label>
              <span className="text-[10px] text-ink-muted uppercase tracking-wider font-semibold">
                PDF · TXT · MD
              </span>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                type="button"
                onClick={() => documentInputRef.current?.click()}
                disabled={
                  isImportingDocument ||
                  isImportingInstagram ||
                  isProcessingImages ||
                  isProcessingAI ||
                  isRecording ||
                  isTranscribing
                }
                className="flex-1 rounded-lg border border-dashed border-line-subtle hover:border-accent/40 bg-surface-1 hover:bg-white/[0.04] px-3 py-2 text-xs text-ink-secondary hover:text-ink-primary transition-all flex items-center justify-center sm:justify-start gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImportingDocument ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                ) : (
                  <FileUp className="w-3.5 h-3.5 text-accent" />
                )}
                <span>
                  {isImportingDocument
                    ? 'Processando e estruturando dados do documento...'
                    : 'Clique para selecionar PDF, book, memorial ou apresentação'}
                </span>
              </button>
            </div>

            <p className="text-[10px] text-ink-secondary mt-1.5">
              Envie books de lançamento, apresentações comerciais ou memoriais descritivos. A IA extrairá os dados e preencherá a ficha para sua conferência.
            </p>
            {documentProgress && (
              <p role="status" className="text-[10px] text-accent mt-1.5 font-medium">
                {documentProgress}
              </p>
            )}
          </div>
        )}

        <PropertyGallery
          images={images}
          onFilesSelected={handleFilesSelected}
          onRemoveImage={handleRemoveImage}
          onSetCover={handleSetCover}
          onReorderImages={(newImages) => setImages(newImages)}
          isProcessing={isProcessingImages || isImportingInstagram || isImportingDocument}
          isDevelopment={isDevelopment}
        />

        <div className="h-px bg-line-subtle/50" />

        <div className={isImportingInstagram ? 'pointer-events-none opacity-60' : ''}>
          <PropertyFicha
            data={reviewData}
            onUpdateField={handleUpdateReviewField}
            requiredValidation={requiredValidation}
            pendingLabels={pendingLabels}
            progressPct={progressPct}
            showValidationErrors={showValidationErrors}
          />
        </div>
      </div>

      {/* ── Entrada por texto/voz com base ancorada e expansão suave (disponível em ambos os modos) ── */}
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
                disabled={isProcessingAI || isImportingInstagram}
                rows={1}
                placeholder={
                  isDevelopment
                    ? 'Fale ou escreva os dados do empreendimento...'
                    : 'Fale ou escreva os dados do imóvel...'
                }
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
                  disabled={isProcessingAI || isImportingInstagram}
                  title="Gravar áudio narrando os detalhes"
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-ink-secondary hover:text-ink-primary hover:bg-white/10 transition-all cursor-pointer disabled:opacity-40"
                >
                  <Mic className="w-3.5 h-3.5 text-accent" />
                </button>
                <button
                  type="button"
                  onClick={handleSendToAI}
                  disabled={isProcessingAI || isImportingInstagram || !textInput.trim()}
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

      {/* ── Modal de Campos Obrigatórios Pendentes (Acionado pelo "Faltam X") ── */}
      {showMissingFieldsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in">
          <div className="w-full max-w-sm modal-surface rounded-2xl p-5 border border-line-subtle shadow-modal space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-line-subtle">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-status-warning" />
                <h3 className="text-sm font-bold text-ink-primary">
                  Campos obrigatórios pendentes ({requiredValidation.missing.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMissingFieldsModal(false)}
                className="p-1 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-white/5"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-ink-secondary">
              Para cadastrar {isDevelopment ? 'o empreendimento' : 'o imóvel'} no estoque, preencha os seguintes campos na ficha:
            </p>

            <ul className="space-y-2">
              {requiredValidation.missing.map((key) => {
                const label = (requiredValidation as any).missingLabels
                  ? requiredValidation.missingLabels[requiredValidation.missing.indexOf(key)]
                  : key;
                const msg = requiredValidation.errors[key] || `Preencha ${label}`;
                return (
                  <li
                    key={key}
                    className="p-2.5 rounded-xl bg-surface-1 border border-line-subtle flex items-start gap-2.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-status-danger mt-1.5 flex-shrink-0" />
                    <div>
                      <span className="text-xs font-semibold text-ink-primary block">{label}</span>
                      <span className="text-[11px] text-ink-secondary">{msg}</span>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="pt-2 border-t border-line-subtle flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowValidationErrors(true);
                  setShowMissingFieldsModal(false);
                }}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover cursor-pointer"
              >
                Entendi, vou preencher
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Confirmação para Troca Segura de Modo ── */}
      {showSwitchModeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 animate-fade-in">
          <div className="w-full max-w-sm modal-surface rounded-2xl p-5 border border-line-subtle shadow-modal space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-status-warning/15 border border-status-warning/30 flex items-center justify-center text-status-warning flex-shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink-primary">Alternar para Imóvel Pronto?</h3>
                <p className="text-xs text-ink-secondary mt-0.5">
                  Existem tipologias cadastradas. Ao alternar para Imóvel Pronto, o cadastro será tratado como uma unidade única e as tipologias não serão salvas como múltiplas plantas.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-subtle">
              <button
                type="button"
                onClick={() => setShowSwitchModeModal(false)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg text-ink-secondary hover:bg-white/5 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => applyModeSwitch(false)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent-hover cursor-pointer"
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

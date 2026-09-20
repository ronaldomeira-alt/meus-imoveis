import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  Mic,
  Square,
  Image as ImageIcon,
  Trash2,
  Star,
  Check,
  Building2,
  MapPin,
  DollarSign,
  Bed,
  Bath,
  Maximize2,
  Car,
  User,
  Phone,
  Layers,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { AudioRecorder } from '../../lib/audio-recorder';
import { processImageFile, ProcessedImage } from '../../lib/image-processor';
import { extractPropertyWithGemini, transcribeAudioWithGemini, ExtractedPropertyData } from '../../lib/gemini';
import type { Property, PropertyType, PropertyPosition, PropertyCondition, SourceType } from '../../types/property';

interface CaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveProperty: (property: Property) => void;
  geminiApiKey?: string;
}

export const CaptureModal: React.FC<CaptureModalProps> = ({
  isOpen,
  onClose,
  onSaveProperty,
  geminiApiKey,
}) => {
  // Estados do Step
  const [step, setStep] = useState<'composer' | 'review'>('composer');

  // Estados do Composer
  const [textInput, setTextInput] = useState('');
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');

  // Refs de mídia
  const recorderRef = useRef<AudioRecorder | null>(null);
  const timerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estados dos dados extraídos para revisão
  const [reviewData, setReviewData] = useState<ExtractedPropertyData>({
    type: 'Apartamento',
    neighborhood: 'Bessa',
    bedrooms: 2,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 1,
    area_m2: 65,
    price: 450000,
    condo_fee: 450,
    iptu: 850,
    floor: 3,
    position: 'Nascente',
    furnished: false,
    condition: 'Usado',
    building_features: ['Piscina', 'Elevador'],
    apartment_features: ['Varanda gourmet'],
    source_type: 'Próprio',
    owner_name: '',
    owner_phone: '',
    partner_name: '',
    partner_phone: '',
    notes: '',
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recorderRef.current) recorderRef.current.cancel();
    };
  }, []);

  if (!isOpen) return null;

  // ── Gravação de Áudio Nativo ──
  const handleStartRecording = async () => {
    try {
      const recorder = new AudioRecorder();
      await recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Erro ao iniciar gravação de áudio:', err);
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  };

  const handleStopRecording = async () => {
    if (!recorderRef.current) return;
    if (timerRef.current) clearInterval(timerRef.current);

    setIsRecording(false);
    setIsProcessing(true);
    setProcessingStatus('Transcrevendo áudio com IA...');

    try {
      const audioBlob = await recorderRef.current.stop();
      const transcription = await transcribeAudioWithGemini(audioBlob, geminiApiKey);
      setTextInput((prev) => (prev ? `${prev}\n\n[Áudio]: ${transcription}` : transcription));
    } catch (err) {
      console.error('Erro ao parar gravação de áudio:', err);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
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

  // ── Extração Inteligente com IA ──
  const handleAnalyzeWithAI = async () => {
    if (!textInput.trim() && images.length === 0) {
      alert('Digite ou grave uma descrição do imóvel antes de analisar.');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Extraindo características, valores e dados com IA...');

    try {
      const extracted = await extractPropertyWithGemini(textInput, geminiApiKey);
      setReviewData(extracted);
      setStep('review');
    } catch (err) {
      console.error('Erro na extração de IA:', err);
      alert('Houve um erro ao processar o texto com IA. Tente novamente.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  // ── Finalização e Salvar no Estoque ──
  const handleConfirmSave = () => {
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
      ...reviewData,
      id: newPropertyId,
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
      colors: ['#00E5FF', '#38BDF8', '#818CF8', '#10B981'],
    });

    onClose();
    // Reset
    setStep('composer');
    setTextInput('');
    setImages([]);
  };

  const formatSeconds = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md animate-fade-in">
      <div
        className="relative w-full max-w-4xl max-h-[92vh] glass-modal rounded-3xl flex flex-col overflow-hidden border border-white/15"
        style={{
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 50px -10px rgba(0, 229, 255, 0.15)',
        }}
      >
        {/* ── Topo do Modal ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-2xl flex items-center justify-center text-cyan-400"
              style={{
                background: 'linear-gradient(135deg, rgba(0, 229, 255, 0.15) 0%, rgba(14, 165, 233, 0.05) 100%)',
                border: '1px solid rgba(0, 229, 255, 0.3)',
              }}
            >
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Captar Imóvel
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-400/10 text-cyan-300 font-semibold border border-cyan-400/30">
                  Composer IA
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {step === 'composer'
                  ? 'Envie fotos, grave um áudio ou cole os dados brutos para extração'
                  : 'Revise e ajuste as informações extraídas antes de cadastrar no estoque'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Corpo do Modal ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {step === 'composer' ? (
            <>
              {/* 1. Galeria de Fotos Anexadas */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                    <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                    Fotos do Imóvel ({images.length})
                  </label>
                  <span className="text-[11px] text-slate-400">Suporta iPhone HEIC, JPEG e PNG</span>
                </div>

                <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
                  {/* Botão de Adicionar Fotos */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-shrink-0 w-28 h-28 rounded-2xl border-2 border-dashed border-cyan-500/30 hover:border-cyan-400/60 bg-cyan-500/5 hover:bg-cyan-500/10 transition-all flex flex-col items-center justify-center gap-2 text-cyan-400 group cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <span className="text-[11px] font-semibold">Adicionar</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.heic,.heif"
                    onChange={handleFilesSelected}
                    className="hidden"
                  />

                  {/* Miniaturas */}
                  {images.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative flex-shrink-0 w-28 h-28 rounded-2xl overflow-hidden group border border-white/10"
                    >
                      <img
                        src={img.previewUrl}
                        alt={`Upload ${idx}`}
                        className="w-full h-full object-cover"
                      />

                      {/* Badge de Capa */}
                      {img.isCover && (
                        <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-cyan-500 text-[9px] font-bold text-slate-950 flex items-center gap-1 shadow-md">
                          <Star className="w-2.5 h-2.5 fill-current" /> Capa
                        </span>
                      )}

                      {/* Ações ao passar o mouse */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        {!img.isCover && (
                          <button
                            onClick={() => handleSetCover(idx)}
                            title="Definir como capa"
                            className="p-1.5 rounded-lg bg-white/20 hover:bg-cyan-500 hover:text-slate-950 text-white transition-colors"
                          >
                            <Star className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveImage(idx)}
                          title="Remover foto"
                          className="p-1.5 rounded-lg bg-white/20 hover:bg-rose-500 text-white transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 2. Área de Texto Livre / Anotações */}
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between mb-2.5">
                  <span>Descrição / Mensagem do Proprietário ou Parceiro</span>
                  <span className="text-[11px] text-slate-500 font-normal">Cole textos, áudios ou notas</span>
                </label>

                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Exemplo: Apartamento no Bessa com 2 quartos sendo 1 suíte, 64m², varanda gourmet com vista mar. Prédio com piscina e elevador. Valor R$ 495.000, condomínio R$ 450. Proprietário Carlos telefone 83 99999-0000..."
                  rows={6}
                  className="w-full px-4 py-3.5 rounded-2xl bg-white/[0.04] border border-white/10 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-400/50 transition-colors resize-none leading-relaxed"
                />
              </div>

              {/* 3. Barra de Gravação de Áudio */}
              <div
                className="p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all"
                style={{
                  background: isRecording
                    ? 'linear-gradient(135deg, rgba(244, 63, 94, 0.1) 0%, rgba(225, 29, 72, 0.04) 100%)'
                    : 'rgba(255, 255, 255, 0.02)',
                  borderColor: isRecording ? 'rgba(244, 63, 94, 0.4)' : 'rgba(255, 255, 255, 0.08)',
                }}
              >
                <div className="flex items-center gap-3">
                  <button
                    onClick={isRecording ? handleStopRecording : handleStartRecording}
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center font-bold text-white transition-all shadow-lg ${
                      isRecording
                        ? 'bg-rose-500 hover:bg-rose-600 animate-pulse'
                        : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500'
                    }`}
                  >
                    {isRecording ? <Square className="w-4 h-4 fill-current" /> : <Mic className="w-5 h-5" />}
                  </button>

                  <div>
                    <p className="text-xs font-bold text-white">
                      {isRecording ? 'Gravando áudio...' : 'Grave um áudio narrando os detalhes'}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {isRecording
                        ? 'Fale livremente sobre o imóvel. Clique no quadrado para parar e transcrever.'
                        : 'A IA transcreve e extrai os campos automaticamente.'}
                    </p>
                  </div>
                </div>

                {isRecording && (
                  <div className="flex items-center gap-3 pr-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                    <span className="font-mono text-sm font-bold text-rose-400">
                      {formatSeconds(recordingSeconds)}
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ── Step 2: Conferência e Edição dos Campos Extraídos ── */
            <div className="space-y-6">
              <div className="p-3.5 rounded-2xl bg-cyan-500/10 border border-cyan-400/20 flex items-center gap-3">
                <Check className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                <p className="text-xs text-cyan-200">
                  Os dados foram analisados pela IA. Confira e ajuste qualquer informação antes de adicionar ao estoque.
                </p>
              </div>

              {/* Grid de Informações Básicas */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Tipo de Imóvel
                  </label>
                  <select
                    value={reviewData.type}
                    onChange={(e) => setReviewData({ ...reviewData, type: e.target.value as PropertyType })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400"
                  >
                    <option value="Apartamento">Apartamento</option>
                    <option value="Flat">Flat</option>
                    <option value="Studio">Studio</option>
                    <option value="Cobertura">Cobertura</option>
                    <option value="Casa">Casa</option>
                    <option value="Terreno">Terreno</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Bairro
                  </label>
                  <input
                    type="text"
                    value={reviewData.neighborhood}
                    onChange={(e) => setReviewData({ ...reviewData, neighborhood: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Preço de Venda (R$)
                  </label>
                  <input
                    type="number"
                    value={reviewData.price}
                    onChange={(e) => setReviewData({ ...reviewData, price: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-cyan-400 font-bold text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Condomínio (R$)
                  </label>
                  <input
                    type="number"
                    value={reviewData.condo_fee || 0}
                    onChange={(e) => setReviewData({ ...reviewData, condo_fee: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    IPTU Anual (R$)
                  </label>
                  <input
                    type="number"
                    value={reviewData.iptu || 0}
                    onChange={(e) => setReviewData({ ...reviewData, iptu: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Área Privativa (m²)
                  </label>
                  <input
                    type="number"
                    value={reviewData.area_m2}
                    onChange={(e) => setReviewData({ ...reviewData, area_m2: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* Cômodos */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Quartos
                  </label>
                  <input
                    type="number"
                    value={reviewData.bedrooms}
                    onChange={(e) => setReviewData({ ...reviewData, bedrooms: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Suítes
                  </label>
                  <input
                    type="number"
                    value={reviewData.suites}
                    onChange={(e) => setReviewData({ ...reviewData, suites: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Banheiros
                  </label>
                  <input
                    type="number"
                    value={reviewData.bathrooms}
                    onChange={(e) => setReviewData({ ...reviewData, bathrooms: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Vagas
                  </label>
                  <input
                    type="number"
                    value={reviewData.parking_spaces}
                    onChange={(e) => setReviewData({ ...reviewData, parking_spaces: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs"
                  />
                </div>
              </div>

              {/* Origem da Captação: Próprio ou Parceiro */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  Origem do Imóvel
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setReviewData({ ...reviewData, source_type: 'Próprio' })}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      reviewData.source_type === 'Próprio'
                        ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    Captação Própria
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewData({ ...reviewData, source_type: 'Parceiro' })}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                      reviewData.source_type === 'Parceiro'
                        ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20'
                        : 'bg-white/5 text-slate-400 hover:text-white'
                    }`}
                  >
                    Parceria com Corretor
                  </button>
                </div>

                {reviewData.source_type === 'Próprio' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Nome do Proprietário</label>
                      <input
                        type="text"
                        placeholder="Ex: Roberto Silva"
                        value={reviewData.owner_name || ''}
                        onChange={(e) => setReviewData({ ...reviewData, owner_name: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Telefone do Proprietário</label>
                      <input
                        type="text"
                        placeholder="(83) 99999-0000"
                        value={reviewData.owner_phone || ''}
                        onChange={(e) => setReviewData({ ...reviewData, owner_phone: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Nome do Parceiro</label>
                      <input
                        type="text"
                        placeholder="Ex: Corretor Marcos Santos"
                        value={reviewData.partner_name || ''}
                        onChange={(e) => setReviewData({ ...reviewData, partner_name: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Telefone do Parceiro</label>
                      <input
                        type="text"
                        placeholder="(83) 98888-1111"
                        value={reviewData.partner_phone || ''}
                        onChange={(e) => setReviewData({ ...reviewData, partner_phone: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Rodapé do Modal ── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-slate-950/60">
          {step === 'composer' ? (
            <>
              <span className="text-xs text-slate-400">
                {isProcessing ? processingStatus : 'Pronto para extrair com IA'}
              </span>

              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  Cancelar
                </button>

                <button
                  onClick={handleAnalyzeWithAI}
                  disabled={isProcessing}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-950 flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, #00E5FF 0%, #38BDF8 100%)',
                    boxShadow: '0 0 20px rgba(0, 229, 255, 0.4)',
                  }}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Analisar e Extrair com IA
                    </>
                  )}
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('composer')}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar ao Composer
              </button>

              <button
                onClick={handleConfirmSave}
                className="px-6 py-2.5 rounded-xl text-xs font-bold text-slate-950 flex items-center gap-2 transition-all cursor-pointer shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  boxShadow: '0 0 20px rgba(16, 185, 129, 0.4)',
                }}
              >
                <Check className="w-4 h-4" />
                Salvar no Estoque
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

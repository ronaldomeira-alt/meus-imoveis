import React, { useState, useRef } from 'react';
import {
  Building2,
  DollarSign,
  Layers,
  Image as ImageIcon,
  User,
  Trash2,
  Star,
  Check,
  Upload,
  AlertCircle,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { processImageFile, ProcessedImage } from '../../lib/image-processor';
import {
  validateRequiredPropertyFields,
  MandatoryPropertyFieldKey,
} from '../../lib/property-validation';
import type {
  Property,
  PropertyType,
  PropertyPosition,
  PropertyCondition,
  SourceType,
} from '../../types/property';

interface ManualPropertyFormProps {
  onSaveProperty: (property: Property) => void;
  onCancel: () => void;
}

const COMMON_BUILDING_FEATURES = [
  'Piscina',
  'Elevador',
  'Academia',
  'Portaria 24h',
  'Salão de festas',
  'Rooftop',
  'Espaço gourmet',
  'Brinquedoteca',
  'Gerador',
  'Quadra',
];

const COMMON_APARTMENT_FEATURES = [
  'Varanda gourmet',
  'Vista mar',
  'Nascente',
  'Móveis projetados',
  'Ar-condicionado',
  'Closet',
  'Área de serviço',
  'DCE',
];

const NEIGHBORHOOD_SUGGESTIONS = [
  'Bessa',
  'Manaíra',
  'Cabo Branco',
  'Tambaú',
  'Altiplano',
  'Intermares',
  'Aeroclube',
  'Jardim Oceania',
  'Miramar',
  'Estados',
];

export const ManualPropertyForm: React.FC<ManualPropertyFormProps> = ({
  onSaveProperty,
  onCancel,
}) => {
  // ── Estados do Formulário (Inicialmente limpos sem valores falsos) ──
  const [type, setType] = useState<PropertyType>('Apartamento');
  const [neighborhood, setNeighborhood] = useState('');
  const [condominiumName, setCondominiumName] = useState('');
  const [address, setAddress] = useState('');
  const [number, setNumber] = useState('');
  const [complement, setComplement] = useState('');

  // Características (Área e Quartos são obrigatórios; demais opcionais)
  const [areaM2, setAreaM2] = useState<number | ''>('');
  const [bedrooms, setBedrooms] = useState<number | ''>('');
  const [suites, setSuites] = useState<number | ''>('');
  const [bathrooms, setBathrooms] = useState<number | ''>('');
  const [parkingSpaces, setParkingSpaces] = useState<number | ''>('');
  const [floor, setFloor] = useState<number | ''>('');
  const [position, setPosition] = useState<PropertyPosition>('Nascente');
  const [condition, setCondition] = useState<PropertyCondition>('Usado');
  const [furnished, setFurnished] = useState(false);

  // Valores (Preço é obrigatório; condomínio e IPTU são opcionais)
  const [price, setPrice] = useState<number | ''>('');
  const [condoFee, setCondoFee] = useState<number | ''>('');
  const [iptu, setIptu] = useState<number | ''>('');

  // Características / Tags (opcionais)
  const [buildingFeatures, setBuildingFeatures] = useState<string[]>([]);
  const [apartmentFeatures, setApartmentFeatures] = useState<string[]>([]);
  const [customFeature, setCustomFeature] = useState('');

  // Fotos
  const [images, setImages] = useState<ProcessedImage[]>([]);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Origem & Contatos
  const [sourceType, setSourceType] = useState<SourceType>('Próprio');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [partnerPhone, setPartnerPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Validação dos 5 campos obrigatórios
  const [submitted, setSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<MandatoryPropertyFieldKey, string>>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const clearFieldError = (field: MandatoryPropertyFieldKey) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // ── Manipulação de Fotos ──
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setIsProcessingImages(true);
    setErrorMessage(null);

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
    setIsProcessingImages(false);
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

  // Toggle de tags
  const toggleBuildingFeature = (feat: string) => {
    setBuildingFeatures((prev) =>
      prev.includes(feat) ? prev.filter((f) => f !== feat) : [...prev, feat]
    );
  };

  const toggleApartmentFeature = (feat: string) => {
    setApartmentFeatures((prev) =>
      prev.includes(feat) ? prev.filter((f) => f !== feat) : [...prev, feat]
    );
  };

  const handleAddCustomFeature = () => {
    const trimmed = customFeature.trim();
    if (!trimmed) return;
    if (!apartmentFeatures.includes(trimmed)) {
      setApartmentFeatures((prev) => [...prev, trimmed]);
    }
    setCustomFeature('');
  };

  // ── Salvar Imóvel Manualmente (Sem IA) ──
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    // Validação centralizada com a regra dos 5 campos obrigatórios
    const validation = validateRequiredPropertyFields({
      neighborhood,
      price,
      bedrooms,
      area_m2: areaM2,
      type,
    });

    if (!validation.valid) {
      setFieldErrors(validation.errors);
      setErrorMessage(
        `Preencha todos os campos obrigatórios: ${validation.missingLabels.join(', ')}.`
      );
      return;
    }

    setFieldErrors({});
    setErrorMessage(null);

    const numericPrice = Number(price);
    const newPropertyId = `prop-${Date.now()}`;
    const photos = images.map((img, idx) => ({
      id: `photo-${idx}`,
      property_id: newPropertyId,
      storage_path: img.previewUrl,
      sort_order: idx,
      is_cover: img.isCover,
    }));

    if (photos.length === 0) {
      photos.push({
        id: `photo-0`,
        property_id: newPropertyId,
        storage_path:
          'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80',
        sort_order: 0,
        is_cover: true,
      });
    }

    const newProperty: Property = {
      id: newPropertyId,
      purpose: 'Venda',
      type,
      neighborhood: neighborhood.trim(),
      condominium_name: condominiumName.trim() || undefined,
      address: address.trim() || undefined,
      number: number.trim() || undefined,
      complement: complement.trim() || undefined,
      area_m2: Number(areaM2),
      bedrooms: Number(bedrooms),
      suites: suites !== '' ? Number(suites) : 0,
      bathrooms: bathrooms !== '' ? Number(bathrooms) : 0,
      parking_spaces: parkingSpaces !== '' ? Number(parkingSpaces) : 0,
      floor: floor !== '' ? Number(floor) : null,
      position,
      condition,
      furnished,
      price: numericPrice,
      condo_fee: condoFee !== '' ? Number(condoFee) : undefined,
      iptu: iptu !== '' ? Number(iptu) : undefined,
      building_features: buildingFeatures,
      apartment_features: apartmentFeatures,
      source_type: sourceType,
      owner_name: sourceType === 'Próprio' ? ownerName.trim() || undefined : undefined,
      owner_phone: sourceType === 'Próprio' ? ownerPhone.trim() || undefined : undefined,
      partner_name: sourceType === 'Parceiro' ? partnerName.trim() || undefined : undefined,
      partner_phone: sourceType === 'Parceiro' ? partnerPhone.trim() || undefined : undefined,
      notes: notes.trim() || undefined,
      status: 'Ativo',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      photos,
    };

    onSaveProperty(newProperty);

    // Celebração
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#00E5FF', '#38BDF8', '#818CF8', '#10B981'],
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex-1 min-h-0 flex flex-col overflow-hidden animate-fade-in"
    >
      {/* Área rolável com campos organizados */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-4 space-y-5 custom-scrollbar">
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-rose-200 text-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-rose-400 hover:text-white text-xs cursor-pointer font-semibold"
            >
              Fechar
            </button>
          </div>
        )}

        {/* ── 1. INFORMAÇÕES PRINCIPAIS ── */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/8 space-y-3.5">
          <div className="flex items-center gap-2 text-white text-xs font-bold uppercase tracking-wider">
            <Building2 className="w-3.5 h-3.5 text-cyan-400" />
            <span>Informações Principais</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 1. Tipo do Imóvel * */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Tipo do imóvel <span className="text-rose-400 font-bold">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => {
                  setType(e.target.value as PropertyType);
                  clearFieldError('type');
                }}
                className={`w-full px-3 py-2 rounded-xl bg-slate-900/80 text-white text-xs focus:outline-none cursor-pointer transition-colors ${
                  fieldErrors.type
                    ? 'border-2 border-rose-500/70 bg-rose-500/5 text-rose-200'
                    : 'border border-white/10 focus:border-cyan-400'
                }`}
              >
                <option value="Apartamento">Apartamento</option>
                <option value="Flat">Flat</option>
                <option value="Studio">Studio</option>
                <option value="Cobertura">Cobertura</option>
                <option value="Casa">Casa</option>
                <option value="Terreno">Terreno</option>
                <option value="Outro">Outro</option>
              </select>
              {fieldErrors.type && (
                <p className="mt-1 text-[11px] text-rose-400 flex items-center gap-1 font-medium animate-fade-in">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span>⚠ {fieldErrors.type}</span>
                </p>
              )}
            </div>

            {/* 2. Bairro * */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Bairro <span className="text-rose-400 font-bold">*</span>
              </label>
              <input
                type="text"
                list="neighborhood-list"
                value={neighborhood}
                onChange={(e) => {
                  setNeighborhood(e.target.value);
                  clearFieldError('neighborhood');
                }}
                placeholder="Ex: Bessa, Manaíra..."
                className={`w-full px-3 py-2 rounded-xl bg-slate-900/80 text-white text-xs focus:outline-none transition-colors ${
                  fieldErrors.neighborhood
                    ? 'border-2 border-rose-500/70 bg-rose-500/5 placeholder-rose-400/40 text-rose-200'
                    : 'border border-white/10 focus:border-cyan-400'
                }`}
              />
              <datalist id="neighborhood-list">
                {NEIGHBORHOOD_SUGGESTIONS.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
              {fieldErrors.neighborhood && (
                <p className="mt-1 text-[11px] text-rose-400 flex items-center gap-1 font-medium animate-fade-in">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span>⚠ {fieldErrors.neighborhood}</span>
                </p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Condomínio / Edifício
              </label>
              <input
                type="text"
                value={condominiumName}
                onChange={(e) => setCondominiumName(e.target.value)}
                placeholder="Ex: Ed. Ocean Palace"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className="sm:col-span-2">
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Endereço / Rua
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Ex: Av. Governador Argemiro de Figueiredo"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Número
                </label>
                <input
                  type="text"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder="120"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Apto
                </label>
                <input
                  type="text"
                  value={complement}
                  onChange={(e) => setComplement(e.target.value)}
                  placeholder="302"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── 2. CARACTERÍSTICAS & DIMENSÕES ── */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/8 space-y-3.5">
          <div className="flex items-center gap-2 text-white text-xs font-bold uppercase tracking-wider">
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>Características do Imóvel</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {/* 3. Área (m²) * */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Área (m²) <span className="text-rose-400 font-bold">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="5000"
                value={areaM2}
                onChange={(e) => {
                  setAreaM2(e.target.value === '' ? '' : Number(e.target.value));
                  clearFieldError('area_m2');
                }}
                placeholder="Ex: 65"
                className={`w-full px-3 py-2 rounded-xl bg-slate-900/80 text-white text-xs focus:outline-none font-mono transition-colors ${
                  fieldErrors.area_m2
                    ? 'border-2 border-rose-500/70 bg-rose-500/5 placeholder-rose-400/40 text-rose-200'
                    : 'border border-white/10 focus:border-cyan-400'
                }`}
              />
              {fieldErrors.area_m2 && (
                <p className="mt-1 text-[11px] text-rose-400 flex items-center gap-1 font-medium animate-fade-in">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span>⚠ {fieldErrors.area_m2}</span>
                </p>
              )}
            </div>

            {/* 4. Quartos * */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Quartos <span className="text-rose-400 font-bold">*</span>
              </label>
              <input
                type="number"
                min="0"
                max="20"
                value={bedrooms}
                onChange={(e) => {
                  setBedrooms(e.target.value === '' ? '' : Number(e.target.value));
                  clearFieldError('bedrooms');
                }}
                placeholder="Ex: 2"
                className={`w-full px-3 py-2 rounded-xl bg-slate-900/80 text-white text-xs focus:outline-none font-mono transition-colors ${
                  fieldErrors.bedrooms
                    ? 'border-2 border-rose-500/70 bg-rose-500/5 placeholder-rose-400/40 text-rose-200'
                    : 'border border-white/10 focus:border-cyan-400'
                }`}
              />
              {fieldErrors.bedrooms && (
                <p className="mt-1 text-[11px] text-rose-400 flex items-center gap-1 font-medium animate-fade-in">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span>⚠ {fieldErrors.bedrooms}</span>
                </p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Suítes
              </label>
              <input
                type="number"
                min="0"
                max="20"
                value={suites}
                onChange={(e) => setSuites(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Banheiros
              </label>
              <input
                type="number"
                min="0"
                max="20"
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Vagas
              </label>
              <input
                type="number"
                min="0"
                max="20"
                value={parkingSpaces}
                onChange={(e) => setParkingSpaces(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-1">
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Posição Solar
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as PropertyPosition)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400 cursor-pointer"
              >
                <option value="Nascente">Nascente</option>
                <option value="Poente">Poente</option>
                <option value="Norte">Norte</option>
                <option value="Sul">Sul</option>
                <option value="Outro">Outro</option>
                <option value="Não informado">Não informado</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Condição
              </label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as PropertyCondition)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400 cursor-pointer"
              >
                <option value="Novo">Novo</option>
                <option value="Usado">Usado</option>
                <option value="Reformado">Reformado</option>
                <option value="Outro">Outro</option>
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Andar
              </label>
              <input
                type="number"
                min="0"
                max="80"
                value={floor}
                onChange={(e) => setFloor(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex: 3"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            <div className="flex items-center pt-5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={furnished}
                  onChange={(e) => setFurnished(e.target.checked)}
                  className="w-4 h-4 rounded accent-cyan-400 cursor-pointer"
                />
                <span className="text-xs text-white font-medium">Imóvel Mobiliado</span>
              </label>
            </div>
          </div>
        </div>

        {/* ── 3. VALORES FINANCEIROS ── */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/8 space-y-3.5">
          <div className="flex items-center gap-2 text-white text-xs font-bold uppercase tracking-wider">
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
            <span>Valores e Encargos</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* 5. Valor do imóvel * */}
            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Valor do imóvel (R$) <span className="text-rose-400 font-bold">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={price}
                onChange={(e) => {
                  setPrice(e.target.value === '' ? '' : Number(e.target.value));
                  clearFieldError('price');
                }}
                placeholder="Ex: 450000"
                className={`w-full px-3 py-2 rounded-xl bg-slate-900/80 text-white text-xs focus:outline-none font-mono font-bold transition-colors ${
                  fieldErrors.price
                    ? 'border-2 border-rose-500/70 bg-rose-500/5 placeholder-rose-400/40 text-rose-200'
                    : 'border border-white/10 focus:border-cyan-400'
                }`}
              />
              {fieldErrors.price && (
                <p className="mt-1 text-[11px] text-rose-400 flex items-center gap-1 font-medium animate-fade-in">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />
                  <span>⚠ {fieldErrors.price}</span>
                </p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                Condomínio Mensal (R$) <span className="text-slate-500 font-normal">(Opcional)</span>
              </label>
              <input
                type="number"
                min="0"
                value={condoFee}
                onChange={(e) => setCondoFee(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="Ex: 450"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                IPTU Anual (R$)
              </label>
              <input
                type="number"
                min="0"
                value={iptu}
                onChange={(e) => setIptu(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="850"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>
          </div>
        </div>

        {/* ── 4. COMODIDADES E TAGS ── */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/8 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-white text-xs font-bold uppercase tracking-wider">
              Comodidades e Detalhes
            </span>
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
              Características do Edifício
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_BUILDING_FEATURES.map((feat) => {
                const active = buildingFeatures.includes(feat);
                return (
                  <button
                    key={feat}
                    type="button"
                    onClick={() => toggleBuildingFeature(feat)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer select-none ${
                      active
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-sm font-semibold'
                        : 'bg-white/5 text-slate-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {active ? '✓ ' : '+ '}
                    {feat}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-white/5">
            <label className="text-[11px] font-semibold text-slate-400 block mb-1.5">
              Características do Imóvel
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_APARTMENT_FEATURES.map((feat) => {
                const active = apartmentFeatures.includes(feat);
                return (
                  <button
                    key={feat}
                    type="button"
                    onClick={() => toggleApartmentFeature(feat)}
                    className={`px-2.5 py-1 rounded-lg text-xs transition-all cursor-pointer select-none ${
                      active
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-sm font-semibold'
                        : 'bg-white/5 text-slate-400 hover:text-white border border-white/5'
                    }`}
                  >
                    {active ? '✓ ' : '+ '}
                    {feat}
                  </button>
                );
              })}
            </div>

            {/* Inserir tag customizada */}
            <div className="flex items-center gap-2 mt-2.5 max-w-sm">
              <input
                type="text"
                value={customFeature}
                onChange={(e) => setCustomFeature(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomFeature();
                  }
                }}
                placeholder="Adicionar outra comodidade..."
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-white/10 text-white text-xs"
              />
              <button
                type="button"
                onClick={handleAddCustomFeature}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-400 text-xs font-semibold border border-white/10 cursor-pointer"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>

        {/* ── 5. SEÇÃO EXCLUSIVA DE FOTOS (MODO MANUAL) ── */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/8 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white text-xs font-bold uppercase tracking-wider">
              <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
              <span>Fotos do Imóvel ({images.length})</span>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingImages}
              className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/40 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Adicionar fotos</span>
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.heic,.heif"
            onChange={handleFilesSelected}
            className="hidden"
          />

          {images.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 pt-1">
              {images.map((img, idx) => (
                <div
                  key={idx}
                  className={`relative group rounded-xl overflow-hidden aspect-video border transition-all ${
                    img.isCover
                      ? 'border-cyan-400 ring-2 ring-cyan-400/40 shadow-lg shadow-cyan-500/20'
                      : 'border-white/15 hover:border-white/30'
                  }`}
                >
                  <img
                    src={img.previewUrl}
                    alt={`Foto ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />

                  {/* Badge de Capa */}
                  {img.isCover && (
                    <span className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-cyan-500 text-[9px] font-bold text-slate-950 flex items-center gap-1 shadow-md">
                      <Star className="w-2.5 h-2.5 fill-current" /> Capa
                    </span>
                  )}

                  {/* Ações ao passar o mouse */}
                  <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    {!img.isCover && (
                      <button
                        type="button"
                        onClick={() => handleSetCover(idx)}
                        title="Definir como foto principal de capa"
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-cyan-300 transition-colors cursor-pointer"
                      >
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      title="Excluir foto"
                      className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-300 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border border-dashed border-white/15 hover:border-cyan-400/40 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-white/[0.01] hover:bg-white/[0.03]"
            >
              <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2 group-hover:text-cyan-400" />
              <p className="text-xs text-slate-300 font-medium">
                Clique para selecionar ou arraste fotos aqui
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                PNG, JPG ou HEIC. Se nenhuma for enviada, um placeholder moderno será adotado.
              </p>
            </div>
          )}
        </div>

        {/* ── 6. ORIGEM & CONTATOS ── */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/8 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-white text-xs font-bold uppercase tracking-wider">
              <User className="w-3.5 h-3.5 text-cyan-400" />
              <span>Origem e Contatos</span>
            </div>

            {/* Toggle Próprio / Parceiro */}
            <div className="p-0.5 rounded-xl bg-slate-900 border border-white/10 flex items-center">
              <button
                type="button"
                onClick={() => setSourceType('Próprio')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  sourceType === 'Próprio'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Próprio
              </button>
              <button
                type="button"
                onClick={() => setSourceType('Parceiro')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  sourceType === 'Parceiro'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Parceiro
              </button>
            </div>
          </div>

          {sourceType === 'Próprio' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Nome do Proprietário
                </label>
                <input
                  type="text"
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                  placeholder="Ex: Carlos Eduardo"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                  placeholder="(83) 99999-8888"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Nome do Corretor Parceiro
                </label>
                <input
                  type="text"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="Ex: Corretor Silva"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Telefone do Parceiro
                </label>
                <input
                  type="text"
                  value={partnerPhone}
                  onChange={(e) => setPartnerPhone(e.target.value)}
                  placeholder="(83) 98888-7777"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>
            </div>
          )}

          <div className="pt-2">
            <label className="text-[11px] font-semibold text-slate-400 block mb-1">
              Observações / Notas Internas
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Informações adicionais, chaves, horários para visitação..."
              className="w-full px-3 py-2 rounded-xl bg-slate-900/80 border border-white/10 text-white text-xs focus:outline-none focus:border-cyan-400 resize-none"
            />
          </div>
        </div>
      </div>

      {/* ── 7. RODAPÉ FIXO DO MODO MANUAL ── */}
      <div className="h-[64px] px-6 border-t border-white/10 bg-slate-950/70 flex items-center justify-between flex-shrink-0">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
        >
          Cancelar
        </button>

        <button
          type="submit"
          className="px-6 py-2.5 rounded-xl text-xs font-bold text-slate-950 flex items-center gap-2 transition-all cursor-pointer shadow-lg active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #00E5FF 0%, #38BDF8 100%)',
            boxShadow: '0 0 20px rgba(0, 229, 255, 0.35)',
          }}
        >
          <Check className="w-4 h-4 stroke-[2.5]" />
          <span>Adicionar imóvel</span>
        </button>
      </div>
    </form>
  );
};

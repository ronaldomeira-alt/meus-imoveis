import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  MapPin,
  Maximize2,
  BedDouble,
  DoorClosed,
  ShowerHead,
  Car,
  DollarSign,
  Landmark,
  Receipt,
  AlignLeft,
  Check,
  X,
} from 'lucide-react';
import type { ExtractedPropertyData } from '../../lib/gemini';
import type { PropertyType } from '../../types/property';
import type { RequiredFieldsValidationResult, MandatoryPropertyFieldKey } from '../../lib/property-validation';
import { VoiceNotesInput } from '../ui/VoiceNotesInput';

interface PropertyFichaProps {
  data: ExtractedPropertyData;
  onUpdateField: (field: keyof ExtractedPropertyData, value: any) => void;
  requiredValidation: RequiredFieldsValidationResult;
  pendingLabels: string[];
  progressPct: number;
  showValidationErrors?: boolean;
}

const PROPERTY_TYPES: PropertyType[] = ['Apartamento', 'Casa', 'Flat', 'Studio', 'Cobertura', 'Terreno', 'Outro'];

const COMMON_NEIGHBORHOODS = [
  'Aeroclube',
  'Altiplano',
  'Bancários',
  'Bela Vista',
  'Bessa',
  'Cabo Branco',
  'Camboinha',
  'Expedicionários',
  'Intermares',
  'Jardim Luna',
  'Jardim Oceania',
  'Manaíra',
  'Miramar',
  'Portal do Sol',
  'Tambauzinho',
  'Tambaú',
];

const COMMON_AMENITIES = [
  'Academia',
  'Cinema',
  'Elevador',
  'Escada',
  'Espaço gourmet',
  'Lavanderia',
  'Minimercado',
  'Piscina',
  'Portaria física',
  'Portaria virtual',
  'Recepção',
  'Restaurante',
  'Rooftop',
  'Salão de festas',
  'Salão de jogos',
  'Sem área de lazer',
];

const currency = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatCurrencyValue = (value: string) => {
  const number = Number(value);
  return Number.isFinite(number)
    ? number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
    : '';
};

const formatCurrencyTyping = (value: string) => {
  const digits = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return '';
  const cents = Number(digits) / 100;
  return cents.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
};

const parseCurrencyInput = (value: string) => {
  const normalized = value.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.');
  return normalized !== '' ? parseFloat(normalized) : null;
};

const formatBedrooms = (data: ExtractedPropertyData): string => {
  if (data.bedrooms_options && data.bedrooms_options.length > 0) {
    const opts = data.bedrooms_options;
    if (opts.length === 1) return `${opts[0]} ${opts[0] === 1 ? 'quarto' : 'quartos'}`;
    if (opts.length === 2) return `${opts[0]} e ${opts[1]} quartos`;
    return `${opts.slice(0, -1).join(', ')} e ${opts[opts.length - 1]} quartos`;
  }
  if (data.bedrooms != null) {
    return `${data.bedrooms} ${data.bedrooms === 1 ? 'quarto' : 'quartos'}`;
  }
  return '';
};

const formatArea = (data: ExtractedPropertyData): string => {
  if (data.area_range && (data.area_range.min > 0 || data.area_range.max > 0)) {
    return `${data.area_range.min}–${data.area_range.max} m²`;
  }
  if (data.area_m2 != null) {
    return `${data.area_m2} m²`;
  }
  return '';
};

// ── Célula base minimalista da Ficha Viva ──
const FichaItem: React.FC<{
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  required?: boolean;
  resolved: boolean;
  approximate?: boolean;
  showError?: boolean;
  errorMessage?: string;
  className?: string;
  children: React.ReactNode;
}> = ({ label, icon: Icon, required, resolved, approximate, showError, errorMessage, className, children }) => (
  <div
    className={`p-3 rounded-xl border transition-all duration-150 ${
      showError && !resolved && required
        ? 'border-status-danger/40 bg-status-danger/[0.04]'
        : resolved
        ? 'border-line-subtle bg-white/[0.02]'
        : 'border-white/[0.04] bg-white/[0.008]'
    } ${className || ''}`}
  >
    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-ink-secondary mb-1">
      {Icon && <Icon className="w-3 h-3 flex-shrink-0 text-accent/80" />}
      <span className="truncate">{label}</span>
      {approximate && <span className="ml-auto text-[9px] normal-case font-medium text-status-warning flex-shrink-0">~ aprox.</span>}
    </div>
    <motion.div
      key={resolved ? 'filled' : 'empty'}
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
    {showError && errorMessage && (
      <p className="text-[10px] text-status-danger mt-1">{errorMessage}</p>
    )}
  </div>
);

// ── Valor inline editável com foco sutil ──
const InlineValue: React.FC<{
  rawValue: string;
  displayValue: React.ReactNode;
  placeholder: string;
  type?: 'text' | 'number';
  suggestions?: string[];
  formatDraft?: (value: string) => string;
  formatInput?: (value: string) => string;
  onCommit: (raw: string) => void;
}> = ({ rawValue, displayValue, placeholder, type = 'text', suggestions = [], formatDraft, formatInput, onCommit }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatDraft ? formatDraft(rawValue) : rawValue);

  if (editing) {
    return (
      <>
        <input
          autoFocus
          type={formatDraft ? 'text' : type}
          list={suggestions.length > 0 ? `suggestions-${type}-${placeholder.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}` : undefined}
          value={draft}
          onChange={(e) => setDraft(formatInput ? formatInput(e.target.value) : e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => {
            onCommit(draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onCommit(draft);
              setEditing(false);
            }
            if (e.key === 'Escape') {
              setDraft(rawValue);
              setEditing(false);
            }
          }}
          className="w-full bg-transparent text-sm font-semibold text-ink-primary focus:outline-none border-b border-accent pb-0.5"
        />
        {suggestions.length > 0 && (
          <datalist id={`suggestions-${type}-${placeholder.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>
            {suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
          </datalist>
        )}
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(formatDraft ? formatDraft(rawValue) : rawValue);
        setEditing(true);
      }}
      className="w-full text-left cursor-pointer hover:opacity-80 transition-opacity"
    >
      <span
        className={`text-sm tracking-tight ${
          displayValue ? 'font-semibold text-ink-primary' : 'text-ink-secondary/50 font-normal italic text-xs'
        }`}
      >
        {displayValue || placeholder}
      </span>
    </button>
  );
};

export const PropertyFicha: React.FC<PropertyFichaProps> = ({
  data,
  onUpdateField,
  requiredValidation,
  pendingLabels,
  progressPct,
  showValidationErrors = false,
}) => {
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const [neighborhoodMenuOpen, setNeighborhoodMenuOpen] = useState(false);
  const [bathroomsMenuOpen, setBathroomsMenuOpen] = useState(false);
  const [parkingMenuOpen, setParkingMenuOpen] = useState(false);
  const [amenityDraft, setAmenityDraft] = useState('');
  const errors = requiredValidation.errors as Partial<Record<MandatoryPropertyFieldKey, string>>;
  const neighborhoodQuery = (data.neighborhood || '').trim().toLocaleLowerCase('pt-BR');
  const filteredNeighborhoods = COMMON_NEIGHBORHOODS.filter((neighborhood) =>
    neighborhood.toLocaleLowerCase('pt-BR').startsWith(neighborhoodQuery)
  );
  const bathroomQuery = data.bathrooms?.toString() || '';
  const filteredBathrooms = ['1', '2', '3', '4'].filter((value) => value.startsWith(bathroomQuery));

  const amenities = data.building_features || [];
  const amenityOptions = [
    ...COMMON_AMENITIES,
    ...amenities.filter((feat) => !COMMON_AMENITIES.includes(feat)),
  ];

  const toggleAmenity = (feat: string) => {
    const next = feat === 'Sem área de lazer'
      ? (amenities.includes(feat) ? [] : [feat])
      : (amenities.includes(feat)
        ? amenities.filter((f) => f !== feat)
        : [...amenities.filter((f) => f !== 'Sem área de lazer'), feat]);
    onUpdateField('building_features', next);
  };

  const addCustomAmenity = () => {
    const trimmed = amenityDraft.trim();
    if (!trimmed) return;
    if (!amenities.includes(trimmed)) {
      onUpdateField('building_features', [...amenities.filter((f) => f !== 'Sem área de lazer'), trimmed]);
    }
    setAmenityDraft('');
  };

  const isComplete = requiredValidation.valid && pendingLabels.length === 0;

  return (
    <div className="space-y-5">
      {/* ── Cabeçalho integrado da Ficha Viva com linha textual elegante de pendências ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-1 border-b border-line-subtle/50">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-primary flex items-center gap-2">
            <AlignLeft className="w-3.5 h-3.5 text-accent" strokeWidth={2.2} />
            Ficha do imóvel
          </h3>
          <p className="text-[11.5px] text-ink-secondary mt-0.5">
            Construída em tempo real a partir de áudio, texto ou edição direta.
          </p>
        </div>

        {/* Linha discreta de pendências (sem alerta amarelo ou checkboxes) */}
        <div className="flex items-center gap-3">
          {isComplete ? (
            <div className="px-2.5 py-1 rounded-lg bg-status-success/10 border border-status-success/30 text-status-success text-xs font-semibold flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Cadastro completo</span>
            </div>
          ) : progressPct > 0 ? (
            <div className="flex items-center gap-2.5 text-xs text-ink-secondary">
              <div className="w-16 h-1 rounded-full bg-white/[0.08] overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="font-semibold text-ink-primary tabular">{progressPct}%</span>
              <span className="text-ink-secondary/60">·</span>
              <span className="text-[11px] text-ink-secondary">
                Ainda faltam {pendingLabels.length}: <span className="text-ink-primary font-medium">{pendingLabels.join(' · ')}</span>
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-ink-secondary/70 italic">
              Aguardando fotos, áudio ou texto para preencher a ficha...
            </span>
          )}
        </div>
      </div>

      {/* ── SEÇÃO 1: Espaço & Dimensões ── */}
      <div className="space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary/70 block">
          Identificação & Dimensões
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
          {/* Tipo */}
          <FichaItem
            label="Tipo"
            icon={Building2}
            required
            resolved={!!data.type}
            showError={showValidationErrors}
            errorMessage={errors.type}
            className="lg:col-span-2"
          >
            <div className="relative">
              <button
                type="button"
                onClick={() => setTypeMenuOpen((v) => !v)}
                className="w-full text-left cursor-pointer"
              >
                <span className={`text-sm ${data.type ? 'font-semibold text-ink-primary' : 'text-ink-secondary/50 text-xs italic'}`}>
                  {data.type || 'Selecionar tipo...'}
                </span>
              </button>
              {typeMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setTypeMenuOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-20 w-44 modal-surface rounded-xl py-1 shadow-modal border border-line-subtle">
                    {PROPERTY_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          onUpdateField('type', t);
                          setTypeMenuOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-white/[0.06] transition-colors cursor-pointer ${
                          data.type === t ? 'text-accent font-semibold' : 'text-ink-secondary'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </FichaItem>

          {/* Bairro */}
          <FichaItem
            label="Bairro"
            icon={MapPin}
            required
            resolved={!!data.neighborhood}
            showError={showValidationErrors}
            errorMessage={errors.neighborhood}
            className="lg:col-span-2"
          >
            <div className="relative">
              <button
                type="button"
                onClick={() => setNeighborhoodMenuOpen((value) => !value)}
                className="w-full text-left cursor-pointer hover:opacity-80 transition-opacity"
              >
                <span className={`text-sm ${data.neighborhood ? 'font-semibold text-ink-primary' : 'text-ink-secondary/50 text-xs italic'}`}>
                  {data.neighborhood || 'Selecionar bairro...'}
                </span>
              </button>
              {neighborhoodMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setNeighborhoodMenuOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-20 w-52 max-h-64 overflow-y-auto modal-surface rounded-xl py-1 shadow-modal border border-line-subtle">
                    <div className="px-2 pb-1.5">
                      <input
                        autoFocus
                        type="text"
                        value={data.neighborhood || ''}
                        onChange={(event) => onUpdateField('neighborhood', event.target.value || null)}
                        placeholder="Digite o bairro..."
                        className="w-full rounded-lg border border-line-subtle bg-black/20 px-2.5 py-1.5 text-xs text-ink-primary outline-none focus:border-accent"
                      />
                    </div>
                    {filteredNeighborhoods.map((neighborhood) => {
                      const selected = data.neighborhood === neighborhood;
                      return (
                        <button
                          key={neighborhood}
                          type="button"
                          onClick={() => {
                            onUpdateField('neighborhood', neighborhood);
                            setNeighborhoodMenuOpen(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-white/[0.06] transition-colors cursor-pointer ${selected ? 'text-accent font-semibold' : 'text-ink-secondary'}`}
                        >
                          {neighborhood}
                        </button>
                      );
                    })}
                    {filteredNeighborhoods.length === 0 && (
                      <p className="px-3 py-2 text-xs text-ink-secondary/70">Nenhuma sugestão encontrada.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </FichaItem>

          {/* Área */}
          <FichaItem
            label="Área"
            icon={Maximize2}
            required
            resolved={data.area_m2 != null || Boolean(data.area_range && (data.area_range.min > 0 || data.area_range.max > 0))}
            approximate={data.is_approximate_area}
            showError={showValidationErrors}
            errorMessage={errors.area_m2}
          >
            <InlineValue
              rawValue={
                data.area_range && (data.area_range.min > 0 || data.area_range.max > 0)
                  ? `${data.area_range.min}-${data.area_range.max}`
                  : data.area_m2?.toString() ?? ''
              }
              displayValue={formatArea(data)}
              placeholder="Ex: 65 m² ou 19–39 m²"
              type="text"
              onCommit={(v) => {
                const cleaned = v.trim();
                const rangeMatch = cleaned.match(/(\d+)\s*(?:a|até|-)\s*(\d+)/i);
                if (rangeMatch) {
                  const min = parseInt(rangeMatch[1], 10);
                  const max = parseInt(rangeMatch[2], 10);
                  onUpdateField('area_range', { min: Math.min(min, max), max: Math.max(min, max) });
                  onUpdateField('area_m2', Math.min(min, max));
                  onUpdateField('is_development', true);
                } else if (cleaned !== '') {
                  const num = parseFloat(cleaned.replace(',', '.'));
                  onUpdateField('area_range', null);
                  onUpdateField('area_m2', !isNaN(num) ? num : null);
                } else {
                  onUpdateField('area_range', null);
                  onUpdateField('area_m2', null);
                }
              }}
            />
          </FichaItem>

          {/* Quartos */}
          <FichaItem
            label="Quartos"
            icon={BedDouble}
            required
            resolved={data.bedrooms != null || Boolean(data.bedrooms_options && data.bedrooms_options.length > 0)}
            showError={showValidationErrors}
            errorMessage={errors.bedrooms}
          >
            <InlineValue
              rawValue={
                data.bedrooms_options && data.bedrooms_options.length > 0
                  ? data.bedrooms_options.join(', ')
                  : data.bedrooms?.toString() ?? ''
              }
              displayValue={formatBedrooms(data)}
              placeholder="Ex: 2 ou 1, 2, 3"
              type="text"
              onCommit={(v) => {
                const cleaned = v.trim();
                const multiMatch = cleaned.match(/([1-4])\s*(?:,|\s*e|\s*ou)\s*([1-4])(?:\s*(?:e|ou|,)\s*([1-4]))?/);
                if (multiMatch) {
                  const opts = [multiMatch[1], multiMatch[2], multiMatch[3]]
                    .filter(Boolean)
                    .map((n) => parseInt(n, 10));
                  const unique = Array.from(new Set(opts)).sort((a, b) => a - b);
                  onUpdateField('bedrooms_options', unique);
                  onUpdateField('bedrooms', unique[0]);
                  onUpdateField('is_development', true);
                } else if (cleaned !== '') {
                  const num = parseInt(cleaned, 10);
                  onUpdateField('bedrooms_options', null);
                  onUpdateField('bedrooms', !isNaN(num) ? num : null);
                } else {
                  onUpdateField('bedrooms_options', null);
                  onUpdateField('bedrooms', null);
                }
              }}
            />
          </FichaItem>

          {/* Suítes (0 é válido) */}
          <FichaItem
            label="Suítes"
            icon={DoorClosed}
            resolved={data.suites != null}
          >
            <InlineValue
              rawValue={data.suites?.toString() ?? ''}
              displayValue={
                data.suites != null
                  ? data.suites === 0
                    ? '0 (sem suíte)'
                    : `${data.suites} ${data.suites === 1 ? 'suíte' : 'suítes'}`
                  : ''
              }
              placeholder="Não informado"
              type="number"
              onCommit={(v) => onUpdateField('suites', v !== '' ? parseInt(v, 10) : null)}
            />
          </FichaItem>

          {/* Banheiros */}
          <FichaItem
            label="Banheiros"
            icon={ShowerHead}
            resolved={data.bathrooms != null}
          >
            <div className="relative">
              <button
                type="button"
                onClick={() => setBathroomsMenuOpen((value) => !value)}
                className="w-full text-left cursor-pointer hover:opacity-80 transition-opacity"
              >
                <span className={`text-sm ${data.bathrooms != null ? 'font-semibold text-ink-primary' : 'text-ink-secondary/50 text-xs italic'}`}>
                  {data.bathrooms != null ? `${data.bathrooms} ${data.bathrooms === 1 ? 'banheiro' : 'banheiros'}` : 'Selecionar banheiros...'}
                </span>
              </button>
              {bathroomsMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setBathroomsMenuOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-20 w-44 max-h-64 overflow-y-auto modal-surface rounded-xl py-1 shadow-modal border border-line-subtle">
                    <div className="px-2 pb-1.5">
                      <input
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        value={data.bathrooms?.toString() || ''}
                        onChange={(event) => {
                          const value = event.target.value.replace(/\D/g, '');
                          onUpdateField('bathrooms', value ? parseInt(value, 10) : null);
                        }}
                        placeholder="Digite a quantidade..."
                        className="w-full rounded-lg border border-line-subtle bg-black/20 px-2.5 py-1.5 text-xs text-ink-primary outline-none focus:border-accent"
                      />
                    </div>
                    {filteredBathrooms.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          onUpdateField('bathrooms', Number(value));
                          setBathroomsMenuOpen(false);
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-white/[0.06] transition-colors cursor-pointer ${data.bathrooms === Number(value) ? 'text-accent font-semibold' : 'text-ink-secondary'}`}
                      >
                        {value}
                      </button>
                    ))}
                    {filteredBathrooms.length === 0 && (
                      <p className="px-3 py-2 text-xs text-ink-secondary/70">Nenhuma sugestão encontrada.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </FichaItem>

          {/* Vagas (0 é válido) */}
          <FichaItem
            label="Vagas"
            icon={Car}
            resolved={data.parking_spaces != null || data.parking_spaces_type === 'Rotativas'}
          >
            <div className="relative">
              <button
                type="button"
                onClick={() => setParkingMenuOpen((value) => !value)}
                className="w-full text-left cursor-pointer"
              >
                <span className={`text-sm ${data.parking_spaces_type === 'Rotativas' || data.parking_spaces != null ? 'font-semibold text-ink-primary' : 'text-ink-secondary/50 text-xs italic'}`}>
                  {data.parking_spaces_type === 'Rotativas'
                    ? 'Rotativas'
                    : data.parking_spaces != null
                      ? data.parking_spaces === 0 ? '0 (sem vaga)' : `${data.parking_spaces} ${data.parking_spaces === 1 ? 'vaga' : 'vagas'}`
                      : 'Selecionar vagas...'}
                </span>
              </button>
              {parkingMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setParkingMenuOpen(false)} />
                  <div className="absolute left-0 top-full mt-1.5 z-20 w-44 max-h-64 overflow-y-auto modal-surface rounded-xl py-1 shadow-modal border border-line-subtle">
                    {['Rotativas', '1', '2', '3', '4'].map((option) => {
                      const selected = option === 'Rotativas'
                        ? data.parking_spaces_type === 'Rotativas'
                        : data.parking_spaces_type !== 'Rotativas' && data.parking_spaces === Number(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => {
                            onUpdateField('parking_spaces_type', option === 'Rotativas' ? 'Rotativas' : null);
                            onUpdateField('parking_spaces', option === 'Rotativas' ? 0 : Number(option));
                            setParkingMenuOpen(false);
                          }}
                          className={`w-full px-3 py-1.5 text-left text-xs hover:bg-white/[0.06] transition-colors cursor-pointer ${selected ? 'text-accent font-semibold' : 'text-ink-secondary'}`}
                        >
                          {option === 'Rotativas' ? 'Rotativa' : `${option} ${option === '1' ? 'vaga' : 'vagas'}`}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </FichaItem>
        </div>
      </div>

      {/* ── SEÇÃO 2: Valores & Encargos ── */}
      <div className="space-y-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary/70 block">
          Valores & Custos
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* Preço */}
          <FichaItem
            label={data.purpose === 'Locação' ? 'Valor do aluguel' : 'Preço de venda'}
            icon={DollarSign}
            required
            resolved={data.price != null}
            approximate={data.is_approximate_price}
            showError={showValidationErrors}
            errorMessage={errors.price}
          >
            <InlineValue
              rawValue={data.price?.toString() ?? ''}
              displayValue={data.price != null ? currency(data.price) : ''}
              placeholder="Ex: R$ 520.000"
              formatDraft={(value) => value ? formatCurrencyValue(value) : ''}
              formatInput={formatCurrencyTyping}
              onCommit={(v) => {
                const normalized = v.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.');
                onUpdateField('price', normalized !== '' ? parseFloat(normalized) : null);
              }}
            />
          </FichaItem>

          {/* Condomínio (3 estados: valor / incluso / não se aplica) */}
          <FichaItem
            label="Condomínio"
            icon={Landmark}
            resolved={data.condo_fee != null || Boolean(data.condo_included) || Boolean(data.condo_not_applicable)}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                {data.condo_included ? (
                  <span className="text-xs font-semibold text-accent">Incluso no valor</span>
                ) : data.condo_not_applicable ? (
                  <span className="text-xs font-semibold text-ink-secondary/80 italic">Não se aplica</span>
                ) : (
                  <InlineValue
                    rawValue={data.condo_fee?.toString() ?? ''}
                    displayValue={data.condo_fee != null ? currency(data.condo_fee) : ''}
                    placeholder="Não informado"
                    formatDraft={(value) => value ? formatCurrencyValue(value) : ''}
                    formatInput={formatCurrencyTyping}
                    onCommit={(v) => onUpdateField('condo_fee', parseCurrencyInput(v))}
                  />
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    onUpdateField('condo_included', !data.condo_included);
                    if (!data.condo_included) {
                      onUpdateField('condo_fee', null);
                      onUpdateField('condo_not_applicable', false);
                    }
                  }}
                  className={`text-[9.5px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                    data.condo_included
                      ? 'border-accent/40 bg-accent/15 text-accent font-semibold'
                      : 'border-line-subtle text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  Incluso
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onUpdateField('condo_not_applicable', !data.condo_not_applicable);
                    if (!data.condo_not_applicable) {
                      onUpdateField('condo_fee', null);
                      onUpdateField('condo_included', false);
                    }
                  }}
                  className={`text-[9.5px] px-1.5 py-0.5 rounded border transition-colors cursor-pointer ${
                    data.condo_not_applicable
                      ? 'border-accent/40 bg-accent/15 text-accent font-semibold'
                      : 'border-line-subtle text-ink-secondary hover:text-ink-primary'
                  }`}
                >
                  Não se aplica
                </button>
              </div>
            </div>
          </FichaItem>

          {/* IPTU */}
          <FichaItem
            label="IPTU anual"
            icon={Receipt}
            resolved={data.iptu != null}
          >
            <InlineValue
              rawValue={data.iptu?.toString() ?? ''}
              displayValue={data.iptu != null ? currency(data.iptu) : ''}
              placeholder="Não informado"
              formatDraft={(value) => value ? formatCurrencyValue(value) : ''}
              formatInput={formatCurrencyTyping}
              onCommit={(v) => onUpdateField('iptu', parseCurrencyInput(v))}
            />
          </FichaItem>
        </div>
      </div>

      {/* ── SEÇÃO 3: Lazer & Comodidades ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary/70 block">
            Comodidades & Lazer
          </span>
          {amenities.length > 0 && (
            <button
              type="button"
              onClick={() => onUpdateField('building_features', [])}
              className="text-[10.5px] text-ink-secondary hover:text-status-danger transition-colors cursor-pointer"
            >
              Limpar todas
            </button>
          )}
        </div>

        <div className="p-3 rounded-xl border border-line-subtle/60 bg-white/[0.015] space-y-2.5">
          <div className="flex items-center gap-2 w-1/5 min-w-[150px]">
            <input
              type="text"
              value={amenityDraft}
              onChange={(e) => setAmenityDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustomAmenity();
                }
              }}
              placeholder="Adicionar comodidade..."
              className="w-full px-2.5 py-1 rounded-lg bg-surface-1 border border-line-subtle text-ink-primary text-xs focus:outline-none focus:border-accent"
            />
            {amenityDraft.trim() && (
              <button
                type="button"
                onClick={addCustomAmenity}
                className="px-2.5 py-1 rounded-lg bg-accent text-white text-xs font-semibold cursor-pointer"
              >
                Adicionar
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {amenityOptions.map((feat) => {
              const selected = amenities.includes(feat);
              return selected ? (
                <span
                  key={feat}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleAmenity(feat)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggleAmenity(feat);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-accent/25 transition-colors"
                >
                  {feat}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleAmenity(feat);
                    }}
                    className="hover:text-status-danger cursor-pointer ml-0.5"
                    aria-label={`Remover ${feat}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ) : (
                <button
                  key={feat}
                  type="button"
                  onClick={() => toggleAmenity(feat)}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.02] border border-line-subtle text-ink-secondary hover:text-ink-primary hover:border-line-strong text-xs transition-colors cursor-pointer"
                >
                  {feat}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── SEÇÃO 4: Observações / Descrição Livre (Com entrada por voz) ── */}
      <VoiceNotesInput
        value={data.notes || ''}
        onChange={(val) => onUpdateField('notes', val)}
        label="Observações & Percepções do Imóvel"
        placeholder="Observações livres sobre o imóvel, vizinhança, proximidade do mar, rotina local, comércio ou pontos fortes da negociação..."
        rows={3}
      />
    </div>
  );
};

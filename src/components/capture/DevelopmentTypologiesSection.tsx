import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, Layers, AlertCircle } from 'lucide-react';
import { DevelopmentTypology, PropertyType } from '../../types/property';

interface DevelopmentTypologiesSectionProps {
  typologies: DevelopmentTypology[];
  onChange: (typologies: DevelopmentTypology[]) => void;
}

const PROPERTY_TYPES: PropertyType[] = [
  'Apartamento',
  'Studio',
  'Flat',
  'Cobertura',
  'Casa',
  'Outro',
];

export const DevelopmentTypologiesSection: React.FC<DevelopmentTypologiesSectionProps> = ({
  typologies = [],
  onChange,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [type, setType] = useState<PropertyType>('Apartamento');
  const [areaMin, setAreaMin] = useState<string>('');
  const [areaMax, setAreaMax] = useState<string>('');
  const [bedrooms, setBedrooms] = useState<number>(1);
  const [suites, setSuites] = useState<string>('');
  const [bathrooms, setBathrooms] = useState<string>('');
  const [parkingSpaces, setParkingSpaces] = useState<string>('');
  const [priceFrom, setPriceFrom] = useState<string>('');
  const [priceTo, setPriceTo] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('');
    setType('Apartamento');
    setAreaMin('');
    setAreaMax('');
    setBedrooms(1);
    setSuites('');
    setBathrooms('');
    setParkingSpaces('');
    setPriceFrom('');
    setPriceTo('');
    setFormError(null);
    setIsAdding(false);
    setEditingId(null);
  };

  const startEdit = (typology: DevelopmentTypology) => {
    setEditingId(typology.id);
    setTitle(typology.title || '');
    setType(typology.type || 'Apartamento');
    setAreaMin(typology.area_min ? String(typology.area_min) : '');
    setAreaMax(typology.area_max ? String(typology.area_max) : '');
    setBedrooms(typology.bedrooms);
    setSuites(typology.suites !== undefined && typology.suites !== null ? String(typology.suites) : '');
    setBathrooms(typology.bathrooms !== undefined && typology.bathrooms !== null ? String(typology.bathrooms) : '');
    setParkingSpaces(typology.parking_spaces !== undefined && typology.parking_spaces !== null ? String(typology.parking_spaces) : '');
    setPriceFrom(typology.price_from ? String(typology.price_from) : '');
    setPriceTo(typology.price_to ? String(typology.price_to) : '');
    setFormError(null);
    setIsAdding(true);
  };

  const handleSave = () => {
    const parsedAreaMin = parseFloat(areaMin.replace(',', '.'));
    const parsedAreaMax = areaMax ? parseFloat(areaMax.replace(',', '.')) : undefined;
    const cleanPriceFrom = priceFrom.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.');
    const parsedPriceFrom = parseFloat(cleanPriceFrom);
    const cleanPriceTo = priceTo ? priceTo.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.') : '';
    const parsedPriceTo = cleanPriceTo ? parseFloat(cleanPriceTo) : undefined;

    if (isNaN(parsedAreaMin) || parsedAreaMin <= 0) {
      setFormError('Informe ao menos a área mínima válida (m²).');
      return;
    }

    if (isNaN(parsedPriceFrom) || parsedPriceFrom <= 0) {
      setFormError('Informe o preço a partir de (R$) para esta tipologia.');
      return;
    }

    const newTypology: DevelopmentTypology = {
      id: editingId || `typ-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim() || undefined,
      type,
      area_min: parsedAreaMin,
      area_max: parsedAreaMax && parsedAreaMax > parsedAreaMin ? parsedAreaMax : undefined,
      bedrooms,
      suites: suites !== '' ? parseInt(suites, 10) : undefined,
      bathrooms: bathrooms !== '' ? parseInt(bathrooms, 10) : undefined,
      parking_spaces: parkingSpaces !== '' ? parseInt(parkingSpaces, 10) : undefined,
      price_from: parsedPriceFrom,
      price_to: parsedPriceTo && parsedPriceTo > parsedPriceFrom ? parsedPriceTo : undefined,
    };

    if (editingId) {
      onChange(typologies.map((t) => (t.id === editingId ? newTypology : t)));
    } else {
      onChange([...typologies, newTypology]);
    }

    resetForm();
  };

  const handleRemove = (id: string) => {
    onChange(typologies.filter((t) => t.id !== id));
    if (editingId === id) resetForm();
  };

  const formatPrice = (val: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const formatBedroomsLabel = (qty: number) => {
    if (qty === 0) return 'Studio';
    if (qty === 1) return '1 quarto';
    return `${qty} quartos`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-accent" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-primary">
            Tipologias Disponíveis (Plantas do Empreendimento)
          </h3>
        </div>
        {!isAdding && typologies.length > 0 && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setIsAdding(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-accent/15 text-accent hover:bg-accent/25 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar tipologia
          </button>
        )}
      </div>

      <p className="text-[11.5px] text-ink-secondary">
        Cadastre as diferentes opções de plantas do empreendimento com metragens e valores de partida. O motor de Match avaliará cada tipologia de forma independente para evitar falsos positivos com os clientes.
      </p>

      {/* Lista de tipologias já cadastradas */}
      {typologies.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {typologies.map((t) => (
            <div
              key={t.id}
              className={`p-3.5 rounded-xl border transition-all ${
                editingId === t.id
                  ? 'border-accent bg-accent/[0.06] shadow-sm'
                  : 'border-line-subtle bg-surface-1 hover:border-line-strong'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-ink-primary">
                      {t.title || `${t.type} · ${formatBedroomsLabel(t.bedrooms)}`}
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-surface-2 text-ink-secondary border border-line-subtle">
                      {t.type}
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-ink-secondary flex flex-wrap gap-x-3 gap-y-1">
                    <span>
                      📐 {t.area_max ? `${t.area_min} a ${t.area_max} m²` : `${t.area_min} m²`}
                    </span>
                    <span>🛏️ {formatBedroomsLabel(t.bedrooms)}</span>
                    {t.suites !== undefined && t.suites > 0 && <span>🚿 {t.suites} suíte{t.suites > 1 ? 's' : ''}</span>}
                    {t.bathrooms !== undefined && t.bathrooms > 0 && <span>🚽 {t.bathrooms} banh.</span>}
                    {t.parking_spaces !== undefined && (
                      <span>🚗 {t.parking_spaces === 0 ? 'Sem vaga' : `${t.parking_spaces} vaga${t.parking_spaces > 1 ? 's' : ''}`}</span>
                    )}
                  </div>

                  <div className="mt-2.5">
                    <span className="text-[10px] uppercase tracking-wider text-ink-muted font-medium">
                      {t.price_to ? 'Faixa de valor' : 'A partir de'}
                    </span>
                    <div className="text-sm font-bold text-accent">
                      {t.price_to
                        ? `${formatPrice(t.price_from)} a ${formatPrice(t.price_to)}`
                        : formatPrice(t.price_from)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(t)}
                    title="Editar tipologia"
                    className="p-1.5 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-surface-2 transition-all cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(t.id)}
                    title="Excluir tipologia"
                    className="p-1.5 rounded-lg text-ink-secondary hover:text-status-danger hover:bg-status-danger/10 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !isAdding && (
          <div className="p-6 rounded-xl border border-dashed border-line-subtle bg-surface-1/40 text-center space-y-3">
            <div>
              <p className="text-xs font-semibold text-ink-primary">
                Nenhuma tipologia cadastrada ainda.
              </p>
              <p className="text-xs text-ink-secondary mt-0.5">
                Cadastre as diferentes plantas deste empreendimento com metragens e valores de partida.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setIsAdding(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent/90 shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Adicionar primeira tipologia
            </button>
          </div>
        )
      )}

      {/* Formulário de adicionar/editar tipologia */}
      {isAdding && (
        <div className="p-4 rounded-xl border border-accent/40 bg-surface-1 shadow-md space-y-4 animate-in fade-in-50 duration-200">
          <div className="flex items-center justify-between pb-2 border-b border-line-subtle">
            <h4 className="text-xs font-bold uppercase tracking-wider text-accent">
              {editingId ? 'Editar Tipologia' : 'Nova Tipologia'}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              className="p-1 rounded-lg text-ink-secondary hover:text-ink-primary hover:bg-surface-2 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {formError && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-status-danger/10 border border-status-danger/20 text-xs text-status-danger">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {/* Título opcional da planta */}
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Nome/Identificação da Planta (opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: Studio Final 01, Planta Tipo 2Q..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-lg border border-line-subtle bg-surface-2 text-ink-primary placeholder-ink-muted focus:outline-none focus:border-accent"
              />
            </div>

            {/* Tipo */}
            <div>
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Tipo do Imóvel *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as PropertyType)}
                className="w-full h-9 px-2 text-xs rounded-lg border border-line-subtle bg-surface-2 text-ink-primary focus:outline-none focus:border-accent"
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t} className="bg-surface-1 text-ink-primary">
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Quartos */}
            <div>
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Quartos *
              </label>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setBedrooms(n)}
                    className={`flex-1 h-9 text-xs font-semibold rounded-lg border transition-all cursor-pointer ${
                      bedrooms === n
                        ? 'border-accent bg-accent text-white shadow-sm'
                        : 'border-line-subtle bg-surface-2 text-ink-secondary hover:text-ink-primary'
                    }`}
                  >
                    {n === 0 ? 'Std' : `${n}Q`}
                  </button>
                ))}
              </div>
            </div>

            {/* Metragem Mínima */}
            <div>
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Área Mínima (m²) *
              </label>
              <input
                type="number"
                step="any"
                placeholder="Ex: 48"
                value={areaMin}
                onChange={(e) => setAreaMin(e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-lg border border-line-subtle bg-surface-2 text-ink-primary placeholder-ink-muted focus:outline-none focus:border-accent"
              />
            </div>

            {/* Metragem Máxima */}
            <div>
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Área Máxima (m², opcional)
              </label>
              <input
                type="number"
                step="any"
                placeholder="Ex: 55"
                value={areaMax}
                onChange={(e) => setAreaMax(e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-lg border border-line-subtle bg-surface-2 text-ink-primary placeholder-ink-muted focus:outline-none focus:border-accent"
              />
            </div>

            {/* Suítes */}
            <div>
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Suítes
              </label>
              <input
                type="number"
                min="0"
                placeholder="Ex: 1"
                value={suites}
                onChange={(e) => setSuites(e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-lg border border-line-subtle bg-surface-2 text-ink-primary placeholder-ink-muted focus:outline-none focus:border-accent"
              />
            </div>

            {/* Banheiros */}
            <div>
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Banheiros
              </label>
              <input
                type="number"
                min="0"
                placeholder="Ex: 2"
                value={bathrooms}
                onChange={(e) => setBathrooms(e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-lg border border-line-subtle bg-surface-2 text-ink-primary placeholder-ink-muted focus:outline-none focus:border-accent"
              />
            </div>

            {/* Vagas */}
            <div>
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Vagas de Garagem
              </label>
              <input
                type="number"
                min="0"
                placeholder="Ex: 1"
                value={parkingSpaces}
                onChange={(e) => setParkingSpaces(e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-lg border border-line-subtle bg-surface-2 text-ink-primary placeholder-ink-muted focus:outline-none focus:border-accent"
              />
            </div>

            {/* Preço a partir de */}
            <div>
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Preço a partir de (R$) *
              </label>
              <input
                type="text"
                placeholder="Ex: 380.000"
                value={priceFrom}
                onChange={(e) => setPriceFrom(e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-lg border border-line-subtle bg-surface-2 text-ink-primary placeholder-ink-muted focus:outline-none focus:border-accent font-semibold"
              />
            </div>

            {/* Preço até (opcional) */}
            <div>
              <label className="block text-[11px] font-medium text-ink-secondary mb-1">
                Preço até (R$, opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: 490.000"
                value={priceTo}
                onChange={(e) => setPriceTo(e.target.value)}
                className="w-full h-9 px-3 text-xs rounded-lg border border-line-subtle bg-surface-2 text-ink-primary placeholder-ink-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-line-subtle">
            <button
              type="button"
              onClick={resetForm}
              className="px-3 py-1.5 text-xs font-medium rounded-lg text-ink-secondary hover:bg-surface-2 transition-all cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-accent text-white shadow-sm hover:opacity-90 transition-all cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {editingId ? 'Salvar alterações' : 'Adicionar planta'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

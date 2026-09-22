import React from 'react';
import { ArrowUpDown, X, Filter } from 'lucide-react';
import type { PropertyType } from '../../types/property';

export type SortOption = 'recent' | 'price_asc' | 'price_desc' | 'area_asc' | 'area_desc';

export interface FilterState {
  neighborhood: string;
  type: string;
  bedrooms: string;
  minPrice: string;
  maxPrice: string;
  sourceType: string;
  status: string;
  sortBy: SortOption;
}

interface PropertyFiltersProps {
  filters: FilterState;
  onFilterChange: (newFilters: FilterState) => void;
  availableNeighborhoods: string[];
  totalResults: number;
}

export const PropertyFilters: React.FC<PropertyFiltersProps> = ({
  filters,
  onFilterChange,
  availableNeighborhoods,
  totalResults,
}) => {
  const propertyTypes: PropertyType[] = [
    'Apartamento',
    'Flat',
    'Studio',
    'Cobertura',
    'Casa',
    'Terreno',
    'Outro',
  ];

  const handleReset = () => {
    onFilterChange({
      neighborhood: '',
      type: '',
      bedrooms: '',
      minPrice: '',
      maxPrice: '',
      sourceType: '',
      status: 'Ativo',
      sortBy: 'recent',
    });
  };

  const hasActiveFilters = Boolean(
    filters.neighborhood ||
      filters.type ||
      filters.bedrooms ||
      filters.minPrice ||
      filters.maxPrice ||
      filters.sourceType ||
      filters.status !== 'Ativo'
  );

  return (
    <div className="panel-surface p-4 mb-4 space-y-3">
      {/* Linha Superior: Filtros em Cápsulas Glass */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {/* Bairro */}
        <div>
          <label className="text-[9.5px] font-bold text-ink-secondary uppercase tracking-wider block mb-1">
            Bairro
          </label>
          <select
            value={filters.neighborhood}
            onChange={(e) => onFilterChange({ ...filters, neighborhood: e.target.value })}
            className="w-full px-3 py-1.5 pill-surface rounded-xl text-xs text-ink-primary focus:outline-none focus:border-accent/50"
          >
            <option value="" className="bg-[#15181D]">Todos os bairros</option>
            {availableNeighborhoods.map((n) => (
              <option key={n} value={n} className="bg-[#15181D]">
                {n}
              </option>
            ))}
          </select>
        </div>

        {/* Tipo */}
        <div>
          <label className="text-[9.5px] font-bold text-ink-secondary uppercase tracking-wider block mb-1">
            Tipo
          </label>
          <select
            value={filters.type}
            onChange={(e) => onFilterChange({ ...filters, type: e.target.value })}
            className="w-full px-3 py-1.5 pill-surface rounded-xl text-xs text-ink-primary focus:outline-none focus:border-accent/50"
          >
            <option value="" className="bg-[#15181D]">Todos os tipos</option>
            {propertyTypes.map((t) => (
              <option key={t} value={t} className="bg-[#15181D]">
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Quartos */}
        <div>
          <label className="text-[9.5px] font-bold text-ink-secondary uppercase tracking-wider block mb-1">
            Quartos
          </label>
          <select
            value={filters.bedrooms}
            onChange={(e) => onFilterChange({ ...filters, bedrooms: e.target.value })}
            className="w-full px-3 py-1.5 pill-surface rounded-xl text-xs text-ink-primary focus:outline-none focus:border-accent/50"
          >
            <option value="" className="bg-[#15181D]">Qualquer</option>
            <option value="1" className="bg-[#15181D]">1+ quartos</option>
            <option value="2" className="bg-[#15181D]">2+ quartos</option>
            <option value="3" className="bg-[#15181D]">3+ quartos</option>
            <option value="4" className="bg-[#15181D]">4+ quartos</option>
          </select>
        </div>

        {/* Preço Mínimo */}
        <div>
          <label className="text-[9.5px] font-bold text-ink-secondary uppercase tracking-wider block mb-1">
            Preço Mínimo
          </label>
          <input
            type="number"
            placeholder="Ex: 300000"
            value={filters.minPrice}
            onChange={(e) => onFilterChange({ ...filters, minPrice: e.target.value })}
            className="w-full input-field rounded-xl text-xs px-3 py-1.5"
          />
        </div>

        {/* Preço Máximo */}
        <div>
          <label className="text-[9.5px] font-bold text-ink-secondary uppercase tracking-wider block mb-1">
            Preço Máximo
          </label>
          <input
            type="number"
            placeholder="Ex: 800000"
            value={filters.maxPrice}
            onChange={(e) => onFilterChange({ ...filters, maxPrice: e.target.value })}
            className="w-full input-field rounded-xl text-xs px-3 py-1.5"
          />
        </div>

        {/* Origem */}
        <div>
          <label className="text-[9.5px] font-bold text-ink-secondary uppercase tracking-wider block mb-1">
            Origem
          </label>
          <select
            value={filters.sourceType}
            onChange={(e) => onFilterChange({ ...filters, sourceType: e.target.value })}
            className="w-full px-3 py-1.5 pill-surface rounded-xl text-xs text-ink-primary focus:outline-none focus:border-accent/50"
          >
            <option value="" className="bg-[#15181D]">Todos</option>
            <option value="Próprio" className="bg-[#15181D]">Próprio</option>
            <option value="Parceiro" className="bg-[#15181D]">Parceiro</option>
          </select>
        </div>

        {/* Status */}
        <div>
          <label className="text-[9.5px] font-bold text-ink-secondary uppercase tracking-wider block mb-1">
            Status
          </label>
          <select
            value={filters.status}
            onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
            className="w-full px-3 py-1.5 pill-surface rounded-xl text-xs text-ink-primary focus:outline-none focus:border-accent/50"
          >
            <option value="Ativo" className="bg-[#15181D]">Ativo</option>
            <option value="Vendido" className="bg-[#15181D]">Vendido</option>
            <option value="Arquivado" className="bg-[#15181D]">Arquivado</option>
          </select>
        </div>
      </div>

      {/* Linha Inferior: Contagem e Ordenação */}
      <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-ink-primary tabular">
            {totalResults} {totalResults === 1 ? 'imóvel' : 'imóveis'} no catálogo
          </span>
          {hasActiveFilters && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent font-semibold px-2 py-0.5 rounded-lg bg-accent/10 border border-accent/20 transition-colors"
            >
              <X className="w-3 h-3" />
              Limpar filtros
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label className="text-[11px] font-semibold text-ink-secondary flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5" />
            Ordenar:
          </label>
          <select
            value={filters.sortBy}
            onChange={(e) => onFilterChange({ ...filters, sortBy: e.target.value as SortOption })}
            className="px-3 py-1 pill-surface rounded-xl text-xs text-ink-primary focus:outline-none focus:border-accent/50"
          >
            <option value="recent" className="bg-[#15181D]">Mais recentes</option>
            <option value="price_asc" className="bg-[#15181D]">Menor preço</option>
            <option value="price_desc" className="bg-[#15181D]">Maior preço</option>
            <option value="area_asc" className="bg-[#15181D]">Menor área (m²)</option>
            <option value="area_desc" className="bg-[#15181D]">Maior área (m²)</option>
          </select>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { ArrowUpDown, SlidersHorizontal, X } from 'lucide-react';
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
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const propertyTypes: PropertyType[] = ['Apartamento', 'Flat', 'Studio', 'Cobertura', 'Casa', 'Terreno', 'Outro'];
  const fieldClass = 'w-full px-3 py-2 pill-surface rounded-xl text-xs text-ink-primary focus:outline-none focus:border-accent/50';
  const labelClass = 'text-[9.5px] font-bold text-ink-secondary uppercase tracking-wider block mb-1';
  const hasActiveFilters = Boolean(
    filters.neighborhood || filters.type || filters.bedrooms || filters.minPrice ||
    filters.maxPrice || filters.sourceType || filters.status !== 'Ativo'
  );

  const reset = () => onFilterChange({
    neighborhood: '', type: '', bedrooms: '', minPrice: '', maxPrice: '',
    sourceType: '', status: 'Ativo', sortBy: 'recent',
  });

  return (
    <div className="panel-surface p-2 sm:p-3 rounded-2xl">
      <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-end sm:gap-2.5">
        <div className="min-w-0 sm:min-w-[150px] sm:flex-[1_1_170px]">
          <label className={`${labelClass} hidden sm:block`}>Bairro</label>
          <select value={filters.neighborhood} onChange={(e) => onFilterChange({ ...filters, neighborhood: e.target.value })} className={fieldClass}>
            <option value="" className="bg-[#15181D]">Todos os bairros</option>
            {availableNeighborhoods.map((n) => <option key={n} value={n} className="bg-[#15181D]">{n}</option>)}
          </select>
        </div>
        <div className="hidden sm:block min-w-[145px] flex-[1_1_160px]">
          <label className={labelClass}>Tipo</label>
          <select value={filters.type} onChange={(e) => onFilterChange({ ...filters, type: e.target.value })} className={fieldClass}>
            <option value="" className="bg-[#15181D]">Todos os tipos</option>
            {propertyTypes.map((t) => <option key={t} value={t} className="bg-[#15181D]">{t}</option>)}
          </select>
        </div>
        <div className="min-w-0 sm:min-w-[130px] sm:flex-[1_1_145px]">
          <label className={`${labelClass} hidden sm:block`}>Quartos</label>
          <select value={filters.bedrooms} onChange={(e) => onFilterChange({ ...filters, bedrooms: e.target.value })} className={fieldClass}>
            <option value="" className="bg-[#15181D]">Qualquer</option>
            {[1, 2, 3, 4].map((n) => <option key={n} value={n} className="bg-[#15181D]">{n}+ quartos</option>)}
          </select>
        </div>
        <div className="min-w-0 sm:min-w-[130px] sm:flex-[1_1_145px]">
          <label className={`${labelClass} hidden sm:block`}>Preço</label>
          <button type="button" onClick={() => setMoreOpen(!moreOpen)} className={fieldClass + ' text-left'}>
            {filters.minPrice || filters.maxPrice ? 'Faixa definida' : 'Qualquer valor'}
          </button>
        </div>
        <button type="button" onClick={() => setMoreOpen(!moreOpen)} aria-expanded={moreOpen} className="btn-secondary h-[34px] px-2 sm:px-3 rounded-xl text-xs inline-flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5" /> Mais filtros
        </button>
        <div className="hidden sm:flex items-center gap-2 ml-auto">
          <label className="text-[11px] font-semibold text-ink-secondary inline-flex items-center gap-1 whitespace-nowrap">
            <ArrowUpDown className="w-3.5 h-3.5" /> Ordenar:
          </label>
          <select value={filters.sortBy} onChange={(e) => onFilterChange({ ...filters, sortBy: e.target.value as SortOption })} className={fieldClass}>
            <option value="recent" className="bg-[#15181D]">Mais recentes</option>
            <option value="price_asc" className="bg-[#15181D]">Menor preço</option>
            <option value="price_desc" className="bg-[#15181D]">Maior preço</option>
            <option value="area_asc" className="bg-[#15181D]">Menor área (m²)</option>
            <option value="area_desc" className="bg-[#15181D]">Maior área (m²)</option>
          </select>
        </div>
      </div>
      {moreOpen && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-2.5 mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-line-subtle">
          <div className="sm:hidden">
            <label className={labelClass}>Tipo</label>
            <select value={filters.type} onChange={(e) => onFilterChange({ ...filters, type: e.target.value })} className={fieldClass}>
              <option value="" className="bg-[#15181D]">Todos os tipos</option>
              {propertyTypes.map((t) => <option key={t} value={t} className="bg-[#15181D]">{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Preço mínimo</label>
            <input type="number" min="0" placeholder="Ex: 300000" value={filters.minPrice} onChange={(e) => onFilterChange({ ...filters, minPrice: e.target.value })} className="w-full input-field rounded-xl text-xs px-3 py-2" />
          </div>
          <div>
            <label className={labelClass}>Preço máximo</label>
            <input type="number" min="0" placeholder="Ex: 800000" value={filters.maxPrice} onChange={(e) => onFilterChange({ ...filters, maxPrice: e.target.value })} className="w-full input-field rounded-xl text-xs px-3 py-2" />
          </div>
          <div>
            <label className={labelClass}>Origem</label>
            <select value={filters.sourceType} onChange={(e) => onFilterChange({ ...filters, sourceType: e.target.value })} className={fieldClass}>
              <option value="" className="bg-[#15181D]">Todos</option>
              <option value="Próprio" className="bg-[#15181D]">Próprio</option>
              <option value="Parceiro" className="bg-[#15181D]">Parceiro</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Status</label>
            <select value={filters.status} onChange={(e) => onFilterChange({ ...filters, status: e.target.value })} className={fieldClass}>
              <option value="Ativo" className="bg-[#15181D]">Ativo</option>
              <option value="Vendido" className="bg-[#15181D]">Vendido</option>
              <option value="Arquivado" className="bg-[#15181D]">Arquivado</option>
            </select>
          </div>
          <div className="sm:hidden col-span-2">
            <label className={labelClass}>Ordenar</label>
            <select value={filters.sortBy} onChange={(e) => onFilterChange({ ...filters, sortBy: e.target.value as SortOption })} className={fieldClass}>
              <option value="recent" className="bg-[#15181D]">Mais recentes</option>
              <option value="price_asc" className="bg-[#15181D]">Menor preço</option>
              <option value="price_desc" className="bg-[#15181D]">Maior preço</option>
              <option value="area_asc" className="bg-[#15181D]">Menor área (m²)</option>
              <option value="area_desc" className="bg-[#15181D]">Maior área (m²)</option>
            </select>
          </div>
        </div>
      )}
      {hasActiveFilters && (
        <button type="button" onClick={reset} className="inline-flex items-center gap-1 mt-2 text-[11px] text-accent font-semibold">
          <X className="w-3 h-3" /> Limpar filtros
        </button>
      )}
    </div>
  );
};

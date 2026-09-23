import { createClient } from '@supabase/supabase-js';
import type { Property, DashboardStats, NeighborhoodStat, PropertyTypeStat, PriceRangeStat } from '../types/property';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const STORAGE_BUCKET = 'property-images';
export const ASSETS_BUCKET = 'app-assets';

export const getPhotoUrl = (path: string): string => {
  if (!path) return 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80';
  if (path.startsWith('http') || path.startsWith('blob:')) return path;
  if (!supabase) return path;
  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
};

export const calculateDashboardStats = (properties: Property[]): DashboardStats => {
  const activeProps = properties.filter((p) => p.status === 'Ativo');
  const totalActive = activeProps.length;

  const ownCount = activeProps.filter((p) => p.source_type === 'Próprio').length;
  const partnerCount = activeProps.filter((p) => p.source_type === 'Parceiro').length;

  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const addedThisWeekCount = activeProps.filter(
    (p) => new Date(p.created_at) >= oneWeekAgo
  ).length;

  // ── Agrupamento por Bairro ──
  const countsByNeighborhood: Record<string, number> = {};
  activeProps.forEach((p) => {
    const n = p.neighborhood || 'Outro';
    countsByNeighborhood[n] = (countsByNeighborhood[n] || 0) + 1;
  });

  const byNeighborhood: NeighborhoodStat[] = Object.entries(countsByNeighborhood)
    .map(([neighborhood, count]) => ({
      neighborhood,
      count,
      pct: totalActive > 0 ? (count / totalActive) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ── Agrupamento por Tipos de Imóvel (Barras Verticais) ──
  const countsByType: Record<string, number> = {};
  activeProps.forEach((p) => {
    const t = p.type || 'Outro';
    countsByType[t] = (countsByType[t] || 0) + 1;
  });

  const byPropertyType: PropertyTypeStat[] = Object.entries(countsByType)
    .map(([type, count]) => ({
      type,
      count,
      pct: totalActive > 0 ? (count / totalActive) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count);

  // ── Agrupamento por Faixas de Preço (Idêntico ao Gráfico de Anel da Referência) ──
  // 1: Até R$ 300 mil
  // 2: R$ 300 – 400 mil
  // 3: R$ 400 – 500 mil
  // 4: R$ 500 – 700 mil
  // 5: R$ 700 mil – 1 mi
  // 6: Acima de R$ 1 mi
  // Paleta categórica validada (CVD-safe) — mesma ordem fixa de
  // src/components/dashboard/PriceRangeChart.tsx; não reordenar sem revalidar.
  const rangesDef = [
    { id: 'r1', label: 'Até R$ 300 mil',    min: 0,       max: 300000,  color: '#3987E5' },
    { id: 'r2', label: 'R$ 300 – 400 mil',  min: 300000,  max: 400000,  color: '#D95926' },
    { id: 'r3', label: 'R$ 400 – 500 mil',  min: 400000,  max: 500000,  color: '#199E70' },
    { id: 'r4', label: 'R$ 500 – 700 mil',  min: 500000,  max: 700000,  color: '#C98500' },
    { id: 'r5', label: 'R$ 700 mil – 1 mi', min: 700000,  max: 1000000, color: '#D55181' },
    { id: 'r6', label: 'Acima de R$ 1 mi',  min: 1000000, max: Infinity,color: '#008300' },
  ];

  const byPriceRange: PriceRangeStat[] = rangesDef.map((def) => {
    const count = activeProps.filter((p) => {
      if (def.max === Infinity) return p.price >= def.min;
      return p.price >= def.min && p.price < def.max;
    }).length;

    const pct = totalActive > 0 ? (count / totalActive) * 100 : 0;

    return {
      id: def.id,
      label: def.label,
      minPrice: def.min,
      maxPrice: def.max,
      count,
      pct,
      color: def.color,
    };
  });

  const totalPortfolioValue = activeProps.reduce((sum, p) => sum + (p.price || 0), 0);

  return {
    totalActive,
    ownCount,
    partnerCount,
    addedThisWeekCount,
    activeCountChangePct: 12,
    ownCountChangePct: 7,
    partnerCountChangePct: 28,
    addedThisWeekChangePct: 33,
    byNeighborhood,
    byPropertyType,
    byPriceRange,
    totalPortfolioValue,
  };
};

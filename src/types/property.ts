export type PropertyType =
  | 'Apartamento'
  | 'Flat'
  | 'Studio'
  | 'Cobertura'
  | 'Casa'
  | 'Terreno'
  | 'Outro';

export type PropertyPosition =
  | 'Nascente'
  | 'Poente'
  | 'Norte'
  | 'Sul'
  | 'Outro'
  | 'Não informado';

export type PropertyCondition = 'Novo' | 'Usado' | 'Reformado' | 'Outro';

export type PropertyPurpose = 'Venda' | 'Locação';

export type FieldState = 'informed' | 'missing' | 'ambiguous';

export type SourceType = 'Próprio' | 'Parceiro';

export type PropertyStatus = 'Ativo' | 'Vendido' | 'Arquivado';

export interface PropertyPhoto {
  id: string;
  property_id: string;
  storage_path: string;
  sort_order: number;
  is_cover: boolean;
}

export interface Property {
  id: string;
  purpose?: PropertyPurpose;
  type: PropertyType;
  neighborhood: string;
  address?: string;
  number?: string;
  complement?: string;
  cep?: string;
  condominium_name?: string;
  unit?: string;
  bedrooms: number;
  suites: number;
  bathrooms: number;
  parking_spaces: number;
  area_m2: number;
  price: number;
  condo_fee?: number;
  iptu?: number;
  floor?: number | null;
  position?: PropertyPosition;
  furnished?: boolean;
  condition?: PropertyCondition;
  building_features: string[];
  apartment_features: string[];
  notes?: string;
  source_type: SourceType;
  owner_name?: string;
  owner_phone?: string;
  partner_name?: string;
  partner_phone?: string;
  status: PropertyStatus;
  created_by?: string;
  created_at: string;
  updated_at: string;
  photos?: PropertyPhoto[];
}

export interface NeighborhoodStat {
  neighborhood: string;
  count: number;
  pct: number;
}

export interface PriceRangeStat {
  id: string;
  label: string;
  minPrice: number;
  maxPrice: number;
  count: number;
  pct: number;
  color: string;
}

export interface DashboardStats {
  totalActive: number;
  ownCount: number;
  partnerCount: number;
  addedThisWeekCount: number;
  activeCountChangePct: number;
  ownCountChangePct: number;
  partnerCountChangePct: number;
  addedThisWeekChangePct: number;
  byNeighborhood: NeighborhoodStat[];
  byPriceRange: PriceRangeStat[];
  totalPortfolioValue: number;
}

export interface AppearanceSettings {
  bgImage: string | null;
  bgBlur: number;        // em px (default: 16)
  bgOpacity: number;     // 0.0 a 1.0 (default: 1.0)
  bgDarkness: number;    // 0.0 a 1.0 (0.0 = sem escurecimento, padrão: 0.25)
  bgBrightness: number;  // 0.5 a 1.8 (default: 1.0 = brilho natural 100%)
  bgSaturation: number;  // 0.5 a 2.0 (default: 1.1)
  cardOpacity: number;   // 0.05 a 0.95 (default: 0.18) -> Transparência dos Cards
  glassIntensity: number;// 0.2 a 2.0 (default: 1.0) -> Intensidade do Vidro
  lightPrimary?: string; // Hex ou rgba
  lightSecondary?: string;// Hex ou rgba
  lightIntensity?: number;// 0.2 a 2.0 (default: 1.0)
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  property_id: string;
  read: boolean;
  created_at: string;
}

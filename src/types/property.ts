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

export type SocialPlatform = 'instagram' | 'tiktok' | 'facebook';
export type SocialPublishStatus = 'not_published' | 'published';

export interface SocialPublication {
  status: SocialPublishStatus;
  published_at?: string;
  url?: string;
}

export type SocialPublications = Partial<Record<SocialPlatform, SocialPublication>>;

export interface PropertyPhoto {
  id: string;
  property_id: string;
  storage_path: string;
  sort_order: number;
  is_cover: boolean;
}

export interface Property {
  id: string;
  title?: string;
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
  is_development?: boolean;
  area_range?: { min: number; max: number } | null;
  bedrooms_options?: number[] | null;
  social_publications?: SocialPublications;
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

export interface PropertyTypeStat {
  type: PropertyType | string;
  count: number;
  pct: number;
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
  byPropertyType: PropertyTypeStat[];
  byPriceRange: PriceRangeStat[];
  totalPortfolioValue: number;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  property_id: string;
  read: boolean;
  created_at: string;
}

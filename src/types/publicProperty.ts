export interface PublicPropertyListing {
  id: string;
  title: string;
  purpose: string;
  type: string;
  neighborhood: string;
  city: string;
  condominiumName?: string;
  price: number;
  condoFee?: number | null;
  iptu?: number | null;
  bedrooms: number;
  suites: number;
  bathrooms: number;
  parkingSpaces: number;
  parkingSpacesType?: 'Rotativas';
  areaM2: number;
  areaRange: { min: number; max: number } | null;
  floor?: number | null;
  position?: string | null;
  condition?: string | null;
  furnished?: boolean | null;
  features: string[];
  apartmentFeatures?: string[];
  buildingFeatures?: string[];
  description: string;
  photos: string[];
  brand: string;
  agentName: string;
  agentRole: string;
}

export interface PublicPropertyRecord {
  id: string;
  active: boolean;
  listing: PublicPropertyListing | null;
  related: Array<{ id: string; listing: PublicPropertyListing }>;
}

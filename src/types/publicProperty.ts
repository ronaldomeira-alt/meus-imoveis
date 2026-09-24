export interface PublicPropertyListing {
  title: string;
  purpose: string;
  type: string;
  neighborhood: string;
  price: number;
  bedrooms: number;
  suites: number;
  bathrooms: number;
  parkingSpaces: number;
  parkingSpacesType?: 'Rotativas';
  areaM2: number;
  areaRange: { min: number; max: number } | null;
  features: string[];
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

import type { Property } from '../../types/property';
import type { PropertyProjection, PropertyOperation, DeliveryStatus } from './types';
import { getPhotoUrl } from '../supabase';

/**
 * Garante que qualquer identificador (seja UUID já válido ou ID legado como 'prop-01')
 * seja mapeado de forma determinística e estável para um UUID válido exigido pelo PostgreSQL.
 */
export function ensureUuid(id: string): string {
  if (!id) return '00000000-0000-4000-8000-000000000000';
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) {
    return id.toLowerCase();
  }

  // Gera hash SHA-1 simples determinístico para compatibilidade no navegador e Node
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0') +
    (id.length * 31).toString(16).padStart(8, '0') +
    'a1b2c3d4e5f6';

  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    '4' + hex.substring(13, 16),
    'a' + hex.substring(17, 20),
    hex.substring(20, 32).padEnd(12, '0'),
  ].join('-');
}

/**
 * Converte um `Property` do Meus Imóveis em uma `PropertyProjection`
 * estruturada conforme o Contrato Match v1.
 */
export function propertyToProjection(
  property: Property,
  accountId: string = '7f434d39-87d8-4d16-8262-e3006908d1c5'
): PropertyProjection {
  const propertyId = ensureUuid(property.id);

  // Determina título comercial limpo (nunca expondo internal_name)
  const title =
    property.title ||
    property.condominium_name ||
    `${property.type}${property.neighborhood ? ` no ${property.neighborhood}` : ''}`;

  const operation: PropertyOperation =
    property.purpose === 'Locação' ? 'locacao' : 'venda';

  const propertyType = (property.type || 'apartamento').toLowerCase();

  // Preço e faixas (FASE 3)
  const propWithRange = property as Property & { price_range?: { min: number; max: number } | null };
  const priceMin = propWithRange.price_range?.min ?? property.price ?? 0;
  const priceMax = propWithRange.price_range?.max ?? property.price ?? priceMin;

  // Metragem e faixas (FASE 3)
  const areaMin = property.area_range?.min ?? property.area_m2 ?? null;
  const areaMax = property.area_range?.max ?? property.area_m2 ?? areaMin;

  // Quartos e opções (FASE 3)
  let bedroomsMin: number | null = null;
  let bedroomsMax: number | null = null;
  if (property.bedrooms_options && property.bedrooms_options.length > 0) {
    bedroomsMin = Math.min(...property.bedrooms_options);
    bedroomsMax = Math.max(...property.bedrooms_options);
  } else if (property.bedrooms != null) {
    bedroomsMin = property.bedrooms;
    bedroomsMax = property.bedrooms;
  }

  // Delivery status (pronto / planta / em_construcao)
  let deliveryStatus: DeliveryStatus = 'pronto';
  const notesAndFeatures = [
    ...(property.building_features || []),
    ...(property.apartment_features || []),
    property.notes || '',
  ].join(' ').toLowerCase();

  if (notesAndFeatures.includes('na planta') || notesAndFeatures.includes('lançamento')) {
    deliveryStatus = 'planta';
  } else if (notesAndFeatures.includes('em construção') || notesAndFeatures.includes('obra')) {
    deliveryStatus = 'em_construcao';
  } else if (property.condition === 'Novo') {
    deliveryStatus = 'pronto';
  }

  // Status comercial
  const status: 'ativo' | 'inativo' | 'arquivado' =
    property.status === 'Ativo'
      ? 'ativo'
      : property.status === 'Vendido'
      ? 'inativo'
      : 'arquivado';

  // Capa principal real
  const coverPhoto = property.photos?.find((p) => p.is_cover) || property.photos?.[0];
  const coverUrl = coverPhoto ? getPhotoUrl(coverPhoto.storage_path) : null;

  const features = Array.from(
    new Set([
      ...(property.building_features || []),
      ...(property.apartment_features || []),
    ])
  );

  return {
    propertyId,
    accountId,
    code: property.unit ? `Unidade ${property.unit}` : undefined,
    title,
    operation,
    propertyType,
    neighborhood: property.neighborhood || 'João Pessoa',
    city: 'João Pessoa',
    priceMin: Number(priceMin) || 0,
    priceMax: Number(priceMax) || Number(priceMin) || 0,
    areaMin: areaMin != null ? Number(areaMin) : null,
    areaMax: areaMax != null ? Number(areaMax) : null,
    bedroomsMin,
    bedroomsMax,
    deliveryStatus,
    deliveryDeadline: null,
    features,
    coverUrl,
    publicUrl: property.public_page_id ? `/imovel/${property.public_page_id}` : undefined,
    status,
    updatedAt: property.updated_at || new Date().toISOString(),
  };
}

/**
 * FASE 9 & 28: Verifica se uma alteração no imóvel afeta campos relevantes ao Match.
 * Mudanças puramente visuais (fotos secundárias, notas internas) retornam `false`.
 */
export function isMatchRelevantPropertyChange(oldProp: Property, newProp: Property): boolean {
  if (oldProp.status !== newProp.status) return true;
  if (oldProp.price !== newProp.price) return true;
  if (oldProp.purpose !== newProp.purpose) return true;
  if (oldProp.type !== newProp.type) return true;
  if (oldProp.neighborhood !== newProp.neighborhood) return true;
  if (oldProp.bedrooms !== newProp.bedrooms) return true;
  if (oldProp.area_m2 !== newProp.area_m2) return true;
  if (oldProp.parking_spaces !== newProp.parking_spaces) return true;
  if (oldProp.condition !== newProp.condition) return true;

  // Empreendimentos
  const oldAny = oldProp as any;
  const newAny = newProp as any;
  if (JSON.stringify(oldProp.bedrooms_options) !== JSON.stringify(newProp.bedrooms_options)) return true;
  if (JSON.stringify(oldProp.area_range) !== JSON.stringify(newProp.area_range)) return true;
  if (JSON.stringify(oldAny.price_range) !== JSON.stringify(newAny.price_range)) return true;

  // Features estruturais (elevador, acessibilidade, piscina)
  const oldFeats = [...(oldProp.building_features || []), ...(oldProp.apartment_features || [])].sort().join('|');
  const newFeats = [...(newProp.building_features || []), ...(newProp.apartment_features || [])].sort().join('|');
  if (oldFeats !== newFeats) return true;

  return false;
}

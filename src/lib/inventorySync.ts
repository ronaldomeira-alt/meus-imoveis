import type { Property } from '../types/property';
import { supabase } from './supabase';

export interface InventorySnapshot {
  properties: Property[];
  deletedIds: string[];
}

const restoreMissingPropertyPhotos = async (properties: Property[]): Promise<Property[]> => {
  if (!supabase) return properties;

  const missingPhotoIds = properties
    .filter((property) => property.id && (!Array.isArray(property.photos) || property.photos.length === 0))
    .map((property) => property.id);
  if (missingPhotoIds.length === 0) return properties;

  const { data, error } = await supabase
    .from('property_media')
    .select('id, property_id, storage_path, object_key, storage_provider, sort_order, is_cover, media_type, mime_type, size_bytes')
    .in('property_id', missingPhotoIds)
    .order('sort_order', { ascending: true });

  if (error) {
    console.warn('[Estoque] Não foi possível recuperar referências de fotos:', error);
    return properties;
  }

  const photosByPropertyId = new Map<string, NonNullable<Property['photos']>>();
  for (const media of data || []) {
    if (!media.property_id || !media.storage_path) continue;
    const photos = photosByPropertyId.get(media.property_id) || [];
    photos.push({
      id: media.id,
      property_id: media.property_id,
      storage_path: media.storage_path,
      object_key: media.object_key || undefined,
      storage_provider: media.storage_provider,
      sort_order: media.sort_order,
      is_cover: media.is_cover,
      media_type: media.media_type,
      mime_type: media.mime_type || undefined,
      size_bytes: media.size_bytes || undefined,
    });
    photosByPropertyId.set(media.property_id, photos);
  }

  return properties.map((property) => {
    const restoredPhotos = photosByPropertyId.get(property.id);
    return restoredPhotos?.length ? { ...property, photos: restoredPhotos } : property;
  });
};

export const fetchInventorySnapshot = async (): Promise<InventorySnapshot> => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc('get_inventory_snapshot');
  if (error) throw error;
  const snapshot = data as Partial<InventorySnapshot> | null;
  return {
    properties: await restoreMissingPropertyPhotos(Array.isArray(snapshot?.properties) ? snapshot.properties : []),
    deletedIds: Array.isArray(snapshot?.deletedIds) ? snapshot.deletedIds : [],
  };
};

export const syncInventoryProperties = async (properties: Property[]): Promise<void> => {
  if (!supabase || properties.length === 0) return;
  const { error } = await supabase.rpc('sync_inventory_properties', { p_properties: properties });
  if (error) throw error;
};

export const deleteInventoryProperty = async (propertyId: string): Promise<void> => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { error } = await supabase.rpc('delete_inventory_property', { p_property_id: propertyId });
  if (error) throw error;
};

export const mergeInventoryProperties = (
  localProperties: Property[],
  snapshot: InventorySnapshot
): Property[] => {
  const deleted = new Set(snapshot.deletedIds);
  const merged = new Map<string, Property>();

  for (const property of snapshot.properties) {
    if (property?.id && !deleted.has(property.id)) merged.set(property.id, property);
  }
  for (const property of localProperties) {
    if (!property?.id || deleted.has(property.id)) continue;
    const remote = merged.get(property.id);
    const localUpdatedAt = Date.parse(property.updated_at || property.created_at || '');
    const remoteUpdatedAt = Date.parse(remote?.updated_at || remote?.created_at || '');
    if (!remote || (Number.isFinite(localUpdatedAt) && localUpdatedAt > remoteUpdatedAt)) {
      merged.set(
        property.id,
        !property.photos?.length && remote?.photos?.length
          ? { ...property, photos: remote.photos }
          : property
      );
    }
  }
  return [...merged.values()].sort((a, b) =>
    Date.parse(b.created_at || '') - Date.parse(a.created_at || '')
  );
};

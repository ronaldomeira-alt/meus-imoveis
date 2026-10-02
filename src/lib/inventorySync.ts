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

const reconcilePropertySocialStatus = async (properties: Property[]): Promise<Property[]> => {
  if (!supabase || properties.length === 0) return properties;

  try {
    const { data: posts, error } = await supabase
      .from('marketing_posts')
      .select('listing_id, channel, status, external_media_id, published_at')
      .eq('status', 'published');

    if (error || !Array.isArray(posts) || posts.length === 0) return properties;

    const publishedByListing = new Map<string, any>();
    for (const post of posts) {
      if (post.listing_id) {
        publishedByListing.set(post.listing_id, post);
      }
    }

    return properties.map((property) => {
      const pubPost = publishedByListing.get(property.id);
      if (pubPost && property.social_publications?.instagram?.status !== 'published') {
        return {
          ...property,
          social_publications: {
            ...(property.social_publications || {}),
            instagram: {
              status: 'published' as const,
              published_at: pubPost.published_at || new Date().toISOString(),
              external_media_id: pubPost.external_media_id || undefined,
            },
          },
        };
      }
      return property;
    });
  } catch (err) {
    console.warn('[Estoque] Erro ao reconciliar status social de publicações:', err);
    return properties;
  }
};

export const fetchInventorySnapshot = async (): Promise<InventorySnapshot> => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc('get_inventory_snapshot');
  if (error) throw error;
  const snapshot = data as Partial<InventorySnapshot> | null;
  const rawProps = Array.isArray(snapshot?.properties) ? snapshot.properties : [];
  const withPhotos = await restoreMissingPropertyPhotos(rawProps);
  const withSocial = await reconcilePropertySocialStatus(withPhotos);
  return {
    properties: withSocial,
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
      const mergedCandidate =
        !property.photos?.length && remote?.photos?.length
          ? { ...property, photos: remote.photos }
          : property;

      // Se no banco remoto o status já estava publicado, preserva o status publicado
      if (
        remote?.social_publications?.instagram?.status === 'published' &&
        mergedCandidate.social_publications?.instagram?.status !== 'published'
      ) {
        mergedCandidate.social_publications = {
          ...(mergedCandidate.social_publications || {}),
          instagram: remote.social_publications.instagram,
        };
      }

      merged.set(property.id, mergedCandidate);
    }
  }
  return [...merged.values()].sort((a, b) =>
    Date.parse(b.created_at || '') - Date.parse(a.created_at || '')
  );
};

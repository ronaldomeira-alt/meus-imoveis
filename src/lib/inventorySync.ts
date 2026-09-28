import type { Property } from '../types/property';
import { supabase } from './supabase';

export interface InventorySnapshot {
  properties: Property[];
  deletedIds: string[];
}

export const fetchInventorySnapshot = async (): Promise<InventorySnapshot> => {
  if (!supabase) throw new Error('Supabase não está configurado.');
  const { data, error } = await supabase.rpc('get_inventory_snapshot');
  if (error) throw error;
  const snapshot = data as Partial<InventorySnapshot> | null;
  return {
    properties: Array.isArray(snapshot?.properties) ? snapshot.properties : [],
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
      merged.set(property.id, property);
    }
  }
  return [...merged.values()].sort((a, b) =>
    Date.parse(b.created_at || '') - Date.parse(a.created_at || '')
  );
};

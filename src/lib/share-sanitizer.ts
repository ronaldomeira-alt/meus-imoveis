import type { Property } from '../types/property';
import { getPropertyPublicUrl, sharePropertyUniversal } from './propertyShare';

export const sharePropertySafely = async (property: Property): Promise<boolean> => {
  const result = await sharePropertyUniversal(property);
  return result.success;
};

export { getPropertyPublicUrl };

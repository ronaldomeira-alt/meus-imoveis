import { getPhotoUrl } from './supabase';
import type { Property } from '../types/property';

const ADMIN_TOKEN_KEY = 'meus-imoveis-public-pages-admin-token';

export const getPublicPageUrl = (id: string) => `${window.location.origin}/imovel/${encodeURIComponent(id)}`;
export const getSavedPublicAdminToken = () => localStorage.getItem(ADMIN_TOKEN_KEY) || '';
export const savePublicAdminToken = (token: string) => localStorage.setItem(ADMIN_TOKEN_KEY, token);

async function compressPhoto(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Não foi possível carregar uma das fotos do imóvel.');
  const source = await createImageBitmap(await response.blob());
  let scale = Math.min(1, 1280 / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Seu navegador não conseguiu preparar as fotos.');
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', Math.max(0.5, 0.76 - attempt * 0.06)));
      if (blob && blob.size <= 220_000) {
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Não foi possível preparar uma das fotos.'));
          reader.readAsDataURL(blob);
        });
      }
      scale *= 0.82;
    }
    throw new Error('Não foi possível reduzir uma foto ao tamanho permitido.');
  } finally {
    source.close();
  }
}

export async function setPublicPage(property: Property, active: boolean, token: string) {
  const photos = property.photos || [];
  const photoUrls = photos
    .slice()
    .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)
    .slice(0, 12)
    .map((photo) => getPhotoUrl(photo.storage_path));
  const photoData = active ? await Promise.all(photoUrls.map(compressPhoto)) : [];

  const response = await fetch('/api/public-pages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      propertyId: property.id,
      publicPageId: property.public_page_id,
      active,
      listing: {
        type: property.type,
        purpose: property.purpose,
        neighborhood: property.neighborhood,
        price: property.price,
        bedrooms: property.bedrooms,
        suites: property.suites,
        bathrooms: property.bathrooms,
        parkingSpaces: property.parking_spaces,
        parkingSpacesType: property.parking_spaces_type,
        areaM2: property.area_m2,
        areaRange: property.area_range,
        apartmentFeatures: property.apartment_features,
        buildingFeatures: property.building_features,
      },
      photos: photoData,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível alterar a página pública.');
  if (active) savePublicAdminToken(token);
  return result as { id: string; active: boolean };
}

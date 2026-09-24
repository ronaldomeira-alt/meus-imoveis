import { resolveMediaUrl } from './supabase';

export interface PropertyMediaItem {
  id: string;
  property_id: string;
  object_key: string;
  storage_provider: 'r2' | 'supabase' | 'external';
  media_type: 'photo' | 'video' | 'document';
  mime_type: string;
  size_bytes: number;
  sort_order: number;
  is_cover: boolean;
  storage_path: string;
  public_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface UploadMediaProgress {
  loaded: number;
  total: number;
  pct: number;
}

/**
 * Solicita a URL pré-assinada, envia o binário diretamente do navegador para o Cloudflare R2
 * e confirma os metadados no Supabase.
 */
export async function uploadPropertyMedia(
  propertyId: string,
  file: File,
  options: {
    sortOrder?: number;
    isCover?: boolean;
    onProgress?: (p: UploadMediaProgress) => void;
  } = {}
): Promise<PropertyMediaItem> {
  const { sortOrder = 0, isCover = false, onProgress } = options;

  // 1. Obter URL pré-assinada de upload no backend
  const presignRes = await fetch('/api/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'get-upload-url',
      propertyId,
      fileName: file.name,
      fileType: file.type || 'image/jpeg',
      fileSize: file.size,
    }),
  });

  if (!presignRes.ok) {
    const errorData = await presignRes.json().catch(() => ({}));
    throw new Error(errorData.error || 'Falha ao autorizar upload no servidor.');
  }

  const { uploadUrl, objectKey, mediaType, mimeType, publicUrl } = await presignRes.json();

  // 2. Upload direto do navegador para o Cloudflare R2 via HTTP PUT
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || mimeType);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            pct: Math.round((e.loaded / e.total) * 100),
          });
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Erro ao enviar arquivo para o Cloudflare R2 (HTTP ${xhr.status}).`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Falha de conexão durante o upload para o Cloudflare R2.'));
    };

    xhr.send(file);
  });

  // 3. Confirmar metadados no Supabase pelo backend
  const confirmRes = await fetch('/api/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'confirm-upload',
      propertyId,
      objectKey,
      mediaType,
      mimeType: file.type || mimeType,
      sizeBytes: file.size,
      sortOrder,
      isCover,
    }),
  });

  if (!confirmRes.ok) {
    const errorData = await confirmRes.json().catch(() => ({}));
    throw new Error(errorData.error || 'Falha ao registrar metadados no Supabase.');
  }

  const { media } = await confirmRes.json();
  return {
    ...media,
    public_url: publicUrl || resolveMediaUrl(media.object_key),
  };
}

/**
 * Exclui a mídia do Cloudflare R2 e remove seu registro no Supabase.
 */
export async function deletePropertyMedia(
  propertyId: string,
  params: { mediaId?: string; objectKey?: string }
): Promise<void> {
  const res = await fetch('/api/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'delete-media',
      propertyId,
      mediaId: params.mediaId,
      objectKey: params.objectKey,
    }),
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Falha ao excluir mídia.');
  }
}

/**
 * Busca todas as mídias salvas para um imóvel.
 */
export async function fetchPropertyMedia(propertyId: string): Promise<PropertyMediaItem[]> {
  const res = await fetch(`/api/media?propertyId=${encodeURIComponent(propertyId)}`);
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({ media: [] }));
  return (data.media || []).map((m: PropertyMediaItem) => ({
    ...m,
    public_url: resolveMediaUrl(m.object_key),
  }));
}

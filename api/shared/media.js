import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Carrega .env em ambiente de desenvolvimento local
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const rawEnv = fs.readFileSync(envPath, 'utf-8');
    rawEnv.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        let v = trimmed.slice(eqIdx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    });
  }
} catch {
  // Ignora em produção na Vercel
}

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
]);

const MAX_PHOTO_SIZE = 25 * 1024 * 1024; // 25 MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200 MB
const MAX_DOC_SIZE = 50 * 1024 * 1024; // 50 MB

function getMediaType(mimeType) {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf' || mimeType.startsWith('application/')) return 'document';
  return 'photo';
}

function getS3Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error('R2_NOT_CONFIGURED');
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function getSupabaseClient() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey || serviceKey === 'undefined') {
    throw new Error('SUPABASE_SERVICE_ROLE_NOT_CONFIGURED');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

function sanitizeId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
}

function getExtension(fileName, mimeType) {
  const match = String(fileName || '').match(/\.([a-zA-Z0-9]+)$/);
  if (match) return match[1].toLowerCase();
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'video/quicktime') return 'mov';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'bin';
}


export async function handleMedia(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const sendJson = (status, data) => {
    res.statusCode = status;
    res.end(JSON.stringify(data));
  };

  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return sendJson(503, { error: 'Backend de mídia não configurado com chave server-side.' });
    }

    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://localhost');
      const propertyId = sanitizeId(url.searchParams.get('propertyId'));
      if (!propertyId) return sendJson(400, { error: 'propertyId é obrigatório.' });

      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('property_media')
        .select('*')
        .eq('property_id', propertyId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return sendJson(200, { media: data || [] });
    }

    if (req.method === 'POST') {
      let raw = '';
      if (req.body && typeof req.body === 'object') {
        raw = req.body;
      } else {
        for await (const chunk of req) raw += chunk;
        raw = JSON.parse(raw || '{}');
      }

      const { action } = raw;

      if (action === 'get-upload-url') {
        const propertyId = sanitizeId(raw.propertyId);
        const fileName = String(raw.fileName || '').trim();
        const fileType = String(raw.fileType || '').toLowerCase().trim();
        const fileSize = Number(raw.fileSize) || 0;
        const mediaType = getMediaType(fileType);

        if (!propertyId) return sendJson(400, { error: 'ID do imóvel inválido.' });
        if (!ALLOWED_MIME_TYPES.has(fileType)) {
          return sendJson(400, { error: `Tipo de arquivo não permitido: ${fileType}` });
        }

        const maxSize = mediaType === 'video' ? MAX_VIDEO_SIZE : mediaType === 'document' ? MAX_DOC_SIZE : MAX_PHOTO_SIZE;
        if (fileSize > maxSize) {
          return sendJson(400, {
            error: `Arquivo excede o tamanho máximo permitido de ${Math.round(maxSize / (1024 * 1024))}MB.`,
          });
        }

        const ext = getExtension(fileName, fileType);
        const folder = mediaType === 'video' ? 'videos' : mediaType === 'document' ? 'documents' : 'photos';
        const uniqueName = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
        const objectKey = `properties/${propertyId}/${folder}/${uniqueName}`;

        const s3 = getS3Client();
        const bucket = process.env.R2_BUCKET_NAME || 'rm-imoveis-media';

        const command = new PutObjectCommand({
          Bucket: bucket,
          Key: objectKey,
          ContentType: fileType,
        });

        const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });
        const publicBase = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
        const publicUrl = `${publicBase}/${objectKey}`;

        return sendJson(200, {
          uploadUrl,
          objectKey,
          publicUrl,
          mediaType,
          mimeType: fileType,
        });
      }

      if (action === 'confirm-upload') {
        const propertyId = sanitizeId(raw.propertyId);
        const objectKey = String(raw.objectKey || '').trim();
        const mimeType = String(raw.mimeType || 'image/jpeg').toLowerCase().trim();
        const mediaType = raw.mediaType === 'video' ? 'video' : raw.mediaType === 'document' ? 'document' : getMediaType(mimeType);
        const sizeBytes = Number(raw.sizeBytes) || 0;
        const sortOrder = Number(raw.sortOrder) || 0;
        const isCover = Boolean(raw.isCover);
        const metadata = raw.metadata || {};

        if (!propertyId || !objectKey) {
          return sendJson(400, { error: 'Dados insuficientes para confirmação.' });
        }

        if (!ALLOWED_MIME_TYPES.has(mimeType)) {
          return sendJson(400, { error: 'MIME type não permitido.' });
        }

        const maxSize = mediaType === 'video' ? MAX_VIDEO_SIZE : mediaType === 'document' ? MAX_DOC_SIZE : MAX_PHOTO_SIZE;
        if (!Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > maxSize) {
          return sendJson(400, { error: 'Tamanho de mídia inválido.' });
        }

        // Validação estrita de formato e escopo de object key
        const keyPattern = new RegExp(`^properties/${propertyId}/(photos|videos|documents)/[0-9]+-[a-zA-Z0-9-]+\\.[a-zA-Z0-9]+$`);
        if (!keyPattern.test(objectKey)) {
          return sendJson(403, { error: 'Object key com formato inválido ou não pertence a este imóvel.' });
        }


        const supabase = getSupabaseClient();

        // Se for capa, desmarca outras fotos como capa
        if (isCover) {
          await supabase
            .from('property_media')
            .update({ is_cover: false })
            .eq('property_id', propertyId);
        }

        const newRecord = {
          id: randomUUID(),
          property_id: propertyId,
          object_key: objectKey,
          storage_provider: 'r2',
          media_type: mediaType,
          mime_type: mimeType,
          size_bytes: sizeBytes,
          sort_order: sortOrder,
          is_cover: isCover,
          storage_path: objectKey,
          metadata,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('property_media')
          .insert(newRecord)
          .select()
          .single();

        if (error) throw error;
        return sendJson(200, { media: data });
      }

      if (action === 'delete-media') {
        const propertyId = sanitizeId(raw.propertyId);
        const mediaId = String(raw.mediaId || '');
        const objectKey = String(raw.objectKey || '').trim();

        if (!propertyId || (!mediaId && !objectKey)) {
          return sendJson(400, { error: 'Identificadores insuficientes para exclusão.' });
        }

        // Validação de segurança: se objectKey informada, deve pertencer a properties/${propertyId}/
        if (objectKey && !objectKey.startsWith(`properties/${propertyId}/`)) {
          return sendJson(403, { error: 'Object key não pertence ao imóvel.' });
        }

        const supabase = getSupabaseClient();
        let targetKey = objectKey;

        // Se só recebemos mediaId, busca no banco para descobrir o objectKey
        if (!targetKey && mediaId) {
          const { data } = await supabase
            .from('property_media')
            .select('object_key')
            .eq('id', mediaId)
            .eq('property_id', propertyId)
            .maybeSingle();

          if (data?.object_key) {
            targetKey = data.object_key;
          }
        }

        // Remove do Cloudflare R2
        if (targetKey && targetKey.startsWith(`properties/${propertyId}/`)) {
          try {
            const s3 = getS3Client();
            const bucket = process.env.R2_BUCKET_NAME || 'rm-imoveis-media';
            await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: targetKey }));
          } catch (r2Err) {
            console.error('Erro ao deletar objeto no R2:', r2Err);
          }
        }

        // Remove do Supabase
        let deleteQuery = supabase.from('property_media').delete().eq('property_id', propertyId);
        if (mediaId) {
          deleteQuery = deleteQuery.eq('id', mediaId);
        } else if (targetKey) {
          deleteQuery = deleteQuery.eq('object_key', targetKey);
        }

        const { error } = await deleteQuery;
        if (error) throw error;

        return sendJson(200, { success: true });
      }

      if (action === 'reorder-media') {
        const propertyId = sanitizeId(raw.propertyId);
        const items = Array.isArray(raw.items) ? raw.items : [];

        if (!propertyId) return sendJson(400, { error: 'propertyId é obrigatório.' });

        const supabase = getSupabaseClient();
        for (const item of items) {
          if (item.id) {
            await supabase
              .from('property_media')
              .update({
                sort_order: Number(item.sortOrder) || 0,
                is_cover: Boolean(item.isCover),
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.id)
              .eq('property_id', propertyId);
          }
        }

        return sendJson(200, { success: true });
      }

      return sendJson(400, { error: 'Ação desconhecida.' });
    }

    return sendJson(405, { error: 'Método não permitido.' });
  } catch (err) {
    console.error('Erro no handler de mídia:', err);
    return sendJson(500, { error: err.message || 'Erro interno ao processar mídia.' });
  }
}

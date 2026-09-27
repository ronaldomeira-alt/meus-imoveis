import { createClient } from '@supabase/supabase-js';

const MAX_IMAGES = 20;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

export function parseInstagramPostUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com'].includes(url.hostname)) return null;
    const match = url.pathname.match(/^\/(?:[A-Za-z0-9_.]+\/)?(p|reel|tv)\/([A-Za-z0-9_-]{5,50})\/?$/);
    return match ? `https://www.instagram.com/${match[1]}/${match[2]}/` : null;
  } catch { return null; }
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && /(^|\.)(cdninstagram\.com|fbcdn\.net)$/.test(url.hostname) ? url.toString() : null;
  } catch { return null; }
}

export function normalizeInstagramPost(row, canonicalUrl, ownUsername = '') {
  const children = Array.isArray(row.childPosts) ? row.childPosts : row.children?.data || [];
  const candidates = children.length
    ? children.map((item) => item.displayUrl || item.media_url || item.thumbnail_url || item.images?.[0])
    : Array.isArray(row.images) && row.images.length
      ? row.images
      : [row.displayUrl || row.media_url || row.thumbnail_url];
  const images = [...new Set(candidates.map(safeImageUrl).filter(Boolean))].slice(0, MAX_IMAGES);
  const username = String(row.ownerUsername || row.username || '').replace(/^@/, '').trim();
  return {
    url: canonicalUrl,
    caption: String(row.caption || '').slice(0, 15000),
    username,
    ownerName: String(row.ownerFullName || row.owner?.full_name || username).slice(0, 150),
    isOwnPost: Boolean(username && ownUsername && username.toLowerCase() === ownUsername.toLowerCase()),
    images,
  };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const part of req) {
    raw += part;
    if (raw.length > 10000) throw new Error('Requisição muito grande.');
  }
  return JSON.parse(raw || '{}');
}

async function authenticate(req) {
  const bearer = String(req.headers?.authorization || '').match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) return null;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Serviço não configurado.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await db.auth.getUser(bearer);
  if (error || data?.user?.email?.toLowerCase() !== 'ronaldomeira@gmail.com') return null;
  return db;
}

async function getOwnPost(db, canonicalUrl) {
  const { data: account } = await db.from('marketing_instagram_accounts')
    .select('id,instagram_user_id,instagram_username').eq('status', 'connected')
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (!account) return { post: null, username: '' };
  const { data: stored } = await db.from('marketing_instagram_tokens')
    .select('access_token').eq('account_id', account.id).maybeSingle();
  if (!stored?.access_token) return { post: null, username: account.instagram_username };
  let after = '';
  const deadline = Date.now() + 7000;
  for (let page = 0; page < 10; page++) {
    const remaining = deadline - Date.now();
    if (remaining < 1000) break;
    const url = new URL(`https://graph.instagram.com/v24.0/${encodeURIComponent(account.instagram_user_id)}/media`);
    url.searchParams.set('fields', 'id,caption,media_url,thumbnail_url,media_type,permalink,username,children{id,media_url,thumbnail_url,media_type}');
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after', after);
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${stored.access_token}` }, signal: AbortSignal.timeout(Math.min(remaining, 6000)) });
      if (!response.ok) break;
      const body = await response.json();
      const post = body.data?.find((item) => parseInstagramPostUrl(item.permalink) === canonicalUrl);
      if (post) return { post, username: account.instagram_username };
      after = body.paging?.cursors?.after || '';
      if (!after || !body.paging?.next) break;
    } catch { break; }
  }
  return { post: null, username: account.instagram_username };
}

async function getPublicPost(canonicalUrl) {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) return null;
  const url = 'https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?maxItems=1&maxTotalChargeUsd=0.10&timeout=40';
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ directUrls: [canonicalUrl], resultsType: 'posts', resultsLimit: 1 }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Serviço de importação indisponível (HTTP ${response.status}).`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows.find((row) => parseInstagramPostUrl(row.url || row.inputUrl) === canonicalUrl) || null : null;
}

export async function handleInstagramImport(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const json = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido.' });
  try {
    const db = await authenticate(req);
    if (!db) return json(401, { error: 'Sessão inválida. Entre novamente para importar.' });
    const body = await readBody(req);
    if (body.action === 'image') {
      const imageUrl = safeImageUrl(body.url);
      if (!imageUrl) return json(400, { error: 'Endereço de imagem inválido.' });
      const response = await fetch(imageUrl, { redirect: 'error', signal: AbortSignal.timeout(15000) });
      const length = Number(response.headers.get('content-length') || 0);
      const type = response.headers.get('content-type')?.split(';')[0] || '';
      if (!response.ok || length > MAX_IMAGE_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
        return json(422, { error: 'Esta foto não pôde ser importada.' });
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_IMAGE_BYTES) return json(422, { error: 'Foto muito grande para importar.' });
      res.statusCode = 200;
      res.setHeader('Content-Type', type);
      return res.end(bytes);
    }
    if (body.action !== 'post') return json(400, { error: 'Ação inválida.' });
    const canonicalUrl = parseInstagramPostUrl(body.url);
    if (!canonicalUrl) return json(400, { error: 'Cole o link de uma publicação do Instagram.' });
    const own = await getOwnPost(db, canonicalUrl);
    const row = own.post || await getPublicPost(canonicalUrl);
    if (!row) return json(process.env.APIFY_API_TOKEN ? 404 : 503, {
      error: process.env.APIFY_API_TOKEN
        ? 'Não foi possível ler esta publicação. Confira se ela é pública e tente novamente.'
        : 'A importação de posts de parceiros ainda precisa da conexão com o serviço de leitura de publicações públicas.',
    });
    const post = normalizeInstagramPost(row, canonicalUrl, own.username);
    if (!post.caption && post.images.length === 0) return json(422, { error: 'A publicação não contém dados acessíveis para importar.' });
    return json(200, { post });
  } catch (error) {
    console.error('[instagram-import]', error);
    return json(502, { error: error instanceof Error ? error.message : 'Não foi possível importar a publicação.' });
  }
}

import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
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

if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const INVENTORY_TABLE = 'inventory_properties';
const TOMBSTONES_TABLE = 'inventory_property_tombstones';
const LEGACY_PAGES_TABLE = 'public_property_pages';

const R2_BASE = (
  process.env.VITE_R2_PUBLIC_URL ||
  process.env.R2_PUBLIC_URL ||
  'https://pub-e28ab031048d44b2aa8b1846c6e6fdc6.r2.dev'
).replace(/\/+$/, '');

function client() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('PUBLIC_PAGES_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function equalSecret(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

function safeText(value, max = 200) {
  return [...String(value || '').trim()]
    .filter((char) => (char === '<' || char === '>' ? false : char.charCodeAt(0) >= 32))
    .join('')
    .slice(0, max);
}

export function resolvePhotoUrl(path) {
  if (!path) return '';
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path;
  }
  if (path.startsWith('properties/') || path.startsWith('r2:')) {
    const key = path.replace(/^r2:/, '');
    return `${R2_BASE}/${key}`;
  }
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  if (supabaseUrl) {
    return `${supabaseUrl}/storage/v1/object/public/property-images/${path}`;
  }
  return path;
}

/**
 * Serializador com WHITELIST ESTRITA.
 * Garante que dados internos (proprietário, parceiro, comissão, anotações de negociação)
 * NUNCA saiam no JSON ou no HTML.
 */
export function buildPublicListing(prop) {
  if (!prop || typeof prop !== 'object') return null;

  const id = safeText(prop.id, 64);
  const type = safeText(prop.type, 40) || 'Imóvel';
  const neighborhood = safeText(prop.neighborhood, 80);
  const purpose = prop.purpose === 'Locação' ? 'Locação' : 'Venda';
  const condominiumName = safeText(prop.condominium_name, 100);

  const bedrooms = Math.max(0, Math.min(30, Number(prop.bedrooms) || 0));
  const suites = Math.max(0, Math.min(30, Number(prop.suites) || 0));
  const bathrooms = Math.max(0, Math.min(30, Number(prop.bathrooms) || 0));
  const parkingSpaces = Math.max(0, Math.min(30, Number(prop.parking_spaces) || 0));
  const parkingSpacesType = prop.parking_spaces_type === 'Rotativas' ? 'Rotativas' : undefined;
  const areaM2 = Math.max(0, Math.min(100000, Number(prop.area_m2) || 0));
  const price = Math.max(0, Math.min(1_000_000_000, Number(prop.price) || 0));
  const condoFee = prop.condo_fee != null && Number(prop.condo_fee) > 0 ? Number(prop.condo_fee) : null;
  const iptu = prop.iptu != null && Number(prop.iptu) > 0 ? Number(prop.iptu) : null;

  const floor = prop.floor != null && !isNaN(Number(prop.floor)) ? Number(prop.floor) : null;
  const position = prop.position && prop.position !== 'Não informado' && prop.position !== 'Outro' ? safeText(prop.position, 30) : null;
  const condition = prop.condition && prop.condition !== 'Outro' ? safeText(prop.condition, 30) : null;
  const furnished = typeof prop.furnished === 'boolean' ? prop.furnished : null;

  const areaRange =
    prop.area_range && typeof prop.area_range === 'object'
      ? { min: Number(prop.area_range.min) || 0, max: Number(prop.area_range.max) || 0 }
      : null;

  const apartmentFeatures = (Array.isArray(prop.apartment_features) ? prop.apartment_features : [])
    .map((item) => safeText(item, 64))
    .filter(Boolean);

  const buildingFeatures = (Array.isArray(prop.building_features) ? prop.building_features : [])
    .map((item) => safeText(item, 64))
    .filter(Boolean);

  const features = [...new Set([...apartmentFeatures, ...buildingFeatures])].slice(0, 30);

  // Sanitização de descrição: usamos apenas texto comercial descritivo
  let rawDescription = typeof prop.notes === 'string' ? prop.notes.trim() : '';
  // Remove menções acidentais a parceiro ou proprietário se houver
  rawDescription = rawDescription
    .replace(/(?:propriet[áa]rio|contato|fone|tel|whatsapp|comiss[ãa]o)[\s:=]+[^\n.]+/gi, '')
    .trim();

  const generatedDescription = [
    `${type} com ${areaM2 ? `${areaM2} m²` : 'ótima metragem'}`,
    neighborhood ? `localizado em ${neighborhood}` : '',
    bedrooms ? `${bedrooms} quarto${bedrooms === 1 ? '' : 's'}` : '',
    suites ? `sendo ${suites} suíte${suites === 1 ? '' : 's'}` : '',
    parkingSpacesType ? 'vagas rotativas' : parkingSpaces ? `${parkingSpaces} vaga${parkingSpaces === 1 ? '' : 's'}` : '',
    features.length ? `Diferenciais: ${features.slice(0, 6).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(', ');

  const description = rawDescription || generatedDescription;
  const title = `${type}${neighborhood ? ` em ${neighborhood}` : ''}`;

  // Fotos reais ordenadas com cover primeiro
  const photosList = Array.isArray(prop.photos) ? prop.photos : [];
  const sortedPhotos = photosList
    .slice()
    .sort((a, b) => Number(Boolean(b.is_cover)) - Number(Boolean(a.is_cover)) || (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((p) => resolvePhotoUrl(p.storage_path || p.object_key || ''))
    .filter(Boolean);

  return {
    id,
    title,
    purpose,
    type,
    neighborhood,
    city: 'João Pessoa - PB',
    condominiumName: condominiumName || undefined,
    price,
    condoFee,
    iptu,
    bedrooms,
    suites,
    bathrooms,
    parkingSpaces,
    parkingSpacesType,
    areaM2,
    areaRange,
    floor,
    position,
    condition,
    furnished,
    features,
    apartmentFeatures,
    buildingFeatures,
    description,
    photos: sortedPhotos,
    brand: 'RM Imóveis',
    agentName: 'Ronaldo Meira',
    agentRole: 'Corretor de Imóveis',
  };
}

/**
 * Algoritmo determinístico de recomendação de imóveis similares.
 * Pontuação:
 * 1. Mesma operação (Venda/Locação): +50 pts
 * 2. Mesmo bairro: +40 pts
 * 3. Mesma tipologia: +30 pts
 * 4. Faixa de preço (até 15%: +35 pts, até 30%: +20 pts, até 50%: +10 pts)
 * 5. Proximidade de quartos (exato: +15 pts, +/- 1: +8 pts)
 * 6. Proximidade de metragem (até 20%: +15 pts, até 40%: +8 pts)
 * 7. Diferenciais compartilhados: +1 pt por feature (máx 10)
 */
export function rankRelatedProperties(candidates, targetId, targetListing) {
  const valid = candidates.filter((item) => item.id !== targetId && item.listing && item.listing.price > 0);

  if (!targetListing) {
    // Se o imóvel alvo não está disponível, retorna os primeiros disponíveis ordenados por preço
    return valid.slice(0, 6);
  }

  const targetNeighborhood = (targetListing.neighborhood || '').toLowerCase();
  const targetType = (targetListing.type || '').toLowerCase();
  const targetFeatures = new Set((targetListing.features || []).map((f) => f.toLowerCase()));

  const scored = valid.map((cand) => {
    const it = cand.listing;
    let score = 0;

    // 1. Finalidade (Venda / Locação)
    if (it.purpose === targetListing.purpose) score += 50;

    // 2. Bairro
    if (it.neighborhood && it.neighborhood.toLowerCase() === targetNeighborhood) {
      score += 40;
    }

    // 3. Tipologia
    if (it.type && it.type.toLowerCase() === targetType) {
      score += 30;
    }

    // 4. Preço
    if (targetListing.price > 0 && it.price > 0) {
      const diffRatio = Math.abs(it.price - targetListing.price) / targetListing.price;
      if (diffRatio <= 0.15) score += 35;
      else if (diffRatio <= 0.3) score += 20;
      else if (diffRatio <= 0.5) score += 10;
    }

    // 5. Quartos
    const diffBeds = Math.abs((it.bedrooms || 0) - (targetListing.bedrooms || 0));
    if (diffBeds === 0) score += 15;
    else if (diffBeds === 1) score += 8;

    // 6. Metragem
    if (targetListing.areaM2 > 0 && it.areaM2 > 0) {
      const diffArea = Math.abs(it.areaM2 - targetListing.areaM2) / targetListing.areaM2;
      if (diffArea <= 0.2) score += 15;
      else if (diffArea <= 0.4) score += 8;
    }

    // 7. Diferenciais
    if (Array.isArray(it.features)) {
      let featureHits = 0;
      for (const f of it.features) {
        if (targetFeatures.has(f.toLowerCase())) {
          featureHits += 1;
          if (featureHits >= 10) break;
        }
      }
      score += featureHits;
    }

    return { cand, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 6).map((s) => s.cand);
}

/**
 * Busca o registro público do imóvel com whitelist e recomendações.
 */
export async function getPublicRecord(id) {
  const db = client();
  const cleanId = String(id || '').trim();

  // 1. Busca todos os ativos do estoque para recomendações e fallback
  const [{ data: invRows, error: invError }, { data: tombstones }] = await Promise.all([
    db.from(INVENTORY_TABLE).select('property_id, property_data, updated_at'),
    db.from(TOMBSTONES_TABLE).select('property_id'),
  ]);

  if (invError) throw invError;

  const deletedSet = new Set((tombstones || []).map((t) => t.property_id));

  // Constrói lista sanitizada de todos os imóveis publicáveis
  const activeCandidates = [];
  let foundRaw = null;

  for (const row of invRows || []) {
    const raw = row.property_data;
    if (!raw) continue;
    const propId = row.property_id || raw.id;

    // Se é o imóvel procurado
    if (propId === cleanId || raw.id === cleanId) {
      foundRaw = raw;
    }

    // Se é publicável (ativo e não deletado)
    if (raw.status === 'Ativo' && !deletedSet.has(propId)) {
      const sanitized = buildPublicListing(raw);
      if (sanitized && sanitized.price > 0) {
        activeCandidates.push({ id: propId, listing: sanitized });
      }
    }
  }

  // 2. Se não encontrou no inventory_properties, verifica tabela legada public_property_pages
  if (!foundRaw && /^[0-9a-f-]{36}$/i.test(cleanId)) {
    try {
      const { data: legacy } = await db.from(LEGACY_PAGES_TABLE).select('property_id, is_active, payload').eq('id', cleanId).maybeSingle();
      if (legacy?.is_active && legacy.payload) {
        return {
          id: cleanId,
          active: true,
          listing: legacy.payload,
          related: rankRelatedProperties(activeCandidates, cleanId, legacy.payload),
        };
      }
    } catch {}
  }

  // 3. Determina se o imóvel está ativo e publicável
  const isDeleted = deletedSet.has(cleanId);
  const isActive = Boolean(foundRaw && foundRaw.status === 'Ativo' && !isDeleted);
  const listing = isActive ? buildPublicListing(foundRaw) : null;

  // 4. Calcula similares
  const related = rankRelatedProperties(activeCandidates, cleanId, listing);

  return {
    id: cleanId,
    active: isActive,
    listing,
    related,
  };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || '{}');
}

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value || '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
}

const money = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value || 0);

/**
 * Handler da API JSON /api/public-pages
 */
export async function handlePublicPages(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const id = String(new URL(req.url, 'http://local').searchParams.get('id') || '').trim();
      if (!id || id.length > 80) return json(res, 400, { error: 'Identificador inválido.' });
      return json(res, 200, await getPublicRecord(id));
    }
    return json(res, 405, { error: 'Método não permitido.' });
  } catch (error) {
    const configError = error?.message === 'PUBLIC_PAGES_NOT_CONFIGURED';
    return json(res, configError ? 503 : 500, {
      error: configError ? 'Serviço de publicação não configurado no servidor.' : 'Não foi possível carregar o imóvel.',
    });
  }
}

/**
 * Handler do endpoint de imagem Open Graph 1200x630 (proporção 1.91:1)
 * Enquadramento cover centralizado sem distorção para WhatsApp e redes sociais.
 */
export async function handlePublicOgImage(req, res) {
  try {
    const urlObj = new URL(req.url, 'http://local');
    let id = urlObj.searchParams.get('id') || '';
    const token = urlObj.searchParams.get('token') || '';

    if (!id) {
      const match = urlObj.pathname.match(/\/imovel\/([^/]+)\/og\.jpg/i);
      if (match) id = decodeURIComponent(match[1]);
    }

    if (token && !id) {
      try {
        const db = client();
        const { data: share } = await db
          .from('property_shares')
          .select('property_id')
          .eq('tracking_token', token)
          .maybeSingle();
        if (share?.property_id) {
          id = share.property_id;
        }
      } catch {}
    }

    const record = id ? await getPublicRecord(id).catch(() => null) : null;
    const item = record?.listing;
    const photoUrl = item?.photos?.[0] || '';

    const { createCanvas, loadImage } = await import('@napi-rs/canvas');
    const width = 1200;
    const height = 630;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    if (photoUrl) {
      try {
        const fetchRes = await fetch(photoUrl, { signal: AbortSignal.timeout(6000) });
        if (fetchRes.ok) {
          const imgBuf = Buffer.from(await fetchRes.arrayBuffer());
          const img = await loadImage(imgBuf);

          // Enquadramento object-fit: cover, object-position: center
          const scale = Math.max(width / img.width, height / img.height);
          const sw = width / scale;
          const sh = height / scale;
          const sx = (img.width - sw) / 2;
          const sy = (img.height - sh) / 2;

          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);

          const jpegBuf = canvas.toBuffer('image/jpeg', { quality: 86 });
          res.statusCode = 200;
          res.setHeader('Content-Type', 'image/jpeg');
          res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
          res.setHeader('Content-Length', jpegBuf.length);
          return res.end(jpegBuf);
        }
      } catch (imgErr) {
        console.error('[handlePublicOgImage] Erro ao carregar foto do imóvel:', imgErr);
      }
    }

    // Fallback: Card elegante com identidade visual do catálogo
    const grad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, 700);
    grad.addColorStop(0, '#151a26');
    grad.addColorStop(1, '#090b10');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#1e2430';
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, width - 48, height - 48);

    ctx.fillStyle = '#3b82f6';
    ctx.fillRect(80, 80, 80, 80);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RM', 120, 120);

    ctx.textAlign = 'left';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillStyle = '#f3f5f9';
    ctx.fillText('RM Imóveis', 180, 125);

    const titleText = item?.title || 'Imóvel Exclusivo';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(titleText.slice(0, 42), 80, 260);

    const locText = item?.neighborhood ? `📍 ${item.neighborhood}, João Pessoa - PB` : 'João Pessoa - PB';
    ctx.font = '28px sans-serif';
    ctx.fillStyle = '#9ba5b7';
    ctx.fillText(locText, 80, 320);

    if (item?.price) {
      ctx.font = 'bold 60px sans-serif';
      ctx.fillStyle = '#10b981';
      ctx.fillText(money(item.price), 80, 430);
    }

    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('ronaldomeira.com.br · Ronaldo Meira Corretor de Imóveis', 80, 540);

    const fallbackBuf = canvas.toBuffer('image/jpeg', { quality: 86 });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400');
    res.setHeader('Content-Length', fallbackBuf.length);
    return res.end(fallbackBuf);
  } catch (err) {
    console.error('[handlePublicOgImage] Erro crítico:', err);
    res.statusCode = 302;
    res.setHeader('Location', 'https://ronaldomeira.com.br/apple-touch-icon.png');
    return res.end();
  }
}

/**
 * Card HTML de recomendação similar com navegação contínua
 */
function renderRelatedCard(row, token) {
  const item = row.listing;
  if (!item) return '';
  const photo = item.photos?.[0] || '';
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
  const photoHtml = photo
    ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(item.title)}" loading="lazy">`
    : `<div class="related-placeholder"><span>Foto sob consulta</span></div>`;

  return `
    <a class="related-card" href="/imovel/${encodeURIComponent(row.id)}${tokenQuery}">
      <div class="related-media">${photoHtml}</div>
      <div class="related-copy">
        <span class="related-badge">${escapeHtml(item.type)} · ${escapeHtml(item.purpose)}</span>
        <h3 class="related-title">${escapeHtml(item.title)}</h3>
        <p class="related-specs">
          ${item.bedrooms ? `${item.bedrooms} qtos · ` : ''}${item.areaM2 ? `${item.areaM2} m²` : ''}
        </p>
        <div class="related-price">${money(item.price)}</div>
      </div>
    </a>
  `;
}

/**
 * Handler SSR / Edge HTML para rotas públicas /imovel/:id e /imoveis/p/:token
 */
export async function handlePublicPageHtml(req, res) {
  try {
    const urlObj = new URL(req.url, 'http://local');
    let id = urlObj.searchParams.get('id') || '';
    const token = urlObj.searchParams.get('token') || '';

    // Se acesso com tracking token individual (Match), resolve o property_id
    if (token && !id) {
      try {
        const db = client();
        const { data: share } = await db
          .from('property_shares')
          .select('property_id')
          .eq('tracking_token', token)
          .maybeSingle();
        if (share?.property_id) {
          id = share.property_id;
        }
      } catch {}
    }

    const record = await getPublicRecord(id);
    const item = record.listing;

    // Emissão de evento de tracking se houver token WACRM
    if (token) {
      try {
        const wacrmUrl = process.env.VITE_WACRM_URL || process.env.WACRM_URL || 'http://localhost:3000';
        const nowIso = new Date().toISOString();
        const isOriginal = !id || (record?.listing && id === record.listing.id);
        const eventName = isOriginal ? 'public_link.opened' : 'public_related_property.opened';

        fetch(`${wacrmUrl}/api/tunnel/v1/events/tracking`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_name: eventName,
            tracking_token: token,
            property_id: id || undefined,
            related_property_id: isOriginal ? undefined : id,
            timestamp: nowIso,
          }),
        }).catch(() => {});
      } catch {}
    }

    // Configuração de contato do corretor
    const phone = String(process.env.PUBLIC_CONTACT_WHATSAPP || process.env.VITE_PUBLIC_CONTACT_WHATSAPP || '').replace(/\D/g, '');
    const origin = req.headers.host
      ? `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`
      : 'https://ronaldomeira.com.br';
    const canonical = `${origin}/imovel/${encodeURIComponent(id)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;

    // Metadata e SEO
    const title = item
      ? `${item.type} em ${item.neighborhood} · ${item.brand}`
      : 'Imóvel não disponível · RM Imóveis';
    const summary = item
      ? `${item.type} para ${item.purpose.toLowerCase()} em ${item.neighborhood}, João Pessoa. ${item.bedrooms ? `${item.bedrooms} quartos · ` : ''}${item.areaM2 ? `${item.areaM2} m² · ` : ''}${money(item.price)}.`
      : 'Este imóvel não está mais disponível no catálogo. Conheça outras opções selecionadas em João Pessoa.';
    const cover = item?.photos?.[0] || '';
    const ogImageUrl = id ? `${origin}/imovel/${encodeURIComponent(id)}/og.jpg` : `${origin}/apple-touch-icon.png`;

    // WhatsApp CTA link
    const waText = item
      ? `Olá Ronaldo! Gostaria de mais informações sobre o imóvel: ${item.type} em ${item.neighborhood} (${money(item.price)}) - ref: ${id}\n${canonical}`
      : `Olá Ronaldo! Acessei um imóvel que não está mais disponível (${id}) e gostaria de ver outras opções de imóveis no seu catálogo.`;

    const waLink = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(waText)}`
      : `https://wa.me/?text=${encodeURIComponent(waText)}`;

    // Recomendações HTML
    const relatedCardsHtml = record.related.map((r) => renderRelatedCard(r, token)).join('');
    const relatedSectionHtml = relatedCardsHtml
      ? `
        <section class="related-section">
          <div class="section-header">
            <h2 class="section-title">Outros imóveis que podem fazer sentido para você</h2>
            <p class="section-subtitle">Opções selecionadas com perfil semelhante no catálogo</p>
          </div>
          <div class="related-grid">${relatedCardsHtml}</div>
        </section>
      `
      : '';

    // Conteúdo Principal
    let mainContentHtml = '';

    if (item) {
      // Galeria de fotos
      const photos = item.photos || [];
      const hasPhotos = photos.length > 0;
      const coverPhoto = hasPhotos ? photos[0] : '';

      const galleryThumbnails = hasPhotos
        ? photos
            .map(
              (p, idx) => `
            <button type="button" class="thumb-btn ${idx === 0 ? 'active' : ''}" onclick="selectPhoto(${idx})" aria-label="Ver foto ${idx + 1}">
              <img src="${escapeHtml(p)}" alt="${escapeHtml(item.title)} - miniatura ${idx + 1}" loading="lazy">
            </button>
          `
            )
            .join('')
        : '';

      const photoViewerModalHtml = hasPhotos
        ? `
          <div id="lightbox" class="lightbox" onclick="closeLightbox(event)">
            <button class="lightbox-close" onclick="closeLightbox(event)" aria-label="Fechar galeria">✕</button>
            <button class="lightbox-prev" onclick="prevPhoto(event)" aria-label="Foto anterior">‹</button>
            <div class="lightbox-content">
              <img id="lightbox-img" src="${escapeHtml(coverPhoto)}" alt="${escapeHtml(item.title)}">
              <div id="lightbox-counter" class="lightbox-counter">1 / ${photos.length}</div>
            </div>
            <button class="lightbox-next" onclick="nextPhoto(event)" aria-label="Próxima foto">›</button>
          </div>
        `
        : '';

      // Especificações
      const specItems = [
        item.bedrooms ? `<div class="spec-item"><span class="spec-label">Quartos</span><strong class="spec-val">${item.bedrooms} ${item.suites ? `(${item.suites} suíte${item.suites > 1 ? 's' : ''})` : ''}</strong></div>` : '',
        item.areaM2 ? `<div class="spec-item"><span class="spec-label">Área Privativa</span><strong class="spec-val">${item.areaM2} m²</strong></div>` : '',
        item.parkingSpacesType ? `<div class="spec-item"><span class="spec-label">Vagas</span><strong class="spec-val">Rotativas</strong></div>` : item.parkingSpaces ? `<div class="spec-item"><span class="spec-label">Vagas</span><strong class="spec-val">${item.parkingSpaces}</strong></div>` : '',
        item.bathrooms ? `<div class="spec-item"><span class="spec-label">Banheiros</span><strong class="spec-val">${item.bathrooms}</strong></div>` : '',
        item.position ? `<div class="spec-item"><span class="spec-label">Posição</span><strong class="spec-val">${escapeHtml(item.position)}</strong></div>` : '',
        item.floor != null ? `<div class="spec-item"><span class="spec-label">Andar</span><strong class="spec-val">${item.floor}º</strong></div>` : '',
        item.condition ? `<div class="spec-item"><span class="spec-label">Condição</span><strong class="spec-val">${escapeHtml(item.condition)}</strong></div>` : '',
      ]
        .filter(Boolean)
        .join('');

      // Diferenciais
      const featuresBadges = item.features.length
        ? `<div class="features-list">${item.features.map((f) => `<span class="feature-pill">${escapeHtml(f)}</span>`).join('')}</div>`
        : '';

      mainContentHtml = `
        <div class="property-layout">
          <!-- Coluna 1: Galeria -->
          <div class="gallery-col">
            <div class="main-photo-wrap" onclick="openLightbox(currentPhotoIndex)">
              ${
                hasPhotos
                  ? `<img id="main-photo" src="${escapeHtml(coverPhoto)}" alt="${escapeHtml(item.title)}">
                     <span class="photo-badge" id="photo-counter-badge">1 / ${photos.length} fotos · Ampliar ⤢</span>`
                  : `<div class="no-photo"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><span>Fotografia sob consulta</span></div>`
              }
            </div>

            ${hasPhotos && photos.length > 1 ? `<div class="thumbs-strip">${galleryThumbnails}</div>` : ''}
          </div>

          <!-- Coluna 2: Informações e CTA -->
          <div class="info-col">
            <div class="property-eyebrow">
              <span class="badge-purpose">${escapeHtml(item.purpose)}</span>
              <span class="badge-type">${escapeHtml(item.type)}</span>
              ${item.condominiumName ? `<span class="badge-condo">${escapeHtml(item.condominiumName)}</span>` : ''}
            </div>

            <h1 class="property-title">${escapeHtml(item.title)}</h1>
            <p class="property-location">📍 ${escapeHtml(item.neighborhood)}, ${escapeHtml(item.city)}</p>

            <div class="price-box">
              <div class="main-price">${money(item.price)}</div>
              <div class="fees-row">
                ${item.condoFee ? `<span class="fee-item">Condomínio: <b>${money(item.condoFee)}/mês</b></span>` : ''}
                ${item.iptu ? `<span class="fee-item">IPTU: <b>${money(item.iptu)}/ano</b></span>` : ''}
              </div>
            </div>

            <!-- Botão de Ação CTA -->
            <div class="cta-wrap">
              <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-cta-whatsapp">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.27-2.42 5.82a8.19 8.19 0 0 1-5.82 2.42c-1.47 0-2.91-.39-4.17-1.14l-.3-.18-3.1.81.83-3.02-.2-.31a8.19 8.19 0 0 1-1.26-4.4c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.64c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.25-1.5-1.4-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.38-.44.13-.15.17-.25.25-.42.08-.17.04-.32-.02-.45-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.59.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.3z"/></svg>
                <span>Tenho interesse neste imóvel</span>
              </a>
            </div>

            <!-- Métricas e Ficha Técnica -->
            <div class="specs-grid">${specItems}</div>

            <!-- Descrição Comercial -->
            ${
              item.description
                ? `
              <div class="description-box">
                <h2 class="subheading">Sobre o Imóvel</h2>
                <p class="description-text">${escapeHtml(item.description)}</p>
              </div>
            `
                : ''
            }

            <!-- Diferenciais -->
            ${
              featuresBadges
                ? `
              <div class="features-box">
                <h2 class="subheading">Diferenciais e Infraestrutura</h2>
                ${featuresBadges}
              </div>
            `
                : ''
            }

            <!-- Corretor Responsável -->
            <div class="broker-card">
              <div class="broker-avatar">RM</div>
              <div class="broker-info">
                <strong class="broker-name">${escapeHtml(item.agentName)}</strong>
                <span class="broker-role">${escapeHtml(item.agentRole)} · ${escapeHtml(item.brand)}</span>
              </div>
            </div>
          </div>
        </div>
        ${photoViewerModalHtml}
      `;
    } else {
      // Estado Elegante para Imóvel Indisponível
      mainContentHtml = `
        <div class="unavailable-card">
          <div class="unavailable-badge">RM IMÓVEIS</div>
          <h1 class="unavailable-title">Este imóvel não está mais disponível</h1>
          <p class="unavailable-desc">
            Ele pode ter sido vendido, alugado ou atualizado em nosso estoque.
            Confira abaixo outras oportunidades selecionadas com perfil semelhante ou entre em contato.
          </p>
          <div class="unavailable-cta">
            <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn-cta-whatsapp">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2z"/></svg>
              <span>Consultar outras opções com Ronaldo Meira</span>
            </a>
          </div>
        </div>
      `;
    }

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(summary)}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  
  <!-- Open Graph / WhatsApp Preview (Proporção 1200x630 1.91:1) -->
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="RM Imóveis">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(summary)}">
  <meta property="og:url" content="${escapeHtml(canonical)}">
  <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
  <meta property="og:image:secure_url" content="${escapeHtml(ogImageUrl)}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escapeHtml(title)}">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(summary)}">
  <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">

  <style>
    :root {
      --bg: #090b10;
      --card-bg: #11141c;
      --card-border: #1e2430;
      --text-main: #f3f5f9;
      --text-muted: #9ba5b7;
      --accent: #3b82f6;
      --accent-hover: #2563eb;
      --accent-soft: rgba(59, 130, 246, 0.12);
      --green: #10b981;
      --green-hover: #059669;
    }
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html {
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
      width: 100%;
      overflow-x: hidden;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: radial-gradient(circle at 50% 0%, #151a26 0%, #090b10 55%);
      color: var(--text-main);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
      padding-bottom: max(32px, env(safe-area-inset-bottom));
      width: 100%;
      max-width: 100vw;
      overflow-x: hidden;
    }
    a { color: inherit; text-decoration: none; }

    .container {
      width: 100%;
      max-width: 1180px;
      margin: 0 auto;
      padding-left: max(16px, env(safe-area-inset-left));
      padding-right: max(16px, env(safe-area-inset-right));
      padding-top: max(16px, env(safe-area-inset-top));
      min-width: 0;
    }
    .top-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 16px 0 24px;
      border-bottom: 1px solid var(--card-border);
      margin-bottom: 24px;
      min-width: 0;
    }
    .brand-logo {
      display: flex;
      align-items: center;
      gap: 10px;
      font-weight: 800;
      font-size: 18px;
      letter-spacing: -0.02em;
      min-width: 0;
    }
    .brand-logo-mark {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: var(--accent);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 900;
      flex-shrink: 0;
    }

    .property-layout {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.95fr);
      gap: 36px;
      align-items: start;
      width: 100%;
      min-width: 0;
    }

    /* Galeria Principal */
    .gallery-col {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
      width: 100%;
      max-width: 100%;
    }
    .main-photo-wrap {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 10;
      border-radius: 18px;
      overflow: hidden;
      background: #131720;
      cursor: pointer;
      border: 1px solid var(--card-border);
      transition: border-color 0.2s;
    }
    .main-photo-wrap:hover { border-color: var(--accent); }
    .main-photo-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      transition: transform 0.4s ease;
    }
    .main-photo-wrap:hover img { transform: scale(1.02); }
    .photo-badge {
      position: absolute;
      bottom: 14px;
      right: 14px;
      background: rgba(0,0,0,0.75);
      backdrop-filter: blur(8px);
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid rgba(255,255,255,0.2);
      pointer-events: none;
    }
    .no-photo {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: var(--text-muted);
      font-size: 13px;
    }

    /* Thumbnails com rolagem horizontal interna */
    .thumbs-strip {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      overflow-y: hidden;
      -webkit-overflow-scrolling: touch;
      scroll-behavior: smooth;
      width: 100%;
      max-width: 100%;
      min-width: 0;
      padding-bottom: 6px;
      scrollbar-width: none;
      -ms-overflow-style: none;
    }
    .thumbs-strip::-webkit-scrollbar {
      display: none;
    }
    .thumb-btn {
      width: 76px;
      height: 56px;
      border-radius: 10px;
      overflow: hidden;
      background: #131720;
      border: 2px solid transparent;
      cursor: pointer;
      flex: 0 0 76px;
      padding: 0;
      transition: border-color 0.15s, opacity 0.15s;
      opacity: 0.65;
    }
    .thumb-btn.active, .thumb-btn:hover { border-color: var(--accent); opacity: 1; }
    .thumb-btn img { width: 100%; height: 100%; object-fit: cover; display: block; }

    /* Lightbox */
    .lightbox {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(5,7,11,0.95);
      z-index: 1000;
      justify-content: center;
      align-items: center;
    }
    .lightbox.active { display: flex; }
    .lightbox-content {
      position: relative;
      max-width: 90vw;
      max-height: 85vh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .lightbox-content img {
      max-width: 90vw;
      max-height: 80vh;
      object-fit: contain;
      border-radius: 12px;
    }
    .lightbox-counter {
      color: var(--text-muted);
      font-size: 13px;
      margin-top: 10px;
      font-weight: 600;
    }
    .lightbox-close, .lightbox-prev, .lightbox-next {
      position: absolute;
      background: rgba(255,255,255,0.12);
      color: #fff;
      border: none;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      font-size: 24px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }
    .lightbox-close:hover, .lightbox-prev:hover, .lightbox-next:hover { background: rgba(255,255,255,0.25); }
    .lightbox-close { top: 20px; right: 20px; font-size: 20px; }
    .lightbox-prev { left: 20px; }
    .lightbox-next { right: 20px; }

    /* Detalhes */
    .info-col {
      display: flex;
      flex-direction: column;
      gap: 18px;
      min-width: 0;
      width: 100%;
    }
    .property-eyebrow { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .badge-purpose, .badge-type, .badge-condo {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 4px 9px;
      border-radius: 6px;
    }
    .badge-purpose { background: var(--accent-soft); color: var(--accent); border: 1px solid rgba(59,130,246,0.3); }
    .badge-type { background: rgba(255,255,255,0.06); color: var(--text-muted); border: 1px solid var(--card-border); }
    .badge-condo { background: rgba(16,185,129,0.1); color: #34d399; border: 1px solid rgba(16,185,129,0.25); }

    .property-title { font-size: clamp(24px, 3.5vw, 34px); font-weight: 800; line-height: 1.15; letter-spacing: -0.03em; word-break: break-word; }
    .property-location { color: var(--text-muted); font-size: 14px; margin-top: -6px; word-break: break-word; }

    .price-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 18px 20px;
      width: 100%;
      min-width: 0;
    }
    .main-price { font-size: 32px; font-weight: 850; letter-spacing: -0.03em; color: #fff; }
    .fees-row { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 6px; font-size: 12px; color: var(--text-muted); }
    .fee-item b { color: var(--text-main); }

    .cta-wrap { margin-top: 4px; width: 100%; min-width: 0; }
    .btn-cta-whatsapp {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      background: var(--green);
      color: #fff;
      font-weight: 700;
      font-size: 16px;
      padding: 16px 24px;
      border-radius: 14px;
      box-shadow: 0 8px 24px rgba(16, 185, 129, 0.28);
      transition: background 0.18s, transform 0.18s;
      min-height: 52px;
      text-align: center;
      width: 100%;
      word-break: break-word;
    }
    .btn-cta-whatsapp:hover { background: var(--green-hover); transform: translateY(-1px); }

    .specs-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
      width: 100%;
      min-width: 0;
    }
    @media (min-width: 480px) and (max-width: 820px) {
      .specs-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
      }
    }
    @media (min-width: 821px) {
      .specs-grid {
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
      }
    }
    .spec-item {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      overflow: hidden;
    }
    .spec-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--text-muted);
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .spec-val {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-main);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .subheading { font-size: 16px; font-weight: 700; margin-bottom: 10px; letter-spacing: -0.01em; }
    .description-box, .features-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      padding: 18px 20px;
      width: 100%;
      min-width: 0;
    }
    .description-text { font-size: 14px; line-height: 1.65; color: #cbd5e1; white-space: pre-line; word-break: break-word; }

    .features-list { display: flex; flex-wrap: wrap; gap: 8px; }
    .feature-pill {
      background: rgba(255,255,255,0.04);
      border: 1px solid var(--card-border);
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12.5px;
      color: #e2e8f0;
      word-break: break-word;
    }

    .broker-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 18px;
      background: rgba(255,255,255,0.02);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      width: 100%;
      min-width: 0;
    }
    .broker-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--accent);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 14px;
      flex-shrink: 0;
    }
    .broker-info { display: flex; flex-direction: column; min-width: 0; }
    .broker-name { font-size: 14px; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .broker-role { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* Seção de Recomendações */
    .related-section {
      margin-top: 56px;
      width: 100%;
      min-width: 0;
    }
    .section-header { margin-bottom: 20px; }
    .section-title { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; word-break: break-word; }
    .section-subtitle { font-size: 13px; color: var(--text-muted); margin-top: 4px; word-break: break-word; }

    /* Desktop (default): Grid limpo de 3 colunas */
    .related-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 18px;
      width: 100%;
      min-width: 0;
    }
    .related-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      transition: transform 0.2s, border-color 0.2s;
      min-width: 0;
    }
    .related-card:hover { transform: translateY(-3px); border-color: var(--accent); }
    .related-media {
      aspect-ratio: 16 / 10;
      background: #141822;
      overflow: hidden;
      width: 100%;
    }
    .related-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .related-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      font-size: 12px;
    }
    .related-copy { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
    .related-badge { font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .related-title { font-size: 14px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .related-specs { font-size: 12px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .related-price { font-size: 15px; font-weight: 800; color: #fff; margin-top: 4px; }

    /* Breakpoints Responsivos */
    @media (max-width: 820px) {
      .property-layout {
        grid-template-columns: 1fr;
        gap: 24px;
      }
    }
    @media (min-width: 641px) and (max-width: 820px) {
      .related-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }
    }

    /* Mobile: Carrossel Horizontal e Escala Ideal (<= 640px) */
    @media (max-width: 640px) {
      .container {
        padding-left: max(14px, env(safe-area-inset-left));
        padding-right: max(14px, env(safe-area-inset-right));
      }
      .main-price { font-size: 28px; }
      .btn-cta-whatsapp { font-size: 15px; padding: 14px 18px; }

      /* Carrossel de Imóveis Relacionados com indicação de continuidade */
      .related-grid {
        display: flex;
        overflow-x: auto;
        overflow-y: hidden;
        scroll-snap-type: x mandatory;
        -webkit-overflow-scrolling: touch;
        gap: 14px;
        padding-bottom: 14px;
        scrollbar-width: none;
        -ms-overflow-style: none;
        width: 100%;
        max-width: 100%;
        min-width: 0;
      }
      .related-grid::-webkit-scrollbar {
        display: none;
      }
      .related-card {
        flex: 0 0 82%;
        max-width: 84%;
        min-width: 250px;
        scroll-snap-align: start;
        scroll-snap-stop: normal;
      }
      .related-title {
        font-size: 14.5px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="top-header">
      <div class="brand-logo">
        <div class="brand-logo-mark">RM</div>
        <span>RM Imóveis</span>
      </div>
      <a href="https://wa.me/${phone}" target="_blank" rel="noopener noreferrer" style="font-size:13px;color:var(--text-muted);font-weight:600">
        Falar com Ronaldo Meira ↗
      </a>
    </header>

    <main>
      ${mainContentHtml}
      ${relatedSectionHtml}
    </main>
  </div>

  <script>
    var photosList = ${JSON.stringify(item?.photos || [])};
    var currentPhotoIndex = 0;

    function selectPhoto(index) {
      if (!photosList || !photosList.length) return;
      currentPhotoIndex = index;
      var mainImg = document.getElementById('main-photo');
      var badge = document.getElementById('photo-counter-badge');
      if (mainImg) mainImg.src = photosList[index];
      if (badge) badge.innerText = (index + 1) + ' / ' + photosList.length + ' fotos · Ampliar ⤢';

      var thumbs = document.querySelectorAll('.thumb-btn');
      thumbs.forEach(function(btn, i) {
        if (i === index) {
          btn.classList.add('active');
          try {
            btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
          } catch(e) {}
        } else {
          btn.classList.remove('active');
        }
      });
    }

    function openLightbox(index) {
      if (!photosList || !photosList.length) return;
      currentPhotoIndex = index;
      var box = document.getElementById('lightbox');
      var img = document.getElementById('lightbox-img');
      var counter = document.getElementById('lightbox-counter');
      if (box && img) {
        img.src = photosList[index];
        if (counter) counter.innerText = (index + 1) + ' / ' + photosList.length;
        box.classList.add('active');
      }
    }

    function closeLightbox(e) {
      if (e.target.id === 'lightbox' || e.target.classList.contains('lightbox-close')) {
        var box = document.getElementById('lightbox');
        if (box) box.classList.remove('active');
      }
    }

    function prevPhoto(e) {
      if (e) e.stopPropagation();
      if (!photosList.length) return;
      currentPhotoIndex = (currentPhotoIndex - 1 + photosList.length) % photosList.length;
      updateLightbox();
    }

    function nextPhoto(e) {
      if (e) e.stopPropagation();
      if (!photosList.length) return;
      currentPhotoIndex = (currentPhotoIndex + 1) % photosList.length;
      updateLightbox();
    }

    function updateLightbox() {
      var img = document.getElementById('lightbox-img');
      var counter = document.getElementById('lightbox-counter');
      if (img) img.src = photosList[currentPhotoIndex];
      if (counter) counter.innerText = (currentPhotoIndex + 1) + ' / ' + photosList.length;
      selectPhoto(currentPhotoIndex);
    }

    // Teclas de seta e ESC no lightbox
    document.addEventListener('keydown', function(e) {
      var box = document.getElementById('lightbox');
      if (!box || !box.classList.contains('active')) return;
      if (e.key === 'Escape') {
        box.classList.remove('active');
      } else if (e.key === 'ArrowLeft') {
        prevPhoto();
      } else if (e.key === 'ArrowRight') {
        nextPhoto();
      }
    });
  </script>
</body>
</html>`;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.end(html);
  } catch (err) {
    console.error('[handlePublicPageHtml] Erro:', err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Catálogo indisponível</title><body style="font:16px system-ui;background:#090b10;color:#fff;padding:40px;text-align:center"><h1 style="margin-bottom:12px">RM Imóveis</h1><p style="color:#94a3b8">Página temporariamente indisponível. Por favor, tente novamente em instantes.</p></body></html>`);
  }
}

import { createClient } from '@supabase/supabase-js';
import { randomUUID, timingSafeEqual } from 'node:crypto';

const TABLE = 'public_property_pages';
const BUCKET = 'public-property-media';
const MAX_PHOTOS = 12;

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

function safeText(value, max = 180) {
  return [...String(value || '').trim()].filter((char) => char === '<' || char === '>' ? false : char.charCodeAt(0) >= 32).join('').slice(0, max);
}

function buildListing(input, photos) {
  const type = safeText(input.type, 40) || 'Imóvel';
  const neighborhood = safeText(input.neighborhood, 80);
  const purpose = input.purpose === 'Locação' ? 'Locação' : 'Venda';
  const bedrooms = Math.max(0, Math.min(30, Number(input.bedrooms) || 0));
  const suites = Math.max(0, Math.min(30, Number(input.suites) || 0));
  const bathrooms = Math.max(0, Math.min(30, Number(input.bathrooms) || 0));
  const parkingSpaces = Math.max(0, Math.min(30, Number(input.parkingSpaces) || 0));
  const parkingSpacesType = input.parkingSpacesType === 'Rotativas' ? 'Rotativas' : undefined;
  const areaM2 = Math.max(0, Math.min(100000, Number(input.areaM2) || 0));
  const price = Math.max(0, Math.min(1_000_000_000, Number(input.price) || 0));
  const range = input.areaRange && typeof input.areaRange === 'object'
    ? { min: Number(input.areaRange.min) || 0, max: Number(input.areaRange.max) || 0 }
    : null;
  const features = [...new Set([...(Array.isArray(input.apartmentFeatures) ? input.apartmentFeatures : []), ...(Array.isArray(input.buildingFeatures) ? input.buildingFeatures : [])]
    .map((item) => safeText(item, 64)).filter(Boolean))].slice(0, 30);
  const title = `${type}${neighborhood ? ` no ${neighborhood}` : ''}`;
  const description = [
    bedrooms ? `${bedrooms} quarto${bedrooms === 1 ? '' : 's'}` : '',
    suites ? `${suites} suíte${suites === 1 ? '' : 's'}` : '',
    areaM2 ? `${areaM2} m²` : '',
    parkingSpacesType ? 'Vagas rotativas' : parkingSpaces ? `${parkingSpaces} vaga${parkingSpaces === 1 ? '' : 's'}` : '',
    features.length ? `Características: ${features.join(', ')}.` : '',
  ].filter(Boolean).join(' · ');

  return { title, purpose, type, neighborhood, price, bedrooms, suites, bathrooms, parkingSpaces, parkingSpacesType, areaM2, areaRange: range, features, description, photos, brand: 'RM Imóveis', agentName: 'Ronaldo Meira', agentRole: 'Corretor de Imóveis' };
}

function relatedRows(rows, targetId, listing) {
  const candidates = rows.filter((row) => row.id !== targetId && row.payload);
  const sameNeighborhood = listing?.neighborhood?.toLocaleLowerCase('pt-BR');
  return candidates.sort((a, b) => {
    const x = a.payload; const y = b.payload;
    const score = (item) => [
      item.purpose === listing?.purpose ? 0 : 1,
      item.type === listing?.type ? 0 : 1,
      sameNeighborhood && item.neighborhood.toLocaleLowerCase('pt-BR') === sameNeighborhood ? 0 : 1,
      Math.abs((item.bedrooms || 0) - (listing?.bedrooms || 0)),
      listing?.price ? Math.abs(item.price - listing.price) / listing.price : 1,
    ];
    const sx = score(x); const sy = score(y);
    for (let i = 0; i < sx.length; i += 1) if (sx[i] !== sy[i]) return sx[i] - sy[i];
    return 0;
  }).slice(0, 6).map((row) => ({ id: row.id, listing: row.payload }));
}

async function allActive(db) {
  const { data, error } = await db.from(TABLE).select('id,payload').eq('is_active', true).order('updated_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data || [];
}

export async function getPublicRecord(id) {
  const db = client();
  const [{ data, error }, active] = await Promise.all([
    db.from(TABLE).select('id,is_active,payload').eq('id', id).maybeSingle(),
    allActive(db),
  ]);
  if (error) throw error;
  const listing = data?.is_active ? data.payload : null;
  return { id, active: Boolean(data?.is_active), listing, related: relatedRows(active, id, listing) };
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return JSON.parse(raw || '{}');
}

export async function handlePublicPages(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const db = client();
    if (req.method === 'GET') {
      const id = String(new URL(req.url, 'http://local').searchParams.get('id') || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json(res, 400, { error: 'Identificador inválido.' });
      return json(res, 200, await getPublicRecord(id));
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
    const secret = process.env.PUBLIC_PROPERTIES_ADMIN_TOKEN;
    if (!secret || !equalSecret(req.headers.authorization?.replace(/^Bearer\s+/i, ''), secret)) return json(res, 401, { error: 'Token administrativo inválido.' });
    const body = await readBody(req);
    const propertyId = safeText(body.propertyId, 100);
    const id = /^[0-9a-f-]{36}$/i.test(body.publicPageId) ? body.publicPageId : randomUUID();
    if (!propertyId) return json(res, 400, { error: 'Imóvel inválido.' });
    if (body.active !== true) {
      const { error } = await db.from(TABLE).update({ is_active: false, updated_at: new Date().toISOString() }).eq('property_id', propertyId);
      if (error) throw error;
      const { data } = await db.from(TABLE).select('id').eq('property_id', propertyId).maybeSingle();
      return json(res, 200, { id: data?.id || id, active: false });
    }

    if (!Array.isArray(body.photos) || body.photos.length === 0 || body.photos.length > MAX_PHOTOS) return json(res, 400, { error: 'Inclua de 1 a 12 fotos.' });
    const photos = [];
    for (let i = 0; i < body.photos.length; i += 1) {
      const match = String(body.photos[i]).match(/^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/);
      if (!match) return json(res, 400, { error: 'Formato de foto inválido.' });
      const bytes = Buffer.from(match[1], 'base64');
      if (bytes.length > 2_000_000) return json(res, 413, { error: 'Uma foto ultrapassou o limite permitido.' });
      const path = `${id}/${i + 1}.webp`;
      const { error } = await db.storage.from(BUCKET).upload(path, bytes, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
      if (error) throw error;
      photos.push(db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    }
    const listing = buildListing(body.listing || {}, photos);
    if (!listing.neighborhood || !listing.price) return json(res, 400, { error: 'Bairro e preço são necessários para publicar.' });
    const { error } = await db.from(TABLE).upsert({ id, property_id: propertyId, is_active: true, payload: listing, updated_at: new Date().toISOString() }, { onConflict: 'property_id' });
    if (error) throw error;
    const { data } = await db.from(TABLE).select('id').eq('property_id', propertyId).single();
    return json(res, 200, { id: data.id, active: true });
  } catch (error) {
    const configError = error?.message === 'PUBLIC_PAGES_NOT_CONFIGURED';
    return json(res, configError ? 503 : 500, { error: configError ? 'A publicação ainda precisa de configuração no servidor.' : 'Não foi possível processar a solicitação.' });
  }
}

function json(res, status, value) { res.statusCode = status; res.end(JSON.stringify(value)); }

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value || 0);

function listingCard(row, token) {
  const item = row.listing;
  const photo = item.photos?.[0] || '';
  const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : '';
  return `<a class="related-card" href="/imovel/${encodeURIComponent(row.id)}${tokenQuery}"><img src="${escapeHtml(photo)}" alt=""><span class="related-copy"><b>${escapeHtml(item.title)}</b><small>${item.bedrooms ? `${item.bedrooms} quartos · ` : ''}${item.areaM2 ? `${item.areaM2} m²` : ''}</small><strong>${money(item.price)}</strong></span></a>`;
}

export async function handlePublicPageHtml(req, res) {
  try {
    const urlObj = new URL(req.url, 'http://local');
    let id = urlObj.searchParams.get('id') || '';
    const token = urlObj.searchParams.get('token') || '';

    // Se o acesso foi feito com token individual (ex: /imoveis/p/:token), resolve o property_id correspondente
    if (token && !id) {
      try {
        const db = client();
        const { data: share } = await db.from('property_shares').select('property_id').eq('tracking_token', token).maybeSingle();
        if (share?.property_id) {
          id = share.property_id;
        }
      } catch {}
    }

    const record = await getPublicRecord(id);
    const item = record.listing;

    // FASE 6, 7 & 8: WACRM é a autoridade canônica de tracking.
    // Meus Imóveis apenas emite o evento para o WACRM via túnel (sem escrita direta no DB).
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
        }).catch((err) => {
          console.warn('[public-page tracking] Falha ao notificar WACRM tracking:', err.message);
        });
      } catch (tErr) {
        console.error('[public-page tracking] Erro silencioso:', tErr);
      }
    }

    const title = item ? `${item.title} | ${item.brand}` : 'Imóvel indisponível | RM Imóveis';
    const summary = item ? `${item.purpose} · ${money(item.price)} · ${item.bedrooms} quartos · ${item.areaM2} m² · ${item.neighborhood}` : 'Este imóvel não está mais disponível. Veja outras opções.';
    const origin = req.headers.host ? `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}` : '';
    const canonical = `${origin}/imovel/${encodeURIComponent(id)}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    const cover = item?.photos?.[0] || '';
    const phone = String(process.env.PUBLIC_CONTACT_WHATSAPP || '').replace(/\D/g, '');
    const msg = encodeURIComponent(`Olá! Tenho interesse no imóvel ${item?.title || 'que vi no catálogo'}${item ? `, anunciado por ${money(item.price)}` : ''}.`);
    const gallery = item ? item.photos.slice(0, 5).map((photo, index) => `<div class="photo photo-${index}"><img src="${escapeHtml(photo)}" alt="${escapeHtml(item.title)} - foto ${index + 1}"${index ? ' loading="lazy"' : ''}></div>`).join('') : '';
    const attributes = item ? [item.bedrooms && `${item.bedrooms} quartos`, item.suites && `${item.suites} suítes`, item.bathrooms && `${item.bathrooms} banheiros`, item.parkingSpacesType || (item.parkingSpaces ? `${item.parkingSpaces} vagas` : ''), item.areaM2 && `${item.areaM2} m²`].filter(Boolean).map((x) => `<div class="stat">${escapeHtml(x)}</div>`).join('') : '';
    
    // FASE 21: Preservação de identificação segura nos relacionados
    const related = record.related.map((r) => listingCard(r, token)).join('');
    const relatedSection = related
      ? `<section class="related"><h2>Você também pode gostar</h2><div class="related-grid">${related}</div></section>`
      : `<section class="related"><h2>Encontre seu próximo imóvel</h2><div class="unavailable"><p>Entre em contato para receber outras opções disponíveis no seu perfil.</p><a class="cta" href="${phone ? `https://wa.me/${phone}?text=${encodeURIComponent('Olá! Gostaria de receber outras opções de imóveis.')}` : `https://wa.me/?text=${encodeURIComponent('Olá! Gostaria de receber outras opções de imóveis.')}`}" target="_blank" rel="noopener">Falar com Ronaldo</a></div></section>`;

    // FASE 23: Botão oficial TENHO INTERESSE com registro de evento e feedback imediato
    const interestBtnHtml = `<button id="interest-btn" class="cta cta-interest" onclick="handleInterestClick('${escapeHtml(token)}', '${escapeHtml(id)}', '${escapeHtml(item?.title || 'Imóvel')}')">TENHO INTERESSE</button><div id="interest-feedback" class="interest-feedback" style="display:none">✓ Seu interesse foi registrado com sucesso! Ronaldo Meira entrará em contato em instantes.</div>`;

    const body = item ? `<main><a class="back" href="/">← Catálogo</a><section class="hero"><div class="gallery">${gallery}</div><div class="intro"><div class="eyebrow">${escapeHtml(item.purpose)} · ${escapeHtml(item.type)}</div><h1>${escapeHtml(item.title)}</h1><p class="place">${escapeHtml(item.neighborhood)}</p><div class="price">${money(item.price)}</div><div class="stats">${attributes}</div>${item.description ? `<p class="description">${escapeHtml(item.description)}</p>` : ''}${item.features.length ? `<div class="features">${item.features.map((f) => `<span>${escapeHtml(f)}</span>`).join('')}</div>` : ''}${interestBtnHtml}<small class="agent">${escapeHtml(item.brand)} · ${escapeHtml(item.agentName)} — ${escapeHtml(item.agentRole)}</small></div></section>${relatedSection}</main>` : `<main><a class="back" href="/">← Catálogo</a><section class="unavailable"><div class="eyebrow">RM IMÓVEIS</div><h1>Este imóvel não está mais disponível</h1><p>Veja outras opções que podem combinar com você.</p>${related ? `<div class="related-grid">${related}</div>` : ''}</section></main>`;
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><meta name="description" content="${escapeHtml(summary)}"><link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:type" content="website"><meta property="og:site_name" content="RM Imóveis"><meta property="og:title" content="${escapeHtml(title)}"><meta property="og:description" content="${escapeHtml(summary)}"><meta property="og:url" content="${escapeHtml(canonical)}">${cover ? `<meta property="og:image" content="${escapeHtml(cover)}"><meta property="og:image:alt" content="${escapeHtml(item.title)}">` : ''}<meta name="twitter:card" content="${cover ? 'summary_large_image' : 'summary'}"><style>
      :root{color-scheme:dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#0b0d12;color:#f3f5f9;font-synthesis:none}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 25% -10%,#192336 0,transparent 45%),#0b0d12;color:#f3f5f9}a{color:inherit;text-decoration:none}main{width:min(1120px,calc(100% - 40px));margin:auto;padding:28px 0 70px}.back{display:inline-block;color:#98a6bd;font-size:14px;margin:2px 0 22px}.hero{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(300px,.8fr);gap:36px;align-items:start}.gallery{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(2,minmax(160px,230px));gap:10px}.photo{overflow:hidden;border-radius:16px;background:#171b24}.photo img{width:100%;height:100%;object-fit:cover;display:block}.photo-0{grid-column:1/-1;grid-row:1/-1}.gallery:has(.photo-1) .photo-0{grid-column:1/-1;grid-row:1}.gallery:has(.photo-2) .photo-0{grid-column:1;grid-row:1/-1}.gallery:has(.photo-2) .photo-1{grid-column:2;grid-row:1}.gallery:has(.photo-2) .photo-2{grid-column:2;grid-row:2}.gallery:has(.photo-3) .photo-0{grid-row:1/-1}.intro{padding:7px 0}.eyebrow{text-transform:uppercase;letter-spacing:.13em;font-size:11px;font-weight:700;color:#81aef5}.intro h1,.unavailable h1{font-size:clamp(28px,4vw,42px);line-height:1.12;letter-spacing:-.04em;margin:10px 0}.place{color:#a4afc0;margin:0 0 22px}.price{font-size:28px;font-weight:750;letter-spacing:-.03em}.stats{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}.stat,.features span{border:1px solid #282e3a;background:#12151c;border-radius:9px;padding:9px 11px;font-size:13px;color:#d7deeb}.description{color:#b2bdcd;line-height:1.65;margin:18px 0}.features{display:flex;flex-wrap:wrap;gap:7px;margin:16px 0 23px}.cta{display:flex;justify-content:center;align-items:center;min-height:52px;border-radius:12px;background:#347cf2;color:white;font-weight:700;box-shadow:0 8px 28px #2468db35;border:none;cursor:pointer;width:100%;font-size:15px;letter-spacing:.02em;transition:all .18s ease}.cta:hover{background:#478bff}.cta:disabled{opacity:.7;cursor:not-allowed}.interest-feedback{margin-top:12px;padding:12px 14px;border-radius:10px;background:#10b98115;border:1px solid #10b98140;color:#34d399;font-size:13px;line-height:1.45;text-align:center;animation:fadeIn .2s ease}.agent{display:block;color:#8793a6;text-align:center;margin-top:12px}.related{margin-top:56px}.related h2{font-size:21px;letter-spacing:-.025em;margin-bottom:17px}.related-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.related-card{border:1px solid #272d39;background:#11141b;border-radius:13px;overflow:hidden;transition:border-color .18s,transform .18s}.related-card:hover{border-color:#4388f5;transform:translateY(-2px)}.related-card img{width:100%;height:170px;object-fit:cover;background:#191d26;display:block}.related-copy{display:grid;gap:8px;padding:13px}.related-copy b{font-size:14px}.related-copy small{color:#95a0b2}.related-copy strong{font-size:14px}.unavailable{border:1px solid #252b37;border-radius:18px;padding:34px;background:#11141b}.unavailable p{color:#a3afc1}.unavailable .related-grid{margin-top:24px}@keyframes fadeIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}@media(max-width:760px){main{width:min(100% - 28px,560px);padding-top:18px}.hero{grid-template-columns:1fr;gap:17px}.gallery{grid-template-rows:repeat(2,minmax(120px,30vw));gap:6px}.photo{border-radius:11px}.intro{padding:2px}.price{font-size:25px}.related{margin-top:40px}.related-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.related-card img{height:125px}.related-copy{padding:10px}.related-copy b{font-size:12px}.related-copy small{font-size:10px}.related-copy strong{font-size:12px}}@media(max-width:380px){.related-grid{grid-template-columns:1fr}}
    </style></head><body>${body}<script>
    function handleInterestClick(token, propId, title) {
      var btn = document.getElementById('interest-btn');
      var feedback = document.getElementById('interest-feedback');
      if (btn) {
        btn.disabled = true;
        btn.innerText = 'Registrando interesse...';
      }
      if (token) {
        fetch('/api/tunnel/v1/events/tracking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event_name: 'public_interest.clicked',
            tracking_token: token,
            property_id: propId,
            timestamp: new Date().toISOString()
          })
        }).catch(function(){});
      }
      if (feedback) feedback.style.display = 'block';
      if (btn) {
        btn.innerText = 'Interesse Registrado ✓';
        btn.style.background = '#059669';
      }
      var phone = '${escapeHtml(phone)}';
      if (phone) {
        setTimeout(function() {
          var text = encodeURIComponent('Olá Ronaldo! Acabei de clicar em Tenho Interesse no imóvel ' + title + ' e gostaria de mais detalhes.');
          window.open('https://wa.me/' + phone + '?text=' + text, '_blank');
        }, 1200);
      }
    }
    </script></body></html>`;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.end(html);
  } catch {
    res.statusCode = 503;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Catálogo indisponível</title><body style="font:16px system-ui;background:#0b0d12;color:#fff;padding:40px">Catálogo temporariamente indisponível.</body></html>');
  }
}


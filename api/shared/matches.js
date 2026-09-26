import { createClient } from '@supabase/supabase-js';

const ALLOWED_STATUSES = ['novo', 'enviado', 'pausado', 'arquivado'];

function json(res, status, value) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

/**
 * Autentica a requisição via JWT e autoriza a conta contra as configurações server-side.
 * Retorna { authorized: true, user, callerAccountId, canonicalAccountId, db } ou { status, error }.
 */
export async function authenticateMatchesRequest(req) {
  const headers = req.headers || {};
  const authHeader = headers['authorization'] || headers['Authorization'];

  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return { status: 401, error: 'Token de autenticação não fornecido ou formato inválido.' };
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return { status: 401, error: 'Token de autenticação vazio.' };
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const meusImoveisAccountId = process.env.MEUS_IMOVEIS_ACCOUNT_ID;
  const canonicalAccountId = process.env.MATCH_CANONICAL_ACCOUNT_ID;

  // Fail closed se as configurações de segurança estiverem ausentes
  if (!url || !serviceKey || !meusImoveisAccountId || !canonicalAccountId) {
    console.error('[authenticateMatchesRequest] FAIL CLOSED: Configurações obrigatórias ausentes.', {
      hasUrl: Boolean(url),
      hasServiceKey: Boolean(serviceKey),
      hasMeusImoveisAccountId: Boolean(meusImoveisAccountId),
      hasCanonicalAccountId: Boolean(canonicalAccountId),
    });
    return { status: 500, error: 'Configuração do servidor incompleta.' };
  }

  // 1. Validar JWT do usuário contra o Supabase Auth
  const authClient = createClient(url, anonKey || serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !userData?.user) {
    return { status: 401, error: 'Sessão inválida ou expirada.' };
  }

  const user = userData.user;

  // 2. Carregar o profile com service_role server-side
  const adminDb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Tenta por user_id (padrão) ou id
  let { data: profile, error: profileError } = await adminDb
    .from('profiles')
    .select('id, user_id, account_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!profile && !profileError) {
    const fallbackRes = await adminDb
      .from('profiles')
      .select('id, user_id, account_id, role')
      .eq('id', user.id)
      .maybeSingle();
    profile = fallbackRes.data;
    profileError = fallbackRes.error;
  }

  if (profileError || !profile) {
    return { status: 403, error: 'Perfil do usuário não encontrado.' };
  }

  const callerAccountId = profile.account_id;

  // 3. Vínculo explícito server-side: callerAccountId deve coincidir com MEUS_IMOVEIS_ACCOUNT_ID
  if (callerAccountId !== meusImoveisAccountId) {
    return { status: 403, error: 'Acesso não autorizado para esta conta.' };
  }

  return {
    authorized: true,
    user,
    callerAccountId,
    canonicalAccountId,
    db: adminDb,
  };
}

export async function handleMatches(req, res) {
  try {
    const authResult = await authenticateMatchesRequest(req);
    if (!authResult.authorized) {
      return json(res, authResult.status, { error: authResult.error });
    }

    const { canonicalAccountId, db } = authResult;
    const urlObj = new URL(req.url, 'http://local');
    const method = req.method || 'GET';

    // Defesa em profundidade: Rejeita se o cliente tentar controlar o accountId
    if (urlObj.searchParams.has('accountId')) {
      return json(res, 400, {
        error: 'O parâmetro accountId não é permitido. A conta é determinada pelo servidor.',
      });
    }

    if (method === 'GET') {
      const status = urlObj.searchParams.get('status') || 'novo';
      const minScore = parseInt(urlObj.searchParams.get('minScore') || '50', 10);
      const propertyId = urlObj.searchParams.get('propertyId');
      const onlyActive = urlObj.searchParams.get('onlyActive') === 'true';

      if (status && status !== 'all' && !ALLOWED_STATUSES.includes(status)) {
        return json(res, 400, { error: 'Status de match inválido.' });
      }

      let query = db
        .from('lead_property_matches')
        .select(`
          id,
          account_id,
          lead_id,
          property_id,
          match_score,
          score_breakdown,
          profile_maturity,
          commercial_priority,
          match_status,
          suppressed,
          origin,
          sent_at,
          paused_at,
          archived_at,
          created_at,
          updated_at,
          contacts!inner (
            id,
            name,
            phone,
            ai_score,
            paused_at,
            archived_at
          )
        `)
        .eq('account_id', canonicalAccountId)
        .eq('suppressed', false)
        .gte('match_score', minScore);

      if (status && status !== 'all') {
        query = query.eq('match_status', status);
      }

      if (propertyId) {
        query = query.eq('property_id', propertyId);
      }

      if (onlyActive) {
        query = query
          .is('contacts.paused_at', null)
          .is('contacts.archived_at', null)
          .gte('profile_maturity', 70);
      }

      query = query.order('commercial_priority', { ascending: false });

      const { data: rows, error } = await query;
      if (error) {
        console.error('[handleMatches] Erro query matches:', error);
        return json(res, 500, { error: error.message });
      }

      // Projeções dos imóveis correspondentes
      const propertyIds = Array.from(new Set((rows || []).map((r) => r.property_id)));
      let propMap = new Map();
      if (propertyIds.length > 0) {
        const { data: propRows } = await db
          .from('property_match_projections')
          .select('*')
          .eq('account_id', canonicalAccountId)
          .in('property_id', propertyIds);

        for (const p of propRows || []) {
          propMap.set(p.property_id, {
            propertyId: p.property_id,
            accountId: p.account_id,
            code: p.code,
            title: p.title,
            operation: p.operation,
            propertyType: p.property_type,
            neighborhood: p.neighborhood,
            city: p.city,
            priceMin: Number(p.price_min),
            priceMax: Number(p.price_max),
            areaMin: p.area_min ? Number(p.area_min) : null,
            areaMax: p.area_max ? Number(p.area_max) : null,
            bedroomsMin: p.bedrooms_min,
            bedroomsMax: p.bedrooms_max,
            deliveryStatus: p.delivery_status,
            deliveryDeadline: p.delivery_deadline,
            features: p.features || [],
            coverUrl: p.cover_url,
            publicUrl: p.public_url,
            status: p.status,
          });
        }
      }

      // Histórico de envios (property_shares)
      let sharesByLead = new Map();
      if (propertyIds.length > 0) {
        const { data: shares } = await db
          .from('property_shares')
          .select('*')
          .eq('account_id', canonicalAccountId)
          .in('property_id', propertyIds);

        for (const s of shares || []) {
          const list = sharesByLead.get(s.lead_id) || [];
          list.push({
            id: s.id,
            accountId: s.account_id,
            leadId: s.lead_id,
            propertyId: s.property_id,
            matchId: s.match_id,
            trackingToken: s.tracking_token,
            channel: s.channel,
            messageText: s.message_text,
            sentAt: s.sent_at,
            firstOpenedAt: s.first_opened_at,
            lastOpenedAt: s.last_opened_at,
            openCount: s.open_count || 0,
            isInterested: s.is_interested || false,
            interestedAt: s.interested_at,
            revokedAt: s.revoked_at,
          });
          sharesByLead.set(s.lead_id, list);
        }
      }

      const matches = (rows || []).map((r) => {
        const contact = r.contacts;
        const name = contact?.name || 'Cliente';
        const initials = name
          .split(' ')
          .filter(Boolean)
          .map((w) => w[0])
          .slice(0, 2)
          .join('')
          .toUpperCase();

        const leadShares = sharesByLead.get(r.lead_id) || [];
        const lastShare = leadShares.sort(
          (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
        )[0];

        return {
          id: r.id,
          accountId: r.account_id,
          leadId: r.lead_id,
          propertyId: r.property_id,
          matchScore: Number(r.match_score),
          scoreBreakdown: r.score_breakdown,
          profileMaturity: r.profile_maturity,
          commercialPriority: Number(r.commercial_priority),
          matchStatus: r.match_status,
          suppressed: r.suppressed,
          origin: r.origin,
          sentAt: r.sent_at,
          pausedAt: r.paused_at,
          archivedAt: r.archived_at,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          lead: {
            id: contact.id,
            name,
            initials,
            phone: contact.phone || '',
            aiScore: contact.ai_score ?? 0,
            maturity: r.profile_maturity,
            pausedAt: contact.paused_at,
            archivedAt: contact.archived_at,
            totalPropertiesSent: leadShares.length,
            lastSentAt: lastShare?.sentAt || null,
          },
          property: propMap.get(r.property_id) || null,
          shares: leadShares,
        };
      });

      return json(res, 200, { success: true, matches });
    }

    if (method === 'POST') {
      const body = await readBody(req);

      // Defesa em profundidade: Rejeita se o corpo tentar controlar o accountId
      if (body.accountId !== undefined) {
        return json(res, 400, {
          error: 'O parâmetro accountId não é permitido no corpo. A conta é determinada pelo servidor.',
        });
      }

      if (body.action === 'suppress') {
        const { matchId, leadId, propertyId } = body;

        let checkQuery = db
          .from('lead_property_matches')
          .select('id, account_id')
          .eq('account_id', canonicalAccountId);

        if (matchId) {
          checkQuery = checkQuery.eq('id', matchId);
        } else if (leadId && propertyId) {
          checkQuery = checkQuery.eq('lead_id', leadId).eq('property_id', propertyId);
        } else {
          return json(res, 400, { error: 'Identificador do match (matchId ou leadId/propertyId) é obrigatório.' });
        }

        const { data: existing, error: checkError } = await checkQuery.maybeSingle();
        if (checkError) {
          return json(res, 500, { error: checkError.message });
        }
        if (!existing) {
          return json(res, 404, { error: 'Match não encontrado na conta autorizada.' });
        }

        const { error } = await db
          .from('lead_property_matches')
          .update({
            suppressed: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .eq('account_id', canonicalAccountId);

        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { success: true });
      }

      if (body.action === 'update_status') {
        const { matchId, newStatus } = body;

        if (!matchId) {
          return json(res, 400, { error: 'matchId é obrigatório.' });
        }

        if (!ALLOWED_STATUSES.includes(newStatus)) {
          return json(res, 400, {
            error: `Status '${newStatus}' inválido. Valores permitidos: ${ALLOWED_STATUSES.join(', ')}.`,
          });
        }

        // Valida que o match pertence estritamente à conta canônica autorizada
        const { data: existing, error: checkError } = await db
          .from('lead_property_matches')
          .select('id, account_id')
          .eq('id', matchId)
          .eq('account_id', canonicalAccountId)
          .maybeSingle();

        if (checkError) {
          return json(res, 500, { error: checkError.message });
        }
        if (!existing) {
          return json(res, 404, { error: 'Match não encontrado na conta autorizada.' });
        }

        const now = new Date().toISOString();
        const updatePayload = {
          match_status: newStatus,
          updated_at: now,
        };

        if (newStatus === 'pausado') {
          updatePayload.paused_at = now;
        } else if (newStatus === 'arquivado') {
          updatePayload.archived_at = now;
        } else if (newStatus === 'enviado') {
          updatePayload.sent_at = now;
        }

        const { error } = await db
          .from('lead_property_matches')
          .update(updatePayload)
          .eq('id', matchId)
          .eq('account_id', canonicalAccountId);

        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { success: true });
      }

      return json(res, 400, { error: 'Ação não reconhecida.' });
    }

    return json(res, 405, { error: 'Método não permitido.' });
  } catch (err) {
    console.error('[handleMatches] Erro interno:', err);
    return json(res, 500, { error: 'Erro interno ao processar matches.' });
  }
}

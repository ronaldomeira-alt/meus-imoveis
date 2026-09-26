import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import type { Property } from '../../types/property';
import type {
  PropertyProjection,
  LeadSearchProfile,
  MatchRecord,
  MatchStatus,
  MatchOrigin,
  PropertyShareRecord,
  TrackingEventRecord,
} from './types';
import { propertyToProjection, ensureUuid } from './property-adapter';
import { generateTrackingToken, buildSharePublicUrl, buildWhatsAppPersonalLink } from './tokens';

/**
 * Obtém o cabeçalho Authorization: Bearer <access_token> a partir da sessão Supabase no browser.
 */
async function getAuthHeader(): Promise<Record<string, string> | null> {
  if (typeof window === 'undefined' || !supabase) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data?.session?.access_token) {
      return null;
    }
    return {
      Authorization: `Bearer ${data.session.access_token}`,
    };
  } catch (err) {
    console.warn('[getAuthHeader] Falha ao obter token da sessão:', err);
    return null;
  }
}

const getEnv = (key: string): string => {
  if (typeof import.meta !== 'undefined' && (import.meta as any)?.env?.[key]) {
    return (import.meta as any).env[key];
  }
  const proc = (globalThis as any).process;
  if (typeof proc !== 'undefined' && proc?.env?.[key]) {
    return proc.env[key] as string;
  }
  return '';
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL') || getEnv('NEXT_PUBLIC_SUPABASE_URL');
const supabaseKey =
  getEnv('VITE_SUPABASE_ANON_KEY') ||
  getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
  '';

let _cachedTunnelClient: SupabaseClient | null = null;

export function getTunnelClient(): SupabaseClient | null {
  if (_cachedTunnelClient) return _cachedTunnelClient;
  const supabaseUrl = getEnv('VITE_SUPABASE_URL') || getEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = typeof window === 'undefined' ? getEnv('SUPABASE_SERVICE_ROLE_KEY') : '';
  const supabaseKey =
    serviceRoleKey ||
    getEnv('VITE_SUPABASE_ANON_KEY') ||
    getEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') ||
    '';
  if (supabaseUrl && supabaseKey) {
    _cachedTunnelClient = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _cachedTunnelClient;
}

export const tunnelClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getTunnelClient();
    if (!client) return undefined;
    const value = (client as any)[prop];
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

// Account padrão do CRM
export const DEFAULT_ACCOUNT_ID = '7f434d39-87d8-4d16-8262-e3006908d1c5';
export const WACRM_BASE_URL = getEnv('VITE_WACRM_URL') || 'http://localhost:3000';

/**
 * Constrói o LeadSearchProfile para cálculo no lado do Meus Imóveis.
 * Consome os dados e proveniências oficiais persistidos no banco compartilhado.
 */
export async function fetchLeadProfile(
  db: SupabaseClient,
  accountId: string,
  leadId: string
): Promise<LeadSearchProfile | null> {
  const [
    { data: contact },
    { data: intelligence },
    { data: contactTags },
  ] = await Promise.all([
    db
      .from('contacts')
      .select('id, account_id, name, phone, ai_score, paused_at, archived_at')
      .eq('id', leadId)
      .eq('account_id', accountId)
      .maybeSingle(),
    db
      .from('lead_intelligence')
      .select('summary')
      .eq('contact_id', leadId)
      .maybeSingle(),
    db
      .from('contact_tags')
      .select('source, originally_from_ctwa, tags!inner(id, name, category)')
      .eq('contact_id', leadId),
  ]);

  if (!contact) return null;

  const summary = (intelligence?.summary || {}) as Record<string, any>;
  const tags = (contactTags || []) as any[];

  // Separação de tags por categoria
  const byCategory: Record<string, { name: string; source: 'ctwa' | 'conversation' | 'manual' }[]> = {};
  for (const ct of tags) {
    const t = ct.tags;
    if (!t?.category) continue;
    const cat = t.category.trim();
    (byCategory[cat] ??= []).push({
      name: t.name,
      source: ct.source || 'conversation',
    });
  }

  // Operação e Temporada
  let operation: 'venda' | 'locacao' = 'venda';
  let isShortStayOnly = false;
  const rawPurpose = Array.isArray(summary.purpose) ? summary.purpose : [];
  const notesText = (summary.notes as string) || '';

  if (
    notesText.toLowerCase().includes('temporada') ||
    rawPurpose.some((p: string) => p.toLowerCase().includes('temporada'))
  ) {
    isShortStayOnly = true;
  }
  if (
    notesText.toLowerCase().includes('aluguel') ||
    notesText.toLowerCase().includes('locação') ||
    rawPurpose.some((p: string) => p.toLowerCase().includes('aluguel') || p.toLowerCase().includes('loca'))
  ) {
    operation = 'locacao';
  }

  // Finalidade
  const purpose = [...rawPurpose];
  for (const ft of byCategory['Finalidade'] || []) {
    if (!purpose.includes(ft.name)) purpose.push(ft.name);
  }

  // Tipologias
  const propertyTypes = Array.isArray(summary.property_type) ? [...summary.property_type] : [];
  for (const tt of byCategory['Tipo de imóvel'] || []) {
    if (!propertyTypes.includes(tt.name)) propertyTypes.push(tt.name);
  }

  // Localizações
  const locations = Array.isArray(summary.location) ? [...summary.location] : [];
  for (const bt of byCategory['Bairro'] || []) {
    if (!locations.includes(bt.name)) locations.push(bt.name);
  }

  // Preço
  const priceMin = typeof summary.price_min === 'number' ? summary.price_min : null;
  const priceMax = typeof summary.price_max === 'number' ? summary.price_max : null;
  const priceStrictMax = Boolean(summary.price_strict_max);
  const priceFlexMax = typeof summary.price_flex_max === 'number' ? summary.price_flex_max : null;

  // Quartos
  const bedrooms: number[] = Array.isArray(summary.bedrooms)
    ? summary.bedrooms.filter((n: any) => typeof n === 'number')
    : [];

  return {
    accountId,
    leadId: contact.id,
    name: contact.name || 'Cliente',
    phone: contact.phone || '',
    aiScore: contact.ai_score ?? 0,
    isPaused: Boolean(contact.paused_at),
    isArchived: Boolean(contact.archived_at),
    operation,
    purpose,
    propertyTypes,
    propertyTypeStrict: Boolean(summary.property_type_strict),
    locations,
    locationStrict: Boolean(summary.location_strict),
    locationSpecificity: 'neighborhood',
    priceMin,
    priceMax,
    priceStrictMax,
    priceFlexMax,
    bedrooms,
    bedroomsStrict: Boolean(summary.bedrooms_strict),
    deliveryStatus: Array.isArray(summary.delivery_status) ? summary.delivery_status : [],
    deliveryStrict: Boolean(summary.delivery_strict),
    requiredFeatures: Array.isArray(summary.required_features) ? summary.required_features : [],
    preferredFeatures: Array.isArray(summary.preferred_features) ? summary.preferred_features : [],
    isShortStayOnly,
    provenance: {
      operation: byCategory['Finalidade']?.some((e) => e.source === 'ctwa') ? 'ctwa' : 'conversation',
      propertyTypes: byCategory['Tipo de imóvel']?.some((e) => e.source === 'ctwa') ? 'ctwa' : 'conversation',
      locations: byCategory['Bairro']?.some((e) => e.source === 'ctwa') ? 'ctwa' : 'conversation',
    },
  };
}

/**
 * FASE 9 & 10: Sincroniza imóvel no catálogo e roda Match com leads elegíveis.
 */
export async function syncPropertyToMatch(
  property: Property,
  accountId: string = DEFAULT_ACCOUNT_ID
): Promise<{
  success: boolean;
  propertyId: string;
  totalEvaluated: number;
  matchesCount: number;
  strongMatchesCount: number;
}> {
  if (!tunnelClient) {
    return {
      success: false,
      propertyId: property.id,
      totalEvaluated: 0,
      matchesCount: 0,
      strongMatchesCount: 0,
    };
  }

  const projection = propertyToProjection(property, accountId);
  const now = new Date().toISOString();

  // 1. Persiste a projeção na tabela property_match_projections
  const { error: projError } = await tunnelClient
    .from('property_match_projections')
    .upsert(
      {
        account_id: accountId,
        property_id: projection.propertyId,
        code: projection.code || null,
        title: projection.title,
        operation: projection.operation,
        property_type: projection.propertyType,
        neighborhood: projection.neighborhood,
        city: projection.city,
        price_min: projection.priceMin,
        price_max: projection.priceMax,
        area_min: projection.areaMin,
        area_max: projection.areaMax,
        bedrooms_min: projection.bedroomsMin,
        bedrooms_max: projection.bedroomsMax,
        delivery_status: projection.deliveryStatus,
        delivery_deadline: projection.deliveryDeadline,
        features: projection.features,
        cover_url: projection.coverUrl,
        public_url: projection.publicUrl,
        status: projection.status,
        updated_at: now,
      },
      { onConflict: 'account_id,property_id' }
    );

  if (projError) {
    console.error('[syncPropertyToMatch] Erro ao salvar projeção:', projError);
  }

  // Se o imóvel não estiver ativo (Vendido, Inativo, Arquivado), não calcula novos Matches
  if (projection.status !== 'ativo') {
    return {
      success: true,
      propertyId: projection.propertyId,
      totalEvaluated: 0,
      matchesCount: 0,
      strongMatchesCount: 0,
    };
  }

  // FASE 2 & 3: WACRM é a ÚNICA autoridade canônica para cálculo e persistência de Matches
  // Meus Imóveis envia a projeção ao WACRM através de POST /api/tunnel/v1/properties/sync
  let totalEvaluated = 0;
  let matchesCount = 0;
  let strongMatchesCount = 0;

  try {
    const res = await fetch('/api/tunnel/v1/properties/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        property_id: projection.propertyId,
        title: projection.title,
        operation: projection.operation,
        property_type: projection.propertyType,
        neighborhood: projection.neighborhood,
        city: projection.city,
        price_min: projection.priceMin,
        price_max: projection.priceMax,
        area_min: projection.areaMin,
        area_max: projection.areaMax,
        bedrooms_min: projection.bedroomsMin,
        bedrooms_max: projection.bedroomsMax,
        delivery_status: projection.deliveryStatus,
        delivery_deadline: projection.deliveryDeadline,
        features: projection.features,
        cover_url: projection.coverUrl,
        public_url: projection.publicUrl,
        status: projection.status,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      matchesCount = data.matches_recalculated || 0;
      strongMatchesCount = data.strong_matches_count || 0;
      totalEvaluated = data.matches_recalculated || 0;
    } else {
      console.warn('[syncPropertyToMatch] WACRM retornou status não-ok:', res.status);
    }
  } catch (err) {
    console.error('[syncPropertyToMatch] Falha ao sincronizar com WACRM:', err);
  }

  return {
    success: true,
    propertyId: projection.propertyId,
    totalEvaluated,
    matchesCount,
    strongMatchesCount,
  };
}

/**
 * FASE 11 & 12: Consulta os Matches de um imóvel específico ordenados por prioridade comercial.
 */
export async function getMatchesForProperty(
  propertyId: string,
  options?: {
    accountId?: string;
    minScore?: number;
    onlyActive?: boolean;
    status?: MatchStatus;
  }
): Promise<MatchRecord[]> {
  const accountId = options?.accountId || DEFAULT_ACCOUNT_ID;
  const canonicalPropId = ensureUuid(propertyId);
  const minScore = options?.minScore ?? 50;

  if (typeof window !== 'undefined') {
    const authHeaders = await getAuthHeader();
    if (!authHeaders) {
      console.warn('[getMatchesForProperty] Usuário não autenticado.');
      return [];
    }

    try {
      const url = new URL('/api/matches', window.location.origin);
      url.searchParams.set('propertyId', canonicalPropId);
      url.searchParams.set('minScore', String(minScore));
      if (options?.status) url.searchParams.set('status', options.status);
      if (options?.onlyActive) url.searchParams.set('onlyActive', 'true');

      const res = await fetch(url.toString(), {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.matches)) {
          return data.matches;
        }
      }
    } catch (err) {
      console.warn('[getMatchesForProperty] Falha em /api/matches:', err);
    }
    return [];
  }

  if (!tunnelClient) return [];

  let query = tunnelClient
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
    .eq('account_id', accountId)
    .eq('property_id', canonicalPropId)
    .eq('suppressed', false)
    .gte('match_score', minScore);

  if (options?.status) {
    query = query.eq('match_status', options.status);
  }

  if (options?.onlyActive) {
    query = query
      .is('contacts.paused_at', null)
      .is('contacts.archived_at', null)
      .gte('profile_maturity', 70);
  }

  query = query.order('commercial_priority', { ascending: false });

  const { data: rows, error } = await query;
  if (error || !rows) {
    console.error('[getMatchesForProperty] Erro:', error);
    return [];
  }

  // Busca shares correspondentes a este imóvel para histórico de envios
  const { data: shares } = await tunnelClient
    .from('property_shares')
    .select('*')
    .eq('account_id', accountId)
    .eq('property_id', canonicalPropId);

  const sharesByLead = new Map<string, PropertyShareRecord[]>();
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

  return rows.map((r: any) => {
    const contact = r.contacts;
    const name = contact?.name || 'Cliente';
    const initials = name
      .split(' ')
      .filter(Boolean)
      .map((w: string) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

    const leadShares = sharesByLead.get(r.lead_id) || [];
    const lastShare = leadShares.sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime())[0];

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
      shares: leadShares,
    };
  });
}

/**
 * FASE 11: Busca TODOS os Matches da conta para alimentar a Central MATCH do Meus Imóveis.
 */
export async function getAllMatches(options?: {
  accountId?: string;
  status?: MatchStatus;
  minScore?: number;
  search?: string;
}): Promise<MatchRecord[]> {
  const accountId = options?.accountId || DEFAULT_ACCOUNT_ID;
  const minScore = options?.minScore ?? 50;
  const status = options?.status || 'novo';

  if (typeof window !== 'undefined') {
    const authHeaders = await getAuthHeader();
    if (!authHeaders) {
      console.warn('[getAllMatches] Usuário não autenticado.');
      return [];
    }

    try {
      const url = new URL('/api/matches', window.location.origin);
      url.searchParams.set('status', status);
      url.searchParams.set('minScore', String(minScore));
      if (options?.search) url.searchParams.set('search', options.search);

      const res = await fetch(url.toString(), {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.matches)) {
          return data.matches;
        }
      }
    } catch (err) {
      console.warn('[getAllMatches] Falha em /api/matches:', err);
    }
    return [];
  }

  if (!tunnelClient) return [];

  let query = tunnelClient
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
    .eq('account_id', accountId)
    .eq('suppressed', false)
    .gte('match_score', minScore);

  if (options?.status) {
    query = query.eq('match_status', options.status);
  }

  query = query.order('commercial_priority', { ascending: false });

  const { data: rows, error } = await query;
  if (error || !rows) {
    console.error('[getAllMatches] Erro:', error);
    return [];
  }

  // Busca dados de projeção dos imóveis relacionados
  const propertyIds = Array.from(new Set(rows.map((r: any) => r.property_id)));
  const { data: propRows } = await tunnelClient
    .from('property_match_projections')
    .select('*')
    .eq('account_id', accountId)
    .in('property_id', propertyIds);

  const propMap = new Map<string, PropertyProjection>();
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

  return rows.map((r: any) => {
    const contact = r.contacts;
    const name = contact?.name || 'Cliente';
    const initials = name
      .split(' ')
      .filter(Boolean)
      .map((w: string) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();

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
      },
      property: propMap.get(r.property_id),
    };
  });
}

/**
 * FASE 14: Descartar Match (Supressão).
 * O par (lead_id, property_id) é marcado como suppressed = true no banco compartilhado.
 */
export async function suppressMatch(args: {
  matchId?: string;
  leadId: string;
  propertyId: string;
  accountId?: string;
}): Promise<boolean> {
  const accountId = args.accountId || DEFAULT_ACCOUNT_ID;
  const canonicalPropId = ensureUuid(args.propertyId);

  if (typeof window !== 'undefined') {
    const authHeaders = await getAuthHeader();
    if (!authHeaders) {
      console.warn('[suppressMatch] Usuário não autenticado.');
      return false;
    }

    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'suppress',
          matchId: args.matchId,
          leadId: args.leadId,
          propertyId: canonicalPropId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return Boolean(data.success);
      }
    } catch (err) {
      console.warn('[suppressMatch] Falha em /api/matches:', err);
    }
    return false;
  }

  if (!tunnelClient) return false;

  const { error } = await tunnelClient
    .from('lead_property_matches')
    .update({
      suppressed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('account_id', accountId)
    .eq('lead_id', args.leadId)
    .eq('property_id', canonicalPropId);

  return !error;
}

/**
 * FASE 15: Atualiza o status do Match ('novo' | 'enviado' | 'pausado' | 'arquivado').
 */
export async function updateMatchStatus(
  matchId: string,
  newStatus: MatchStatus,
  accountId: string = DEFAULT_ACCOUNT_ID
): Promise<boolean> {
  if (typeof window !== 'undefined') {
    const authHeaders = await getAuthHeader();
    if (!authHeaders) {
      console.warn('[updateMatchStatus] Usuário não autenticado.');
      return false;
    }

    try {
      const res = await fetch('/api/matches', {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update_status',
          matchId,
          newStatus,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return Boolean(data.success);
      }
    } catch (err) {
      console.warn('[updateMatchStatus] Falha em /api/matches:', err);
    }
    return false;
  }

  if (!tunnelClient) return false;
  const now = new Date().toISOString();
  const updateData: Record<string, any> = {
    match_status: newStatus,
    updated_at: now,
  };
  if (newStatus === 'enviado') updateData.sent_at = now;
  if (newStatus === 'pausado') updateData.paused_at = now;
  if (newStatus === 'arquivado') updateData.archived_at = now;

  const { error } = await tunnelClient
    .from('lead_property_matches')
    .update(updateData)
    .eq('id', matchId)
    .eq('account_id', accountId);

  return !error;
}

/**
 * FASE 9 & 10: Cria envio individual com token criptográfico novo.
 * Delega a criação do share ao WACRM (autoridade canônica de property_shares).
 */
export async function createPropertyShareAndSend(args: {
  leadId: string;
  propertyId: string;
  matchId?: string | null;
  messageText?: string | null;
  accountId?: string;
}): Promise<{
  success: boolean;
  share?: PropertyShareRecord;
  publicUrl: string;
  waLink: string;
}> {
  const canonicalPropId = ensureUuid(args.propertyId);

  // FASE 9: Canonicalização - WACRM é a autoridade canônica para criação de shares
  try {
    const res = await fetch('/api/tunnel/v1/shares/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lead_id: args.leadId,
        property_id: canonicalPropId,
        match_id: args.matchId || null,
        message_text: args.messageText || null,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        share: data.share,
        publicUrl: data.publicUrl,
        waLink: data.waLink,
      };
    } else {
      const errData = await res.json().catch(() => ({}));
      console.error('[createPropertyShareAndSend] Erro retornado pelo WACRM:', errData);
    }
  } catch (err) {
    console.error('[createPropertyShareAndSend] Falha ao comunicar com WACRM:', err);
  }

  return { success: false, publicUrl: '', waLink: '' };
}

/**
 * FASE 16: Histórico de envios de um imóvel (quais leads receberam, aberturas, interesses).
 */
export async function getPropertyShareHistory(
  propertyId: string,
  accountId: string = DEFAULT_ACCOUNT_ID
): Promise<PropertyShareRecord[]> {
  if (!tunnelClient) return [];
  const canonicalPropId = ensureUuid(propertyId);

  const { data: shares, error } = await tunnelClient
    .from('property_shares')
    .select(`
      id,
      account_id,
      lead_id,
      property_id,
      match_id,
      tracking_token,
      channel,
      message_text,
      sent_at,
      firstOpenedAt: first_opened_at,
      lastOpenedAt: last_opened_at,
      openCount: open_count,
      isInterested: is_interested,
      interestedAt: interested_at,
      revokedAt: revoked_at,
      contacts (
        id,
        name,
        phone
      )
    `)
    .eq('account_id', accountId)
    .eq('property_id', canonicalPropId)
    .order('sent_at', { ascending: false });

  if (error || !shares) {
    console.error('[getPropertyShareHistory] Erro:', error);
    return [];
  }

  return shares.map((s: any) => ({
    id: s.id,
    accountId: s.account_id,
    leadId: s.lead_id,
    propertyId: s.property_id,
    matchId: s.match_id,
    trackingToken: s.tracking_token,
    channel: s.channel,
    messageText: s.message_text,
    sentAt: s.sent_at,
    firstOpenedAt: s.firstOpenedAt,
    lastOpenedAt: s.lastOpenedAt,
    openCount: s.openCount || 0,
    isInterested: s.isInterested || false,
    interestedAt: s.interestedAt,
    revokedAt: s.revokedAt,
    leadName: s.contacts?.name || 'Cliente',
    leadPhone: s.contacts?.phone || '',
  }));
}

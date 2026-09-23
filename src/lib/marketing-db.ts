import { supabase } from './supabase';
import type {
  MarketingEditorialSettings,
  MarketingPost,
  InstagramAccount,
  PostStatus,
} from '../types/marketing';
import {
  DEFAULT_STRUCTURAL_SKILL,
  DEFAULT_REALTOR_PROFILE_SKILL,
  DEFAULT_NEGATIVE_RULES_SKILL,
} from '../types/marketing';

const LOCAL_STORAGE_SETTINGS_KEY = 'meus-imoveis:editorial-settings';

// ─── SKILLS EDITORIAIS ───────────────────────────────────────────────────────

export async function getEditorialSettings(): Promise<MarketingEditorialSettings> {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('marketing_editorial_settings')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return {
          id: data.id,
          structural_skill: data.structural_skill,
          realtor_profile_skill: data.realtor_profile_skill,
          negative_rules_skill: data.negative_rules_skill,
          created_at: data.created_at,
          updated_at: data.updated_at,
        };
      }
    } catch (e) {
      console.warn('Erro ao carregar editorial settings do Supabase:', e);
    }
  }

  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SETTINGS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}

  return {
    structural_skill: DEFAULT_STRUCTURAL_SKILL,
    realtor_profile_skill: DEFAULT_REALTOR_PROFILE_SKILL,
    negative_rules_skill: DEFAULT_NEGATIVE_RULES_SKILL,
  };
}

export async function saveEditorialSettings(
  settings: MarketingEditorialSettings
): Promise<MarketingEditorialSettings> {
  const payload = {
    structural_skill: settings.structural_skill,
    realtor_profile_skill: settings.realtor_profile_skill,
    negative_rules_skill: settings.negative_rules_skill,
    updated_at: new Date().toISOString(),
  };

  try {
    localStorage.setItem(LOCAL_STORAGE_SETTINGS_KEY, JSON.stringify({ ...settings, ...payload }));
  } catch {}

  if (supabase) {
    try {
      if (settings.id) {
        const { data, error } = await supabase
          .from('marketing_editorial_settings')
          .update(payload)
          .eq('id', settings.id)
          .select()
          .single();
        if (!error && data) return data;
      } else {
        const { data, error } = await supabase
          .from('marketing_editorial_settings')
          .insert(payload)
          .select()
          .single();
        if (!error && data) return data;
      }
    } catch (e) {
      console.warn('Erro ao salvar editorial settings no Supabase:', e);
    }
  }

  return { ...settings, ...payload };
}

// ─── POSTS DE MARKETING / CALENDÁRIO (AUTORIDADE: SUPABASE POSTGRESQL) ───────

export async function getMarketingPosts(): Promise<MarketingPost[]> {
  if (!supabase) {
    console.warn('Supabase não inicializado.');
    return [];
  }

  const { data, error } = await supabase
    .from('marketing_posts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Erro ao buscar marketing posts do Supabase:', error);
    return [];
  }

  return (data || []) as MarketingPost[];
}

const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const isValidUUID = (str?: string | null): boolean => {
  if (!str) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
};

export async function saveMarketingPost(post: MarketingPost): Promise<MarketingPost> {
  if (!supabase) {
    throw new Error('Supabase indisponível para persistir o post.');
  }

  const id = post.id && isValidUUID(post.id) ? post.id : generateUUID();
  const now = new Date().toISOString();

  const dbPayload = {
    id,
    listing_id: post.listing_id || null,
    property_snapshot: post.property_snapshot || {},
    caption: post.caption,
    media_urls: post.media_urls || [],
    cover_url: post.cover_url || null,
    post_type: post.post_type,
    channel: post.channel,
    status: post.status,
    scheduled_at: post.scheduled_at || null,
    published_at: post.published_at || null,
    provider: post.provider || 'instagram',
    external_media_id: post.external_media_id || null,
    last_error: post.last_error || null,
    retry_count: post.retry_count ?? 0,
    publishing_lock_until: post.publishing_lock_until || null,
    created_by: post.created_by || null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('marketing_posts')
    .upsert(dbPayload, { onConflict: 'id' })
    .select()
    .single();

  if (error) {
    console.error('Erro ao persistir post no Supabase:', error);
    throw new Error(`Falha ao salvar post no banco: ${error.message}`);
  }

  return data as MarketingPost;
}

export async function deleteMarketingPost(id: string): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase.from('marketing_posts').delete().eq('id', id);
  if (error) {
    console.error('Erro ao deletar post no Supabase:', error);
    return false;
  }
  return true;
}

export async function reschedulePost(
  postId: string,
  newScheduledAtIso: string
): Promise<MarketingPost | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('marketing_posts')
    .update({
      scheduled_at: newScheduledAtIso,
      status: 'scheduled',
      last_error: null,
      retry_count: 0,
      publishing_lock_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId)
    .select()
    .single();

  if (error) {
    console.error('Erro ao reagendar post no Supabase:', error);
    return null;
  }

  return data as MarketingPost;
}

export const rescheduleMarketingPost = reschedulePost;

// ─── INSTAGRAM ACCOUNT (SEGURANÇA RIGOROSA DE TOKENS) ───────────────────────

/**
 * Retorna dados públicos da conta conectada (SEM access_token por segurança)
 */
export async function getInstagramAccount(): Promise<InstagramAccount> {
  if (!supabase) {
    return { status: 'disconnected' };
  }

  try {
    const { data, error } = await supabase
      .from('marketing_instagram_accounts')
      .select('id, instagram_user_id, instagram_username, status, token_expires_at, updated_at, created_at')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return {
        id: data.id,
        instagram_user_id: data.instagram_user_id,
        instagram_username: data.instagram_username,
        status: data.status as any,
        token_expires_at: data.token_expires_at,
        updated_at: data.updated_at,
      };
    }
  } catch (e) {
    console.warn('Erro ao consultar conta Instagram no Supabase:', e);
  }

  return { status: 'disconnected' };
}

/**
 * Conecta ou atualiza conta do Instagram armazenando o token com segurança
 * no backend via stored procedure SECURITY DEFINER (tabela privada sem acesso do cliente)
 */
export async function saveInstagramAccountWithToken(params: {
  accountId?: string;
  instagramUserId: string;
  username: string;
  accountType?: string;
  accessToken: string;
  tokenExpiresAt?: string | null;
}): Promise<InstagramAccount> {
  if (!supabase) {
    throw new Error('Supabase indisponível.');
  }

  const { data, error } = await supabase.rpc('save_instagram_account_with_token', {
    p_account_id: params.accountId && isValidUUID(params.accountId) ? params.accountId : null,
    p_instagram_user_id: params.instagramUserId,
    p_username: params.username,
    p_account_type: params.accountType || 'BUSINESS',
    p_access_token: params.accessToken,
    p_token_expires_at: params.tokenExpiresAt || null,
  });

  if (error) {
    console.error('Erro ao salvar conta do Instagram via RPC:', error);
    throw new Error(`Falha ao conectar conta do Instagram: ${error.message}`);
  }

  return {
    id: data,
    instagram_user_id: params.instagramUserId,
    instagram_username: params.username,
    status: 'connected',
  };
}

/**
 * Desconecta a conta do Instagram e remove o token com segurança no banco
 */
export async function disconnectInstagramAccount(accountId?: string): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase.rpc('disconnect_instagram_account', {
    p_account_id: accountId || null,
  });

  if (error) {
    console.error('Erro ao desconectar conta do Instagram:', error);
    return false;
  }

  return true;
}

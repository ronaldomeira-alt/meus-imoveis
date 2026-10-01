import { supabase } from '../supabase';
import type {
  BotSettings,
  BotCampaign,
  BotMessageTemplate,
  BotCapture,
  BotExecutionRound,
  BotDashboardMetrics,
  CaptureStatus,
} from '../../types/bot-captador';

export async function getCurrentAccountId(): Promise<string | null> {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return profile?.account_id || null;
}

// ── 1. CONFIGURAÇÕES GERAIS ──────────────────────────────────────────────────

export async function getBotSettings(): Promise<BotSettings | null> {
  if (!supabase) return null;
  const accountId = await getCurrentAccountId();
  if (!accountId) return null;

  const { data, error } = await supabase
    .from('bot_settings')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    console.error('Erro ao buscar configurações do Bot Captador:', error);
    return null;
  }

  // Se não existir, inicializa com valores padrão seguros
  if (!data) {
    const defaultSettings: Partial<BotSettings> = {
      account_id: accountId,
      is_active: false,
      health_status: 'paused',
      health_reason: 'Bot pausado pelo usuário',
      retention_days: 40,
    };
    const { data: created, error: createErr } = await supabase
      .from('bot_settings')
      .insert(defaultSettings)
      .select()
      .single();

    if (createErr) {
      console.error('Erro ao inicializar configurações do Bot Captador:', createErr);
      return null;
    }
    return created;
  }

  return data;
}

export async function updateBotSettings(updates: Partial<BotSettings>): Promise<BotSettings | null> {
  if (!supabase) return null;
  const accountId = await getCurrentAccountId();
  if (!accountId) return null;

  const { data, error } = await supabase
    .from('bot_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .select()
    .single();

  if (error) {
    console.error('Erro ao atualizar configurações do Bot Captador:', error);
    throw error;
  }
  return data;
}

// ── 2. CAMPANHAS (VENDA E LOCAÇÃO) ───────────────────────────────────────────

export async function getBotCampaigns(): Promise<BotCampaign[]> {
  if (!supabase) return [];
  const accountId = await getCurrentAccountId();
  if (!accountId) return [];

  const { data, error } = await supabase
    .from('bot_campaigns')
    .select('*')
    .eq('account_id', accountId);

  if (error) {
    console.error('Erro ao buscar campanhas do Bot Captador:', error);
    return [];
  }

  // Garante que existam as 2 campanhas base (Venda e Locação)
  const existingTypes = new Set((data || []).map((c) => c.type));
  const missingCampaigns: Partial<BotCampaign>[] = [];

  if (!existingTypes.has('venda')) {
    missingCampaigns.push({
      account_id: accountId,
      type: 'venda',
      is_active: true,
      neighborhoods: ['Bessa', 'Manaíra', 'Tambaú', 'Cabo Branco', 'Altiplano'],
      min_price: 250000,
      max_price: 1500000,
      min_bedrooms: 2,
      max_bedrooms: 4,
      min_area: 50,
      max_area: 250,
      only_private: true,
      rounds_per_day: 2,
      schedule_times: ['09:00', '19:00'],
      max_contacts_per_round: 10,
    });
  }

  if (!existingTypes.has('locacao')) {
    missingCampaigns.push({
      account_id: accountId,
      type: 'locacao',
      is_active: false,
      neighborhoods: ['Bessa', 'Manaíra', 'Tambaú', 'Cabo Branco', 'Intermares'],
      min_price: 1500,
      max_price: 6000,
      min_bedrooms: 1,
      max_bedrooms: 3,
      min_area: 30,
      max_area: 150,
      only_private: true,
      rounds_per_day: 2,
      schedule_times: ['09:00', '19:00'],
      max_contacts_per_round: 10,
    });
  }

  if (missingCampaigns.length > 0) {
    const { data: created } = await supabase
      .from('bot_campaigns')
      .insert(missingCampaigns)
      .select();
    return [...(data || []), ...(created || [])];
  }

  return data || [];
}

export async function saveBotCampaign(campaign: Partial<BotCampaign> & { id: string }): Promise<BotCampaign | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('bot_campaigns')
    .update({ ...campaign, updated_at: new Date().toISOString() })
    .eq('id', campaign.id)
    .select()
    .single();

  if (error) {
    console.error('Erro ao salvar campanha:', error);
    throw error;
  }
  return data;
}

// ── 3. TEMPLATES DE MENSAGENS ────────────────────────────────────────────────

export async function getBotMessageTemplates(): Promise<BotMessageTemplate[]> {
  if (!supabase) return [];
  const accountId = await getCurrentAccountId();
  if (!accountId) return [];

  const { data, error } = await supabase
    .from('bot_message_templates')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro ao buscar templates de mensagem:', error);
    return [];
  }

  // Inicializa mensagens padrão caso nenhuma exista
  if (!data || data.length === 0) {
    const defaultTemplates = [
      {
        account_id: accountId,
        title: 'Abordagem Direta e Transparente',
        content: 'Olá! Vi seu anúncio e achei o imóvel muito interessante. Tenho clientes procurando nessa região e gostaria de saber se você aceita parceria para venda. Um abraço!',
      },
      {
        account_id: accountId,
        title: 'Abordagem Objetiva com Perfil de Comprador',
        content: 'Olá, tudo bem? Trabalho com foco nessa região e estou com clientes em busca de um imóvel com essa metragem. O anúncio ainda está disponível? Se sim, você aceita intermediação?',
      },
      {
        account_id: accountId,
        title: 'Abordagem Consultiva',
        content: 'Olá! Sou corretor especialista no bairro e acompanho as oportunidades locais. Parabéns pelo imóvel! Caso tenha interesse em apresentar para potenciais interessados da minha carteira, estou à disposição.',
      },
    ];

    const { data: created } = await supabase
      .from('bot_message_templates')
      .insert(defaultTemplates)
      .select();

    return created || [];
  }

  // Busca métricas associadas para cada mensagem
  const { data: captures } = await supabase
    .from('bot_captures')
    .select('message_template_id, status')
    .eq('account_id', accountId)
    .not('message_template_id', 'is', null);

  const metricsMap = new Map<string, { sent: number; responded: number; imported: number }>();

  (captures || []).forEach((c) => {
    if (!c.message_template_id) return;
    const current = metricsMap.get(c.message_template_id) || { sent: 0, responded: 0, imported: 0 };
    current.sent += 1;
    if (c.status === 'RESPONDED' || c.status === 'IMPORTED') {
      current.responded += 1;
    }
    if (c.status === 'IMPORTED') {
      current.imported += 1;
    }
    metricsMap.set(c.message_template_id, current);
  });

  return data.map((template) => {
    const metric = metricsMap.get(template.id) || { sent: 0, responded: 0, imported: 0 };
    return {
      ...template,
      sent_count: metric.sent,
      responses_count: metric.responded,
      response_rate: metric.sent > 0 ? (metric.responded / metric.sent) * 100 : 0,
      imported_count: metric.imported,
      conversion_rate: metric.sent > 0 ? (metric.imported / metric.sent) * 100 : 0,
    };
  });
}

export async function createBotMessageTemplate(title: string, content: string): Promise<BotMessageTemplate | null> {
  if (!supabase) return null;
  const accountId = await getCurrentAccountId();
  if (!accountId) return null;

  const { data, error } = await supabase
    .from('bot_message_templates')
    .insert({
      account_id: accountId,
      title: title.trim(),
      content: content.trim(),
    })
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar template:', error);
    throw error;
  }
  return data;
}

export async function updateBotMessageTemplate(id: string, title: string, content: string): Promise<BotMessageTemplate | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('bot_message_templates')
    .update({
      title: title.trim(),
      content: content.trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Erro ao atualizar template:', error);
    throw error;
  }
  return data;
}

export async function deleteBotMessageTemplate(id: string): Promise<boolean> {
  if (!supabase) return false;
  const accountId = await getCurrentAccountId();
  if (!accountId) return false;

  // Garante que não é possível excluir a última mensagem
  const { count } = await supabase
    .from('bot_message_templates')
    .select('*', { count: 'exact', head: true })
    .eq('account_id', accountId);

  if ((count || 0) <= 1) {
    throw new Error('O Bot Captador precisa de pelo menos uma mensagem de abordagem cadastrada.');
  }

  const { error } = await supabase
    .from('bot_message_templates')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Erro ao excluir template:', error);
    throw error;
  }
  return true;
}

// ── 4. CAPTAÇÕES (FILA & HISTÓRICO) ──────────────────────────────────────────

export async function getBotCaptures(options?: {
  status?: CaptureStatus | 'ALL';
  campaignType?: 'venda' | 'locacao' | 'ALL';
  limit?: number;
}): Promise<BotCapture[]> {
  if (!supabase) return [];
  const accountId = await getCurrentAccountId();
  if (!accountId) return [];

  let query = supabase
    .from('bot_captures')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (options?.status && options.status !== 'ALL') {
    query = query.eq('status', options.status);
  }
  if (options?.campaignType && options.campaignType !== 'ALL') {
    query = query.eq('campaign_type', options.campaignType);
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Erro ao buscar captações:', error);
    return [];
  }
  return data || [];
}

export async function updateBotCaptureStatus(
  captureId: string,
  status: CaptureStatus,
  extraUpdates?: Partial<BotCapture>
): Promise<boolean> {
  if (!supabase) return false;
  const updates: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
    ...extraUpdates,
  };

  if (status === 'RESPONDED' && !extraUpdates?.responded_at) {
    updates.responded_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('bot_captures')
    .update(updates)
    .eq('id', captureId);

  if (error) {
    console.error('Erro ao atualizar status da captação:', error);
    return false;
  }
  return true;
}

// ── 5. MÉTRICAS DO PAINEL ────────────────────────────────────────────────────

export async function getBotDashboardMetrics(days: 7 | 30 | 90 = 30): Promise<BotDashboardMetrics> {
  if (!supabase) {
    return {
      totalContacted: 0,
      totalResponded: 0,
      totalImported: 0,
      responseRate: 0,
      conversionRate: 0,
      waitingCount: 0,
      archivedCount: 0,
      trendSeries: [],
    };
  }

  const accountId = await getCurrentAccountId();
  if (!accountId) {
    return {
      totalContacted: 0,
      totalResponded: 0,
      totalImported: 0,
      responseRate: 0,
      conversionRate: 0,
      waitingCount: 0,
      archivedCount: 0,
      trendSeries: [],
    };
  }

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - days);
  const sinceIso = sinceDate.toISOString();

  const { data: captures, error } = await supabase
    .from('bot_captures')
    .select('id, status, contacted_at, responded_at, imported_property_id, created_at')
    .eq('account_id', accountId)
    .gte('created_at', sinceIso);

  if (error || !captures) {
    console.error('Erro ao calcular métricas do dashboard:', error);
    return {
      totalContacted: 0,
      totalResponded: 0,
      totalImported: 0,
      responseRate: 0,
      conversionRate: 0,
      waitingCount: 0,
      archivedCount: 0,
      trendSeries: [],
    };
  }

  let totalContacted = 0;
  let totalResponded = 0;
  let totalImported = 0;
  let waitingCount = 0;
  let archivedCount = 0;

  // Mapa diário para o gráfico de linha
  const trendMap = new Map<string, { contacted: number; responded: number; imported: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    trendMap.set(key, { contacted: 0, responded: 0, imported: 0 });
  }

  captures.forEach((c) => {
    if (c.contacted_at) {
      totalContacted += 1;
      const dayKey = c.contacted_at.split('T')[0];
      const entry = trendMap.get(dayKey);
      if (entry) entry.contacted += 1;
    }
    if (c.responded_at || c.status === 'RESPONDED' || c.status === 'IMPORTED') {
      totalResponded += 1;
      const dayKey = (c.responded_at || c.created_at).split('T')[0];
      const entry = trendMap.get(dayKey);
      if (entry) entry.responded += 1;
    }
    if (c.status === 'IMPORTED' || c.imported_property_id) {
      totalImported += 1;
      const dayKey = c.created_at.split('T')[0];
      const entry = trendMap.get(dayKey);
      if (entry) entry.imported += 1;
    }
    if (c.status === 'WAITING_RESPONSE') waitingCount += 1;
    if (c.status === 'ARCHIVED') archivedCount += 1;
  });

  const responseRate = totalContacted > 0 ? (totalResponded / totalContacted) * 100 : 0;
  const conversionRate = totalContacted > 0 ? (totalImported / totalContacted) * 100 : 0;

  const trendSeries = Array.from(trendMap.entries()).map(([date, counts]) => ({
    date,
    ...counts,
  }));

  return {
    totalContacted,
    totalResponded,
    totalImported,
    responseRate,
    conversionRate,
    waitingCount,
    archivedCount,
    trendSeries,
  };
}

// ── 6. HISTÓRICO DAS RODADAS ─────────────────────────────────────────────────

export async function getBotExecutionRounds(limit = 10): Promise<BotExecutionRound[]> {
  if (!supabase) return [];
  const accountId = await getCurrentAccountId();
  if (!accountId) return [];

  const { data, error } = await supabase
    .from('bot_execution_rounds')
    .select('*')
    .eq('account_id', accountId)
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Erro ao buscar histórico de rodadas:', error);
    return [];
  }
  return data || [];
}

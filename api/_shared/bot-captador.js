import { createClient } from '@supabase/supabase-js';

const ALLOWED_ADMIN_EMAIL = 'ronaldomeira@gmail.com';

async function authenticateRequest(req) {
  const cronSecretHeader = req.headers?.['x-cron-secret'];
  const bearer = String(req.headers?.authorization || '').match(/^Bearer (.+)$/i)?.[1];
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error('Serviço de banco não configurado no servidor.');
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Autorização via Cron Secret
  if (cronSecretHeader) {
    const { data: secretRow } = await db
      .from('marketing_internal_secrets')
      .select('secret_value')
      .eq('key_name', 'cron_secret')
      .maybeSingle();

    if (secretRow && secretRow.secret_value === cronSecretHeader) {
      return { db, authorizedBy: 'cron' };
    }
  }

  // 2. Autorização via JWT do Ronaldo
  if (bearer) {
    if (bearer === key) {
      return { db, authorizedBy: 'service_role' };
    }
    const { data, error } = await db.auth.getUser(bearer);
    if (!error && data?.user?.email?.toLowerCase() === ALLOWED_ADMIN_EMAIL) {
      return { db, authorizedBy: 'admin', user: data.user };
    }
  }

  return null;
}

export async function handleBotCaptadorRequest(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-cron-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const auth = await authenticateRequest(req);
    if (!auth) {
      return res.status(401).json({ error: 'Acesso não autorizado ao módulo Bot Captador.' });
    }

    const { db } = auth;
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }
    const { action = 'health', campaignType = 'both' } = body || {};

    if (action === 'health') {
      const { data: settings } = await db.from('bot_settings').select('*').limit(1).maybeSingle();
      return res.status(200).json({
        ok: true,
        botActive: Boolean(settings?.is_active),
        healthStatus: settings?.health_status || 'active',
        lastRoundAt: settings?.last_round_at || null,
      });
    }

    if (action === 'purge') {
      const { data: accounts } = await db.from('accounts').select('id');
      let totalPurged = 0;
      for (const acc of accounts || []) {
        const { data: count } = await db.rpc('purge_expired_bot_operations', { p_account_id: acc.id });
        totalPurged += Number(count || 0);
      }
      return res.status(200).json({ success: true, purgedCount: totalPurged });
    }

    return res.status(200).json({
      success: true,
      action,
      message: 'Ação executada com sucesso pelo orquestrador.',
    });
  } catch (err) {
    console.error('Erro na API Bot Captador:', err);
    return res.status(500).json({
      error: err?.message || 'Erro interno no processamento do Bot Captador.',
    });
  }
}

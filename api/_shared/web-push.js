// ==============================================================================
// HANDLER HTTP DE WEB PUSH NOTIFICATIONS — MEUS IMÓVEIS
// ==============================================================================

import {
  sendPushToAccount,
  buildRoundSummaryPush,
  buildOwnerRespondedPush,
  buildBotFailurePush,
} from './web-push-service.js';

export async function handleWebPushRequest(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-cron-secret');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        body = {};
      }
    }

    const { action = 'test', accountId, roundData, captureData, errorData } = body || {};

    if (!accountId) {
      return res.status(400).json({ error: 'accountId é obrigatório.' });
    }

    // ── 1. TESTE DE PUSH ──────────────────────────────────────────────────────
    if (action === 'test') {
      const payload = {
        title: 'Meus Imóveis — Teste de Push',
        body: 'Notificações push ativas! Você receberá os resumos de rodada e alertas do Bot Captador diretamente no seu aparelho.',
        icon: '/pwa-192.png',
        badge: '/favicon-32.png',
        tag: 'test-push-notification',
        url: '/configuracoes',
      };

      const result = await sendPushToAccount(accountId, payload);
      return res.status(200).json({
        success: true,
        sentCount: result.sentCount,
        totalTargeted: result.totalTargeted || 0,
        removedCount: result.removedCount || 0,
        message: result.sentCount > 0
          ? `Notificação enviada com sucesso para ${result.sentCount} aparelho(s)!`
          : 'Nenhum aparelho ativo encontrado ou falha no envio.',
      });
    }

    // ── 2. RESUMO DE RODADA DO BOT CAPTADOR ───────────────────────────────────
    if (action === 'round-summary') {
      const payload = buildRoundSummaryPush(roundData || {});
      const result = await sendPushToAccount(accountId, payload);
      return res.status(200).json({ success: true, ...result });
    }

    // ── 3. PROPRIETÁRIO RESPONDEU ─────────────────────────────────────────────
    if (action === 'owner-responded') {
      const payload = buildOwnerRespondedPush(captureData || {});
      const result = await sendPushToAccount(accountId, payload);
      return res.status(200).json({ success: true, ...result });
    }

    // ── 4. FALHA IMPORTANTE DO BOT ────────────────────────────────────────────
    if (action === 'bot-failure') {
      const payload = buildBotFailurePush(errorData || {});
      const result = await sendPushToAccount(accountId, payload);
      return res.status(200).json({ success: true, ...result });
    }

    return res.status(400).json({ error: `Ação '${action}' desconhecida.` });
  } catch (err) {
    console.error('Erro no processamento do Web Push:', err);
    return res.status(500).json({
      error: err?.message || 'Erro interno no envio de notificação push.',
    });
  }
}

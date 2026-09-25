/**
 * FASE 6, 7 & 8: Repassador / Proxy de Tracking do Meus Imóveis para o WACRM.
 * WACRM é a ÚNICA autoridade canônica para tracking.
 * Meus Imóveis NÃO grava diretamente em property_shares nem em tracking_events.
 */

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

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Método não permitido.' }));
  }

  const tunnelKey = process.env.TUNNEL_API_KEY;
  if (!tunnelKey) {
    console.error('[tracking-proxy] TUNNEL_API_KEY não configurada no servidor.');
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'TUNNEL_API_KEY não configurada no servidor.' }));
  }

  try {
    const body = await readBody(req);
    const trackingToken = String(body.tracking_token || '').trim();
    const eventName = String(body.event_name || '').trim();
    const propertyId = body.property_id ? String(body.property_id).trim() : null;
    const relatedPropertyId = body.related_property_id ? String(body.related_property_id).trim() : null;
    const timestamp = body.timestamp || new Date().toISOString();

    if (!trackingToken || !eventName) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'tracking_token e event_name são obrigatórios.' }));
    }

    const validEvents = ['public_link.opened', 'public_related_property.opened', 'public_interest.clicked'];
    if (!validEvents.includes(eventName)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'event_name inválido.' }));
    }

    // Repassa o evento diretamente para o WACRM (autoridade canônica de tracking)
    const wacrmUrl = process.env.WACRM_URL || 'http://localhost:3000';

    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${tunnelKey}`,
    };

    const wacrmRes = await fetch(`${wacrmUrl}/api/tunnel/v1/events/tracking`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tracking_token: trackingToken,
        event_name: eventName,
        property_id: propertyId,
        related_property_id: relatedPropertyId,
        timestamp,
      }),
    });

    const data = await wacrmRes.json().catch(() => ({}));
    res.statusCode = wacrmRes.status;
    return res.end(JSON.stringify(data));
  } catch (err) {
    console.error('[tracking-proxy] Erro ao repassar evento de tracking para WACRM:', err);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'Erro ao repassar evento de tracking.' }));
  }
}

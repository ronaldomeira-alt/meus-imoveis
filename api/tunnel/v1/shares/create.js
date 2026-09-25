/**
 * Proxy Server-Side Seguro para Criação de Compartilhamento (Meus Imóveis -> WACRM).
 * Executado exclusivamente no ambiente serverless (Node.js).
 * O navegador chama este endpoint localmente sem portar credenciais.
 * O Bearer token privado é injetado estritamente no servidor.
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

  const tunnelKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.TUNNEL_API_KEY;
  if (!tunnelKey) {
    console.error('[shares-create-proxy] Nenhuma credencial de túnel configurada no servidor.');
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'Credenciais do túnel não configuradas no servidor.' }));
  }

  try {
    const body = await readBody(req);
    const wacrmUrl = process.env.WACRM_URL || 'http://localhost:3000';

    const wacrmRes = await fetch(`${wacrmUrl}/api/tunnel/v1/shares/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tunnelKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = await wacrmRes.json().catch(() => ({}));
    res.statusCode = wacrmRes.status;
    return res.end(JSON.stringify(data));
  } catch (err) {
    console.error('[shares-create-proxy] Falha ao encaminhar requisição ao WACRM:', err);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'Falha ao conectar com o serviço WACRM.' }));
  }
}

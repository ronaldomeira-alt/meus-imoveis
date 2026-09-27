import { authenticateMatchesRequest } from './matches.js';

export async function handlePropertyDeletion(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const reply = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  if (req.method !== 'DELETE') return reply(405, { error: 'Método não permitido.' });
  try {
    const auth = await authenticateMatchesRequest(req);
    if (!auth.authorized) return reply(auth.status, { error: auth.error });
    const params = new URL(req.url, 'http://local').searchParams;
    const propertyId = params.get('propertyId');
    if (params.has('accountId') || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(propertyId || '')) {
      return reply(400, { error: 'Identificador de imóvel inválido.' });
    }
    const { error } = await auth.db.rpc('delete_match_property', {
      p_account_id: auth.canonicalAccountId,
      p_property_id: propertyId,
    });
    if (error) throw error;
    return reply(200, { success: true, propertyId });
  } catch (error) {
    console.error('[delete-property]', error);
    return reply(500, { error: 'Não foi possível excluir o imóvel dos matches. Tente novamente.' });
  }
}

import type { Config } from '@netlify/functions';
import { getSessionUser, publicUser } from '../lib/auth.mjs';
export default async (request: Request) => {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Cookie' });
  if (request.method !== 'GET') { headers.set('Allow', 'GET'); return Response.json({ error: 'Método inválido.' }, { status: 405, headers }); }
  try { const user = await getSessionUser(request); return Response.json({ authenticated: !!user, user: user ? publicUser(user) : null }, { status: user ? 200 : 401, headers }); }
  catch { return Response.json({ error: 'Não foi possível verificar a sessão.' }, { status: 503, headers }); }
};
// Session polling is separate from the stricter login-attempt budget on shared school networks.
export const config: Config = { path: '/api/session', rateLimit: { windowLimit: 300, windowSize: 60, aggregateBy: ['ip', 'domain'] } };

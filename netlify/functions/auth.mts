import type { Config } from '@netlify/functions';
import { credentials, matches, isAuthenticated, createSession, revokeSession, sessionCookie, sameOrigin } from '../lib/auth.mjs';

export default async (request: Request) => {
  const route = new URL(request.url).pathname;
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Cookie' });
  const respond = (data: unknown, status = 200) => Response.json(data, { status, headers });
  const method = route === '/api/session' ? 'GET' : 'POST';
  if (request.method !== method) {
    headers.set('Allow', method);
    return respond({ error: 'Método inválido' }, 405);
  }
  if (method === 'POST' && !sameOrigin(request)) return respond({ error: 'Origem inválida' }, 403);
  try {
    if (route !== '/api/logout' && (!Netlify.env.get('AUTH_USER') || !Netlify.env.get('AUTH_PASSWORD'))) {
      return respond({ authenticated: false, code: 'AUTH_NOT_CONFIGURED', error: 'O acesso ainda não foi configurado. Entre em contato com o responsável pelo aplicativo.' }, 503);
    }
    if (route === '/api/session') {
      const authenticated = await isAuthenticated(request);
      return respond({ authenticated }, authenticated ? 200 : 401);
    }
    if (route === '/api/logout') {
      await revokeSession(request);
      headers.set('Set-Cookie', sessionCookie(request));
      return respond({ authenticated: false });
    }
    if (!request.headers.get('content-type')?.includes('application/json')) return respond({ error: 'Formato inválido' }, 415);
    const raw = await request.text();
    if (raw.length > 4096) return respond({ error: 'Requisição muito grande' }, 413);
    let input;
    try { input = JSON.parse(raw); } catch { return respond({ error: 'Dados inválidos' }, 400); }
    const expected = credentials();
    const validUser = matches(typeof input?.username === 'string' ? input.username : '', expected.username);
    const validPassword = matches(typeof input?.password === 'string' ? input.password : '', expected.password);
    if (!validUser || !validPassword) return respond({ error: 'Usuário ou senha incorretos' }, 401);
    headers.set('Set-Cookie', await createSession(request, input?.rememberMe === true));
    return respond({ authenticated: true });
  } catch {
    return respond({ error: 'Não foi possível conectar. Tente novamente em instantes.' }, 503);
  }
};

export const config: Config = {
  path: ['/api/login', '/api/session', '/api/logout'],
  rateLimit: { windowLimit: 20, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

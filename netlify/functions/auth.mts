import type { Config } from '@netlify/functions';
import { database } from '../lib/database.mjs';
import { appUsers, authSessions } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { verifyPassword, hashPassword, getSessionUser, publicUser, createSession, revokeSession, sessionCookie, sameOrigin } from '../lib/auth.mjs';
// A fixed dummy hash makes unknown-account password checks perform the same expensive KDF.
const DUMMY_HASH = 'scrypt:00000000000000000000000000000000:' + '0'.repeat(128);
export default async (request: Request) => {
  const route = new URL(request.url).pathname;
  const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Cookie' });
  const respond = (data: unknown, status = 200) => Response.json(data, { status, headers });
  const method = route === '/api/session' ? 'GET' : 'POST';
  if (!['/api/login','/api/session','/api/logout','/api/password'].includes(route)) return respond({ error: 'Rota inválida' },404);
  if (request.method !== method) { headers.set('Allow',method); return respond({error:'Método inválido'},405); }
  if (method === 'POST' && !sameOrigin(request)) return respond({error:'Origem inválida'},403);
  try {
    if (route === '/api/session') { const user = await getSessionUser(request); return respond({authenticated:!!user, user:user ? publicUser(user) : null},user ? 200 : 401); }
    if (route === '/api/logout') { await revokeSession(request); headers.set('Set-Cookie',sessionCookie(request)); return respond({authenticated:false}); }
    if (!request.headers.get('content-type')?.includes('application/json')) return respond({error:'Formato inválido'},415);
    const raw = await request.text(); if (raw.length>4096) return respond({error:'Requisição muito grande'},413);
    let input; try { input=JSON.parse(raw); } catch { return respond({error:'Dados inválidos'},400); }
    if (route === '/api/password') {
      const user=await getSessionUser(request); if (!user) return respond({error:'Sessão encerrada'},401);
      if (typeof input?.currentPassword!=='string' || input.currentPassword.length>128 || !await verifyPassword(input.currentPassword,user.passwordHash)) return respond({error:'Senha atual incorreta'},400);
      if (typeof input?.newPassword!=='string' || input.newPassword.length<12 || input.newPassword.length>128 || input.newPassword===input.currentPassword) return respond({error:'Use uma senha nova com 12 a 128 caracteres.'},400);
      const passwordHash=await hashPassword(input.newPassword);
      const [updated]=await database().update(appUsers).set({passwordHash,mustChangePassword:false}).where(and(eq(appUsers.id,user.id),eq(appUsers.passwordHash,user.passwordHash),eq(appUsers.active,true))).returning();
      if (!updated) return respond({error:'Seu acesso mudou. Entre novamente.'},409);
      await database().delete(authSessions).where(eq(authSessions.userId,user.id));
      headers.set('Set-Cookie',await createSession(request,updated)); return respond({authenticated:true,user:publicUser(updated)});
    }
    const email=typeof input?.username==='string' ? input.username.trim().toLowerCase() : '';
    const password=typeof input?.password==='string' ? input.password : '';
    if (email.length>200 || password.length>128) return respond({error:'Usuário ou senha incorretos'},401);
    const [user]=await database().select().from(appUsers).where(eq(appUsers.email,email));
    const valid=await verifyPassword(password,user?.passwordHash || DUMMY_HASH);
    if (!user || !user.active || !valid) return respond({error:'Usuário ou senha incorretos'},401);
    headers.set('Set-Cookie',await createSession(request,user,input?.rememberMe===true));
    return respond({authenticated:true,user:publicUser(user)});
  } catch { return respond({error:'Não foi possível conectar. Tente novamente em instantes.'},503); }
};
export const config: Config = { path:['/api/login','/api/session','/api/logout','/api/password'], rateLimit:{windowLimit:20,windowSize:60,aggregateBy:['ip','domain']} };

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { database } from './database.mjs';
import { and, eq, gt, lt } from 'drizzle-orm';
import { authSessions } from '../../db/schema.js';

export function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
export function credentials() {
  // Credentials are runtime configuration only, never bundled in the client or repository.
  const username = Netlify.env.get('AUTH_USER');
  const password = Netlify.env.get('AUTH_PASSWORD');
  if (!username || !password) throw new Error('Authentication configuration unavailable');
  return { username, password, fingerprint: digest(JSON.stringify([username, password])) };
}
export function matches(actual: string, expected: string) {
  return timingSafeEqual(Buffer.from(digest(actual)), Buffer.from(digest(expected)));
}
export function readToken(request: Request) {
  return request.headers.get('cookie')?.match(/(?:^|;\s*)eduscale_session=([a-f0-9]{64})(?:;|$)/)?.[1];
}
export function sessionCookie(request: Request, token = '', maxAge: number | null = 0) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  const expiration = maxAge === null ? '' : `; Max-Age=${maxAge}`;
  return `eduscale_session=${token}; Path=/; HttpOnly; SameSite=Lax${expiration}${secure}`;
}
export async function isAuthenticated(request: Request) {
  const token = readToken(request);
  if (!token) return false;
  const [session] = await database().select().from(authSessions).where(and(
    eq(authSessions.tokenHash, digest(token)), gt(authSessions.expiresAt, new Date()),
    eq(authSessions.credentialHash, credentials().fingerprint)
  ));
  return !!session;
}
export async function revokeSession(request: Request) {
  const token = readToken(request);
  if (token) await database().delete(authSessions).where(eq(authSessions.tokenHash, digest(token)));
}
export async function createSession(request: Request, rememberMe = false) {
  const db = database();
  await revokeSession(request);
  await db.delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
  const token = randomBytes(32).toString('hex');
  const lifetime = rememberMe ? 60 * 60 * 24 * 30 : 60 * 60 * 8;
  await db.insert(authSessions).values({ tokenHash: digest(token), credentialHash: credentials().fingerprint,
    expiresAt: new Date(Date.now() + lifetime * 1000) });
  return sessionCookie(request, token, rememberMe ? lifetime : null);
}
export function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin;
}

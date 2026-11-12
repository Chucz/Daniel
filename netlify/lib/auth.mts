import { createHash, randomBytes, timingSafeEqual, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { database } from './database.mjs';
import { and, eq, gt, lt } from 'drizzle-orm';
import { authSessions, appUsers } from '../../db/schema.js';
const scrypt = promisify(scryptCallback);
export function digest(value: string) { return createHash('sha256').update(value).digest('hex'); }
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt' || !/^[a-f0-9]{32}$/.test(parts[1]) || !/^[a-f0-9]{128}$/.test(parts[2])) return false;
  const key = await scrypt(password, parts[1], 64) as Buffer;
  return timingSafeEqual(key, Buffer.from(parts[2], 'hex'));
}
export function readToken(request: Request) { return request.headers.get('cookie')?.match(/(?:^|;\s*)eduscale_session=([a-f0-9]{64})(?:;|$)/)?.[1]; }
export function sessionCookie(request: Request, token = '', maxAge: number | null = 0) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `eduscale_session=${token}; Path=/; HttpOnly; SameSite=Strict${maxAge === null ? '' : `; Max-Age=${maxAge}`}${secure}`;
}
export async function getSessionUser(request: Request) {
  const token = readToken(request); if (!token) return null;
  const [row] = await database().select({ user: appUsers, credentialHash: authSessions.credentialHash }).from(authSessions)
    .innerJoin(appUsers, eq(authSessions.userId, appUsers.id))
    .where(and(eq(authSessions.tokenHash, digest(token)), gt(authSessions.expiresAt, new Date()), eq(appUsers.active, true)));
  if (!row || row.credentialHash !== digest(row.user.passwordHash)) return null;
  return row.user;
}
export async function isAuthenticated(request: Request) { return !!await getSessionUser(request); }
export function publicUser(user: typeof appUsers.$inferSelect) { return { id: user.id, email: user.email, name: user.name, role: user.role, mustChangePassword: user.mustChangePassword }; }
export async function revokeSession(request: Request) { const token = readToken(request); if (token) await database().delete(authSessions).where(eq(authSessions.tokenHash, digest(token))); }
export async function createSession(request: Request, user: typeof appUsers.$inferSelect, rememberMe = false) {
  const db = database(); await revokeSession(request); await db.delete(authSessions).where(lt(authSessions.expiresAt, new Date()));
  const token = randomBytes(32).toString('hex'); const lifetime = rememberMe && !user.mustChangePassword ? 60*60*24*7 : 60*60*8;
  await db.insert(authSessions).values({ tokenHash: digest(token), credentialHash: digest(user.passwordHash), userId: user.id, expiresAt: new Date(Date.now()+lifetime*1000) });
  return sessionCookie(request, token, rememberMe ? lifetime : null);
}
export function sameOrigin(request: Request) { return request.headers.get('origin') === new URL(request.url).origin; }

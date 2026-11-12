import type { Config } from '@netlify/functions';
import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { database } from '../lib/database.mjs';
import { appUsers, authSessions, userAudit } from '../../db/schema.js';
import { getSessionUser, hashPassword, sameOrigin } from '../lib/auth.mjs';
import { ACCESS_ROLES, canManageUsers, safeUser } from '../lib/access.mjs';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const validName = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 200 && !/[\u0000-\u001f\u007f]/.test(v);
const validEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && !/[\u0000-\u001f\u007f]/.test(v);
const version = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
export default async (request: Request) => {
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Vary': 'Cookie', 'Pragma': 'no-cache' });
  const respond = (data: unknown, status = 200) => Response.json(data, { status, headers });
  let actor;
  try { actor = await getSessionUser(request); }
  catch { return respond({ error: 'Não foi possível verificar a sessão.' }, 503); }
  if (!actor) return respond({ error: 'Sessão encerrada. Entre novamente.' }, 401);
  if (!canManageUsers(actor)) return respond({ error: 'Somente administradores podem gerenciar usuários.', code: 'FORBIDDEN' }, 403);
  if (!['GET', 'POST', 'PATCH'].includes(request.method)) { headers.set('Allow', 'GET, POST, PATCH'); return respond({ error: 'Método inválido.' }, 405); }
  if (request.method !== 'GET' && !sameOrigin(request)) return respond({ error: 'Origem inválida.' }, 403);
  try {
    const db = database();
    if (request.method === 'GET') {
      const url = new URL(request.url);
      if (url.searchParams.get('view') === 'audit') {
        const rows = await db.select().from(userAudit).orderBy(desc(userAudit.createdAt)).limit(100);
        return respond({ entries: rows });
      }
      const users = await db.select().from(appUsers).orderBy(desc(appUsers.isPrimary), asc(appUsers.name));
      return respond({ users: users.map(safeUser) });
    }
    if (!request.headers.get('content-type')?.includes('application/json')) return respond({ error: 'Formato inválido.' }, 415);
    const raw = await request.text(); if (raw.length > 4096) return respond({ error: 'Requisição muito grande.' }, 413);
    let input; try { input = JSON.parse(raw); } catch { return respond({ error: 'Dados inválidos.' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return respond({ error: 'Dados inválidos.' }, 400);
    const creating = request.method === 'POST';
    const allowed = creating ? ['name', 'email', 'role'] : ['id', 'version', 'action', 'name', 'role', 'active'];
    if (Object.keys(input).some(key => !allowed.includes(key))) return respond({ error: 'A solicitação contém campos não permitidos.' }, 400);
    if (creating && (!validName(input.name) || typeof input.email !== 'string' || !validEmail(input.email.trim().toLowerCase()) || !ACCESS_ROLES.includes(input.role))) return respond({ error: 'Informe nome, e-mail válido e perfil de acesso.' }, 400);
    if (!creating && ((typeof input.id !== 'string' || !uuid.test(input.id)) || !version(input.version) || !['update', 'set_active', 'reset_password'].includes(input.action))) return respond({ error: 'Dados inválidos.' }, 400);
    if (!creating && input.action === 'update' && (!validName(input.name) || !ACCESS_ROLES.includes(input.role) || input.active !== undefined)) return respond({ error: 'Informe nome e perfil válidos.' }, 400);
    if (!creating && input.action === 'set_active' && (typeof input.active !== 'boolean' || input.name !== undefined || input.role !== undefined)) return respond({ error: 'Estado de acesso inválido.' }, 400);
    if (!creating && input.action === 'reset_password' && [input.name, input.role, input.active].some(value => value !== undefined)) return respond({ error: 'Dados inválidos.' }, 400);
    // Passwords are returned only with a successful creation/reset response, never stored in audit.
    const temporaryPassword = creating || input.action === 'reset_password' ? randomBytes(24).toString('base64url') : undefined;
    const passwordHash = temporaryPassword ? await hashPassword(temporaryPassword) : undefined;
    return await db.transaction(async (tx: any) => {
      await tx.execute(sql`select pg_advisory_xact_lock(182736452)`);
      const [currentActor] = await tx.select().from(appUsers).where(eq(appUsers.id, actor.id)).for('update');
      if (!currentActor || !currentActor.active || currentActor.passwordHash !== actor.passwordHash || !canManageUsers(currentActor)) return respond({ error: 'Seu acesso mudou. Entre novamente.', code: 'FORBIDDEN' }, 403);
      if (creating) {
        const [created] = await tx.insert(appUsers).values({ email: input.email.trim().toLowerCase(), name: input.name.trim(), role: input.role, passwordHash, active: true, mustChangePassword: true }).returning();
        await tx.insert(userAudit).values({ actorId: actor.id, targetId: created.id, action: 'create', beforeState: null, afterState: safeUser(created) });
        return respond({ user: safeUser(created), temporaryPassword }, 201);
      }
      const [target] = await tx.select().from(appUsers).where(eq(appUsers.id, input.id)).for('update');
      if (!target) return respond({ error: 'Usuário não encontrado.' }, 404);
      if (target.version !== input.version) return respond({ error: 'Este usuário foi alterado por outra pessoa. Atualize a lista e revise a alteração.', code: 'VERSION_CONFLICT' }, 409);
      if (target.isPrimary && (input.action === 'reset_password' || input.action === 'set_active' || input.role !== 'admin')) return respond({ error: 'A conta principal é protegida. A senha só pode ser alterada pelo titular em Minha conta.', code: 'PRIMARY_ACCOUNT_PROTECTED' }, 403);
      // Avoid orphaning the current administrator's session or losing the one-time secret in a self reset.
      if (target.id === actor.id && (input.action === 'reset_password' || (input.action === 'set_active' && !input.active) || (input.action === 'update' && input.role !== 'admin'))) return respond({ error: 'Não é possível remover seu próprio acesso administrativo nesta tela.' }, 403);
      const changes: any = { version: target.version + 1 };
      let action = 'update';
      if (input.action === 'update') { changes.name = input.name.trim(); changes.role = input.role; }
      if (input.action === 'set_active') { changes.active = input.active; action = input.active ? 'activate' : 'deactivate'; }
      if (input.action === 'reset_password') { changes.passwordHash = passwordHash; changes.mustChangePassword = true; action = 'reset_password'; }
      const [updated] = await tx.update(appUsers).set(changes).where(and(eq(appUsers.id, target.id), eq(appUsers.version, input.version))).returning();
      if (!updated) return respond({ error: 'Este usuário foi alterado por outra pessoa.', code: 'VERSION_CONFLICT' }, 409);
      if ((input.action === 'set_active' && !input.active) || input.action === 'reset_password') await tx.delete(authSessions).where(eq(authSessions.userId, target.id));
      await tx.insert(userAudit).values({ actorId: actor.id, targetId: target.id, action, beforeState: safeUser(target), afterState: safeUser(updated) });
      return respond({ user: safeUser(updated), ...(temporaryPassword ? { temporaryPassword } : {}) });
    });
  } catch (error: any) {
    if (error?.code === '23505' || error?.cause?.code === '23505') return respond({ error: 'Já existe um usuário com este e-mail.' }, 409);
    return respond({ error: 'Não foi possível concluir a operação. Atualize a lista antes de tentar novamente.' }, 503);
  }
};
export const config: Config = { path: '/api/users', rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] } };

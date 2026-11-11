import { database } from '../lib/database.mjs';
import { eq } from 'drizzle-orm';
import { schedules } from '../../db/schema.js';
import { isAuthenticated } from '../lib/auth.mjs';

// Each browser owns its schedule, as in the previous local-only application.
export default async (request: Request) => {
  const headers = new Headers({ 'Cache-Control': 'no-store' });
  const respond = (data: unknown, status = 200) => Response.json(data, { status, headers });
  try {
    if (!await isAuthenticated(request)) return respond({ error: 'Sessão encerrada. Entre novamente.' }, 401);
  } catch {
    return respond({ error: 'Não foi possível verificar a sessão' }, 503);
  }
  if (!['GET', 'PUT'].includes(request.method)) return respond({ error: 'Método inválido' }, 405);
  if (request.method === 'PUT' && request.headers.get('origin') !== new URL(request.url).origin) {
    return respond({ error: 'Origem inválida' }, 403);
  }
  const cookie = request.headers.get('cookie')?.match(/(?:^|;\s*)eduscale_schedule=([a-f0-9-]{36})(?:;|$)/)?.[1];
  const id = cookie || crypto.randomUUID();
  if (!cookie) {
    if (request.method !== 'GET') return respond({ error: 'Recarregue a aplicação' }, 401);
    headers.set('Set-Cookie', `eduscale_schedule=${id}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=31536000`);
  }
  try {
    const db = database();
    if (request.method === 'GET') {
      const [row] = await db.select().from(schedules).where(eq(schedules.id, id));
      return respond(row?.data || { teachers: { titulares: [], substitutos: [] }, slots: {} });
    }
    if (!request.headers.get('content-type')?.includes('application/json')) return respond({ error: 'Formato inválido' }, 415);
    const raw = await request.text();
    if (raw.length > 1000000) return respond({ error: 'Grade muito grande' }, 413);
    let data;
    try { data = JSON.parse(raw); } catch { return respond({ error: 'JSON inválido' }, 400); }
    const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 200;
    if (!data || !Array.isArray(data.teachers?.titulares) || !Array.isArray(data.teachers?.substitutos) ||
        !data.teachers.titulares.every(text) || !data.teachers.substitutos.every((s: any) => s && text(s.name) && text(s.phone)) ||
        !data.slots || typeof data.slots !== 'object' || Array.isArray(data.slots) ||
        !Object.values(data.slots).every((s: any) => s && text(s.id) && text(s.day) && text(s.shift) && text(s.className) && text(s.slotId) && text(s.slotLabel) && text(s.timeRange) && text(s.regularTeacher) && ['regular', 'falta', 'substituido'].includes(s.status) && (s.substituteTeacher === null || text(s.substituteTeacher)))) {
      return respond({ error: 'Dados inválidos' }, 400);
    }
    await db.insert(schedules).values({ id, data }).onConflictDoUpdate({ target: schedules.id, set: { data } });
    return respond({ saved: true });
  } catch {
    return respond({ error: 'Não foi possível acessar a grade' }, 503);
  }
};

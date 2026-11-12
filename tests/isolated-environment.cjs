const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const { drizzle } = require('drizzle-orm/pglite');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const OWNER_EMAIL = 'danielchuczman@gmail.com';
const TEST_PASSWORD = 'Isolated-fixture-password-123!';
async function buildTestModules() {
  const outdir = path.join(root, '.test-build'); fs.mkdirSync(outdir, { recursive: true });
  const dbPlugin = { name: 'isolated-test-database', setup(build) {
    build.onResolve({ filter: /database\.mjs$/ }, () => ({ path: 'isolated-db', namespace: 'test-db' }));
    build.onLoad({ filter: /.*/, namespace: 'test-db' }, () => ({ contents: 'export function database(){return globalThis.__eduscaleIsolatedDb}', loader: 'js' }));
  } };
  const modules = { auth: 'netlify/functions/auth.mts', session: 'netlify/functions/session.mts', users: 'netlify/functions/users.mts', schedule: 'netlify/functions/schedule.mts', crypto: 'netlify/lib/auth.mts' };
  for (const [name, entry] of Object.entries(modules)) {
    const output = path.join(outdir, name + '.cjs');
    await esbuild.build({ entryPoints: [path.join(root, entry)], outfile: output, bundle: true, platform: 'node', format: 'cjs', nodePaths: (process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean), plugins: [dbPlugin], logLevel: 'silent' });
    delete require.cache[output]; modules[name] = require(output);
  }
  return modules;
}
function fixtureSchedule() {
  return { teachers: { titulares: ['Titular de teste'], substitutos: [{ name: "Substituto O'Connor <teste>", phone: '' }] }, slots: {
    lesson: { id: 'lesson', day: 'Segunda-feira', shift: 'Manhã', className: '9º Ano A', slotId: 'm1', slotLabel: '1ª Aula', timeRange: '07:00 - 07:50', regularTeacher: 'Titular de teste', status: 'falta', substituteTeacher: null, substituteSelectedBy: null }
  } };
}
async function createTestEnvironment() {
  const modules = await buildTestModules();
  const pg = new PGlite(); await pg.waitReady;
  await pg.exec('create role anon; create role authenticated;');
  await pg.exec(fs.readFileSync(path.join(root, 'db/supabase-setup.sql'), 'utf8'));
  await pg.exec(fs.readFileSync(path.join(root, 'db/security-hardening.sql'), 'utf8'));
  const initialHash = await modules.crypto.hashPassword(TEST_PASSWORD);
  const ownerId = crypto.randomUUID(), legacyId = crypto.randomUUID();
  await pg.query('insert into public.app_users(id,email,name,password_hash,role,must_change_password) values($1,$2,$3,$4,$5,false),($6,$7,$8,$4,$9,false)', [ownerId, OWNER_EMAIL, 'Administrador fictício de teste', initialHash, 'admin', legacyId, 'legacy@example.invalid', 'Gestor legado fictício', 'gestor']);
  await pg.exec(fs.readFileSync(path.join(root, 'db/user-management.sql'), 'utf8'));
  await pg.query('insert into public.schedules(id,data) values($1,$2)', ['00000000-0000-4000-8000-000000000001', JSON.stringify(fixtureSchedule())]);
  await pg.exec('set role eduscale_app;');
  globalThis.__eduscaleIsolatedDb = drizzle({ client: pg });
  const handlerFor = url => url.pathname === '/api/users' ? modules.users.default : url.pathname === '/api/session' ? modules.session.default : url.pathname.startsWith('/api/') ? modules.auth.default : modules.schedule.default;
  async function request(route, { method = 'GET', body, cookie, headers = {}, origin = 'https://isolated.test' } = {}) {
    const url = new URL(route, 'https://isolated.test');
    return handlerFor(url)(new Request(url, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(method !== 'GET' ? { Origin: origin } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }));
  }
  async function login(email = OWNER_EMAIL, password = TEST_PASSWORD) {
    const response = await request('/api/login', { method: 'POST', body: { username: email, password } });
    const data = await response.json();
    if (response.status !== 200) throw new Error('Fixture login failed: ' + response.status + ' ' + data.error);
    return { cookie: response.headers.get('set-cookie').split(';')[0], user: data.user };
  }
  return { pg, modules, request, login, ownerId, legacyId, initialHash, close: () => pg.close() };
}
module.exports = { createTestEnvironment, fixtureSchedule, TEST_PASSWORD, OWNER_EMAIL };

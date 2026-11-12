const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), os = require('node:os');
const { performance } = require('node:perf_hooks');
const assert = require('node:assert/strict');
const { createTestEnvironment, TEST_PASSWORD } = require('./isolated-environment.cjs');
const root = path.resolve(__dirname, '..');
function representativeSchedule() {
  const context = vm.createContext({ navigator: { userAgent: '' }, location: { hash: '' }, window: { navigator: {}, addEventListener() {}, matchMedia: () => ({ matches: false }) }, document: { referrer: '', addEventListener() {} }, setTimeout() {}, clearTimeout() {} });
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/checkSession\(\);\s*$/, ''), context);
  const data = vm.runInContext('initDefaultSlots(); JSON.parse(JSON.stringify({teachers:state.teachers,slots:state.slots}))', context);
  data.teachers.titulares = ['Titular fictício de carga']; data.teachers.substitutos = [{ name: 'Substituto fictício de carga', phone: '' }];
  for (const slot of Object.values(data.slots)) slot.regularTeacher = 'Titular fictício de carga';
  return data;
}
async function runLoadTest() {
  const env = await createTestEnvironment();
  try {
    const owner = await env.login(); const users = [];
    for (let i = 0; i < 10; i++) {
      const created = await env.request('/api/users', { method: 'POST', cookie: owner.cookie, body: { name: 'Pessoa fictícia ' + i, email: `load-${i}@example.invalid`, role: 'editor' } });
      const account = await created.json(); assert.equal(created.status, 201, account.error);
      const initial = await env.login(account.user.email, account.temporaryPassword);
      const changed = await env.request('/api/password', { method: 'POST', cookie: initial.cookie, body: { currentPassword: account.temporaryPassword, newPassword: TEST_PASSWORD } });
      assert.equal(changed.status, 200); users.push({ cookie: changed.headers.get('set-cookie').split(';')[0], id: account.user.id });
    }
    const data = representativeSchedule();
    await env.pg.query('update public.schedules set data=$1', [JSON.stringify(data)]);
    const scenarios = [];
    for (const count of [5, 10]) {
      const timings = []; let requests = 0;
      const begin = performance.now();
      await Promise.all(users.slice(0, count).map(async user => {
        for (let round = 0; round < 5; round++) {
          const start = performance.now();
          const session = await env.request('/api/session', { cookie: user.cookie }); assert.equal(session.status, 200);
          const schedule = await env.request('/.netlify/functions/schedule', { cookie: user.cookie }); assert.equal(schedule.status, 200); assert.ok(schedule.headers.get('x-schedule-revision')); await schedule.json();
          timings.push(performance.now() - start); requests += 2;
        }
      }));
      const elapsed = performance.now() - begin, sorted = timings.slice().sort((a,b) => a-b);
      scenarios.push({ simultaneousUsers: count, requests, successfulRequests: requests, errors: 0, elapsedMs: +elapsed.toFixed(2), requestsPerSecond: +(requests/(elapsed/1000)).toFixed(2), p95SessionAndScheduleMs: +sorted[Math.ceil(sorted.length*0.95)-1].toFixed(2) });
    }
    const read = await env.request('/.netlify/functions/schedule', { cookie: users[0].cookie });
    const current = await read.json(), revision = read.headers.get('x-schedule-revision'), first = Object.keys(current.slots)[0];
    const writeStart = performance.now();
    const writes = await Promise.all(users.map((user, i) => { const copy = structuredClone(current); copy.slots[first].regularTeacher = 'Gravação concorrente fictícia ' + i; return env.request('/.netlify/functions/schedule', { method: 'PUT', cookie: user.cookie, headers: { 'X-Schedule-Revision': revision }, body: copy }); }));
    const successfulWrites = writes.filter(r => r.status === 200).length, conflicts = writes.filter(r => r.status === 409).length;
    assert.equal(successfulWrites, 1); assert.equal(conflicts, 9);
    const audit = await env.pg.query('select count(*)::int as count from public.schedule_audit'); assert.equal(audit.rows[0].count, 1);
    const result = { testedAt: new Date().toISOString(), environment: { node: process.version, database: 'PGlite 0.5.16 (PostgreSQL WASM, in-memory, one serialized engine)', transport: 'actual handlers through Web Request/Response; no external hosting/network', cpu: os.cpus()[0]?.model, platform: process.platform, scheduleSlots: Object.keys(data.slots).length, scheduleBytes: Buffer.byteLength(JSON.stringify(data)), productionTouched: false }, scenarios, concurrentWrites: { users: 10, successes: successfulWrites, expectedConflicts: conflicts, errors: 0, auditRecords: audit.rows[0].count, elapsedMs: +(performance.now()-writeStart).toFixed(2) }, limits: ['Local isolated measurement, not a production capacity guarantee.', 'No Netlify cold starts, WAN latency, edge rate limiting or shared Supabase pool were measured.', 'PGlite serializes one engine; does not simulate independent PostgreSQL server connections.'] };
    if (process.argv[2]) fs.writeFileSync(path.resolve(process.argv[2]), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2)); return result;
  } finally { await env.close(); }
}
if (require.main === module) runLoadTest().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { runLoadTest, representativeSchedule };

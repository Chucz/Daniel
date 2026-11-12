const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createTestEnvironment, TEST_PASSWORD, OWNER_EMAIL } = require('./isolated-environment.cjs');
let env, owner;
const accounts = {};
const bodyOf = response => response.json();
async function create(email, role, name = 'Pessoa fictícia') {
  const response = await env.request('/api/users', { method: 'POST', cookie: owner.cookie, body: { name, email, role } });
  const body = await response.json(); assert.equal(response.status, 201, body.error);
  return body;
}
async function activatePassword(account) {
  const login = await env.login(account.user.email, account.temporaryPassword);
  const response = await env.request('/api/password', { method: 'POST', cookie: login.cookie, body: { currentPassword: account.temporaryPassword, newPassword: TEST_PASSWORD } });
  const result = await response.json(); assert.equal(response.status, 200, result.error);
  return { user: result.user, cookie: response.headers.get('set-cookie').split(';')[0] };
}
async function current(id) { return (await env.pg.query('select * from public.app_users where id=$1', [id])).rows[0]; }
async function patch(user, fields, cookie = owner.cookie) {
  const row = await current(user.id);
  return env.request('/api/users', { method: 'PATCH', cookie, body: { id: user.id, version: row.version, ...fields } });
}
before(async () => { env = await createTestEnvironment(); owner = await env.login(); });
after(async () => { if (env) await env.close(); });
test('migration preserves principal password and maps legacy editor without privilege expansion', async () => {
  const row = await current(env.ownerId), legacy = await current(env.legacyId);
  assert.equal(row.password_hash, env.initialHash); assert.equal(row.is_primary, true); assert.equal(row.role, 'admin'); assert.equal(row.active, true);
  assert.equal(legacy.role, 'editor'); assert.equal(legacy.is_primary, false);
});
test('create users, normalize email, return temporary secret only once and require password change', async () => {
  for (const role of ['editor', 'consulta', 'admin']) {
    const account = await create(' ' + role.toUpperCase() + '@EXAMPLE.INVALID ', role, role === 'editor' ? "O'Connor <img src=x onerror=alert(1)>" : 'Pessoa ' + role);
    assert.equal(account.user.email, role + '@example.invalid'); assert.equal(account.user.mustChangePassword, true); assert.equal(account.user.isPrimary, false);
    assert.match(account.temporaryPassword, /^[A-Za-z0-9_-]{32}$/); assert.equal(account.user.passwordHash, undefined);
    const temporaryLogin = await env.login(account.user.email, account.temporaryPassword);
    assert.equal((await env.request('/.netlify/functions/schedule', { cookie: temporaryLogin.cookie })).status, 403);
    accounts[role] = { ...account, ...(await activatePassword(account)) };
    assert.equal((await env.request('/api/session', { cookie: temporaryLogin.cookie })).status, 401);
    const list = await env.request('/api/users', { cookie: owner.cookie }); const text = await list.text();
    assert.ok(!text.includes(account.temporaryPassword)); assert.ok(!text.includes('passwordHash')); assert.ok(!text.includes('password_hash'));
  }
});
test('case-insensitive duplicate and invalid inputs are rejected; concurrent duplicates produce one account', async () => {
  const duplicate = await env.request('/api/users', { method: 'POST', cookie: owner.cookie, body: { name: 'Duplicado', email: 'EDITOR@EXAMPLE.INVALID', role: 'admin' } }); assert.equal(duplicate.status, 409);
  for (const fields of [{ email: 'bad-email' }, { role: 'superadmin' }, { isPrimary: true }, { passwordHash: 'forged' }, { name: '' }]) {
    const r = await env.request('/api/users', { method: 'POST', cookie: owner.cookie, body: { name: 'Teste', email: 'new@example.invalid', role: 'consulta', ...fields } }); assert.equal(r.status, 400);
  }
  const results = await Promise.all(['race@example.invalid', 'RACE@EXAMPLE.INVALID'].map(email => env.request('/api/users', { method: 'POST', cookie: owner.cookie, body: { name: 'Duplicidade simultânea', email, role: 'consulta' } })));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
});
test('Editor and Consulta cannot use any administrative API or audit; forged role fields cannot elevate access', async () => {
  for (const role of ['editor', 'consulta']) {
    const cookie = accounts[role].cookie;
    for (const route of ['/api/users', '/api/users?view=audit','/api/operations']) assert.equal((await env.request(route, { cookie })).status, 403);
    assert.equal((await env.request('/api/users', { method: 'POST', cookie, body: { name: 'Escalada', email: 'attack@example.invalid', role: 'admin' } })).status, 403);
    assert.equal((await patch(accounts[role].user, { action: 'update', name: 'Escalada', role: 'admin' }, cookie)).status, 403);
    assert.equal((await patch(accounts[role].user, { action: 'reset_password' }, cookie)).status, 403);
  }
  assert.equal((await env.request('/api/users')).status, 401);
  assert.equal((await env.request('/api/users', { method: 'DELETE', cookie: owner.cookie })).status, 405);
  assert.equal((await env.request('/api/users', { method: 'POST', cookie: owner.cookie, origin: 'https://foreign.invalid', body: {} })).status, 403);
});
test('Consulta reads schedule but cannot write directly; Editor can save and attribution comes from session', async () => {
  const read = await env.request('/.netlify/functions/schedule', { cookie: accounts.consulta.cookie }); assert.equal(read.status, 200);
  const data = await read.json(); const date=data.slots.lesson.date;
  const body={operations:[{kind:'occurrence',id:'lesson',date,version:0,data:{status:'substituido',substituteTeacher:'Substituto de teste',substituteSelectedBy:'Diretor(a)',substitutionRecordedBy:'forged@example.invalid'}}]};
  assert.equal((await env.request('/.netlify/functions/schedule',{method:'PATCH',cookie:accounts.consulta.cookie,body})).status,403);
  const saved=await env.request('/.netlify/functions/schedule',{method:'PATCH',cookie:accounts.editor.cookie,body});assert.equal(saved.status,200,(await saved.clone().json()).error);
  assert.equal((await saved.json()).records[0].data.substitutionRecordedBy,'editor@example.invalid');
});
test('principal is immutable through API, hostile fields, resets and direct database triggers; password unchanged', async () => {
  const primary = owner.user;
  for (const body of [{ action: 'set_active', active: false }, { action: 'update', name: 'Principal', role: 'consulta' }, { action: 'reset_password' }]) assert.equal((await patch(primary, body)).status, 403);
  const row = await current(primary.id);
  for (const body of [{ isPrimary: false }, { email: 'different@example.invalid' }, { id: null }]) {
    const r = await env.request('/api/users', { method: 'PATCH', cookie: owner.cookie, body: { id: primary.id, version: row.version, action: 'update', name: 'Principal', role: 'admin', ...body } }); assert.equal(r.status, 400);
  }
  await env.pg.exec('reset role;');
  try {
    for (const query of ['delete from public.app_users where id=$1', "update public.app_users set role='consulta' where id=$1", 'update public.app_users set active=false where id=$1', 'update public.app_users set is_primary=false where id=$1', "update public.app_users set email='else@example.invalid' where id=$1"]) await assert.rejects(env.pg.query(query, [primary.id]), e => e.code === '23514');
  } finally { await env.pg.exec('set role eduscale_app;'); }
  assert.equal((await current(primary.id)).password_hash, env.initialHash);
});
test('role changes apply immediately to an existing open session without logging it out', async () => {
  const editor = accounts.editor, before = await current(editor.user.id);
  const updated = await patch(editor.user, { action: 'update', name: 'Editor agora consulta', role: 'consulta' }); assert.equal(updated.status, 200);
  const session = await env.request('/api/session', { cookie: editor.cookie }); assert.equal((await session.json()).user.role, 'consulta');
  const read = await env.request('/.netlify/functions/schedule', { cookie: editor.cookie });
  assert.equal((await env.request('/.netlify/functions/schedule', { method: 'PATCH', cookie: editor.cookie, headers: { 'X-Schedule-Revision': read.headers.get('x-schedule-revision') }, body: await read.json() })).status, 403);
  const stale = await env.request('/api/users', { method: 'PATCH', cookie: owner.cookie, body: { id: editor.user.id, version: before.version, action: 'update', name: 'Stale', role: 'admin' } }); assert.equal(stale.status, 409);
  assert.equal((await patch(editor.user, { action: 'update', name: 'Editor restaurado', role: 'editor' })).status, 200);
});
test('deactivation revokes all sessions and activation does not resurrect old cookies', async () => {
  const editor = accounts.editor, another = await env.login(editor.user.email);
  assert.equal((await patch(editor.user, { action: 'set_active', active: false })).status, 200);
  assert.equal((await env.request('/api/session', { cookie: editor.cookie })).status, 401); assert.equal((await env.request('/api/session', { cookie: another.cookie })).status, 401);
  const login = await env.request('/api/login', { method: 'POST', body: { username: editor.user.email, password: TEST_PASSWORD } }); assert.equal(login.status, 401);
  assert.equal((await patch(editor.user, { action: 'set_active', active: true })).status, 200);
  assert.equal((await env.request('/api/session', { cookie: editor.cookie })).status, 401);
  accounts.editor = { ...editor, ...(await env.login(editor.user.email)) };
});
test('reset returns a new random password, revokes sessions and forces change before access', async () => {
  const editor = accounts.editor;
  const response = await patch(editor.user, { action: 'reset_password' }); const result = await response.json(); assert.equal(response.status, 200);
  assert.equal((await env.request('/api/session', { cookie: editor.cookie })).status, 401);
  const oldLogin = await env.request('/api/login', { method: 'POST', body: { username: editor.user.email, password: TEST_PASSWORD } }); assert.equal(oldLogin.status, 401);
  assert.equal((await env.pg.query('select count(*)::int as n from recovery_codes where user_id=$1',[editor.user.id])).rows[0].n,0);
  assert.notEqual(result.temporaryPassword, editor.temporaryPassword);
  const login = await env.login(editor.user.email, result.temporaryPassword);
  assert.equal(login.user.mustChangePassword, true); assert.equal((await env.request('/.netlify/functions/schedule', { cookie: login.cookie })).status, 403);
  accounts.editor = { ...result, ...(await activatePassword(result)) };
  const audit = await env.request('/api/users?view=audit', { cookie: owner.cookie }); const auditText = await audit.text();
  for (const forbidden of [result.temporaryPassword, 'passwordHash', 'password_hash', 'tokenHash', 'credentialHash']) assert.ok(!auditText.includes(forbidden));
  assert.ok(JSON.parse(auditText).entries.some(entry => entry.action === 'reset_password' && entry.actorId === owner.user.id));
});
test('administrator cannot accidentally remove their own access; primary can manage another admin', async () => {
  const other = accounts.admin;
  assert.equal((await patch(other.user, { action: 'update', name: 'Outro admin', role: 'editor' }, other.cookie)).status, 403);
  assert.equal((await patch(other.user, { action: 'set_active', active: false }, other.cookie)).status, 403);
  assert.equal((await patch(other.user, { action: 'reset_password' }, other.cookie)).status, 403);
  assert.equal((await patch(other.user, { action: 'update', name: 'Outro administrador', role: 'editor' })).status, 200);
  assert.equal((await env.request('/api/users', { cookie: other.cookie })).status, 403);
});
test('two writers on one record cannot overwrite each other; winner is audited',async()=>{
 const body=name=>({operations:[{kind:'lesson',id:'lesson',version:1,data:{regularTeacher:name}}]});
 const responses=await Promise.all([owner.cookie,accounts.editor.cookie].map((cookie,i)=>env.request('/.netlify/functions/schedule',{method:'PATCH',cookie,body:body('Titular '+i)})));
 assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);const audits=await env.pg.query("select actor_id from record_audit where record_id='lesson:lesson'");assert.equal(audits.rows.length,1);
});

test('admin operation and audit commit atomically, and RLS blocks public access', async () => {
  const before = (await env.pg.query('select count(*)::int as count from public.app_users')).rows[0].count;
  await env.pg.exec("reset role; create function public.test_reject_user_audit() returns trigger language plpgsql as $$ begin raise exception 'isolated audit failure'; end $$; create trigger test_reject_user_audit before insert on public.user_audit for each row execute function public.test_reject_user_audit(); set role eduscale_app;");
  try { const r = await env.request('/api/users', { method: 'POST', cookie: owner.cookie, body: { name: 'Rollback fictício', email: 'rollback@example.invalid', role: 'consulta' } }); assert.equal(r.status, 503); assert.equal((await env.pg.query('select count(*)::int as count from public.app_users')).rows[0].count, before); }
  finally { await env.pg.exec('reset role; drop trigger test_reject_user_audit on public.user_audit; drop function public.test_reject_user_audit(); set role eduscale_app;'); }
  await env.pg.exec('reset role; set role anon;');
  try { for (const table of ['app_users', 'auth_sessions', 'schedule_audit', 'user_audit', 'schedules','school_records','record_audit','recovery_codes','operational_events']) await assert.rejects(env.pg.query('select * from public.' + table), e => e.code === '42501'); }
  finally { await env.pg.exec('reset role; set role eduscale_app;'); }
  assert.equal((await current(env.ownerId)).password_hash, env.initialHash);
});

test('authentication and polling have unique routes and separate budgets',()=>{assert.ok(!env.modules.auth.config.path.includes('/api/session'));assert.equal(env.modules.session.config.path,'/api/session');assert.equal(env.modules.auth.config.rateLimit.windowLimit,20);assert.equal(env.modules.session.config.rateLimit.windowLimit,300);});

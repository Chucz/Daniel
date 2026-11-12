const userManagementRoute = '#gerenciar-usuarios';
const userManagementState = { open: false, returnHash: '', users: [], entries: [], loading: false, busy: false, error: '', message: '', oneTime: null, showAudit: false, createDraft: { name: '', email: '', role: 'consulta' }, editId: null, editDraft: null };
const accessRoleNames = { admin: 'Administrador', editor: 'Editor', consulta: 'Consulta' };
const auditActionNames = { create: 'Cadastro', update: 'Alteração de nome/perfil', activate: 'Ativação', deactivate: 'Desativação', reset_password: 'Redefinição de senha' };
function clearUserManagement() {
  userManagementState.open = false; userManagementState.oneTime = null; userManagementState.users = []; userManagementState.entries = [];
  userManagementState.editId = null; userManagementState.editDraft = null; userManagementState.createDraft = { name: '', email: '', role: 'consulta' };
}
function leaveUserManagementForNavigation() {
  operationsState.open=false;
  if (!userManagementState.open) return true;
  if (userManagementState.busy) { userManagementState.message = 'Aguarde a operação terminar antes de sair desta tela.'; renderApp(); return false; }
  clearUserManagement(); return true;
}
async function usersRequest(method = 'GET', body, query = '') {
  const response = await fetch('/api/users' + query, { method, cache: 'no-store', credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json().catch(() => ({}));
  if(response.status===403&&result.code==='REAUTH_REQUIRED'&&body){if(await confirmSensitiveAction())return usersRequest(method,body,query);throw new Error('Operação cancelada. Confirme sua senha para continuar.');}
  if (!response.ok) {
    if (response.status === 401) { clearUserManagement(); showLogin(); }
    if (response.status === 403) await refreshAccess();
    throw new Error(result.error || 'Não foi possível concluir. Atualize a lista antes de tentar novamente.');
  }
  return result;
}
async function openUserManagement() {
  operationsState.open=false;
  if (userManagementState.open) return loadManagedUsers();
  await saveQueue;
  if (!canManageUsers()) return;
  if (persistenceError) { showToast('Salve as alterações ou baixe uma cópia local antes de gerenciar usuários.'); return; }
  userManagementState.returnHash = location.hash;
  userManagementState.open = true; userManagementState.error = ''; userManagementState.message = ''; userManagementState.oneTime = null;
  userManagementState.editId = null; userManagementState.editDraft = null;
  history.pushState(null, '', userManagementRoute); renderApp(); window.scrollTo(0, 0);
  await loadManagedUsers();
}
function closeUserManagement() {
  const previousHash = userManagementState.returnHash;
  clearUserManagement(); history.replaceState(null, '', location.pathname + location.search + previousHash); renderApp();
}
async function loadManagedUsers() {
  if (!userManagementState.open || !canManageUsers() || userManagementState.busy) return;
  userManagementState.loading = true; userManagementState.error = ''; renderApp();
  try {
    const result = await usersRequest();
    if (!userManagementState.open || !canManageUsers()) return;
    userManagementState.users = result.users;
    if (userManagementState.showAudit) { const audit = await usersRequest('GET', null, '?view=audit'); if (userManagementState.open) userManagementState.entries = audit.entries; }
  } catch (error) { userManagementState.error = error.message; }
  finally { userManagementState.loading = false; if (userManagementState.open) renderApp(); }
}
function beginUserEdit(user) {
  if (userManagementState.busy) return;
  userManagementState.editId = user.id; userManagementState.editDraft = { name: user.name, role: user.role }; renderApp();
}
async function performUserOperation(method, body) {
  if (userManagementState.busy || !canManageUsers()) return;
  userManagementState.busy = true; userManagementState.error = ''; userManagementState.message = ''; userManagementState.oneTime = null; renderApp();
  try {
    const result = await usersRequest(method, body);
    if (!userManagementState.open || !canManageUsers()) return;
    const index = userManagementState.users.findIndex(user => user.id === result.user.id);
    if (index < 0) userManagementState.users.push(result.user); else userManagementState.users[index] = result.user;
    if (result.user.id === authState.user.id) authState.user = result.user;
    userManagementState.editId = null; userManagementState.editDraft = null;
    if (method === 'POST') userManagementState.createDraft = { name: '', email: '', role: 'consulta' };
    userManagementState.message = 'Alteração salva com sucesso.';
    if (result.temporaryPassword) userManagementState.oneTime = { email: result.user.email, password: result.temporaryPassword };
    if (userManagementState.showAudit) { const audit = await usersRequest('GET', null, '?view=audit'); if (userManagementState.open) userManagementState.entries = audit.entries; }
  } catch (error) { userManagementState.error = error.message; }
  finally { userManagementState.busy = false; if (userManagementState.open) renderApp(); }
}
async function createManagedUser(event) {
  event.preventDefault(); const draft = userManagementState.createDraft;
  await performUserOperation('POST', { name: draft.name.trim(), email: draft.email.trim(), role: draft.role });
}
async function saveManagedUser(event, user) {
  event.preventDefault(); const draft = userManagementState.editDraft;
  await performUserOperation('PATCH', { id: user.id, version: user.version, action: 'update', name: draft.name.trim(), role: user.isPrimary ? 'admin' : draft.role });
}
async function toggleManagedUser(user) {
  if (!user.active && userManagementState.busy) return;
  if (!window.confirm(`${user.active ? 'Desativar' : 'Ativar'} o acesso de ${user.name}?${user.active ? ' As sessões abertas serão encerradas.' : ''}`)) return;
  await performUserOperation('PATCH', { id: user.id, version: user.version, action: 'set_active', active: !user.active });
}
async function resetManagedPassword(user) {
  if (!window.confirm(`Redefinir a senha de ${user.name}? A senha anterior deixará de funcionar e as sessões abertas serão encerradas.`)) return;
  await performUserOperation('PATCH', { id: user.id, version: user.version, action: 'reset_password' });
}
async function copyTemporaryPassword() {
  const secret = userManagementState.oneTime; if (!secret) return;
  try { await navigator.clipboard.writeText(secret.password); userManagementState.message = 'Senha copiada. Compartilhe com a pessoa por um canal seguro.'; }
  catch { userManagementState.error = 'Não foi possível copiar automaticamente. Selecione e copie a senha exibida.'; }
  if (userManagementState.open) renderApp();
}
function roleOptions(selected) { return Object.entries(accessRoleNames).map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join(''); }
function renderUserManagementPage() {
  if (!canManageUsers()) return '';
  const model = userManagementState, esc = allocationEscape, field = 'touch-target w-full min-w-0 border border-[#D2D2D7] rounded-xl px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-200', button = 'touch-target px-3 py-2 rounded-xl border border-[#E5E5EA] text-sm font-semibold hover:bg-[#F5F5F7] disabled:opacity-50';
  return `<main aria-labelledby="usersTitle" class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
  <section class="bg-white border border-[#E5E5EA] rounded-3xl p-5 sm:p-7 space-y-5" aria-busy="${model.busy || model.loading}">
    <header class="flex flex-wrap items-center justify-between gap-3"><div><button type="button" ${model.busy ? 'disabled' : ''} data-on-click="${registerUIHandler(function () { closeUserManagement(); })}" class="touch-target text-sm font-semibold text-[#0071E3]">← Voltar</button><h2 id="usersTitle" class="text-xl font-bold mt-3">Gerenciar usuários</h2><p class="text-xs text-[#6E6E73] mt-1">Acessos individuais à mesma grade da escola.</p></div><button type="button" ${model.busy || model.loading ? 'disabled' : ''} data-on-click="${registerUIHandler(function () { loadManagedUsers(); })}" class="${button}">Atualizar lista</button></header>
    ${model.error ? `<p role="alert" class="bg-red-50 text-red-700 rounded-xl p-3 text-sm">${esc(model.error)}</p>` : ''}
    ${model.message ? `<p role="status" class="text-sm text-emerald-700">${esc(model.message)}</p>` : ''}
    ${model.oneTime ? `<section aria-label="Senha temporária gerada" class="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-3"><h3 class="font-semibold">Senha temporária — exibida somente agora</h3><p class="text-sm">${esc(model.oneTime.email)}</p><p class="text-xs text-[#6E6E73]">Entregue à pessoa por um canal seguro. Ela precisará trocar a senha no primeiro acesso. Ao fechar este aviso, não será possível consultar esta senha novamente.</p><output class="block bg-white rounded-xl p-3 font-mono text-sm break-all select-all">${esc(model.oneTime.password)}</output><div class="flex flex-wrap gap-2"><button type="button" data-on-click="${registerUIHandler(function () { copyTemporaryPassword(); })}" class="${button}">Copiar senha</button><button type="button" data-on-click="${registerUIHandler(function () { model.oneTime = null; renderApp(); })}" class="${button}">Já guardei a senha</button></div></section>` : ''}
    <form id="usersCreateForm" data-on-submit="${registerUIHandler(function (event) { createManagedUser(event); })}" class="bg-[#F5F5F7] border border-[#E5E5EA] rounded-2xl p-4 space-y-3">
      <h3 class="font-semibold">Cadastrar usuário</h3><fieldset ${model.busy ? 'disabled' : ''} class="grid grid-cols-1 md:grid-cols-3 gap-3 min-w-0"><div><label for="newUserName" class="block text-xs font-semibold mb-2">Nome</label><input id="newUserName" required maxlength="200" autocomplete="name" value="${esc(model.createDraft.name)}" data-on-input="${registerUIHandler(function () { model.createDraft.name = this.value; })}" class="${field}"></div><div><label for="newUserEmail" class="block text-xs font-semibold mb-2">E-mail</label><input id="newUserEmail" type="email" required maxlength="200" autocomplete="email" value="${esc(model.createDraft.email)}" data-on-input="${registerUIHandler(function () { model.createDraft.email = this.value; })}" class="${field}"></div><div><label for="newUserRole" class="block text-xs font-semibold mb-2">Perfil</label><select id="newUserRole" data-on-change="${registerUIHandler(function () { model.createDraft.role = this.value; })}" class="${field}">${roleOptions(model.createDraft.role)}</select></div></fieldset>
      <p class="text-xs text-[#6E6E73]">Consulta visualiza; Editor altera a grade; Administrador também gerencia acessos.</p><button type="submit" ${model.busy ? 'disabled' : ''} class="touch-target px-4 py-3 text-sm font-semibold bg-[#0071E3] hover:bg-[#0077ED] rounded-xl text-white disabled:opacity-50">${model.busy ? 'Salvando…' : 'Cadastrar e gerar senha temporária'}</button>
    </form>
    <section aria-label="Usuários cadastrados" class="space-y-3"><h3 class="font-semibold">Usuários cadastrados (${model.users.length})</h3>${model.loading ? '<p role="status" class="text-sm text-[#6E6E73]">Carregando usuários…</p>' : ''}
    ${model.users.map(user => `<article data-user-id="${esc(user.id)}" class="border border-[#E5E5EA] rounded-2xl p-4 space-y-3 min-w-0"><div class="flex flex-wrap justify-between gap-2"><div class="min-w-0"><h4 class="font-semibold break-words">${esc(user.name)}</h4><p class="text-sm text-[#6E6E73] break-all">${esc(user.email)}</p></div><div class="flex flex-wrap items-start gap-2 text-xs"><span class="bg-[#F5F5F7] px-2 py-1 rounded-full">${esc(accessRoleNames[user.role] || 'Sem permissão')}</span><span class="${user.active ? 'text-emerald-700 bg-emerald-50' : 'text-[#6E6E73] bg-[#F5F5F7]'} px-2 py-1 rounded-full">${user.active ? 'Ativo' : 'Desativado'}</span>${user.isPrimary ? '<span class="text-blue-700 bg-blue-50 px-2 py-1 rounded-full">Conta principal protegida</span>' : ''}</div></div>
    <p class="text-xs text-[#6E6E73]">${user.mustChangePassword ? 'Troca de senha pendente no próximo acesso.' : 'Senha individual definida.'}</p>
    ${model.editId === user.id ? `<form data-on-submit="${registerUIHandler(function (event) { saveManagedUser(event, user); })}" class="space-y-3"><fieldset ${model.busy ? 'disabled' : ''} class="grid sm:grid-cols-2 gap-3 min-w-0"><div><label for="editUserName" class="text-xs font-semibold block mb-2">Nome do usuário</label><input id="editUserName" required maxlength="200" value="${esc(model.editDraft.name)}" data-on-input="${registerUIHandler(function () { model.editDraft.name = this.value; })}" class="${field}"></div><div><label for="editUserRole" class="text-xs font-semibold block mb-2">Perfil de acesso</label><select id="editUserRole" ${user.isPrimary ? 'disabled' : ''} data-on-change="${registerUIHandler(function () { model.editDraft.role = this.value; })}" class="${field}">${roleOptions(model.editDraft.role)}</select></div></fieldset><div class="flex flex-wrap gap-2"><button type="submit" ${model.busy ? 'disabled' : ''} class="${button}">Salvar alterações</button><button type="button" ${model.busy ? 'disabled' : ''} data-on-click="${registerUIHandler(function () { model.editId = null; model.editDraft = null; renderApp(); })}" class="${button}">Cancelar</button></div></form>` : `<div class="flex flex-wrap gap-2"><button type="button" ${model.busy ? 'disabled' : ''} data-on-click="${registerUIHandler(function () { beginUserEdit(user); })}" class="${button}">Editar</button>${!user.isPrimary && user.id !== authState.user.id ? `<button type="button" ${model.busy ? 'disabled' : ''} data-on-click="${registerUIHandler(function () { toggleManagedUser(user); })}" class="${button}">${user.active ? 'Desativar acesso' : 'Ativar acesso'}</button><button type="button" ${model.busy ? 'disabled' : ''} data-on-click="${registerUIHandler(function () { resetManagedPassword(user); })}" class="${button}">Redefinir senha</button>` : ''}</div>`}</article>`).join('')}
    </section><section class="border-t border-[#E5E5EA] pt-4 space-y-3"><button type="button" ${model.busy ? 'disabled' : ''} data-on-click="${registerUIHandler(function () { model.showAudit = !model.showAudit; loadManagedUsers(); })}" class="${button}">${model.showAudit ? 'Ocultar histórico de acessos' : 'Ver histórico de alterações de usuários'}</button>
    ${model.showAudit ? `<p class="text-xs text-[#6E6E73]">Até 100 operações mais recentes. Senhas e tokens nunca aparecem no histórico.</p><ol class="space-y-2">${model.entries.map(entry => { const actor = model.users.find(user => user.id === entry.actorId); return `<li class="bg-[#F5F5F7] rounded-xl p-3 text-xs break-words"><strong>${esc(auditActionNames[entry.action] || entry.action)}</strong> · ${esc(entry.afterState.email)}<br>Por ${esc(actor?.email || entry.actorId)} · ${esc(new Date(entry.createdAt).toLocaleString('pt-BR'))}</li>`; }).join('') || '<li class="text-sm text-[#6E6E73]">Nenhuma operação registrada.</li>'}</ol>` : ''}</section>
  </section></main>`;
}
window.addEventListener('hashchange', () => { if (userManagementState.open && location.hash !== userManagementRoute) { clearUserManagement(); if (authState.authenticated) renderApp(); } });

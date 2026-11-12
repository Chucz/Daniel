window.authState = { authenticated: false };
const authRoot = document.getElementById('auth');
const appRoot = document.getElementById('app');
const originalFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await originalFetch(...args);
  if (response.status === 401 && String(args[0]).includes('/.netlify/functions/schedule')) showLogin();
  if (response.status === 403 && String(args[0]).includes('/.netlify/functions/schedule')) await refreshAccess();
  return response;
};
function showLogin(configurationPending = false) {
  clearUserManagement();
  authState.authenticated = false;
  authState.user = null;
  appRoot.hidden = true;
  appRoot.innerHTML = '';
  authRoot.hidden = false;
  authRoot.innerHTML = `<section class="auth-screen" aria-labelledby="auth-title">
    <div class="auth-card">
      <img class="auth-mark" src="/icon.png" alt="" width="56" height="56">
      <h1 id="auth-title">Bem-vindo ao EduScale</h1>
      <p class="auth-subtitle">Entre para organizar os horários<br>e as substituições da sua escola.</p>
      <form id="auth-form">
        <div id="auth-fields">
          <div class="auth-field"><label for="auth-username">E-mail</label><input id="auth-username" name="username" type="email" autocomplete="username" autocapitalize="none" spellcheck="false" required maxlength="200" placeholder="Seu e-mail"></div>
          <div class="auth-field"><label for="auth-password">Senha</label><div class="auth-input-wrap"><input id="auth-password" name="password" type="password" autocomplete="current-password" required maxlength="128" placeholder="Sua senha"><button class="auth-eye" type="button" id="auth-eye" aria-label="Mostrar senha" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>
        </div>
        <label class="auth-remember" for="auth-remember"><input id="auth-remember" name="rememberMe" type="checkbox"> Permanecer conectado</label>
        <p id="auth-error" class="auth-error" role="alert" aria-live="polite"></p>
        <button id="auth-submit" class="auth-primary" type="submit">Entrar</button>
      </form>
      <p class="auth-note">Acesso restrito à gestão escolar.</p>
    </div>
  </section>`;
  const recoveryButton=document.createElement('button'); recoveryButton.type='button'; recoveryButton.className='auth-primary'; recoveryButton.textContent='Recuperar com código de segurança'; recoveryButton.addEventListener('click',()=>showRecovery(false));authRoot.querySelector('.auth-card').append(recoveryButton);
  const form = document.getElementById('auth-form');
  const password = document.getElementById('auth-password');
  if (configurationPending) {
    document.getElementById('auth-error').textContent = 'O acesso ainda não foi configurado. Entre em contato com o responsável pelo aplicativo.';
  }
  document.getElementById('auth-eye').onclick = (event) => {
    const visible = password.type === 'password';
    password.type = visible ? 'text' : 'password';
    event.currentTarget.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
    event.currentTarget.setAttribute('aria-pressed', String(visible));
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const button = document.getElementById('auth-submit');
    if (button.disabled) return;
    const error = document.getElementById('auth-error');
    error.textContent = '';
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    button.innerHTML = '<span class="auth-spinner" aria-hidden="true"></span>Entrando…';
    try {
      const response = await originalFetch('/api/login', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: form.elements.username.value, password: password.value, rememberMe: form.elements.rememberMe.checked })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        error.textContent = data.code === 'AUTH_NOT_CONFIGURED' ? 'O acesso ainda não foi configurado. Entre em contato com o responsável pelo aplicativo.' : response.status === 401 ? 'Usuário ou senha incorretos' : response.status === 429 ? 'Muitas tentativas. Aguarde um minuto e tente novamente.' : 'Não foi possível entrar. Tente novamente em instantes.';
        const fields = document.getElementById('auth-fields');
        fields.classList.remove('auth-shake');
        void fields.offsetWidth;
        fields.classList.add('auth-shake');
        password.value = '';
        password.focus();
        return;
      }
      password.value = '';
      const result = await response.json();
      await openAuthenticatedApp(result.user);
    } catch {
      error.textContent = 'Não foi possível conectar. Verifique sua conexão e tente novamente.';
    } finally {
      button.disabled = false;
      button.textContent = 'Entrar';
      form.removeAttribute('aria-busy');
    }
  };
}
async function openAuthenticatedApp(user) {
  authState.user = user;
  authState.authenticated = true;
  authRoot.hidden = true;
  authRoot.innerHTML = '';
  appRoot.hidden = false;
  appRoot.classList.add('app-enter');
  if (user?.mustChangePassword) return showPasswordChange(true);
  await initializeApp();
}
async function checkSession() {
  try {
    const response = await originalFetch('/api/session', { cache: 'no-store', credentials: 'same-origin' });
    const data = await response.json();
    if (response.ok && data.authenticated) return openAuthenticatedApp(data.user);
    if (data.code === 'AUTH_NOT_CONFIGURED') return showLogin(true);
    if (response.status !== 401) throw new Error('session');
  } catch {
    appRoot.hidden = true;
    authRoot.hidden = false;
    authRoot.innerHTML = '<section class="auth-screen"><div class="auth-card"><p class="auth-check" role="status">Não foi possível verificar seu acesso. Verifique sua conexão.</p><button class="auth-primary" id="auth-retry" type="button">Tentar novamente</button></div></section>';
    document.getElementById('auth-retry').onclick = checkSession;
    return;
  }
  showLogin();
}
async function authLogout(button) {
  if (!leaveUserManagementForNavigation()) return;
  button.disabled = true;
  button.textContent = 'Saindo…';
  try {
    await saveQueue;
    if (persistenceError) throw new Error('save');
    const response = await originalFetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    if (!response.ok) throw new Error('logout');
    persistenceReady = false;
    state.teachers = { titulares: [], substitutos: [] };
    state.slots = {};
    state.isManagementModalOpen = false;
    state.isReportModalOpen = false;
    showLogin();
    document.getElementById('auth-username').focus();
  } catch {
    button.disabled = false;
    button.textContent = 'Sair';
    showToast('Não foi possível sair. Verifique a conexão e se as alterações foram salvas.');
  }
}

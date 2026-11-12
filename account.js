async function openAccount() {
  if (!leaveUserManagementForNavigation()) return;
  await saveQueue;
  if (persistenceError) { showToast('Salve suas alterações ou baixe uma cópia local antes de abrir sua conta.'); return; }
  showPasswordChange(false);
}
function showPasswordChange(required) {
  authRoot.hidden=false;appRoot.hidden=true;
  authRoot.innerHTML=`<section class="auth-screen"><div class="auth-card">
    <img class="auth-mark" src="/icon.png" alt="" width="56" height="56">
    <h1 id="password-title">${required?'Defina sua senha':'Minha conta'}</h1>
    <p class="auth-subtitle" id="account-identity"></p>
    <p class="auth-note">${required?'Troque a senha temporária para acessar a grade.':'Use uma senha exclusiva com pelo menos 12 caracteres.'}</p>
    <form id="password-form">
      <div class="auth-field"><label for="current-password">Senha atual</label><input type="password" id="current-password" autocomplete="current-password" required maxlength="128"></div>
      <div class="auth-field"><label for="new-password">Nova senha</label><input type="password" id="new-password" autocomplete="new-password" required minlength="12" maxlength="128"></div>
      <div class="auth-field"><label for="confirm-password">Confirme a nova senha</label><input type="password" id="confirm-password" autocomplete="new-password" required minlength="12" maxlength="128"></div>
      <p id="password-error" class="auth-error" role="alert"></p><button type="submit" class="auth-primary">Salvar nova senha</button>
    </form><button id="password-back" type="button" class="auth-primary">${required?'Sair':'Voltar'}</button>
  </div></section>`;
  document.getElementById('account-identity').textContent=authState.user.name+' · '+authState.user.email;
  document.getElementById('password-back').addEventListener('click',async(event)=>{
    if(required){const r=await originalFetch('/api/logout',{method:'POST',credentials:'same-origin'});if(r.ok)showLogin();return;}
    authRoot.hidden=true;appRoot.hidden=false;renderApp();
  });
  document.getElementById('password-form').addEventListener('submit',async(event)=>{
    event.preventDefault();const form=event.currentTarget,button=form.querySelector('button'),error=document.getElementById('password-error');
    const currentPassword=document.getElementById('current-password').value,newPassword=document.getElementById('new-password').value;
    if(newPassword!==document.getElementById('confirm-password').value){error.textContent='A confirmação não corresponde à nova senha.';return;}
    button.disabled=true;error.textContent='';
    try{const response=await originalFetch('/api/password',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({currentPassword,newPassword})});const result=await response.json();
      if(!response.ok)throw new Error(result.error||'Não foi possível alterar a senha.');
      form.reset();await openAuthenticatedApp(result.user);
    }catch(e){error.textContent=e.message;}finally{button.disabled=false;}
  });
  document.getElementById('current-password').focus();
}

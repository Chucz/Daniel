function canEditSchedule() { return authState.authenticated && !!authState.user && !authState.user.mustChangePassword && ['admin', 'editor'].includes(authState.user.role); }
function canManageUsers() { return authState.authenticated && !!authState.user && !authState.user.mustChangePassword && authState.user.role === 'admin'; }
function applyAccessToUI(root) {
  const editing = canEditSchedule();
  for (const node of root.querySelectorAll('[data-edit-only]')) node.hidden = !editing;
  for (const node of root.querySelectorAll('[data-admin-only]')) node.hidden = !canManageUsers();
  for (const node of root.querySelectorAll('[draggable]')) node.draggable = editing;
}
let accessRefreshInFlight = null;
async function refreshAccess() {
  if (!authState.authenticated) return false;
  if (accessRefreshInFlight) return accessRefreshInFlight;
  accessRefreshInFlight = (async () => {
    try {
      const response = await originalFetch('/api/session', { cache: 'no-store', credentials: 'same-origin' });
      if (response.status === 401) { clearUserManagement(); showLogin(); return false; }
      if (!response.ok) return false;
      const result = await response.json();
      if (!result.user || !result.authenticated) return false;
      const previous = authState.user;
      authState.user = result.user;
      if (result.user.mustChangePassword) { clearUserManagement(); showPasswordChange(true); return false; }
      if (!canManageUsers()) clearUserManagement();
      if (previous?.role !== result.user.role) {
        if (!canEditSchedule()) {
          state.activeBottomSheetSlotId = null; state.assignTitularPageSlotId = null; state.conflictAlert = null;
          if (persistenceReady) { persistenceError = true; persistenceMessage = 'Seu perfil mudou para consulta. Alterações locais pendentes não serão gravadas; você pode baixar uma cópia local.'; }
        }
        renderApp();
      }
      return true;
    } catch { return false; }
  })();
  try { return await accessRefreshInFlight; } finally { accessRefreshInFlight = null; }
}
window.addEventListener('focus', () => { if (typeof authState !== 'undefined' && authState.authenticated) refreshAccess(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && typeof authState !== 'undefined' && authState.authenticated) refreshAccess(); });
setInterval(() => { if (!document.hidden && typeof authState !== 'undefined' && authState.authenticated) refreshAccess(); }, 30000);


// Event callbacks are compiled closures, never JavaScript strings from HTML.
const uiHandlers = new Map();
let nextUIHandler = 0;
function registerUIHandler(callback) {const id = String(++nextUIHandler);uiHandlers.set(id, callback);return id;}
function bindUIHandlers(root) {
  for (const event of ['click', 'change', 'input', 'focus', 'keydown', 'dragstart', 'dragover', 'dragleave', 'drop', 'submit', 'invalid']) {
    for (const element of root.querySelectorAll('[data-on-' + event + ']')) {
      const id = element.getAttribute('data-on-' + event);
      const callback = uiHandlers.get(id);
      if (callback) {element.addEventListener(event, callback);element.removeAttribute('data-on-' + event);}
    }
  }
}


// Register a same-origin service worker; blob URLs are unsupported here.
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.error('Não foi possível registrar o PWA:', error);
    });
  });
}

let deferredInstallPrompt = null;
const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
window.navigator.standalone === true ||
document.referrer.includes('android-app://');

const isIOS = (/iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) ||
navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) && !isStandalone;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  pwaState.canInstall = true;
  renderApp();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  pwaState.isInstalled = true;
  pwaState.canInstall = false;
  showToast('EduScale instalado com sucesso na sua tela inicial!');
  renderApp();
});

const pwaState = {
  canInstall: false,
  isInstalled: isStandalone,
  showIOSGuide: false,
  showGeneralGuide: false
};

async function triggerInstallApp() {
  if (deferredInstallPrompt) {
    const installPrompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    pwaState.canInstall = false;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch (error) {
      console.error('Não foi possível abrir a instalação:', error);
      pwaState.showGeneralGuide = true;
    }
    renderApp();
  } else if (isIOS) {
    pwaState.showIOSGuide = true;
    renderApp();
  } else {
    pwaState.showGeneralGuide = true;
    renderApp();
  }
}

// ==========================================
// 2. CONFIGURAÇÕES E DADOS DA ESCOLA
// ==========================================
const WEEK_DAYS = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira'];
const WEEK_SHORT = {
  'Segunda-feira': 'Seg',
  'Terça-feira': 'Ter',
  'Quarta-feira': 'Qua',
  'Quinta-feira': 'Qui',
  'Sexta-feira': 'Sex'
};

const CLASSES_BY_CATEGORY = {
  'Ensino Fundamental': ['6º Ano A', '6º Ano B', '7º Ano A', '7º Ano B', '8º Ano A', '8º Ano B', '9º Ano A', '9º Ano B'],
  'Ensino Médio': ['1º EM A', '1º EM B', '1º EM C', '1º EM D', '2º EM A', '2º EM B', '2º EM C', '2º EM D', '3º EM A', '3º EM B', '3º EM C', '3º EM D'],
  'Ensino Médio Técnico': ['2º Técnico', '3º Técnico']
};

const CLASSES_BY_SHIFT = {
  'Manhã': ['9º Ano A', '9º Ano B', '1º EM A', '1º EM B', '1º EM C', '2º EM A', '2º EM B', '2º EM C', '3º EM A', '3º EM B', '3º EM C', '2º Técnico', '3º Técnico'],
  'Tarde': ['6º Ano A', '6º Ano B', '7º Ano A', '7º Ano B', '8º Ano A', '8º Ano B'],
  'Noite': ['1º EM D', '2º EM D', '3º EM D']
};

// Turmas antigas sem letra são preservadas apenas na primeira sala correspondente.
// Simplifica os nomes exibidos sem alterar as chaves das grades salvas.
function formatClassName(className) {
  return className.replace(/^(\dº) (?:EM|Ano) ([A-D])$/, '$1 $2');
}

const LEGACY_CLASSES = {
  '9º Ano A': '9º Ano EF', '6º Ano A': '6º Ano EF',
  '7º Ano A': '7º Ano EF', '8º Ano A': '8º Ano EF',
  '1º EM A': '1º Ano EM', '2º EM A': '2º Ano EM', '3º EM A': '3º Ano EM',
  '1º EM D': '1º Ano EM', '2º EM D': '2º Ano EM', '3º EM D': '3º Ano EM',
  '2º Técnico': '2º Ano EM Técnico', '3º Técnico': '3º Ano EM Técnico'
};

function classesForCategory(category) {
  return CLASSES_BY_SHIFT[state.selectedShift].filter((cls) => CLASSES_BY_CATEGORY[category].includes(cls));
}

function selectShift(shift) {
  state.selectedShift = shift;
  state.selectedClass = CLASSES_BY_SHIFT[shift][0];
  state.selectedCategory = Object.keys(CLASSES_BY_CATEGORY).find((cat) => CLASSES_BY_CATEGORY[cat].includes(state.selectedClass));
  state.activeBottomSheetSlotId = null;
  state.highlightedSlotId = null;
  renderApp();
}

const SHIFTS = {
  'Manhã': [
  { id: 'm1', label: '1ª Aula', time: '07:00 - 07:50' },
  { id: 'm2', label: '2ª Aula', time: '07:50 - 08:40' },
  { id: 'm3', label: '3ª Aula', time: '08:40 - 09:30' },
  { id: 'm_rec', label: 'RECREIO (20 min)', time: '09:30 - 09:50', isRecess: true },
  { id: 'm4', label: '4ª Aula', time: '09:50 - 10:40' },
  { id: 'm5', label: '5ª Aula', time: '10:40 - 11:30' },
  { id: 'm6', label: '6ª Aula', time: '11:30 - 12:20' }],

  'Tarde': [
  { id: 't1', label: '1ª Aula', time: '13:00 - 13:50' },
  { id: 't2', label: '2ª Aula', time: '13:50 - 14:40' },
  { id: 't3', label: '3ª Aula', time: '14:40 - 15:30' },
  { id: 't_rec', label: 'RECREIO (20 min)', time: '15:30 - 15:50', isRecess: true },
  { id: 't4', label: '4ª Aula', time: '15:50 - 16:40' },
  { id: 't5', label: '5ª Aula', time: '16:40 - 17:30' },
  { id: 't6', label: '6ª Aula', time: '17:30 - 18:20' }],

  'Noite': [
  { id: 'n1', label: '1ª Aula', time: '19:00 - 19:45' },
  { id: 'n2', label: '2ª Aula', time: '19:45 - 20:30' },
  { id: 'n_rec', label: 'RECREIO (15 min)', time: '20:30 - 20:45', isRecess: true },
  { id: 'n3', label: '3ª Aula', time: '20:45 - 21:30' },
  { id: 'n4', label: '4ª Aula', time: '21:30 - 22:15' },
  { id: 'n5', label: '5ª Aula', time: '22:15 - 23:00' }]

};

function getSubName(sub) {
  if (!sub) return '';
  return typeof sub === 'string' ? sub : sub.name || '';
}

function getSubPhone(sub) {
  if (!sub || typeof sub === 'string') return '';
  return sub.phone || '';
}

// ==========================================
// 3. ESTADO GLOBAL DA APLICAÇÃO
// ==========================================
// Dados antigos de demonstração do localStorage não são importados.
let persistenceReady = false;
let persistenceError = false;
let persistenceMessage = 'Alterações ainda não salvas.';
let persistenceConflict = false;
let scheduleRevision = null;
let saveQueue = Promise.resolve();

const state = {
  selectedDate: schoolToday(),
  selectedDay: schoolDay(schoolToday()),
  selectedShift: 'Manhã',
  selectedCategory: 'Ensino Fundamental',
  selectedClass: '9º Ano A',
  teachers: { titulares: [], substitutos: [] },
  slots: {},

  // Controle de Busca Global
  globalSearchQuery: '',
  isSearchDropdownOpen: false,
  trackedSubstituteName: null,

  // Modais e Gavetas
  activeBottomSheetSlotId: null,
  assignTitularPageSlotId: null, // Página para atribuir/editar titular
  removeTitularConfirmSlotId: null, // Confirmação de exclusão do Titular no bloco
  isManagementModalOpen: false,
  isReportModalOpen: false,
  reportPeriod: 'day',
  reportDay: schoolDay(schoolToday()),
  conflictAlert: null,

  // Filtro lateral
  sidebarSearch: '',
  highlightedSlotId: null,
  toast: null
};

function initDefaultSlots() {
  const savedSlots = state.slots;
  state.slots = {};
  WEEK_DAYS.forEach((day) => {
    Object.keys(SHIFTS).forEach((shift) => {
      CLASSES_BY_SHIFT[shift].forEach((className) => {
        SHIFTS[shift].filter((slot) => !slot.isRecess).forEach((slot) => {
          const id = `${day}__${shift}__${className}__${slot.id}`;
          const legacyClass = LEGACY_CLASSES[className];
          const legacyId = `${day}__${shift}__${legacyClass}__${slot.id}`;
          const saved = savedSlots[id] || (legacyClass ? savedSlots[legacyId] : undefined);
          state.slots[id] = {
            id, day, shift, className, slotId: slot.id,
            date: saved?.date || dateForSchoolDay(state.selectedDate,day), lessonVersion: saved?.lessonVersion || 0, occurrenceVersion: saved?.occurrenceVersion || 0, templateTeacher: saved?.templateTeacher, source: saved?.source || null,
            slotLabel: slot.label, timeRange: slot.time,
            regularTeacher: saved?.regularTeacher || '',
            status: saved?.status || 'regular',
            substituteTeacher: saved?.substituteTeacher || null,
            substituteSelectedBy: saved?.substituteSelectedBy || null,
            substitutionRecordedBy: saved?.substitutionRecordedBy || null,
            substitutionRecordedAt: saved?.substitutionRecordedAt || null
          };
        });
      });
    });
  });
}

function saveState() {
 if(!canEditSchedule()){showToast('Seu perfil permite apenas consulta.');return;}
 if(!persistenceReady||!authState.authenticated)return;
 const snapshot=cloneRecords({teachers:state.teachers,slots:state.slots});
 saveQueue=saveQueue.then(async()=>{try{
  if(!authState.authenticated||persistenceConflict)return;
  const operations=buildRecordOperations(persistenceBase,snapshot);if(!operations.length)return;
  const response=await fetch('/.netlify/functions/schedule',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({operations})});
  const result=await response.json().catch(()=>({}));if(!response.ok){if(response.status===409||response.status===428)persistenceConflict=true;reportClientEvent('SAVE_REJECTED','schedule',response.status);throw new Error(result.error||'Não foi possível salvar.');}
  mergeSavedRecords(snapshot,result.records||[]);persistenceError=false;
 }catch(error){persistenceError=true;persistenceMessage=error.message||'Alterações ainda não salvas.';reportClientEvent('SAVE_NETWORK','schedule');}renderApp();});return saveQueue;
}
function downloadUnsavedChanges() {
  const blob = new Blob([JSON.stringify({ teachers: state.teachers, slots: state.slots }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob),link = document.createElement('a');link.href = url;link.download = 'eduscale-copia-local.json';link.click();setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function reloadLatestSchedule() {
  await saveQueue;
  if (persistenceError && !window.confirm('As alterações locais ainda não salvas serão descartadas. Baixe uma cópia local antes de continuar. Carregar a grade atual?')) return;
  await initializeApp();
}
let scheduleLoadSequence=0;
async function initializeApp() {
  if (!authState.authenticated) return;
  const loadSequence=++scheduleLoadSequence,loadDate=state.selectedDate;persistenceReady=false;
  document.getElementById('app').innerHTML = '<p class="p-8 text-center">Carregando grade…</p>';
  try {
    const response = await fetch('/.netlify/functions/schedule?date='+encodeURIComponent(loadDate), { cache: 'no-store' });
    if (response.status === 401) return;
    if (!response.ok) throw new Error('load');
    const data = await response.json();
    if (loadSequence !== scheduleLoadSequence || loadDate !== state.selectedDate || !authState.authenticated) return;
    scheduleRevision = response.headers.get('X-Schedule-Revision') || response.headers.get('ETag')?.replace(/^W\//, '');
    persistenceError = false;persistenceConflict = false;
    state.teachers = data.teachers || { titulares: [], substitutos: [] };
    state.slots = data.slots || {};
    initDefaultSlots();
    persistenceBase=cloneRecords({teachers:state.teachers,slots:state.slots,teacherRecords:data.teacherRecords||[]});
    persistenceReady = true;
    renderApp();
    checkOperationalHealth();
  } catch {
    if (loadSequence !== scheduleLoadSequence || !authState.authenticated) return;
    document.getElementById('app').innerHTML = `<div class="p-8 text-center"><p>Não foi possível carregar a grade. Verifique sua conexão.</p><button class="mt-4 underline" data-on-click="${registerUIHandler(function (event) {initializeApp();})}">Tentar novamente</button></div>`;
    applyAccessToUI(document);
  bindUIHandlers(document);
  }
}

function showToast(message) {
  state.toast = message;
  renderApp();
  setTimeout(() => {
    if (state.toast === message) {
      state.toast = null;
      renderApp();
    }
  }, 2800);
}

// ==========================================
// 4. GESTÃO DIRETA DO PROFESSOR TITULAR NO BLOCO
// ==========================================
let titularReturnScroll = 0;
let titularDraft = '';
function openAssignTitularPage(slotId) {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  if (!state.slots[slotId]) return;
  titularReturnScroll = window.scrollY;
  titularDraft = state.slots[slotId].regularTeacher || '';
  state.assignTitularPageSlotId = slotId;
  state.isSearchDropdownOpen = false;
  renderApp();
  window.scrollTo(0, 0);
  document.getElementById('titularTitle')?.focus({ preventScroll: true });
}

function closeAssignTitularPage() {
  state.assignTitularPageSlotId = null;
  renderApp();
  window.scrollTo(0, titularReturnScroll);
}

function saveTitularToSlot(slotId, teacherName) {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  if (!state.slots[slotId]) return;
  const cleanName = teacherName.trim();
  if (!cleanName) return;

  // Se o professor for novo, adiciona à lista geral de titulares
  if (!state.teachers.titulares.includes(cleanName)) {
    state.teachers.titulares.push(cleanName);
  }

  state.slots[slotId].regularTeacher = cleanName;
  state.slots[slotId].status = 'regular';
  state.slots[slotId].substituteTeacher = null;
  state.slots[slotId].substituteSelectedBy = null;
  closeAssignTitularPage();
  saveState();
  renderApp();
  showToast(`Prof. ${cleanName} atribuído(a) ao horário!`);
}

function confirmRemoveTitularFromSlot(slotId) {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  state.removeTitularConfirmSlotId = slotId;
  renderApp();
}

function executeRemoveTitularFromSlot(slotId) {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  if (!state.slots[slotId]) return;
  state.slots[slotId].regularTeacher = '';
  state.slots[slotId].status = 'regular';
  state.slots[slotId].substituteTeacher = null;
  state.slots[slotId].substituteSelectedBy = null;
  state.removeTitularConfirmSlotId = null;
  saveState();
  renderApp();
  showToast('Professor desvinculado. O horário agora está sem professor atribuído.');
}

// ==========================================
// 5. DETECÇÃO DE CONFLITO DE HORÁRIO
// ==========================================
function checkScheduleConflict(substituteName, targetSlotId) {
  const targetSlot = state.slots[targetSlotId];
  if (!targetSlot) return null;

  const subClean = substituteName.trim().toLowerCase();

  for (const key of Object.keys(state.slots)) {
    if (key === targetSlotId) continue;
    const slot = state.slots[key];
    if (
    slot.day === targetSlot.day &&
    slot.shift === targetSlot.shift &&
    slot.slotId === targetSlot.slotId &&
    slot.status === 'substituido' &&
    slot.substituteTeacher &&
    slot.substituteTeacher.trim().toLowerCase() === subClean)
    {
      return slot;
    }
  }
  return null;
}

// ==========================================
// 6. AÇÕES DE FALTAS E SUBSTITUIÇÕES
// ==========================================
function registerFalta(slotId) {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  if (!state.slots[slotId]) return;
  state.slots[slotId].status = 'falta';
  state.slots[slotId].substituteTeacher = null;
  state.slots[slotId].substituteSelectedBy = null;
  saveState();
  renderApp();
  showToast('Falta registrada. Aula marcada como vaga.');
}

function undoFalta(slotId) {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  if (!state.slots[slotId]) return;
  state.slots[slotId].status = 'regular';
  state.slots[slotId].substituteTeacher = null;
  state.slots[slotId].substituteSelectedBy = null;
  saveState();
  renderApp();
  showToast('Falta desfeita. Professor titular restaurado.');
}

function removeSubstitute(slotId) {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  if (!state.slots[slotId]) return;
  state.slots[slotId].status = 'falta';
  state.slots[slotId].substituteTeacher = null;
  state.slots[slotId].substituteSelectedBy = null;
  saveState();
  renderApp();
  showToast('Substituto removido. Aula permanece vaga.');
}

function attemptAssignSubstitute(slotId, substituteName, force = false, responsibleRole = allocationResponsibleRole) {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  if (!state.slots[slotId]) return false;
  if (!SUBSTITUTE_RESPONSIBLE_ROLES.includes(responsibleRole)) {
    showToast('Selecione o responsável pela escolha do substituto.');
    document.getElementById('allocationResponsible')?.focus();
    return false;
  }
  const conflict = checkScheduleConflict(substituteName, slotId);
  if (conflict && !force) {
    state.conflictAlert = {
      subName: substituteName,
      slotId: slotId,
      conflictSlot: conflict
    };
    renderApp();
    return false;
  }

  state.slots[slotId].status = 'substituido';
  state.slots[slotId].substituteTeacher = substituteName;
  state.slots[slotId].substituteSelectedBy = responsibleRole;
  state.activeBottomSheetSlotId = null;
  state.conflictAlert = null;
  const saving = saveState();
  renderApp();
  showToast('Salvando alocação…');
  Promise.resolve(saving).then(() => {
    showToast(persistenceError ? 'Não foi possível salvar. Tente novamente no aviso acima.' : `Prof. ${substituteName} alocado(a) com sucesso!`);
    document.querySelector('[data-allocation-trigger]')?.focus({ preventScroll: true });
  });
  return true;
}

function navigateToSlot(day, shift, className, slotId) {
  state.selectedDate=dateForSchoolDay(state.selectedDate,day);
  state.selectedDay = day;
  state.selectedShift = shift;
  state.selectedClass = className;

  for (const [cat, classes] of Object.entries(CLASSES_BY_CATEGORY)) {
    if (classes.includes(className)) {
      state.selectedCategory = cat;
      break;
    }
  }

  state.trackedSubstituteName = null;
  state.isSearchDropdownOpen = false;
  state.globalSearchQuery = '';
  state.highlightedSlotId = slotId;

  renderApp();

  setTimeout(() => {
    const el = document.getElementById(`slot-${slotId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('slot-highlight');
      setTimeout(() => {
        el.classList.remove('slot-highlight');
        state.highlightedSlotId = null;
      }, 2400);
    }
  }, 120);
}

// ==========================================
// 7. CONTROLADOR DE BUSCA GLOBAL (SEM PERDA DE FOCO)
// ==========================================
function handleGlobalSearchInput(val) {
  state.globalSearchQuery = val;
  updateSearchDropdown();
}

function handleGlobalSearchFocus() {
  state.isSearchDropdownOpen = true;
  updateSearchDropdown();
}

function handleGlobalSearchClear() {
  state.globalSearchQuery = '';
  state.isSearchDropdownOpen = false;
  const input = document.getElementById('globalSearchInput');
  if (input) {
    input.value = '';
    input.focus();
  }
  updateSearchDropdown();
}

function handleGlobalSearchKeyDown(e) {
  if (e.key === 'Escape') {
    state.isSearchDropdownOpen = false;
    const dropdown = document.getElementById('searchDropdown');
    if (dropdown) dropdown.classList.add('hidden');
    e.target.blur();
  } else if (e.key === 'Enter') {
    const query = state.globalSearchQuery.trim().toLowerCase();
    if (!query) return;
    const matches = state.teachers.substitutos.filter((s) =>
    getSubName(s).toLowerCase().includes(query)
    );
    if (matches.length > 0) {
      openSubstituteTracker(getSubName(matches[0]));
    }
  }
}

function updateSearchDropdown() {
  const container = document.getElementById('searchDropdown');
  const clearBtn = document.getElementById('searchClearBtn');
  const hintBadge = document.getElementById('searchHintBadge');

  if (clearBtn) {
    if (state.globalSearchQuery.trim() !== '') {
      clearBtn.classList.remove('hidden');
      if (hintBadge) hintBadge.classList.add('hidden');
    } else {
      clearBtn.classList.add('hidden');
      if (hintBadge) hintBadge.classList.remove('hidden');
    }
  }

  if (!container) return;

  const query = state.globalSearchQuery.trim().toLowerCase();

  if (!state.isSearchDropdownOpen || query === '') {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  const subsList = state.teachers.substitutos;
  const searchMatches = subsList.filter((s) =>
  getSubName(s).toLowerCase().includes(query)
  );

  container.classList.remove('hidden');

  if (searchMatches.length === 0) {
    container.innerHTML = `
          <div class="p-4 text-center text-xs text-[#86868B]">
            Nenhum professor substituto encontrado com "<strong>${allocationEscape(state.globalSearchQuery)}</strong>".
          </div>
        `;
  } else {
    container.innerHTML = `
          <div class="text-[10px] font-semibold tracking-wider text-[#86868B] uppercase px-3 py-1.5 flex items-center justify-between border-b border-[#E5E5EA]/70 mb-1">
            <span>Professores Substitutos Correspondentes</span>
            <span>${searchMatches.length}</span>
          </div>
          <div class="space-y-1 max-h-64 overflow-y-auto pr-1">
            ${searchMatches.map((sub) => {
      const name = getSubName(sub);
      const allAssigned = Object.values(state.slots).filter((s) => s.status === 'substituido' && s.substituteTeacher === name);
      const todayAssigned = allAssigned.filter((s) => s.day === state.selectedDay);
      const initials = name.split(' ').map((n) => n[0]).slice(0, 2).join('');

      return `
                <div data-on-click="${registerUIHandler(function (event) {openSubstituteTracker(name);})}" class="p-2.5 hover:bg-[#F5F5F7] rounded-xl cursor-pointer flex items-center justify-between transition-colors group">
                  <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full bg-[#0071E3]/10 text-[#0071E3] font-bold text-xs flex items-center justify-center">
                      ${allocationEscape(initials)}
                    </div>
                    <div>
                      <div class="text-xs font-semibold text-[#1D1D1F] group-hover:text-[#0071E3] transition-colors">${allocationEscape(name)}</div>
                      <div class="text-[11px] text-[#86868B]">
                        ${todayAssigned.length > 0 ? `<span class="text-blue-600 font-medium">${todayAssigned.length} aula(s) hoje</span>` : 'Disponível hoje'} · ${allAssigned.length} na semana
                      </div>
                    </div>
                  </div>
                  <div class="flex items-center gap-1.5 text-xs text-[#0071E3] font-medium opacity-85 group-hover:opacity-100">
                    <span>Ver Espelho</span>
                    <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                  </div>
                </div>
              `;
    }).join('')}
          </div>
        `;
  }

  applyAccessToUI(document);
  bindUIHandlers(document);
  lucide.createIcons();
}

document.addEventListener('click', (e) => {
  const searchBox = document.getElementById('globalSearchContainer');
  if (searchBox && !searchBox.contains(e.target)) {
    state.isSearchDropdownOpen = false;
    const dropdown = document.getElementById('searchDropdown');
    if (dropdown) dropdown.classList.add('hidden');
  }
});

// ==========================================
// 8. RELATÓRIO PDF DE SUBSTITUIÇÕES
// ==========================================
const reportRoute = '#relatorio-de-substituicoes';
let reportReturnHash = '';
let reportReturnScroll = 0;
function syncReportRoute() {
  const wasReport = state.isReportModalOpen;
  state.isReportModalOpen = location.hash === reportRoute;
  state.isManagementModalOpen = location.hash === '#quadro-de-professores';
  renderApp();
  window.scrollTo(0, state.isReportModalOpen || state.isManagementModalOpen ? 0 : wasReport ? reportReturnScroll : managementReturnScroll);
}
state.isReportModalOpen = location.hash === reportRoute;
function openReportModal() {
  if (!leaveUserManagementForNavigation()) return;
  if (!state.isReportModalOpen) {
    reportReturnHash = location.hash;
    reportReturnScroll = window.scrollY;
    history.pushState(null, '', reportRoute);
  }
  state.isSearchDropdownOpen = false;
  state.reportDay = state.selectedDay;
  state.isReportModalOpen = true;
  renderApp();
  window.scrollTo(0, 0);
  document.getElementById('reportTitle')?.focus({ preventScroll: true });
}

function closeReportModal() {
  history.replaceState(null, '', location.pathname + location.search + reportReturnHash);
  state.isManagementModalOpen = location.hash === '#quadro-de-professores';
  state.isReportModalOpen = false;
  renderApp();
  window.scrollTo(0, reportReturnScroll);
  document.querySelector('[data-report-button]')?.focus({ preventScroll: true });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.isReportModalOpen) closeReportModal();
});

function reportSlots() {
  return Object.values(state.slots).
  filter((s) => (s.status === 'falta' || s.status === 'substituido') && (
  state.reportPeriod === 'week' || s.day === state.reportDay)).
  sort((a, b) => WEEK_DAYS.indexOf(a.day) - WEEK_DAYS.indexOf(b.day) ||
  Object.keys(SHIFTS).indexOf(a.shift) - Object.keys(SHIFTS).indexOf(b.shift) ||
  a.timeRange.localeCompare(b.timeRange) ||
  a.className.localeCompare(b.className, 'pt-BR', { numeric: true }));
}

function exportPDF() {
  try {
    const list = reportSlots();
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape' });
    const period = state.reportPeriod === 'week' ? formatSchoolDate(schoolMonday(state.selectedDate))+' a '+formatSchoolDate(addSchoolDays(schoolMonday(state.selectedDate),4)) : formatSchoolDate(dateForSchoolDay(state.selectedDate,state.reportDay));
    const assigned = list.filter((s) => s.status === 'substituido' && s.substituteTeacher).length;
    pdf.setFontSize(18);
    pdf.text('EduScale | Substituições de aulas', 14, 18);
    pdf.setFontSize(10);
    pdf.text(`Período: ${period} | Todos os turnos e turmas`, 14, 26);
    pdf.text(`Aulas: ${list.length} | Com substituto: ${assigned} | A definir: ${list.length - assigned}`, 14, 33);
    pdf.text(`Emitido em: ${new Date().toLocaleString('pt-BR')}`, 14, 40);
    if (list.length) {
      pdf.autoTable({
        startY: 46,
        head: [['Dia', 'Turno', 'Turma', 'Aula / Horário', 'Professor titular', 'Professor substituto']],
        body: list.map((s) => [formatSchoolDate(s.date)+' · '+s.day+(s.source==='test_legacy_reviewed'?' (teste)':''), s.shift, formatClassName(s.className),
        `${s.slotLabel}\n${s.timeRange}`, s.regularTeacher || 'Sem titular',
        s.status === 'substituido' && s.substituteTeacher ? s.substituteTeacher : 'A definir']),
        styles: { fontSize: 10, cellPadding: 3, overflow: 'linebreak' },
        headStyles: { fillColor: [0, 113, 227] },
        columnStyles: { 0: { cellWidth: 33 }, 1: { cellWidth: 22 }, 2: { cellWidth: 28 }, 3: { cellWidth: 40 } },
        margin: { top: 15, bottom: 18 },
        rowPageBreak: 'avoid'
      });
    } else {
      pdf.text('Nenhuma falta ou substituição registrada neste período.', 14, 54);
    }
    const pages = pdf.getNumberOfPages();
    for (let page = 1; page <= pages; page++) {
      pdf.setPage(page);
      pdf.setFontSize(9);
      pdf.text(`Página ${page} de ${pages}`, 283, 202, { align: 'right' });
    }
    const suffix = state.reportPeriod === 'week' ? 'semana' : WEEK_SHORT[state.reportDay].toLowerCase();
    pdf.save(`eduscale_substituicoes_${suffix}_${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast('Download do PDF iniciado.');
  } catch (error) {
    showToast('Não foi possível gerar o PDF. Tente novamente.');
  }
}

function renderReportPage() {
  const list = reportSlots();
  const assigned = list.filter((s) => s.status === 'substituido' && s.substituteTeacher).length;
  const esc = allocationEscape;
  return `
        <main aria-labelledby="reportTitle" class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-16">
          <section class="min-w-0 bg-white rounded-3xl border border-[#E5E5EA] p-5 sm:p-7 space-y-4">
            <button type="button" data-on-click="${registerUIHandler(function (event) {closeReportModal();})}" class="touch-target flex items-center gap-2 text-sm font-semibold text-[#0071E3]"><i data-lucide="arrow-left" class="w-4 h-4"></i>Voltar</button>
            <div class="flex items-center justify-between gap-3">
              <h2 id="reportTitle" tabindex="-1" class="text-xl sm:text-2xl font-bold">Relatório de substituições</h2>
            </div>
            <p class="text-sm text-[#6E6E73]">Aulas com falta, professor titular e substituto de todos os turnos e turmas. Aulas sem substituto aparecem como “A definir”.</p>
            <label for="reportPeriod" class="block text-xs font-semibold">Período</label>
            <select id="reportPeriod" class="w-full p-3 bg-[#F5F5F7] rounded-xl text-sm" data-on-change="${registerUIHandler(function (event) {state.reportPeriod = this.value;renderApp();document.getElementById('reportPeriod').focus();})}">
              <option value="day" ${state.reportPeriod === 'day' ? 'selected' : ''}>Um dia</option>
              <option value="week" ${state.reportPeriod === 'week' ? 'selected' : ''}>Semana toda</option>
            </select>
            ${state.reportPeriod === 'day' ? `
              <label for="reportDay" class="block text-xs font-semibold">Dia da semana</label>
              <select id="reportDay" class="w-full p-3 bg-[#F5F5F7] rounded-xl text-sm" data-on-change="${registerUIHandler(function (event) {state.reportDay = this.value;renderApp();document.getElementById('reportDay').focus({ preventScroll: true });})}">
                ${WEEK_DAYS.map((day) => `<option ${day === state.reportDay ? 'selected' : ''}>${day}</option>`).join('')}
              </select>` : ''}
            <div role="status" aria-live="polite" class="flex flex-wrap gap-3 text-sm text-[#6E6E73]">
              <span>Aulas: ${list.length}</span><span>Com substituto: ${assigned}</span><span>A definir: ${list.length - assigned}</span>
            </div>
            <section aria-label="Substituições no período" class="grid grid-cols-1 lg:grid-cols-2 gap-3">
              ${list.length ? list.map((slot) => `
                <article class="min-w-0 p-4 bg-[#F5F5F7] rounded-2xl space-y-2 text-sm [overflow-wrap:anywhere]">
                  <h3 class="font-semibold">${esc(formatSchoolDate(slot.date))} · ${esc(slot.day)} · ${esc(slot.shift)} · ${esc(formatClassName(slot.className))}</h3>
                  <p class="text-[#6E6E73]">${esc(slot.slotLabel)} · ${esc(slot.timeRange)}</p>
                  ${slot.source==='test_legacy_reviewed'?'<p class="text-xs text-[#86868B]">Teste antigo revisado</p>':''}<p><span class="font-semibold">Titular:</span> ${esc(slot.regularTeacher || 'Sem titular')}</p>
                  <p><span class="font-semibold">Substituto:</span> ${esc(slot.status === 'substituido' && slot.substituteTeacher ? slot.substituteTeacher : 'A definir')}</p>
                  ${slot.status === 'substituido' ? `<p><span class="font-semibold">Quem selecionou:</span> ${esc(slot.substituteSelectedBy || 'Não informado')}</p>` : ''}
                </article>`).join('') : '<p class="text-sm text-[#6E6E73] lg:col-span-2">Nenhuma falta ou substituição registrada neste período.</p>'}
            </section>
            <p class="text-xs text-[#86868B]">Ocorrências da semana de ${formatSchoolDate(schoolMonday(state.selectedDate))}. Mude a data das aulas para consultar outra semana.</p>
            <button data-on-click="${registerUIHandler(function (event) {exportPDF();})}" class="w-full touch-target py-3 bg-[#0071E3] text-white text-sm font-semibold rounded-xl">Baixar PDF</button>
          </section>
        </main>`;
}

// ==========================================
// 9. RENDERIZAÇÃO DA APLICAÇÃO (UI APPLE HIG)
// ==========================================
function renderApp() {
  if (!authState.authenticated) return;
  const root = document.getElementById('app');
  const currentShiftSlots = SHIFTS[state.selectedShift] || [];

  const shiftSlotsList = Object.values(state.slots).filter((s) => s.day === state.selectedDay && s.shift === state.selectedShift);
  const totalVagasAll = Object.values(state.slots).filter((s) => s.status === 'falta').length;
  const totalVagasShift = shiftSlotsList.filter((s) => s.status === 'falta').length;
  const totalSubstituidasShift = shiftSlotsList.filter((s) => s.status === 'substituido').length;
  const totalRegularesShift = shiftSlotsList.filter((s) => s.status === 'regular' && s.regularTeacher).length;
  const totalSemProfessorShift = shiftSlotsList.filter((s) => s.status === 'regular' && !s.regularTeacher).length;

  const subsList = state.teachers.substitutos;

  uiHandlers.clear();
  root.innerHTML = `
        ${persistenceError ? `<div role="alert" class="bg-red-50 text-red-700 p-3 text-center text-sm">${allocationEscape(persistenceMessage)} <button data-edit-only class="underline font-semibold" data-on-click="${registerUIHandler(function (event) {saveState();})}">Tentar salvar novamente</button><button class="underline font-semibold ml-3" data-on-click="${registerUIHandler(function (event) {reloadLatestSchedule();})}">Carregar versão atual</button><button class="underline font-semibold ml-3" data-on-click="${registerUIHandler(function (event) {downloadUnsavedChanges();})}">Baixar cópia local</button></div>` : ''}
        <div class="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3"><label for="schoolDate" class="text-sm font-semibold">Data das aulas</label><input id="schoolDate" type="date" value="${allocationEscape(state.selectedDate)}" data-on-change="${registerUIHandler(function(){changeSchoolDate(this.value);})}" class="touch-target border border-[#D2D2D7] rounded-xl px-3 text-sm bg-white"><span class="text-xs text-[#6E6E73]">Faltas e substituições são específicas de cada data.</span></div>
<!-- Top App Bar Apple HIG com Botão PWA e Busca Global -->
        <header class="sticky top-0 z-40 bg-white/85 ios-blur border-b border-[#E5E5EA] px-4 sm:px-6 lg:px-8 py-3 transition-all">
          <div class="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">

            <div class="flex items-center justify-end gap-2 self-end md:order-last">
            ${canManageUsers() ? `<button data-on-click="${registerUIHandler(function(){openOperations();})}" class="touch-target px-3 text-sm text-[#0071E3]">Operação</button><button data-on-click="${registerUIHandler(function () {openUserManagement();})}" class="touch-target px-3 text-sm font-semibold text-[#0071E3] rounded-xl hover:bg-black/5">Gerenciar usuários</button>` : ''}
            ${!canEditSchedule() ? '<span class="text-xs text-[#6E6E73] px-2">Somente consulta</span>' : ''}
            <button data-on-click="${registerUIHandler(function (event) {openAccount();})}" class="touch-target px-3 text-sm text-[#0071E3] rounded-xl hover:bg-black/5 self-end">Minha conta</button>
            <button data-on-click="${registerUIHandler(function (event) {authLogout(this);})}" class="touch-target px-3 text-sm text-[#6E6E73] rounded-xl hover:bg-black/5 self-end md:order-last">Sair</button>
            </div>
            <span id="connectionState" class="text-xs text-[#6E6E73]">${operationalHealth.ok===null?'Aguardando verificação':operationalHealth.ok===false?'Sem conexão com o serviço':'Serviço disponível'}</span>
            <!-- Zona de Marca EduScale -->
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <img src="/icon.png" alt="EduScale Icon" class="w-9 h-9 rounded-xl shadow-xs border border-[#E5E5EA] object-cover" />
                <div>
                  <div class="flex items-center gap-2">
                    <h1 class="text-base font-bold tracking-tight text-[#1D1D1F] leading-tight">EduScale</h1>
                    ${totalVagasAll > 0 ? `
                      <span class="inline-flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                        <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                        ${totalVagasAll} ${totalVagasAll === 1 ? 'vaga' : 'vagas'}
                      </span>
                    ` : ''}
                  </div>
                  <p class="text-[11px] text-[#86868B] hidden sm:block">Controle de Faltas & Substitutos</p>
                </div>
              </div>

              <!-- Ações no Mobile (PWA Install + Menu) -->
              <div class="flex md:hidden items-center gap-1.5">
                ${!pwaState.isInstalled ? `
                  <button data-on-click="${registerUIHandler(function (event) {triggerInstallApp();})}" class="px-2.5 py-1.5 text-xs font-semibold text-[#0071E3] bg-[#0071E3]/10 border border-[#0071E3]/20 rounded-xl flex items-center gap-1 touch-target">
                    <i data-lucide="download" class="w-4 h-4"></i>
                    <span>Instalar</span>
                  </button>
                ` : ''}
                <button data-management-trigger data-on-click="${registerUIHandler(function (event) {openTeacherManagement();})}" class="p-2 text-[#1D1D1F] bg-[#F5F5F7] border border-[#E5E5EA] rounded-xl touch-target">
                  <i data-lucide="users" class="w-4 h-4 text-[#0071E3]"></i>
                </button>
                <button data-report-button aria-label="Relatório PDF" data-on-click="${registerUIHandler(function (event) {openReportModal();})}" class="p-2 text-white bg-[#0071E3] rounded-xl touch-target">
                  <i data-lucide="file-text" class="w-4 h-4"></i>
                </button>
              </div>
            </div>

            <!-- 1. BARRA DE BUSCA GLOBAL ESTILO APPLE (Spotlight Search) -->
            <div id="globalSearchContainer" class="relative flex-1 max-w-md mx-auto md:mx-4 w-full">
              <div class="relative flex items-center">
                <i data-lucide="search" class="w-4 h-4 text-[#86868B] absolute left-3.5 pointer-events-none"></i>
                <input
                  type="text"
                  id="globalSearchInput"
                  placeholder="Buscar e rastrear professor substituto..."
                  value="${allocationEscape(state.globalSearchQuery)}"
                  data-on-focus="${registerUIHandler(function (event) {handleGlobalSearchFocus();})}"
                  data-on-input="${registerUIHandler(function (event) {handleGlobalSearchInput(this.value);})}"
                  data-on-keydown="${registerUIHandler(function (event) {handleGlobalSearchKeyDown(event);})}"
                  class="w-full text-xs sm:text-sm bg-[#E5E5EA]/50 hover:bg-[#E5E5EA]/70 focus:bg-white border border-transparent focus:border-[#0071E3] focus:ring-2 focus:ring-[#0071E3]/20 rounded-2xl py-2 pl-9 pr-9 outline-none transition-all placeholder:text-[#8E8E93]"
                />
                <button
                  id="searchClearBtn"
                  data-on-click="${registerUIHandler(function (event) {handleGlobalSearchClear();})}"
                  class="absolute right-3 text-[#86868B] hover:text-[#1D1D1F] ${state.globalSearchQuery ? '' : 'hidden'}">
                  <i data-lucide="x-circle" class="w-4 h-4"></i>
                </button>
                <span
                  id="searchHintBadge"
                  class="absolute right-3 text-[10px] text-[#86868B] bg-white border border-[#E5E5EA] px-1.5 py-0.5 rounded-md hidden sm:block ${state.globalSearchQuery ? 'hidden' : ''}">
                  Rastrear
                </span>
              </div>

              <!-- Lista Suspensa Preditiva Apple Search -->
              <div
                id="searchDropdown"
                class="absolute left-0 right-0 top-full mt-2 bg-white/95 ios-blur border border-[#E5E5EA] rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150 ${state.isSearchDropdownOpen && state.globalSearchQuery.trim() !== '' ? '' : 'hidden'}">
              </div>
            </div>

            <!-- Botões Desktop: Instalar PWA, Professores e Relatório PDF -->
            <div class="hidden md:flex items-center gap-2">
              ${!pwaState.isInstalled ? `
                <button data-on-click="${registerUIHandler(function (event) {triggerInstallApp();})}" class="px-3.5 py-2 text-xs font-semibold text-[#0071E3] bg-[#0071E3]/10 hover:bg-[#0071E3]/20 border border-[#0071E3]/20 rounded-xl transition-all active:scale-[0.98] flex items-center gap-1.5 touch-target" title="Instalar aplicativo EduScale no celular ou computador">
                  <i data-lucide="download" class="w-4 h-4 text-[#0071E3]"></i>
                  <span>Instalar no Celular</span>
                </button>
              ` : `
                <span class="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-xl">
                  <i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i>
                  <span>Instalado</span>
                </span>
              `}

              <button data-management-trigger data-on-click="${registerUIHandler(function (event) {openTeacherManagement();})}" class="px-3.5 py-2 text-xs font-medium text-[#1D1D1F] bg-[#F5F5F7] hover:bg-[#E5E5EA] border border-[#E5E5EA] rounded-xl transition-all active:scale-[0.98] flex items-center gap-1.5 touch-target">
                <i data-lucide="users" class="w-4 h-4 text-[#0071E3]"></i>
                <span>Professores</span>
              </button>

              <button data-report-button aria-label="Relatório PDF" data-on-click="${registerUIHandler(function (event) {openReportModal();})}" class="px-3.5 py-2 text-xs font-medium text-white bg-[#0071E3] hover:bg-[#0077ED] rounded-xl shadow-xs transition-all active:scale-[0.98] flex items-center gap-1.5 touch-target">
                <i data-lucide="file-text" class="w-4 h-4"></i>
                <span>Relatório PDF</span>
              </button>
            </div>
          </div>
        </header>

        <!-- Corpo Principal -->
        ${operationsState.open && canManageUsers() ? renderOperationsPage() : userManagementState.open && canManageUsers() ? renderUserManagementPage() : state.isReportModalOpen ? renderReportPage() : state.isManagementModalOpen ? renderTeacherManagementPage() : state.assignTitularPageSlotId ? renderAssignTitularPage() : state.activeBottomSheetSlotId && !state.conflictAlert ? renderBottomSheet() : `
        <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-16 space-y-6">

          <div class="flex flex-wrap items-center justify-between gap-3">
          <div><h2 class="text-lg font-semibold tracking-tight">Alocação de substitutos</h2><p class="text-xs text-[#6E6E73]">${canEditSchedule() ? 'Escolha uma aula vaga e confirme o professor responsável.' : 'Consulte os horários e os responsáveis pelas substituições.'}</p></div>
          <button data-edit-only data-allocation-trigger data-on-click="${registerUIHandler(function (event) {openBottomSheet();})}" class="touch-target px-4 py-2.5 rounded-xl bg-[#0071E3] hover:bg-[#0077ED] text-white text-sm font-semibold flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>Alocar Substituto</button>
        </div>
        <!-- Controles Segmentados Estilo iOS -->
          <div class="space-y-3.5">
            <!-- 1. DIAS DA SEMANA (Segunda a Sexta-feira) -->
            <div class="space-y-1">
              <div class="text-[11px] font-semibold text-[#86868B] uppercase tracking-wider px-1">Dia da Semana</div>
              <div class="bg-[#E5E5EA]/75 p-1 rounded-2xl flex items-center gap-1 overflow-x-auto no-scrollbar shadow-inner">
                ${WEEK_DAYS.map((day) => {
    const dayVagas = Object.values(state.slots).filter((s) => s.day === day && s.status === 'falta').length;
    const isActive = state.selectedDay === day;
    return `
                    <button data-on-click="${registerUIHandler(function (event) {selectSchoolDay(day);})}"
                      class="flex-1 min-w-[85px] py-2 px-3 text-xs sm:text-sm font-medium rounded-xl transition-all touch-target flex items-center justify-center gap-1.5 ${
    isActive ? 'bg-white text-[#1D1D1F] shadow-[0_2px_8px_rgba(0,0,0,0.12)] font-semibold' : 'text-[#8E8E93] hover:text-[#1D1D1F]'}">
                      <span class="hidden sm:inline">${
    day}</span>
                      <span class="sm:hidden">${WEEK_SHORT[day]}</span>
                      ${dayVagas > 0 ? `
                        <span class="text-[10px] font-bold px-1.5 py-0.2 rounded-full ${isActive ? 'bg-red-500 text-white' : 'bg-red-100 text-red-700'}">
                          ${dayVagas}
                        </span>
                      ` : ''}
                    </button>
                  `;
  }).join('')}
              </div>
            </div>

            <!-- 2. Turnos e Pílulas de Resumo -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div class="bg-[#E5E5EA]/75 p-1 rounded-2xl inline-flex items-center gap-1 self-start shadow-inner">
                ${['Manhã', 'Tarde', 'Noite'].map((shift) => `
                  <button data-on-click="${registerUIHandler(function (event) {selectShift(shift);})}"
                    class="py-1.5 px-3.5 text-xs sm:text-sm font-medium rounded-xl transition-all touch-target ${
  state.selectedShift === shift ? 'bg-white text-[#1D1D1F] shadow-[0_2px_8px_rgba(0,0,0,0.12)] font-semibold' : 'text-[#8E8E93] hover:text-[#1D1D1F]'}">
                    ${
  shift}
                  </button>
                `).join('')}
              </div>

              <!-- Indicadores de Status estilo Apple Health -->
              <div class="flex items-center gap-2 overflow-x-auto text-xs font-medium text-[#6E6E73] py-0.5">
                <span class="flex items-center gap-1.5 bg-white border border-[#E5E5EA] px-3 py-1.5 rounded-full shadow-2xs whitespace-nowrap">
                  <span class="w-2 h-2 rounded-full bg-emerald-500"></span> ${totalRegularesShift} Presentes
                </span>
                ${totalSemProfessorShift > 0 ? `
                  <span class="flex items-center gap-1.5 bg-gray-100 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-full shadow-2xs whitespace-nowrap font-medium">
                    <span class="w-2 h-2 rounded-full bg-gray-400"></span> ${totalSemProfessorShift} Sem Titular
                  </span>
                ` : ''}
                <span class="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 px-3 py-1.5 rounded-full shadow-2xs whitespace-nowrap font-semibold">
                  <span class="w-2 h-2 rounded-full bg-red-500"></span> ${totalVagasShift} Vagas
                </span>
                <span class="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 px-3 py-1.5 rounded-full shadow-2xs whitespace-nowrap">
                  <span class="w-2 h-2 rounded-full bg-blue-500"></span> ${totalSubstituidasShift} Substituídas
                </span>
              </div>
            </div>

            <!-- 3. Seletor de Turmas Obrigatórias -->
            <div class="bg-white border border-[#E5E5EA] p-3.5 sm:p-4 rounded-3xl shadow-xs space-y-3">
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E5EA] pb-2.5">
                <div class="text-xs font-semibold text-[#1D1D1F] flex items-center gap-1.5">
                  <span>Turma em Exibição:</span>
                  <span class="text-[#0071E3] font-bold text-sm">${allocationEscape(formatClassName(state.selectedClass))}</span>
                </div>

                <!-- Categoria da Turma -->
                <div class="flex items-center gap-1 overflow-x-auto no-scrollbar">
                  ${Object.keys(CLASSES_BY_CATEGORY).filter((cat) => classesForCategory(cat).length > 0).map((cat) => `
                    <button data-on-click="${registerUIHandler(function (event) {state.selectedCategory = cat;state.selectedClass = classesForCategory(cat)[0];renderApp();})}"
                      class="text-xs px-2.5 py-1.5 rounded-xl font-medium transition-colors whitespace-nowrap ${
  state.selectedCategory === cat ? 'bg-[#1D1D1F] text-white shadow-2xs' : 'text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-[#F5F5F7]'}">
                      ${
  cat}
                    </button>
                  `).join('')}
                </div>
              </div>

              <!-- Lista de Turmas do Nível Atual -->
              <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                ${classesForCategory(state.selectedCategory).map((cls) => {
    const isSelected = state.selectedClass === cls;
    const clsVagas = shiftSlotsList.filter((s) => s.className === cls && s.status === 'falta').length;
    return `
                    <button data-on-click="${registerUIHandler(function (event) {state.selectedClass = cls;renderApp();})}"
                      class="whitespace-nowrap px-4 py-2.5 text-xs font-semibold rounded-2xl transition-all duration-150 touch-target flex items-center justify-center text-center gap-1.5 ${
    isSelected ? 'bg-[#0071E3] text-white shadow-sm' : 'bg-[#F5F5F7] text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-[#E5E5EA]'}">
                      <span>${allocationEscape(
      formatClassName(cls))}</span>
                      ${clsVagas > 0 ? `
                        <span class="text-[10px] px-1.5 py-0.2 rounded-full font-bold ${isSelected ? 'bg-white text-red-600' : 'bg-red-100 text-red-700'}">
                          ${clsVagas}
                        </span>
                      ` : ''}
                    </button>
                  `;
  }).join('')}
              </div>
            </div>
          </div>

          <!-- Grade de Aulas e Painel Lateral Desktop -->
          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

            <!-- Coluna de Horários e Aulas (Foco estrito: Horário + Nome do Professor/Alerta) -->
            <div class="lg:col-span-8 space-y-3.5">
              <div class="flex items-center justify-between px-1">
                <div>
                  <h2 class="text-base font-semibold text-[#1D1D1F] tracking-tight">Grade de Aulas • ${allocationEscape(formatClassName(state.selectedClass))}</h2>
                  <p class="text-xs text-[#86868B]">${state.selectedDay} · Turno da ${state.selectedShift}</p>
                </div>
                <div class="text-xs text-[#86868B] bg-white border border-[#E5E5EA] px-3 py-1.5 rounded-full shadow-2xs">
                  ${currentShiftSlots.filter((s) => !s.isRecess).length} aulas previstas
                </div>
              </div>

              <div class="space-y-3">
                ${currentShiftSlots.map((slotCfg) => {
    if (slotCfg.isRecess) {
      return `
                      <div class="bg-[#F5F5F7] border border-dashed border-[#D2D2D7] rounded-3xl py-3.5 px-5 flex items-center justify-between text-xs text-[#86868B] shadow-2xs">
                        <div class="flex items-center gap-2.5">
                          <div class="w-8 h-8 rounded-xl bg-white border border-[#E5E5EA] flex items-center justify-center text-[#86868B] shadow-xs">
                            <i data-lucide="coffee" class="w-4 h-4"></i>
                          </div>
                          <div>
                            <span class="font-semibold tracking-wide uppercase text-[11px] text-[#1D1D1F]">${allocationEscape(slotCfg.label)}</span>
                            <span class="text-[11px] text-[#86868B] block">Intervalo escolar para alunos e professores</span>
                          </div>
                        </div>
                        <span class="tabular-nums font-mono font-medium text-xs text-[#6E6E73]">${allocationEscape(slotCfg.time)}</span>
                      </div>
                    `;
    }

    const key = `${state.selectedDay}__${state.selectedShift}__${state.selectedClass}__${slotCfg.id}`;
    const slot = state.slots[key] || {
      id: key,
      day: state.selectedDay,
      shift: state.selectedShift,
      className: state.selectedClass,
      slotId: slotCfg.id,
      slotLabel: slotCfg.label,
      timeRange: slotCfg.time,
      regularTeacher: '',
      status: 'regular'
    };

    return renderClassSlotCard(slot);
  }).join('')}
              </div>
            </div>

            <!-- Painel Lateral Desktop de Professores Substitutos (Arrastar e Soltar + Rastreamento) -->
            <div class="lg:col-span-4 space-y-4">
              <div class="bg-white border border-[#E5E5EA] p-5 rounded-3xl shadow-xs space-y-4 sticky top-24">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="text-sm font-semibold text-[#1D1D1F] tracking-tight">Professores Substitutos</h3>
                    <p class="text-xs text-[#86868B]">${canEditSchedule() ? 'Arraste para aula vaga ou clique para rastrear' : 'Clique para consultar as aulas deste professor'}</p>
                  </div>
                  <span class="text-xs bg-[#F5F5F7] text-[#6E6E73] font-semibold px-2.5 py-1 rounded-full border border-[#E5E5EA]">
                    ${subsList.length}
                  </span>
                </div>

                <!-- Campo de busca na lista lateral -->
                <div class="relative">
                  <input
                    type="text"
                    placeholder="Filtrar substitutos..."
                    value="${allocationEscape(state.sidebarSearch)}"
                    data-on-input="${registerUIHandler(function (event) {state.sidebarSearch = this.value;renderApp();})}"
                    class="w-full text-xs bg-[#F5F5F7] border border-transparent focus:border-[#0071E3] focus:bg-white rounded-xl py-2 pl-8 pr-3 outline-none transition-all placeholder:text-[#8E8E93]"
                  />
                  <i data-lucide="search" class="w-3.5 h-3.5 text-[#86868B] absolute left-2.5 top-2.5 pointer-events-none"></i>
                </div>

                <!-- Lista de Cards Arrastáveis -->
                <div class="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  ${subsList.
  filter((s) => getSubName(s).toLowerCase().includes(state.sidebarSearch.toLowerCase())).
  map((sub) => {
    const name = getSubName(sub);
    const allSubSlots = Object.values(state.slots).filter((s) => s.status === 'substituido' && s.substituteTeacher === name);
    const todayCount = allSubSlots.filter((s) => s.day === state.selectedDay).length;
    const initials = name.split(' ').map((n) => n[0]).slice(0, 2).join('');

    return `
                        <div
                          draggable="${canEditSchedule() ? 'true' : 'false'}"
                          data-on-dragstart="${registerUIHandler(function (event) {handleDragStart(event, name);})}"
                          class="group p-3 bg-[#F5F5F7] hover:bg-[#EBF3FF] border border-transparent hover:border-[#BFDBFE] rounded-2xl flex items-center justify-between cursor-grab active:cursor-grabbing transition-all select-none">
                          <div class="flex items-center gap-3">
                            <div class="w-8 h-8 rounded-full bg-white border border-[#E5E5EA] flex items-center justify-center text-xs font-semibold text-[#0071E3] shadow-2xs group-hover:bg-[#0071E3] group-hover:text-white transition-colors">
                              ${allocationEscape(initials)}
                            </div>
                            <div>
                              <div class="text-xs font-medium text-[#1D1D1F] group-hover:text-[#0071E3]">${allocationEscape(name)}</div>
                              <div class="text-[10px] text-[#86868B] flex items-center gap-1.5 mt-0.5">
                                ${todayCount > 0 ? `
                                  <span class="text-blue-600 font-medium">${todayCount} ${todayCount === 1 ? 'aula hoje' : 'aulas hoje'}</span>
                                ` : `
                                  <span class="text-emerald-600 font-medium">Disponível hoje</span>
                                `}
                              </div>
                            </div>
                          </div>

                          <div class="flex items-center gap-1">
                            <button data-on-click="${registerUIHandler(function (event) {openSubstituteTracker(name);})}" title="Abrir Espelho de Aulas deste Substituto" class="p-1.5 text-[#86868B] hover:text-[#0071E3] hover:bg-white rounded-lg transition-colors">
                              <i data-lucide="eye" class="w-3.5 h-3.5"></i>
                            </button>
                            <i data-lucide="grip-vertical" class="w-4 h-4 text-[#86868B] opacity-40 group-hover:opacity-100 transition-opacity"></i>
                          </div>
                        </div>
                      `;
  }).join('')}
                </div>

                <!-- Formulário Rápido de Adição -->
                <div class="pt-3 border-t border-[#E5E5EA] flex items-center gap-2">
                  <input type="text" data-edit-only id="quickAddSubInput" placeholder="Novo substituto..." class="flex-1 text-xs bg-[#F5F5F7] border border-[#E5E5EA] rounded-xl px-3 py-2 outline-none focus:border-[#0071E3] focus:bg-white transition-all placeholder:text-[#8E8E93]" />
                  <button data-edit-only data-on-click="${registerUIHandler(function (event) {addQuickSubstituto();})}" class="px-3 py-2 bg-[#1D1D1F] hover:bg-black text-white text-xs font-medium rounded-xl transition-all active:scale-[0.97]">
                    Adicionar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>`}





        <!-- MODAL: CONFIRMAR DESVINCULAÇÃO DO PROFESSOR TITULAR -->
        ${state.removeTitularConfirmSlotId ? renderRemoveTitularConfirmModal() : ''}

        <!-- MODAL GUIA DE INSTALAÇÃO NO IOS SAFARI -->
        ${pwaState.showIOSGuide ? renderIOSGuideModal() : ''}

        <!-- MODAL GUIA DE INSTALAÇÃO GERAL (CHROME / DESKTOP) -->
        ${pwaState.showGeneralGuide ? renderGeneralGuideModal() : ''}

        <!-- PAINEL / MODAL: ESPELHO DE AULAS DO SUBSTITUTO -->
        ${state.trackedSubstituteName ? renderSubstituteTrackerModal() : ''}

        <!-- MODAL DE ALERTA DE CONFLITO DE HORÁRIO -->
        ${state.conflictAlert ? renderConflictModal() : ''}

        <!-- GAVETA INFERIOR (BOTTOM SHEET) PARA TOQUE TOUCH -->


        <!-- MODAL DE GERENCIAMENTO DE PROFESSORES -->


        <!-- FEEDBACK TOAST ESTILO APPLE -->
        ${state.toast ? `
          <div role="status" aria-live="polite" class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1D1D1F]/90 ios-blur text-white text-xs font-medium py-2.5 px-4 rounded-2xl shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-400"></i>
            <span>${allocationEscape(state.toast)}</span>
          </div>
        ` : ''}
      `;

  applyAccessToUI(document);
  bindUIHandlers(document);
  lucide.createIcons();

  if (state.isSearchDropdownOpen && state.globalSearchQuery.trim() !== '') {
    updateSearchDropdown();
  }
}

// ==========================================
// 10. CARD DA AULA (GESTÃO DIRETA DO TITULAR NO BLOCO)
// ==========================================
function renderClassSlotCard(slot) {
  const hasTitular = slot.regularTeacher && slot.regularTeacher.trim() !== '';
  const isRegular = slot.status === 'regular';
  const isFalta = slot.status === 'falta';
  const isSubstituido = slot.status === 'substituido';

  // Estilo do container
  let styleClass = 'bg-white border-[#E5E5EA] text-[#1D1D1F] hover:border-[#D2D2D7] shadow-xs';
  if (!hasTitular && isRegular) {
    styleClass = 'bg-white border-[#E5E5EA] hover:border-[#0071E3]/40 shadow-2xs';
  } else if (isFalta) {
    styleClass = 'bg-[#FFF5F5] border-[#FED7D7] text-[#9B1C1C] hover:bg-[#FFEBEB] shadow-xs';
  } else if (isSubstituido) {
    styleClass = 'bg-[#F0F7FF] border-[#BAE6FD] text-[#0369A1] shadow-xs';
  }

  return `
        <div id="slot-${allocationEscape(slot.id)}"
          data-on-dragover="${registerUIHandler(function (event) {handleDragOver(event, slot.id);})}"
          data-on-dragleave="${registerUIHandler(function (event) {handleDragLeave(event, slot.id);})}"
          data-on-drop="${registerUIHandler(function (event) {handleDrop(event, slot.id);})}"
          data-on-click="${registerUIHandler(function (event) {if (!hasTitular && isRegular) openAssignTitularPage(slot.id);else if (isFalta) openBottomSheet(slot.id);})}"
          class="p-4 sm:p-5 rounded-3xl border transition-all duration-200 relative select-none ${styleClass} ${!hasTitular && isRegular || isFalta ? 'cursor-pointer active:scale-[0.99]' : ''}">

          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">

            <div class="flex items-start sm:items-center gap-3.5">
              <!-- Ícone indicador do estado -->
              <div class="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
  !hasTitular && isRegular ? 'bg-[#F5F5F7] text-[#86868B]' :
  isFalta ? 'bg-red-100 text-red-600' :
  isSubstituido ? 'bg-[#0071E3]/15 text-[#0071E3]' :
  'bg-[#F5F5F7] text-[#1D1D1F]'}">
                <i data-lucide="${

  !hasTitular && isRegular ? 'user-plus' :
  isFalta ? 'alert-triangle' :
  isSubstituido ? 'user-check' :
  'clock'}" class="w-5 h-5"></i>
              </div>

              <div>
                <!-- Horário da Aula (Foco Estrito) -->
                <div class="flex items-center gap-2 text-xs font-semibold tabular-nums text-[#86868B]">
                  <span>${allocationEscape(
    slot.timeRange)}</span>
                  <span class="text-[#D2D2D7]">·</span>
                  <span class="font-medium text-[#6E6E73]">${allocationEscape(slot.slotLabel)}</span>
                </div>

                <!-- Nome do Professor ou Alerta (Foco Estrito - SEM matérias) -->
                <div class="mt-1">
                  <!-- Caso 1: Sem professor atribuído -->
                  ${!hasTitular && isRegular ? `
                    <div class="text-base font-semibold text-[#86868B] tracking-tight">
                      Sem professor atribuído
                    </div>
                    <p class="text-xs text-[#86868B] mt-0.5">Toque para definir o professor titular deste horário</p>
                  ` : ''}

                  <!-- Caso 2: Regular com titular atribuído -->
                  ${hasTitular && isRegular ? `
                    <div class="text-base sm:text-lg font-semibold text-[#1D1D1F] tracking-tight">
                      Prof. ${allocationEscape(slot.regularTeacher)}
                    </div>
                  ` : ''}

                  <!-- Caso 3: Falta / Aberto -->
                  ${isFalta ? `
                    <div class="text-base sm:text-lg font-bold text-red-600 tracking-tight flex items-center gap-2">
                      <span>AULA EM ABERTO / VAGO</span>
                    </div>
                    <p class="text-xs text-red-500/90 mt-0.5">${canEditSchedule() ? 'Toque para alocar substituto ou arraste da lista lateral' : 'Aguardando alocação de substituto'} (Titular: Prof. ${allocationEscape(slot.regularTeacher)})</p>
                  ` : ''}

                  <!-- Caso 4: Substituído -->
                  ${isSubstituido ? `
                    <div class="text-base sm:text-lg font-bold text-[#0071E3] tracking-tight flex items-center gap-2">
                      <span>Prof. ${allocationEscape(slot.substituteTeacher)}</span>
                      <button data-on-click="${registerUIHandler(function (event) {event.stopPropagation();openSubstituteTracker(slot.substituteTeacher);})}" title="Ver Espelho do Substituto" class="text-[11px] font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors">
                        <span>Substituto</span>
                        <i data-lucide="eye" class="w-3 h-3"></i>
                      </button>
                    </div>
                    <p class="text-xs text-[#86868B] line-through mt-0.5">Titular ausente: Prof. ${allocationEscape(slot.regularTeacher)}</p>
                    <p class="text-xs text-[#86868B] mt-1">Quem selecionou o substituto? ${allocationEscape(slot.substituteSelectedBy || 'Não informado')}</p>
                    ${slot.source==='test_legacy_reviewed' ? '<p class="text-xs text-[#86868B]">Teste antigo revisado</p>' : ''}
                    ${slot.substitutionRecordedBy ? `<p class="text-xs text-[#86868B] mt-1">Registrado por: ${allocationEscape(slot.substitutionRecordedBy)}</p>` : ''}
                  ` : ''}
                </div>
              </div>
            </div>

            <!-- Ações Rápidas Estilo Apple iOS -->
            <div class="flex flex-wrap items-center justify-end gap-2 self-end sm:self-center shrink-0 pt-1 sm:pt-0" data-on-click="${registerUIHandler(function (event) {event.stopPropagation();})}">

              <!-- Ação quando não há professor titular fixado -->
              ${!hasTitular && isRegular ? `
                <button data-edit-only data-on-click="${registerUIHandler(function (event) {openAssignTitularPage(slot.id);})}"
                  class="px-3.5 py-2 text-xs font-semibold text-[#0071E3] bg-[#0071E3]/10 hover:bg-[#0071E3]/20 border border-[#0071E3]/25 rounded-xl transition-all active:scale-[0.97] flex items-center gap-1.5 touch-target shadow-2xs">
                  <i data-lucide="plus" class="w-4 h-4"></i>
                  <span>Atribuir Titular</span>
                </button>
              ` : ''}

              <!-- Ações quando há professor titular regular fixado -->
              ${hasTitular && isRegular ? `
                <!-- Botão Editar Titular -->
                <button data-edit-only data-on-click="${registerUIHandler(function (event) {openAssignTitularPage(slot.id);})}"
                  title="Editar ou trocar o professor titular deste horário"
                  class="p-2 text-[#86868B] hover:text-[#0071E3] hover:bg-blue-50 border border-[#E5E5EA] rounded-xl transition-all active:scale-[0.97] touch-target flex items-center justify-center">
                  <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                </button>

                <!-- Botão Excluir Titular do Bloco (Volta a ser 'Sem professor atribuído') -->
                <button data-edit-only data-on-click="${registerUIHandler(function (event) {confirmRemoveTitularFromSlot(slot.id);})}"
                  title="Desvincular professor deste horário (deixar sem titular)"
                  class="p-2 text-[#86868B] hover:text-red-600 hover:bg-red-50 border border-[#E5E5EA] rounded-xl transition-all active:scale-[0.97] touch-target flex items-center justify-center">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>

                <!-- Botão Registrar Falta -->
                <button data-edit-only data-on-click="${registerUIHandler(function (event) {registerFalta(slot.id);})}"
                  class="px-3.5 py-2 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100/80 border border-red-200/80 rounded-xl transition-all active:scale-[0.97] flex items-center gap-1.5 touch-target">
                  <i data-lucide="user-x" class="w-4 h-4"></i>
                  <span>Registrar Falta</span>
                </button>
              ` : ''}

              <!-- Ações quando está em Falta / Aberto -->
              ${isFalta ? `
                <button data-edit-only data-on-click="${registerUIHandler(function (event) {openBottomSheet(slot.id);})}"
                  class="px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-xs transition-all active:scale-[0.97] flex items-center gap-1.5 touch-target">
                  <i data-lucide="user-plus" class="w-4 h-4"></i>
                  <span>Alocar Substituto</span>
                </button>

                <button data-edit-only data-on-click="${registerUIHandler(function (event) {undoFalta(slot.id);})}"
                  title="Restaurar Titular"
                  class="p-2.5 text-xs font-medium text-[#86868B] hover:text-[#1D1D1F] bg-white border border-[#E5E5EA] hover:bg-[#F5F5F7] rounded-xl transition-all active:scale-[0.97] flex items-center justify-center touch-target">
                  <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
                </button>
              ` : ''}

              <!-- Ações quando está Substituído -->
              ${isSubstituido ? `
                <button data-edit-only data-on-click="${registerUIHandler(function (event) {openBottomSheet(slot.id);})}" class="px-3 py-2 text-xs font-medium text-[#0071E3] bg-white border border-[#E5E5EA] hover:bg-[#F5F5F7] rounded-xl touch-target">Editar substituição</button>
                <button data-edit-only data-on-click="${registerUIHandler(function (event) {removeSubstitute(slot.id);})}"
                  class="px-3 py-2 text-xs font-medium text-[#86868B] hover:text-red-600 bg-white border border-[#E5E5EA] hover:bg-red-50 rounded-xl transition-all active:scale-[0.97] flex items-center gap-1.5 touch-target">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  <span class="hidden sm:inline">Remover Substituto</span>
                </button>

                <button data-edit-only data-on-click="${registerUIHandler(function (event) {undoFalta(slot.id);})}"
                  title="Restaurar Titular Original"
                  class="px-3.5 py-2 text-xs font-medium text-[#1D1D1F] bg-white border border-[#E5E5EA] hover:bg-[#F5F5F7] rounded-xl transition-all active:scale-[0.97] flex items-center gap-1.5 touch-target">
                  <i data-lucide="rotate-ccw" class="w-3.5 h-3.5 text-[#0071E3]"></i>
                  <span>Desfazer Falta</span>
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
}

// ==========================================
// 11. PÁGINA: ATRIBUIR / EDITAR PROFESSOR TITULAR NO BLOCO
// ==========================================
function renderAssignTitularPage() {
  const slot = state.slots[state.assignTitularPageSlotId];
  if (!slot) return '';

  const currentTeacher = slot.regularTeacher || '';
  const titularesList = state.teachers.titulares;

  return `
        <main aria-labelledby="titularTitle" class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div class="w-full min-w-0 bg-white border border-[#E5E5EA] rounded-3xl p-5 sm:p-7 space-y-5">
            <button type="button" data-on-click="${registerUIHandler(function (event) {closeAssignTitularPage();})}" class="touch-target flex items-center gap-2 text-sm font-semibold text-[#0071E3]">
              <i data-lucide="arrow-left" class="w-4 h-4"></i>Voltar
            </button>

            <div class="flex items-start justify-between border-b border-[#E5E5EA] pb-3.5">
              <div>
                <h2 id="titularTitle" tabindex="-1" class="text-base font-bold text-[#1D1D1F] tracking-tight">
                  ${currentTeacher ? 'Editar Professor Titular' : 'Atribuir Professor Titular'}
                </h2>
                <div class="text-xs text-[#86868B] mt-0.5">
                  <span class="font-medium text-[#1D1D1F]">${allocationEscape(formatClassName(slot.className))}</span> · ${allocationEscape(slot.day)} · ${allocationEscape(slot.timeRange)} (${allocationEscape(slot.slotLabel)})
                </div>
              </div>

            </div>

            <!-- Formulário para digitar ou renomear -->
            <form data-edit-only data-on-submit="${registerUIHandler(function (event) {event.preventDefault();const val = document.getElementById('assignTitularInput').value;saveTitularToSlot(slot.id, val);})}" class="space-y-2">
              <label for="assignTitularInput" class="text-xs font-semibold text-[#1D1D1F] block">
                Nome do Professor Titular:
              </label>
              <div class="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  id="assignTitularInput"
                  value="${allocationEscape(titularDraft)}"
                  data-on-input="${registerUIHandler(function (event) {titularDraft = this.value;})}"
                  required
                  placeholder="Nome completo do professor..."
                  class="min-w-0 w-full flex-1 text-sm bg-[#F5F5F7] border border-[#E5E5EA] focus:border-[#0071E3] focus:bg-white rounded-xl px-3.5 py-2.5 outline-none transition-all placeholder:text-[#8E8E93]"
                />
                <button type="submit" class="px-4 py-2.5 bg-[#0071E3] hover:bg-[#0077ED] text-white text-xs font-semibold rounded-xl transition-all active:scale-[0.98]">
                  Salvar
                </button>
              </div>
            </form>

            <!-- Lista Rápida com 1 Toque dos Titulares Cadastrados -->
            <div class="pt-2 border-t border-[#E5E5EA] space-y-2">
              <div class="text-[11px] font-semibold text-[#86868B] uppercase tracking-wider">
                Ou selecione um professor já cadastrado:
              </div>

              <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                ${titularesList.map((name) => `
                  <button data-edit-only data-on-click="${registerUIHandler(function (event) {saveTitularToSlot(slot.id, name);})}"
                    class="w-full p-2.5 bg-[#F5F5F7] hover:bg-blue-50 border border-transparent hover:border-blue-200 rounded-xl flex items-center justify-between transition-all active:scale-[0.98] text-left touch-target">
                    <div class="min-w-0 flex items-center gap-2.5">
                      <div class="w-7 h-7 rounded-lg bg-white border border-[#E5E5EA] flex items-center justify-center text-xs font-bold text-[#0071E3]">
                        ${allocationEscape(name.split(' ').map((n) => n[0]).slice(0, 2).join(''))}
                      </div>
                      <span class="text-xs break-words min-w-0 font-medium text-[#1D1D1F]">${allocationEscape(name)}</span>
                    </div>
                    ${name === currentTeacher ? `
                      <span class="text-[11px] font-semibold text-[#0071E3] bg-blue-100 px-2 py-0.5 rounded-full">Atual</span>
                    ` : `
                      <span class="text-xs text-[#0071E3] font-semibold flex items-center gap-1">
                        <span>Escolher</span>
                        <i data-lucide="check" class="w-3.5 h-3.5"></i>
                      </span>
                    `}
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- Botão de Desvincular se houver professor -->
            ${currentTeacher ? `
              <div class="pt-2 border-t border-[#E5E5EA] flex flex-wrap gap-3 justify-between items-center">
                <button data-edit-only data-on-click="${registerUIHandler(function (event) {closeAssignTitularPage();confirmRemoveTitularFromSlot(slot.id);})}"
                  class="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-red-50 transition-colors">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                  <span>Desvincular professor deste horário</span>
                </button>
                <button data-on-click="${registerUIHandler(function (event) {closeAssignTitularPage();})}" class="px-4 py-2 bg-[#F5F5F7] text-xs font-medium text-[#1D1D1F] rounded-xl hover:bg-[#E5E5EA]">
                  Cancelar
                </button>
              </div>
            ` : `
              <div class="pt-1 border-t border-[#E5E5EA] flex justify-end">
                <button data-on-click="${registerUIHandler(function (event) {closeAssignTitularPage();})}" class="px-4 py-2 bg-[#F5F5F7] text-xs font-medium text-[#1D1D1F] rounded-xl hover:bg-[#E5E5EA]">
                  Cancelar
                </button>
              </div>
            `}
          </div>
        </main>
      `;
}

// ==========================================
// 12. MODAL: CONFIRMAR DESVINCULAÇÃO DO TITULAR DO BLOCO
// ==========================================
function renderRemoveTitularConfirmModal() {
  const slot = state.slots[state.removeTitularConfirmSlotId];
  if (!slot) return '';

  return `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 ios-blur animate-in fade-in duration-150">
          <div class="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div class="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto shadow-xs">
              <i data-lucide="user-minus" class="w-6 h-6"></i>
            </div>

            <div class="text-center space-y-1">
              <h3 class="text-base font-bold text-[#1D1D1F]">Desvincular Professor?</h3>
              <p class="text-xs text-[#86868B]">
                Deseja remover o <strong>Prof. ${allocationEscape(slot.regularTeacher)}</strong> deste horário (${allocationEscape(formatClassName(slot.className))} · ${allocationEscape(slot.timeRange)})?
              </p>
              <p class="text-[11px] text-[#86868B] pt-1">
                O horário voltará a ficar como <strong>"Sem professor atribuído"</strong>, sem gerar registro de falta.
              </p>
            </div>

            <div class="flex items-center gap-2 pt-2">
              <button data-on-click="${registerUIHandler(function (event) {state.removeTitularConfirmSlotId = null;renderApp();})}" class="flex-1 py-2.5 px-3 text-xs font-semibold text-[#1D1D1F] bg-[#F5F5F7] hover:bg-[#E5E5EA] rounded-xl transition-all touch-target">
                Cancelar
              </button>
              <button data-edit-only data-on-click="${registerUIHandler(function (event) {executeRemoveTitularFromSlot(slot.id);})}" class="flex-1 py-2.5 px-3 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-xs touch-target">
                Confirmar
              </button>
            </div>
          </div>
        </div>
      `;
}

// ==========================================
// 13. ESPELHO DE AULAS DO SUBSTITUTO
// ==========================================
function openSubstituteTracker(subName) {
  state.trackedSubstituteName = subName;
  state.isSearchDropdownOpen = false;
  renderApp();
}

function renderSubstituteTrackerModal() {
  const subName = state.trackedSubstituteName;
  const subObj = state.teachers.substitutos.find((s) => getSubName(s) === subName) || { name: subName };

  const allAllocations = Object.values(state.slots).filter((s) =>
  s.status === 'substituido' &&
  s.substituteTeacher &&
  s.substituteTeacher.trim().toLowerCase() === subName.trim().toLowerCase()
  );

  const dayOrder = { 'Segunda-feira': 1, 'Terça-feira': 2, 'Quarta-feira': 3, 'Quinta-feira': 4, 'Sexta-feira': 5 };
  allAllocations.sort((a, b) => {
    if (dayOrder[a.day] !== dayOrder[b.day]) return dayOrder[a.day] - dayOrder[b.day];
    return a.timeRange.localeCompare(b.timeRange);
  });

  const todayAllocations = allAllocations.filter((s) => s.day === state.selectedDay);
  const uniqueClasses = [...new Set(allAllocations.map((s) => s.className))];
  const initials = subName.split(' ').map((n) => n[0]).slice(0, 2).join('');
  const phone = getSubPhone(subObj);

  return `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 ios-blur animate-in fade-in duration-200" data-on-click="${registerUIHandler(function (event) {state.trackedSubstituteName = null;renderApp();})}">
          <div class="w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200" data-on-click="${registerUIHandler(function (event) {event.stopPropagation();})}">

            <div class="flex items-start justify-between border-b border-[#E5E5EA] pb-4">
              <div class="flex items-center gap-3.5">
                <div class="w-12 h-12 rounded-2xl bg-[#0071E3] text-white flex items-center justify-center font-bold text-lg shadow-sm">
                  ${allocationEscape(initials)}
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <h3 class="text-lg font-bold text-[#1D1D1F] tracking-tight">Prof. ${allocationEscape(subName)}</h3>
                    <span class="text-[11px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">Substituto</span>
                  </div>
                  <p class="text-xs text-[#86868B] mt-0.5">
                    ${phone ? `<span class="flex items-center gap-1"><i data-lucide="phone" class="w-3 h-3"></i> ${allocationEscape(phone)}</span>` : 'Espelho Completo de Aulas e Alocações'}
                  </p>
                </div>
              </div>

              <button data-on-click="${registerUIHandler(function (event) {state.trackedSubstituteName = null;renderApp();})}" class="w-8 h-8 rounded-full bg-[#F5F5F7] hover:bg-[#E5E5EA] text-[#86868B] hover:text-[#1D1D1F] flex items-center justify-center transition-colors">
                <i data-lucide="x" class="w-4 h-4"></i>
              </button>
            </div>

            <div class="grid grid-cols-3 gap-3">
              <div class="bg-[#F5F5F7] p-3.5 rounded-2xl text-center">
                <div class="text-xs font-medium text-[#86868B]">Aulas Hoje (${WEEK_SHORT[state.selectedDay]})</div>
                <div class="text-xl font-bold text-[#1D1D1F] mt-1 tabular-nums">${todayAllocations.length}</div>
              </div>
              <div class="bg-[#F5F5F7] p-3.5 rounded-2xl text-center">
                <div class="text-xs font-medium text-[#86868B]">Total na Semana</div>
                <div class="text-xl font-bold text-[#0071E3] mt-1 tabular-nums">${allAllocations.length}</div>
              </div>
              <div class="bg-[#F5F5F7] p-3.5 rounded-2xl text-center">
                <div class="text-xs font-medium text-[#86868B]">Turmas Atendidas</div>
                <div class="text-xl font-bold text-[#1D1D1F] mt-1 tabular-nums">${uniqueClasses.length}</div>
              </div>
            </div>

            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-semibold text-[#86868B] uppercase tracking-wider">
                  Escala de Aulas Alocadas (${allAllocations.length})
                </h4>
                ${todayAllocations.length > 0 ? `
                  <span class="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                    Ativo hoje na escola
                  </span>
                ` : ''}
              </div>

              ${allAllocations.length === 0 ? `
                <div class="p-8 text-center bg-[#F5F5F7] rounded-2xl text-xs text-[#86868B] space-y-1">
                  <i data-lucide="calendar-x" class="w-8 h-8 text-[#86868B] mx-auto opacity-50 mb-1"></i>
                  <div class="font-medium text-[#1D1D1F]">Nenhuma aula alocada no momento</div>
                  <div>Este professor substituto está totalmente livre para novas substituições.</div>
                </div>
              ` : `
                <div class="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                  ${allAllocations.map((item) => {
    const isToday = item.day === state.selectedDay;
    return `
                      <div class="p-3.5 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
    isToday ? 'bg-blue-50/70 border-blue-200 shadow-2xs' : 'bg-[#F5F5F7] border-transparent'}">
                        <div>
                          <div class="flex items-center gap-2 text-xs font-semibold text-[#1D1D1F]">
                            <span class="px-2 py-0.5 rounded-md ${
    isToday ? 'bg-[#0071E3] text-white' : 'bg-[#E5E5EA] text-[#1D1D1F]'}">
                              ${allocationEscape(item.day)}
                            </span>
                            <span>·</span>
                            <span class="text-[#0071E3]">${allocationEscape(formatClassName(item.className))}</span>
                            <span>·</span>
                            <span class="text-[#86868B] font-mono tabular-nums">${allocationEscape(item.timeRange)}</span>
                          </div>

                          <div class="text-xs text-[#86868B] mt-1 flex items-center gap-2">
                            <span>Quem selecionou: ${allocationEscape(item.substituteSelectedBy || 'Não informado')} · Turno da ${allocationEscape(item.shift)} (${allocationEscape(item.slotLabel)})</span>
                            <span>·</span>
                            <span class="line-through">Titular: Prof. ${allocationEscape(item.regularTeacher || 'Não cadastrado')}</span>
                          </div>
                        </div>

                        <button data-on-click="${registerUIHandler(function (event) {navigateToSlot(item.day, item.shift, item.className, item.id);})}"
                          class="px-3.5 py-2 text-xs font-semibold text-white bg-[#0071E3] hover:bg-[#0077ED] rounded-xl shadow-xs transition-all active:scale-[0.97] flex items-center justify-center gap-1.5 touch-target shrink-0">
                          <span>Ir para a aula</span>
                          <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    `;
  }).join('')}
                </div>
              `}
            </div>

            <div class="pt-3 border-t border-[#E5E5EA] flex justify-end">
              <button data-on-click="${registerUIHandler(function (event) {state.trackedSubstituteName = null;renderApp();})}" class="px-5 py-2.5 bg-[#1D1D1F] hover:bg-black text-white text-xs font-medium rounded-xl transition-all active:scale-[0.98]">
                Fechar Espelho
              </button>
            </div>
          </div>
        </div>
      `;
}

// ==========================================
// 14. ALERTA DE CONFLITO DE HORÁRIO
// ==========================================
function renderConflictModal() {
  const alert = state.conflictAlert;
  if (!alert) return '';

  const target = state.slots[alert.slotId];
  const conflict = alert.conflictSlot;

  return `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 ios-blur animate-in fade-in duration-150">
          <div class="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200">
            <div class="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto shadow-xs">
              <i data-lucide="alert-triangle" class="w-6 h-6"></i>
            </div>

            <div class="text-center space-y-1">
              <h3 class="text-base font-bold text-[#1D1D1F]">Conflito de Horário Detectado!</h3>
              <p class="text-xs text-[#86868B]">O professor substituto selecionado já está lecionando em outra sala neste mesmo horário.</p>
            </div>

            <div class="p-4 bg-red-50 border border-red-200 rounded-2xl space-y-2 text-xs text-red-950">
              <div class="font-bold text-red-700 flex items-center gap-1.5">
                <i data-lucide="clock" class="w-4 h-4"></i>
                <span>${allocationEscape(conflict.day)} · ${allocationEscape(conflict.timeRange)} (${allocationEscape(conflict.slotLabel)})</span>
              </div>
              <div>
                <strong>Professor:</strong> ${allocationEscape(alert.subName)}
              </div>
              <div>
                <strong>Já alocado em:</strong> ${allocationEscape(formatClassName(conflict.className))} (Turno da ${allocationEscape(conflict.shift)})
              </div>
              <div>
                <strong>Tentativa atual:</strong> ${target ? formatClassName(target.className) : ''}
              </div>
            </div>

            <div class="flex items-center gap-2 pt-2">
              <button data-on-click="${registerUIHandler(function (event) {state.conflictAlert = null;renderApp();})}" class="flex-1 py-2.5 px-3 text-xs font-semibold text-[#1D1D1F] bg-[#F5F5F7] hover:bg-[#E5E5EA] rounded-xl transition-all touch-target">
                Cancelar Alocação
              </button>
              <button data-edit-only data-on-click="${registerUIHandler(function (event) {attemptAssignSubstitute(alert.slotId, alert.subName, true);})}" class="flex-1 py-2.5 px-3 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-xs touch-target">
                Forçar Sobreposição
              </button>
            </div>
          </div>
        </div>
      `;
}

// ==========================================
// 15. BOTTOM SHEET TOUCH MOBILE
// ==========================================
const SUBSTITUTE_RESPONSIBLE_ROLES = ['Diretor(a)', 'Vice-diretor(a)', 'Coordenador(a)'];
let allocationResponsibleRole = '';
let allocationTeacherName = '';
let allocationReturnFocus = null;
function allocationEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function allocationSlots() {
  return Object.values(state.slots).filter((slot) => slot.status === 'falta');
}

function openBottomSheet(slotId, substituteName) {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  allocationReturnFocus = document.activeElement?.id;
  const slots = allocationSlots();
  const first = slots.find((slot) => slot.day === state.selectedDay && slot.className === state.selectedClass && slot.shift === state.selectedShift) || slots.find((slot) => slot.day === state.selectedDay) || slots[0];
  state.activeBottomSheetSlotId = slotId || first?.id || 'empty';
  const selected = state.slots[state.activeBottomSheetSlotId];
  allocationResponsibleRole = selected?.substituteSelectedBy || '';
  allocationTeacherName = substituteName || selected?.substituteTeacher || '';
  renderApp();
  window.scrollTo({ top: 0, behavior: 'instant' });
  document.getElementById('allocationLesson')?.focus({ preventScroll: true });
}

function closeAllocation() {
  state.activeBottomSheetSlotId = null;
  renderApp();
  (document.getElementById(allocationReturnFocus) || document.querySelector('[data-allocation-trigger]'))?.focus({ preventScroll: true });
}

function filterAllocationTeachers(query) {
  const normalize = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let count = 0;
  document.querySelectorAll('[data-allocation-name]').forEach((item) => {
    item.hidden = !normalize(item.dataset.allocationName).includes(normalize(query));
    if (!item.hidden) count++;
  });
  document.getElementById('allocationNoResults').hidden = count > 0;
}

function selectAllocationTeacher(index) {
  allocationTeacherName = getSubName(state.teachers.substitutos[index]);
  document.getElementById('sheetNewSubInput').value = allocationTeacherName;
  document.getElementById('allocationConfirm').focus();
}

function renderBottomSheet() {
  const slot = state.slots[state.activeBottomSheetSlotId];
  const slots = allocationSlots();
  if (slot?.status === 'substituido') slots.push(slot);
  const esc = allocationEscape;
  return `
        <main id="allocationDialog" aria-labelledby="allocationTitle" class="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          <section class="bg-white border border-[#E5E5EA] rounded-3xl shadow-sm overflow-hidden">
            <header class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-5 border-b border-[#E5E5EA]">
              <div><h2 id="allocationTitle" class="text-xl sm:text-2xl font-bold">Alocação de Professores Substitutos</h2><p class="text-xs text-[#6E6E73] mt-1">Selecione a aula e confirme a substituição.</p></div>
              <button type="button" data-on-click="${registerUIHandler(function (event) {closeAllocation();})}" class="touch-target self-start sm:self-auto px-4 py-2 rounded-xl bg-[#F5F5F7] text-sm font-semibold flex items-center gap-2"><i data-lucide="arrow-left" class="w-4 h-4"></i>Voltar</button>
            </header>
            <div class="grid md:grid-cols-2">
              <form data-edit-only data-on-submit="${registerUIHandler(function (event) {event.preventDefault();addAndAssignFromSheet(state.activeBottomSheetSlotId);})}" class="p-5 space-y-4 md:border-r border-[#E5E5EA]">
                <div class="space-y-2">
                  <label for="allocationLesson" class="block text-sm font-semibold">1. Professor ausente / aula</label>
                  <select id="allocationLesson" ${slots.length ? '' : 'disabled'} data-on-change="${registerUIHandler(function (event) {openBottomSheet(this.value);})}" class="touch-target w-full min-w-0 border border-[#D2D2D7] rounded-xl px-3 text-sm bg-white focus:ring-2 focus:ring-blue-200">
                    ${slots.length ? slots.map((item) => `<option value="${esc(item.id)}" ${slot?.id === item.id ? 'selected' : ''}>${esc(item.regularTeacher || 'Sem titular')} · ${esc(item.day)} · ${esc(formatClassName(item.className))} · ${esc(item.timeRange)}</option>`).join('') : '<option>Nenhuma aula vaga</option>'}
                  </select>
                </div>
                ${slot ? `<dl class="grid grid-cols-2 gap-3 bg-[#F5F5F7] rounded-2xl p-4 text-xs"><div><dt class="text-[#6E6E73]">Dia / turno</dt><dd class="font-semibold mt-1">${esc(slot.day)} · ${esc(slot.shift)}</dd></div><div><dt class="text-[#6E6E73]">Turma / horário</dt><dd class="font-semibold mt-1">${esc(formatClassName(slot.className))} · ${esc(slot.timeRange)}</dd></div><div class="col-span-2"><dt class="text-[#6E6E73]">Professor ausente</dt><dd class="font-semibold mt-1">${esc(slot.regularTeacher || 'Sem titular cadastrado')}</dd></div></dl>` : '<p class="text-sm text-[#6E6E73]">Registre uma falta na grade para disponibilizar a aula aqui.</p>'}
                <div class="space-y-2"><label for="sheetNewSubInput" class="block text-sm font-semibold">2. Professor substituto</label>
                  <input required ${slot ? '' : 'disabled'} type="text" id="sheetNewSubInput" value="${esc(allocationTeacherName)}" data-on-input="${registerUIHandler(function (event) {allocationTeacherName = this.value;})}" list="allocationTeacherOptions" placeholder="Busque ou digite o nome completo" class="touch-target w-full min-w-0 text-sm border border-[#D2D2D7] rounded-xl px-3 focus:ring-2 focus:ring-blue-200" />
                  <datalist id="allocationTeacherOptions">${state.teachers.substitutos.map((sub) => `<option value="${esc(getSubName(sub))}"></option>`).join('')}</datalist>
                  <p class="text-xs text-[#6E6E73]">Escolha um cadastro ou informe um novo nome. Confira a disponibilidade ao lado.</p>
                </div>
                <div class="space-y-2">
                  <label for="allocationResponsible" class="block text-sm font-semibold">Quem selecionou o substituto?</label>
                  <select id="allocationResponsible" required ${slot ? '' : 'disabled'} data-on-invalid="${registerUIHandler(function (event) {this.setCustomValidity('Selecione o responsável pela escolha do substituto.');})}" data-on-change="${registerUIHandler(function (event) {this.setCustomValidity('');allocationResponsibleRole = this.value;})}" class="touch-target w-full min-w-0 border border-[#D2D2D7] rounded-xl px-3 text-sm bg-white focus:ring-2 focus:ring-blue-200">
                    <option value="">Selecione o responsável</option>
                    ${SUBSTITUTE_RESPONSIBLE_ROLES.map((role) => `<option value="${role}" ${allocationResponsibleRole === role ? 'selected' : ''}>${role}</option>`).join('')}
                  </select>
                </div>
                <button id="allocationConfirm" ${slot ? '' : 'disabled'} class="touch-target w-full rounded-xl bg-[#0071E3] hover:bg-[#0077ED] disabled:opacity-50 text-white text-sm font-semibold px-4 py-3">Confirmar alocação</button>
              </form>
              <aside class="p-5 bg-[#F5F5F7]/50 min-w-0 flex flex-col gap-3">
                <label for="allocationSearch" class="text-sm font-semibold">Substitutos e disponibilidade</label>
                <input id="allocationSearch" type="search" data-on-input="${registerUIHandler(function (event) {filterAllocationTeachers(this.value);})}" placeholder="Filtrar por nome…" class="touch-target w-full border border-[#D2D2D7] rounded-xl px-3 text-sm focus:ring-2 focus:ring-blue-200" />
                <div class="space-y-2 md:max-h-[65vh] md:overflow-y-auto">
                  ${state.teachers.substitutos.map((sub, index) => {
    const name = getSubName(sub);
    const conflict = slot && checkScheduleConflict(name, slot.id);
    return `<div data-allocation-name="${esc(name)}"><button type="button" ${slot ? '' : 'disabled'} data-on-click="${registerUIHandler(function (event) {selectAllocationTeacher(index);})}" class="touch-target w-full text-left p-3 rounded-xl border ${conflict ? 'border-amber-200 bg-amber-50' : 'border-[#E5E5EA] bg-white hover:border-blue-300'}"><span class="block text-sm font-semibold">${esc(name)}</span><span class="block text-xs mt-1 ${conflict ? 'text-amber-800' : 'text-[#6E6E73]'}">${!slot ? 'Selecione uma aula para consultar' : conflict ? 'Ocupado em ' + esc(formatClassName(conflict.className)) : 'Disponível neste horário'} · Selecionar</span></button></div>`;
  }).join('')}
                  <p id="allocationNoResults" ${state.teachers.substitutos.length ? 'hidden' : ''} class="text-sm text-[#6E6E73] p-3">Nenhum substituto encontrado. Informe um novo nome no formulário.</p>
                </div>
              </aside>
            </div>
          </section>
        </main>`;
}

document.addEventListener('keydown', (event) => {
  if (!state.activeBottomSheetSlotId || state.conflictAlert) return;
  if (event.key === 'Escape') {event.preventDefault();closeAllocation();}

});

function addAndAssignFromSheet(slotId) {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  const input = document.getElementById('sheetNewSubInput');
  const name = input ? input.value.trim() : '';
  if (!name || !state.slots[slotId] || !['falta', 'substituido'].includes(state.slots[slotId].status)) return;
  allocationResponsibleRole = document.getElementById('allocationResponsible')?.value || '';
  if (!SUBSTITUTE_RESPONSIBLE_ROLES.includes(allocationResponsibleRole)) {
    showToast('Selecione o responsável pela escolha do substituto.');
    document.getElementById('allocationResponsible')?.reportValidity();
    return;
  }
  if (!state.teachers.substitutos.some((s) => getSubName(s).toLowerCase() === name.toLowerCase())) {
    state.teachers.substitutos.push({ name, phone: '' });
  }
  attemptAssignSubstitute(slotId, name);
}

function addQuickSubstituto() {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  const input = document.getElementById('quickAddSubInput');
  const name = input ? input.value.trim() : '';
  if (!name) return;
  if (!state.teachers.substitutos.some((s) => getSubName(s).toLowerCase() === name.toLowerCase())) {
    state.teachers.substitutos.push({ name, phone: '' });
    saveState();
    renderApp();
    showToast(`Professor substituto ${allocationEscape(name)} adicionado.`);
  } else {
    showToast('Professor já cadastrado.');
  }
}

function handleDragStart(event, name) {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  event.dataTransfer.setData('text/plain', name);
  event.dataTransfer.effectAllowed = 'copy';
}

function handleDragOver(event, slotId) {
  event.preventDefault();
  const el = document.getElementById(`slot-${slotId}`);
  if (el) el.classList.add('ring-2', 'ring-[#0071E3]', 'bg-blue-50/90');
}

function handleDragLeave(event, slotId) {
  const el = document.getElementById(`slot-${slotId}`);
  if (el) el.classList.remove('ring-2', 'ring-[#0071E3]', 'bg-blue-50/90');
}

function handleDrop(event, slotId) {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  event.preventDefault();
  handleDragLeave(event, slotId);
  const name = event.dataTransfer.getData('text/plain');
  if (name && state.slots[slotId]) {
    // Se a aula estiver em falta, aloca o substituto
    if (state.slots[slotId].status === 'falta' || state.slots[slotId].status === 'substituido') {
      openBottomSheet(slotId, name);
    } else {
      showToast('Para alocar substituto, registre a falta primeiro ou defina a aula como vaga.');
    }
  }
}

// ==========================================
// 16. PÁGINA DE GERENCIAMENTO DE PROFESSORES
// ==========================================
const managementRoute = '#quadro-de-professores';
let managementReturnHash = '';
let managementReturnScroll = 0;
let managementActiveTab = 'titulares';
function syncManagementRoute() {
  syncReportRoute();
}
window.addEventListener('hashchange', syncManagementRoute);
state.isManagementModalOpen = location.hash === managementRoute;
function closeTeacherManagement() {
  history.replaceState(null, '', location.pathname + location.search + managementReturnHash);
  state.isManagementModalOpen = false;
  state.isReportModalOpen = location.hash === reportRoute;
  renderApp();
  window.scrollTo(0, managementReturnScroll);
  document.querySelector('[data-management-trigger]')?.focus({ preventScroll: true });
}
let managementFeedback = '';

function openTeacherManagement(tab = managementActiveTab) {
  if (!leaveUserManagementForNavigation()) return;
  if (!state.isManagementModalOpen || state.isReportModalOpen) {
    managementReturnHash = location.hash;
    managementReturnScroll = window.scrollY;
    history.pushState(null, '', managementRoute);
    window.scrollTo(0, 0);
  }
  state.isSearchDropdownOpen = false;
  state.isReportModalOpen = false;
  managementActiveTab = tab;
  managementFeedback = '';
  state.isManagementModalOpen = true;
  renderApp();
  document.getElementById('managementTitle')?.focus({ preventScroll: true });
}

function renderTeacherManagementPage() {
  const titulares = state.teachers.titulares;
  const substitutos = state.teachers.substitutos;

  return `
        <main aria-labelledby="managementTitle" class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-16">
          <div class="w-full min-w-0 bg-white rounded-3xl border border-[#E5E5EA] p-5 sm:p-7 space-y-5">
            <button type="button" data-on-click="${registerUIHandler(function (event) {closeTeacherManagement();})}" class="touch-target flex items-center gap-2 text-sm font-semibold text-[#0071E3]"><i data-lucide="arrow-left" class="w-4 h-4"></i>Voltar</button>

            <div class="flex items-center justify-between border-b border-[#E5E5EA] pb-3.5">
              <div class="flex items-center gap-2.5">
                <div class="w-8 h-8 rounded-xl bg-[#0071E3]/10 flex items-center justify-center text-[#0071E3]">
                  <i data-lucide="users" class="w-4 h-4"></i>
                </div>
                <div>
                  <h2 tabindex="-1" id="managementTitle" class="text-base font-semibold text-[#1D1D1F] tracking-tight">Quadro de Professores</h2>
                  <p class="text-xs text-[#86868B]">Gerenciamento de titulares e banco de substitutos</p>
                </div>
              </div>

            </div>

            <div class="bg-[#E5E5EA]/75 p-1 rounded-2xl flex items-center gap-1">
              <button data-on-click="${registerUIHandler(function (event) {openTeacherManagement('titulares');})}" class="flex-1 min-w-0 py-2 px-2 sm:px-3 text-xs sm:text-sm font-medium rounded-xl transition-all ${
  managementActiveTab === 'titulares' ? 'bg-white text-[#1D1D1F] shadow-xs font-semibold' : 'text-[#8E8E93] hover:text-[#1D1D1F]'}">
                Professores Titulares (${
  titulares.length})
              </button>
              <button data-on-click="${registerUIHandler(function (event) {openTeacherManagement('substitutos');})}" class="flex-1 min-w-0 py-2 px-2 sm:px-3 text-xs sm:text-sm font-medium rounded-xl transition-all ${
  managementActiveTab === 'substitutos' ? 'bg-white text-[#1D1D1F] shadow-xs font-semibold' : 'text-[#8E8E93] hover:text-[#1D1D1F]'}">
                Professores Substitutos (${
  substitutos.length})
              </button>
            </div>

            <div class="grid grid-cols-1 ${canEditSchedule() ? 'md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]' : ''} gap-5 items-start">
              <form data-edit-only data-on-submit="${registerUIHandler(function (event) {event.preventDefault();addTeacherFromModal(managementActiveTab);})}" class="min-w-0 p-4 bg-[#F5F5F7] rounded-2xl border border-[#E5E5EA] space-y-4">
                <h4 class="text-sm font-semibold text-[#1D1D1F]">Cadastrar ${managementActiveTab === 'titulares' ? 'professor titular' : 'substituto'}</h4>
                <div class="space-y-1.5">
                  <label for="modalNewTeacherName" class="block text-xs font-medium">Nome completo <span class="text-[#86868B]">(obrigatório)</span></label>
                  <input type="text" id="modalNewTeacherName" name="teacherName" required autocomplete="name" placeholder="Nome completo..." class="w-full min-w-0 text-sm bg-white border border-[#D2D2D7] rounded-xl px-3 py-3 outline-none focus:border-[#0071E3] focus:ring-2 focus:ring-blue-100" />
                </div>
                ${managementActiveTab === 'substitutos' ? `
                  <div class="space-y-1.5">
                    <label for="modalNewTeacherPhone" class="block text-xs font-medium">Telefone <span class="text-[#86868B]">(opcional)</span></label>
                    <input type="tel" id="modalNewTeacherPhone" name="teacherPhone" autocomplete="tel" placeholder="DDD e telefone" class="w-full min-w-0 text-sm bg-white border border-[#D2D2D7] rounded-xl px-3 py-3 outline-none focus:border-[#0071E3] focus:ring-2 focus:ring-blue-100" />
                  </div>
                ` : ''}
                <button type="submit" class="w-full min-h-[44px] px-4 py-3 bg-[#0071E3] hover:bg-[#0077ED] text-white text-sm font-medium rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0071E3]">Cadastrar</button>
                <p id="managementFeedback" role="status" aria-live="polite" class="text-xs leading-relaxed ${persistenceError ? 'text-red-700' : 'text-emerald-700'}">${managementFeedback ? persistenceError ? 'Cadastro incluído na lista, mas não foi possível salvar. Verifique sua conexão.' : managementFeedback : ''}</p>
              </form>
              <section class="min-w-0 space-y-3" aria-label="Registros cadastrados">
                <h4 class="text-xs font-semibold text-[#86868B] uppercase tracking-wide">${managementActiveTab === 'titulares' ? 'Titulares cadastrados' : 'Substitutos cadastrados'}</h4>
                ${(managementActiveTab === 'titulares' ? titulares : substitutos).length === 0 ? '<p class="p-4 text-sm text-[#86868B] bg-[#F5F5F7] rounded-2xl">Nenhum cadastro ainda. Preencha o formulário para começar.</p>' : ''}
            <div class="space-y-2">
              ${(managementActiveTab === 'titulares' ? titulares : substitutos).map((t, idx) => {
    const name = typeof t === 'string' ? t : t.name || '';
    const phone = typeof t === 'object' ? t.phone : null;
    return `
                  <div class="p-3 bg-[#F5F5F7] hover:bg-[#EBF3FF] rounded-2xl flex items-center justify-between gap-2 text-xs">
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="w-8 h-8 shrink-0 rounded-full bg-white border border-[#E5E5EA] flex items-center justify-center font-bold text-[#0071E3]">
                        ${allocationEscape(name.split(' ').map((n) => n[0]).slice(0, 2).join(''))}
                      </div>
                      <div class="min-w-0 [overflow-wrap:anywhere]">
                        <div class="font-medium text-[#1D1D1F] break-words">${allocationEscape(name)}</div>
                        ${phone ? `<div class="text-[10px] text-[#86868B]">${allocationEscape(phone)}</div>` : ''}
                      </div>
                    </div>
                    <button data-edit-only data-on-click="${registerUIHandler(function (event) {removeTeacherFromModal(idx, managementActiveTab);})}" aria-label="Excluir professor" class="touch-target shrink-0 p-2 text-[#86868B] hover:text-red-600 rounded-xl">
                      <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                  </div>
                `;
  }).join('')}
            </div>

              </section>
            </div>

            <div class="pt-2 border-t border-[#E5E5EA] flex justify-end">
              <button data-on-click="${registerUIHandler(function (event) {closeTeacherManagement();})}" class="px-5 py-2.5 bg-[#1D1D1F] hover:bg-black text-white text-xs font-medium rounded-xl">
                Concluir
              </button>
            </div>
          </div>
        </main>
      `;
}

function removeTeacherFromModal(idx, tab) {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  if (tab === 'titulares') {
    state.teachers.titulares.splice(idx, 1);
  } else {
    state.teachers.substitutos.splice(idx, 1);
  }
  saveState();
  renderApp();
}

function addTeacherFromModal(tab) {if (!canEditSchedule()) {showToast('Seu perfil permite apenas consulta.');return;}
  const nameInput = document.getElementById('modalNewTeacherName');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    nameInput?.focus();
    return;
  }

  if (tab === 'titulares') {
    state.teachers.titulares.push(name);
  } else {
    const phoneInput = document.getElementById('modalNewTeacherPhone');
    const phone = phoneInput ? phoneInput.value.trim() : '';
    state.teachers.substitutos.push({ name, phone });
  }
  managementFeedback = 'Cadastro incluído. Salvando…';
  const saving = saveState();
  renderApp();
  document.getElementById('modalNewTeacherName')?.focus({ preventScroll: true });
  saving?.then(() => {
    managementFeedback = persistenceError ? 'Não foi possível salvar. Verifique sua conexão.' : 'Cadastro salvo com sucesso.';
    if (state.isManagementModalOpen && managementActiveTab === tab) {
      renderApp();
      document.getElementById('modalNewTeacherName')?.focus({ preventScroll: true });
    }
  });
}

// ==========================================
// 17. MODAL GUIAS DE INSTALAÇÃO PWA
// ==========================================
function renderIOSGuideModal() {
  return `
        <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 ios-blur animate-in fade-in duration-200" data-on-click="${registerUIHandler(function (event) {pwaState.showIOSGuide = false;renderApp();})}">
          <div class="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-4 animate-in slide-in-from-bottom sm:zoom-in-95 duration-250" data-on-click="${registerUIHandler(function (event) {event.stopPropagation();})}">
            <div class="w-12 h-12 rounded-2xl bg-[#0071E3] text-white flex items-center justify-center mx-auto shadow-sm">
              <i data-lucide="smartphone" class="w-6 h-6"></i>
            </div>

            <div class="text-center space-y-1">
              <h3 class="text-base font-bold text-[#1D1D1F]">Instalar EduScale no iPhone / iPad</h3>
              <p class="text-xs text-[#86868B]">Siga o passo a passo do Safari para fixar o app na tela inicial:</p>
            </div>

            <div class="space-y-3 bg-[#F5F5F7] p-4 rounded-2xl text-xs text-[#1D1D1F]">
              <div class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-full bg-white flex items-center justify-center font-bold text-[#0071E3] shrink-0 shadow-2xs">1</div>
                <div>Toque no botão <strong>Compartilhar</strong> (<i data-lucide="share" class="inline w-3.5 h-3.5 text-[#0071E3]"></i>) na barra inferior do Safari.</div>
              </div>
              <div class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-full bg-white flex items-center justify-center font-bold text-[#0071E3] shrink-0 shadow-2xs">2</div>
                <div>Role as opções e toque em <strong>"Adicionar à Tela de Início"</strong> (<i data-lucide="plus-square" class="inline w-3.5 h-3.5 text-[#0071E3]"></i>).</div>
              </div>
              <div class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-full bg-white flex items-center justify-center font-bold text-[#0071E3] shrink-0 shadow-2xs">3</div>
                <div>Toque em <strong>Adicionar</strong> no canto superior direito para concluir.</div>
              </div>
            </div>

            <button data-on-click="${registerUIHandler(function (event) {pwaState.showIOSGuide = false;renderApp();})}" class="w-full py-2.5 bg-[#1D1D1F] hover:bg-black text-white text-xs font-semibold rounded-xl transition-all">
              Entendido
            </button>
          </div>
        </div>
      `;
}

function renderGeneralGuideModal() {
  return `
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 ios-blur animate-in fade-in duration-200" data-on-click="${registerUIHandler(function (event) {pwaState.showGeneralGuide = false;renderApp();})}">
          <div class="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6 space-y-4 animate-in zoom-in-95 duration-200" data-on-click="${registerUIHandler(function (event) {event.stopPropagation();})}">
            <div class="w-12 h-12 rounded-2xl bg-[#0071E3] text-white flex items-center justify-center mx-auto shadow-sm">
              <i data-lucide="download" class="w-6 h-6"></i>
            </div>

            <div class="text-center space-y-1">
              <h3 class="text-base font-bold text-[#1D1D1F]">Instalar EduScale</h3>
              <p class="text-xs text-[#86868B]">Para instalar o aplicativo no seu navegador:</p>
            </div>

            <div class="space-y-2 bg-[#F5F5F7] p-4 rounded-2xl text-xs text-[#1D1D1F]">
              <p>• <strong>No Chrome / Edge:</strong> Clique no ícone de computador/instalação na barra de endereços (ao lado da estrela de favoritos) ou no menu de 3 pontos &gt; <strong>"Instalar EduScale"</strong>.</p>
              <p>• <strong>No Android:</strong> Toque no menu de 3 pontos &gt; <strong>"Adicionar à tela inicial"</strong> ou <strong>"Instalar aplicativo"</strong>.</p>
            </div>

            <button data-on-click="${registerUIHandler(function (event) {pwaState.showGeneralGuide = false;renderApp();})}" class="w-full py-2.5 bg-[#1D1D1F] hover:bg-black text-white text-xs font-semibold rounded-xl transition-all">
              Fechar
            </button>
          </div>
        </div>
      `;
}

// Inicialização
checkSession();

import { parseContactLine, parseContactList, normalizePhone, interpolate, processSpintax } from '../shared/phone.js';
import { sendWithRetry } from '../shared/message-retry.js';
import { parseScriptImport } from '../shared/script-format.js';
const $ = id => document.getElementById(id);
let cfg = {}, allLogs = [], currentFilter = 'all';
let runState = { total: 0, rows: [], startedAt: 0, done: 0, success: 0, status: 'Enviando mensagens...', contact: '—', timer: null, poll: null };
let dispatchPaused = false;
const call = (path, options = {}) => new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'backend', path, options: { ...options, body: options.body == null ? undefined : JSON.stringify(options.body) } }, r => r?.ok ? resolve(r.data) : reject(new Error(r?.error || 'Backend indisponível'))));
const msg = (text, error = false) => { $('status').textContent = ` ${text}`; $('status').style.color = error ? 'var(--bad)' : 'var(--ok)'; };
const clock = seconds => { seconds = Math.max(0, Math.floor(seconds)); const h = String(Math.floor(seconds / 3600)).padStart(2, '0'); const m = String(Math.floor(seconds % 3600 / 60)).padStart(2, '0'); const s = String(seconds % 60).padStart(2, '0'); return `${h}:${m}:${s}`; };
function updateRun(done, success, status, contact) { const total = runState.total || 0; if (done != null) runState.done = Number(done) || 0; if (success != null) runState.success = Number(success) || 0; if (status != null) runState.status = status; if (contact != null && contact !== '') runState.contact = contact; done = Number(runState.done || 0); success = Number(runState.success || 0); status = runState.status || 'Enviando mensagens...'; contact = runState.contact || '—'; const pct = total ? Math.min(100, done / total * 100) : 0; $('runCount').textContent = `${done} / ${total}`; $('runSuccess').textContent = success; $('runBar').style.width = `${pct}%`; $('runStatus').textContent = status; $('runContact').textContent = contact || '—'; const elapsed = runState.startedAt ? (Date.now() - runState.startedAt) / 1000 : 0; $('runElapsed').textContent = clock(elapsed); $('runEstimate').textContent = done && total > done ? clock(elapsed / done * (total - done)) : done >= total && total ? '00:00:00' : clock(total * ((cfg.minDelay || 15) + (cfg.maxDelay || 30)) / 2); }
function updateQueueProgress(done, total = runState.total) { done = Math.max(0, Number(done) || 0); total = Math.max(0, Number(total) || 0); const progress = total ? Math.min(100, Math.round(done / total * 100)) : 0; $('bar').style.width = `${progress}%`; $('percent').textContent = `${progress}%`; $('txtEnvios').textContent = `${done} / ${total} mensagens`; }
function beginRun(rows) { clearInterval(runState.timer); clearInterval(runState.poll); runState = { total: rows.length, rows, startedAt: Date.now(), done: 0, success: 0, status: 'Preparando fila...', contact: rows[0]?.name || rows[0]?.phone || '—', timer: null, poll: null }; runState.timer = setInterval(() => updateRun(), 1000); updateQueueProgress(0, rows.length); updateRun(); }
function finishRun(success, failed = 0, status = 'Disparo concluído', completed = runState.total) { clearInterval(runState.timer); clearInterval(runState.poll); updateRun(completed, success, status, failed ? `${failed} com erro` : 'Concluído'); }
function pollRun() { clearInterval(runState.poll); runState.poll = setInterval(async () => { try { const d = await call('/api/messages'); const phones = new Set(runState.rows.map(x => x.phone)); const items = (d.data || []).filter(x => phones.has(x.to || x.to_phone)); const done = items.filter(x => ['sent','delivered','read','failed','cancelled'].includes(x.state)); const success = items.filter(x => ['sent','delivered','read'].includes(x.state)).length; const failed = items.filter(x => ['failed','cancelled'].includes(x.state)).length; const current = items.find(x => x.state === 'pending' || x.state === 'processing'); updateRun(done.length, success, done.length >= runState.total ? 'Disparo concluído' : 'Enviando mensagens...', current?.to || '—'); if (done.length >= runState.total) finishRun(success, failed); } catch {} }, 1500); }
async function localDispatchLogs() { const result = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'storage:get', keys: ['v10DispatchLogs'] }, resolve)); return result?.data?.v10DispatchLogs || []; }
async function saveLocalDispatchLog(message) { const logs = await localDispatchLogs(); const item = { created_at: new Date().toISOString(), level: message.status === 'ERRO' ? 'error' : 'info', event: `web.${String(message.status || 'result').toLowerCase()}`, details: { name: message.nome || '', phone: message.numero || '', status: message.status || '', message: message.mensagem || '' } }; await new Promise(resolve => chrome.runtime.sendMessage({ type: 'storage:set', data: { v10DispatchLogs: [item, ...logs].slice(0, 500) } }, resolve)); return item; }
async function refreshLocalDashboard() { const result = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'storage:get', keys: ['v10DispatchLogs', 'v10LogsHiddenBefore'] }, resolve)); const cutoff = Number(result?.data?.v10LogsHiddenBefore || 0); allLogs = (result?.data?.v10DispatchLogs || []).filter(x => (Date.parse(x.created_at || '') || 0) > cutoff); const ok = allLogs.filter(x => ['ok', 'sent', 'delivered', 'read'].includes(String(x.details?.status || '').toLowerCase())).length; const errors = allLogs.filter(x => x.level === 'error' || String(x.details?.status || '').toUpperCase() === 'ERRO').length; $('mTotal').textContent = allLogs.length; $('mOk').textContent = ok; $('mErrors').textContent = errors; $('mResponded').textContent = 0; $('mTyping').textContent = 0; $('conversion').textContent = allLogs.length ? `${Math.round((ok / allLogs.length) * 100)}% de entrega` : 'Sem dados'; renderLogs(); renderChart(); }
async function restoreActiveDispatch() {
  const result = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'storage:get', keys: ['v10ActiveDispatch', 'v10LastDispatch'] }, resolve));
  let active = result?.data?.v10ActiveDispatch;
  const last = result?.data?.v10LastDispatch;
  if (!active?.active) {
    if (!last?.rows?.length) return;
    runState = { total: last.rows.length, rows: last.rows, startedAt: Date.parse(last.savedAt || '') || 0, timer: null, poll: null };
    updateQueueProgress(Number(active?.sent || 0), last.rows.length);
    updateRun(Number(active?.sent || 0), Number(active?.sent || 0), active?.error || (active?.stoppedAt ? 'Último disparo parado' : 'Último disparo concluído'), active?.lastContact || 'Concluído');
    return;
  }
  if (!active.total) {
    active = { ...active, active: false, paused: false, stoppedAt: new Date().toISOString() };
    await new Promise(resolve => chrome.runtime.sendMessage({ type: 'storage:set', data: { v10ActiveDispatch: active } }, resolve));
    return;
  }
  let liveDispatch = null;
  try { const tab = await whatsappTab(); liveDispatch = (await sendWhatsApp(tab.id, { type: 'whatsapp:status' }))?.data?.dispatch || null; } catch {}
  // O popup é descartável. A ausência de um snapshot vivo não autoriza apagar
  // a fila persistida: a aba pode estar entre duas mensagens ou o content script
  // pode ter sido reinicializado. O usuário ainda pode retomar a fila salva.
  if (liveDispatch?.active) active = { ...active, sent: liveDispatch.sent, total: liveDispatch.total || active.total, paused: liveDispatch.paused, waitingForBusinessHours: liveDispatch.waitingForBusinessHours };
  const rows = Array.isArray(last?.rows) ? last.rows : parseContactList($('contacts').value).filter(x => x.valid);
  clearInterval(runState.timer);
  dispatchPaused = Boolean(active.paused);
  runState = { total: active.total, rows, startedAt: Date.now(), timer: setInterval(async () => {
    const current = (await new Promise(resolve => chrome.runtime.sendMessage({ type: 'storage:get', keys: ['v10ActiveDispatch'] }, resolve))).data?.v10ActiveDispatch || active;
    if (!current.active) { finishRun(current.sent || 0, current.error ? 1 : 0, current.error || (current.stoppedAt ? 'Fila parada' : 'Disparo concluído'), current.sent || 0); return; }
    dispatchPaused = Boolean(current.paused);
    updateQueueProgress(current.sent || 0, current.total || active.total);
    updateRun(current.sent || 0, current.sent || 0, current.waitingForBusinessHours ? 'Aguardando horário comercial...' : current.paused ? 'Fila pausada' : liveDispatch?.active ? 'Disparo em andamento...' : 'Fila persistida; monitorando a aba...', current.currentName || current.currentContact || current.lastContact || '—');
  }, 1000), poll: null };
    updateQueueProgress(active.sent || 0, active.total);
    updateRun(active.sent || 0, active.sent || 0, active.waitingForBusinessHours ? 'Aguardando horário comercial...' : active.paused ? 'Fila pausada' : 'Disparo em andamento...', active.currentName || active.currentContact || active.lastContact || '—');
}
function updateDispatchControls() { $('queue').textContent = '▶ INICIAR DISPARO NO WHATSAPP WEB'; }
async function whatsappTab() {
  if (!chrome.tabs?.query) {
    const error = new Error('Este ambiente não disponibilizou a API de sessões do WhatsApp para a extensão.');
    error.code = 'WHATSAPP_TABS_API_UNAVAILABLE';
    throw error;
  }

  let tabs = [];
  try {
    // No Painel MultiSessão, a extensão é carregada na partição da conta.
    // Consultar diretamente a URL evita depender de "aba ativa" no Electron.
    tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  } catch (error) {
    console.warn('[V10][popup] consulta filtrada de sessões indisponível; tentando consulta ampla', error?.message || error);
  }

  if (!Array.isArray(tabs) || !tabs.length) {
    try { tabs = await chrome.tabs.query({}); } catch { tabs = []; }
  }

  const tab = (Array.isArray(tabs) ? tabs : []).find(candidate => {
    try { return new URL(candidate.url || '').hostname === 'web.whatsapp.com'; } catch { return false; }
  });

  if (!tab?.id) {
    const error = new Error('Nenhuma sessão WhatsApp foi encontrada neste perfil da extensão. No Painel MultiSessão, carregue a V10 no mesmo número/conta e abra a sessão WhatsApp.');
    error.code = 'NO_WHATSAPP_SESSION';
    throw error;
  }
  return tab;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function sendMessageSafe(tabId, message) {
  const action = message.acao || message.type;
  return sendWithRetry(
    () => new Promise((resolve, reject) => chrome.tabs.sendMessage(tabId, message, result => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(result);
    })),
    {
      delays: [0, 300, 650, 1000, 1500, 2000, 2500],
      errorMessage: 'Não foi possível comunicar com a extensão dentro do WhatsApp Web. Confirme que a sessão do perfil está aberta no Painel MultiSessão e recarregue a sessão se necessário.',
      onRetry: ({ attempt, error }) => console.warn('[V10][popup] aguardando resposta do WhatsApp', {
        acao: action,
        tentativa: attempt,
        erro: error?.message || String(error)
      })
    }
  );
}
async function sendWhatsApp(tabId, message) { return sendMessageSafe(tabId, message); }
async function dispatchOnWhatsApp(rows, scripts, warmUpLimite) {
  const tab = await whatsappTab();
  console.log('[V10][popup→content] iniciar_disparo', { msgCount: rows.length, delay: `${cfg.minDelay || 15}-${cfg.maxDelay || 30}`, timestamp: Date.now() });
  const status = await sendWhatsApp(tab.id, { type: 'whatsapp:status' });
  if (!status?.data?.connected) throw new Error('WhatsApp Web não está conectado ou a sessão não foi reconhecida.');
  beginRun(rows);
  dispatchPaused = false;
  const startedAt = Date.now();
  const initialState = { active: true, paused: false, total: rows.length, sent: 0, startedAt, lastContact: rows[0]?.name || rows[0]?.phone || '—' };
  await new Promise(resolve => chrome.runtime.sendMessage({ type: 'storage:set', data: { v10LastDispatch: { rows, scripts, savedAt: new Date().toISOString() }, v10ActiveDispatch: initialState } }, resolve));
  return new Promise(async (resolve, reject) => {
    const listener = (message, sender) => {
      if (sender.tab?.id !== tab.id) return;
      if (message.acao === 'dispatch_status' && message.parado) {
        chrome.runtime.onMessage.removeListener(listener);
        dispatchPaused = false;
        updateQueueProgress(Number(message.enviados || 0), rows.length);
        finishRun(Number(message.enviados || 0), 0, 'Fila parada', Number(message.enviados || 0));
        resolve({ queued: Number(message.enviados || 0), stopped: true });
        return;
      }
      if (message.acao === 'dispatch_status') {
        dispatchPaused = Boolean(message.pausado);
        updateRun(null, null, message.esperandoHorario ? 'Aguardando horário comercial...' : dispatchPaused ? 'Fila pausada' : 'Disparo em andamento...', message.nome || message.contato);
        return;
      }
      if (message.acao === 'log_resultado') {
        const done = Number(message.enviados || 0); const success = message.status === 'OK' ? done : Math.max(0, done - 1);
        setTimeout(() => refreshLocalDashboard().catch(() => {}), 100);
        updateQueueProgress(done, rows.length);
        updateRun(done, success, done >= rows.length ? 'Disparo concluído' : 'Enviando mensagens...', message.nome || message.numero || '—');
      }
      if (message.acao === 'dispatch_concluido') {
        chrome.runtime.onMessage.removeListener(listener);
        const failed = message.erro ? rows.length : 0;
        const completed = Number(message.enviados ?? rows.length); const limited = Boolean(message.limiteAtingido || completed < rows.length);
        updateQueueProgress(completed, rows.length);
        if (message.erro) { finishRun(0, failed, message.erro, completed); reject(new Error(message.erro)); } else { finishRun(completed, 0, limited ? 'Limite diário de warm-up atingido' : 'Disparo concluído', completed); resolve({ queued: completed, total: rows.length, limited }); }
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    try {
      const minDelay = Math.max(15, Math.min(30, Number(cfg.minDelay) || 15)); const maxDelay = Math.max(minDelay, Math.min(30, Number(cfg.maxDelay) || 30));
      const config = { min: minDelay, max: maxDelay, pausaLoteAtiva: Number(cfg.pauseEvery) > 0, qtdLote: Number(cfg.pauseEvery) || 20, tempoLoteMin: Number(cfg.pauseMinutes) || 5, businessEnabled: Boolean(cfg.businessEnabled), businessStart: cfg.businessStart || '08:00', businessEnd: cfg.businessEnd || '20:00', weekdays: Array.isArray(cfg.weekdays) ? cfg.weekdays : [1, 2, 3, 4, 5] };
      const accepted = await sendWhatsApp(tab.id, { acao: 'iniciar_disparo', fila: { lista: rows.map(x => ({ num: x.phone, nome: x.name, campos: x.fields || {} })), scripts, config }, warmUpLimite, ignoraDuplicatas: cfg.ignoreDuplicates !== false });
      if (!accepted?.accepted) throw new Error(accepted?.error || 'O WhatsApp Web não confirmou o início do disparo. Recarregue a aba e tente novamente.');
    } catch (error) { chrome.runtime.onMessage.removeListener(listener); await new Promise(resolve => chrome.runtime.sendMessage({ type: 'storage:set', data: { v10ActiveDispatch: { ...initialState, active: false, paused: false, stoppedAt: new Date().toISOString(), error: error.message } } }, resolve)); finishRun(0, rows.length, error.message); reject(error); }
  });
}
async function sendWhatsAppCommand(action) { const tab = await whatsappTab(); return sendWhatsApp(tab.id, { acao: action }); }
async function verifyConnection() {
  $('connectionStatus').textContent = 'Verificando conexão...';
  try {
    const tab = await whatsappTab();
    const r = await sendWhatsApp(tab.id, { type: 'whatsapp:status' });
    const connected = Boolean(r?.data?.connected);
    const reason = r?.data?.reason || 'A sessão não foi reconhecida.';
    $('connectionStatus').textContent = connected ? 'Conectado ao WhatsApp Web.' : `Aba encontrada, mas não conectada: ${reason}`;
    $('runConnectionStatus').textContent = connected ? '● Conectado: Conta Autenticada' : '● WhatsApp Web não autenticado';
    $('runPhone').textContent = r?.data?.phone || '—';
  } catch (error) {
    $('connectionStatus').textContent = `Falha ao verificar: ${error.message}`;
    $('runConnectionStatus').textContent = error.code === 'NO_WHATSAPP_TAB' ? '● WhatsApp Web não encontrado' : `● Falha na conexão: ${error.message}`;
    $('runPhone').textContent = '—';
  }
}
$('verifyConnection').onclick = verifyConnection;
function switchTab(name) { document.querySelectorAll('.tab-btn').forEach(x => x.classList.toggle('active', x.dataset.target === name)); document.querySelectorAll('.aba').forEach(x => x.classList.toggle('active', x.id === name)); }
document.querySelectorAll('.tab-btn').forEach(btn => btn.onclick = () => { switchTab(btn.dataset.target); if (btn.dataset.target === 'dashboard') refreshDashboard(); });

async function load() {
  const result = await new Promise(r => chrome.runtime.sendMessage({ type: 'settings:get' }, r));
  cfg = result?.data || {};
  $('onboarding').style.display = cfg.onboardingDone ? 'none' : 'block';
  document.body.classList.toggle('light-mode', cfg.theme === 'light');
  cfg.mode = 'web'; loadSettingsForm(); renderScriptFields(cfg.scriptPool || []); $('scriptName').value = cfg.scriptName || ''; $('contacts').value = cfg.contacts || ''; $('batchLists').value = cfg.batchLists || ''; $('batchName').value = cfg.batchName || ''; loadProfiles();
  await refreshDashboard(); await loadSavedScripts(); await restoreActiveDispatch();
}
function loadSettingsForm() {
  cfg.mode = 'web'; $('minDelay').value = Math.max(15, Math.min(30, Number(cfg.minDelay) || 15)); $('maxDelay').value = Math.max(Number($('minDelay').value), Math.min(30, Number(cfg.maxDelay) || 30));
  $('pauseEvery').value = cfg.pauseEvery ?? 20; $('pauseMinutes').value = cfg.pauseMinutes ?? 5; $('businessEnabled').checked = Boolean(cfg.businessEnabled);
  $('businessStart').value = cfg.businessStart || '08:00'; $('businessEnd').value = cfg.businessEnd || '20:00'; $('ignoreDuplicates').checked = cfg.ignoreDuplicates !== false; $('sentDays').value = cfg.sentDays ?? 30;
  $('warmupEnabled').checked = Boolean(cfg.warmupEnabled); $('warmupStart').value = cfg.warmupStart || '';
  document.querySelectorAll('.weekday').forEach(x => x.checked = (cfg.weekdays || [1,2,3,4,5]).includes(Number(x.value)));
  updateDispatchControls();
}
function collectSettings() { const minDelay = Math.max(15, Math.min(30, Number($('minDelay').value) || 15)); const maxDelay = Math.max(minDelay, Math.min(30, Number($('maxDelay').value) || 30)); $('minDelay').value = minDelay; $('maxDelay').value = maxDelay; return { ...cfg, mode: 'web', minDelay, maxDelay, pauseEvery: Number($('pauseEvery').value), pauseMinutes: Number($('pauseMinutes').value), businessEnabled: $('businessEnabled').checked, businessStart: $('businessStart').value, businessEnd: $('businessEnd').value, weekdays: [...document.querySelectorAll('.weekday:checked')].map(x => Number(x.value)), ignoreDuplicates: $('ignoreDuplicates').checked, sentDays: Number($('sentDays').value), warmupEnabled: $('warmupEnabled').checked, warmupStart: $('warmupStart').value, scriptPool: getScriptPool(), scriptName: $('scriptName').value, contacts: $('contacts').value, batchLists: $('batchLists').value, batchName: $('batchName').value, filters: { ...(cfg.filters || {}), query: $('logSearch').value || '' } }; }
async function saveSettings(silent = false) { cfg = collectSettings(); await new Promise(r => chrome.runtime.sendMessage({ type: 'settings:set', data: cfg }, r)); if (!silent) msg('configurações salvas'); }
let draftSaveTimer = null;
function persistDraftSoon() { clearTimeout(draftSaveTimer); draftSaveTimer = setTimeout(async () => { cfg.scriptPool = getScriptPool(); cfg.scriptName = $('scriptName').value; cfg.contacts = $('contacts').value; cfg.batchLists = $('batchLists').value; cfg.batchName = $('batchName').value; await saveSettings(true); }, 250); }
function bindDraftPersistence() { document.querySelectorAll('.script-variation').forEach(x => x.oninput = persistDraftSoon); $('scriptName').oninput = persistDraftSoon; $('contacts').oninput = persistDraftSoon; $('batchLists').oninput = persistDraftSoon; $('batchName').oninput = persistDraftSoon; }

async function refreshDashboard() { await refreshLocalDashboard(); msg('modo local · WhatsApp Web'); }
let dashboardLocalTimer = setInterval(() => { if ($('dashboard')?.classList.contains('active')) refreshLocalDashboard().catch(() => {}); }, 1000);
let connectionTimer = setInterval(() => refreshWhatsAppConnection().catch(() => {}), 5000);
async function refreshWhatsAppConnection() {
  try {
    const tab = await whatsappTab();
    const r = await sendWhatsApp(tab.id, { type: 'whatsapp:status' });
    const connected = Boolean(r?.data?.connected);
    $('runConnectionStatus').textContent = connected ? '● Conectado: Conta Autenticada' : '● WhatsApp Web não autenticado';
    $('runPhone').textContent = r?.data?.phone || '—';
  } catch (error) {
    const missing = error?.code === 'NO_WHATSAPP_TAB';
    $('runConnectionStatus').textContent = missing ? '● WhatsApp Web não encontrado' : `● Falha na conexão: ${error.message}`;
    $('runPhone').textContent = '—';
  }
}
function renderChart() { const days = []; for (let i = 6; i >= 0; i--) { const date = new Date(Date.now() - i * 86400000); const key = date.toISOString().slice(0, 10); const count = allLogs.filter(x => String(x.created_at || '').slice(0, 10) === key && /sent|delivered|read|queue.processed|web.ok/.test(x.event || '')).length; days.push({ label: `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}`, count }); } const max = Math.max(1, ...days.map(x => x.count)); $('chart').innerHTML = days.map(x => `<div class="chart-col"><div class="chart-bar" style="height:${Math.max(3, x.count / max * 78)}px" title="${x.count}"></div><span>${x.label}</span></div>`).join(''); }
function renderLogs() {
  const query = ($('logSearch').value || '').toLowerCase(); const now = Date.now();
  const start = currentFilter === 'today' ? new Date().setHours(0, 0, 0, 0) : currentFilter === 'yesterday' ? new Date(new Date().setHours(0, 0, 0, 0) - 86400000).getTime() : currentFilter === '7' ? now - 7 * 86400000 : currentFilter === '30' ? now - 30 * 86400000 : 0;
  const end = currentFilter === 'yesterday' ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : Infinity;
  const data = allLogs.filter(x => { const time = Date.parse(x.created_at || '') || 0; return time >= start && time < end && (!query || JSON.stringify(x).toLowerCase().includes(query)); });
  const body = $('logBody'); body.replaceChildren();
  const cell = value => { const td = document.createElement('td'); td.textContent = String(value ?? ''); return td; };
  if (!data.length) { const row = document.createElement('tr'); const td = cell('Sem registros.'); td.colSpan = 6; td.className = 'muted'; row.appendChild(td); body.appendChild(row); return; }
  data.slice(0, 100).forEach((x, i) => {
    const detail = x.details || {}; const status = x.level === 'error' ? 'ERRO' : String(x.event || '').replace(/^queue\./, '').toUpperCase();
    const row = document.createElement('tr'); row.append(cell(i + 1), cell(detail.name || detail.phone || 'Sistema'), cell(detail.phone || '—'));
    const statusCell = cell(`${status}${x.reviewed ? ' · REVISADO' : ''}`); const chip = document.createElement('span'); chip.className = `status-chip ${x.level === 'error' ? 'error' : ''}`; chip.textContent = statusCell.textContent; statusCell.replaceChildren(chip); row.appendChild(statusCell);
    row.append(cell(detail.variant || '—'), cell(String(x.created_at || '').slice(11, 19))); body.appendChild(row);
  });
}
$('logSearch').oninput = renderLogs;
document.querySelectorAll('.date-filter').forEach(b => b.onclick = () => { document.querySelectorAll('.date-filter').forEach(x => x.classList.remove('active')); b.classList.add('active'); currentFilter = b.dataset.days; renderLogs(); });

$('theme').onclick = async () => { cfg.theme = document.body.classList.contains('light-mode') ? 'dark' : 'light'; document.body.classList.toggle('light-mode', cfg.theme === 'light'); await saveSettings(true); };
$('finishOnboarding').onclick = async () => { cfg.onboardingDone = true; $('onboarding').style.display = 'none'; await saveSettings(true); };
$('backup').onclick = async () => { try { const local = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'backup' }, resolve)); if (!local?.ok) throw new Error(local?.error || 'Não foi possível criar o backup local.'); let backend = null; let backendNote = 'O backend estava indisponível; foram salvos somente os dados desta extensão.'; try { const remote = await call('/api/backups', { method: 'POST', body: {} }); backend = remote.data || remote; backendNote = 'Dados locais e do backend incluídos.'; } catch {} const payload = { format: 'v10-backup-v1', createdAt: new Date().toISOString(), extension: local.data || {}, backend }; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); a.download = `v10-backup-${localDateKey()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); msg(`backup baixado em JSON. ${backendNote}`); } catch (e) { msg(e.message, true); } };
$('exportLogs').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(allLogs, null, 2)], { type: 'application/json' })); a.download = 'logs-v10.json'; a.click(); };
$('clearLogs').onclick = async () => { const cutoff = Date.now(); await new Promise(resolve => chrome.runtime.sendMessage({ type: 'storage:set', data: { v10LogsHiddenBefore: cutoff } }, resolve)); allLogs = []; renderLogs(); await refreshLocalDashboard(); msg('visualização limpa; histórico salvo preservado'); };
$('markLogs').onclick = async () => { const result = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'storage:get', keys: ['v10DispatchLogs'] }, resolve)); const logs = result?.data?.v10DispatchLogs || []; const visible = new Set(allLogs.map(x => `${x.created_at}|${x.event}|${x.details?.phone || ''}`)); const updated = logs.map(x => visible.has(`${x.created_at}|${x.event}|${x.details?.phone || ''}`) ? { ...x, reviewed: true } : x); await new Promise(resolve => chrome.runtime.sendMessage({ type: 'storage:set', data: { v10DispatchLogs: updated } }, resolve)); await refreshLocalDashboard(); msg(`${visible.size} registro(s) marcado(s) como revisado(s)`); };
$('openScripts').onclick = () => switchTab('scripts');

function renderScriptFields(values = []) { const box = $('scriptFields'); box.innerHTML = ''; for (let i = 0; i < 20; i++) { const wrap = document.createElement('div'); wrap.className = 'list-card'; wrap.innerHTML = `<label>Variação ${i + 1}</label><textarea class="script-variation" data-index="${i}" placeholder="Variação ${i + 1}"></textarea>`; box.appendChild(wrap); wrap.querySelector('textarea').value = values[i] || ''; } bindDraftPersistence(); }
function getScriptPool() { return [...document.querySelectorAll('.script-variation')].map(x => x.value.trim()).filter(Boolean); }
function scriptIdFor(name) { return name.toLowerCase().trim().replace(/[^a-z0-9à-ÿ]+/gi, '-').replace(/^-+|-+$/g, '') || 'scripts-v10'; }
function renderSavedScripts(items = []) {
  const select = $('savedScripts'); select.replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = '-- Scripts em Edição --'; select.appendChild(placeholder);
  items.forEach(x => { const option = document.createElement('option'); option.value = x.id; option.textContent = `${x.name} · versão ${x.version}`; option.dataset.name = x.name || ''; option.dataset.content = JSON.stringify(x.content || []); option.dataset.local = x.local ? 'true' : 'false'; select.appendChild(option); });
  const history = $('scriptsList'); history.replaceChildren(); const title = document.createElement('h2'); title.textContent = 'Histórico de versões'; history.appendChild(title);
  if (!items.length) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'Nenhuma versão carregada.'; history.appendChild(empty); return; }
  items.slice(0, 20).forEach(x => { const card = document.createElement('div'); card.className = 'list-card'; const name = document.createElement('b'); name.textContent = x.name || 'Scripts'; const meta = document.createElement('div'); meta.className = 'muted'; meta.textContent = `Versão ${x.version} · ${(x.content || []).length} variação(ões)${x.local ? ' · salva neste dispositivo' : ''}`; card.append(name, meta); history.appendChild(card); });
}
async function loadSavedScripts() { const localItems = Array.isArray(cfg.scriptVersions) ? cfg.scriptVersions : []; let items = localItems; try { const d = await call('/api/scripts'); const remoteItems = d.data || []; const remoteIds = new Set(remoteItems.map(x => x.id)); items = [...remoteItems, ...localItems.filter(x => x.local && !remoteIds.has(x.id))]; cfg.scriptVersions = items; await saveSettings(true); } catch { /* backend opcional: as versões locais continuam disponíveis */ } renderSavedScripts(items); }
 $('savedScripts').onchange = e => { const o = e.target.selectedOptions[0]; if (!o?.dataset.content) return; renderScriptFields(JSON.parse(o.dataset.content)); $('scriptName').value = o.dataset.name || ''; persistDraftSoon(); };
async function saveScriptVersion(name, content) {
  const scriptId = scriptIdFor(name);
  const localVersion = { id: `local-${Date.now()}`, scriptId, version: (cfg.scriptVersions || []).filter(x => x.scriptId === scriptId).length + 1, name, content, createdAt: new Date().toISOString(), local: true };
  let saved = localVersion;
  let localOnly = true;
  try { saved = await call('/api/scripts', { method: 'POST', body: { scriptId, name, content } }); localOnly = false; } catch {}
  cfg.scriptPool = content;
  cfg.scriptName = name;
  cfg.scriptVersions = [saved, ...(cfg.scriptVersions || []).filter(x => x.id !== saved.id)];
  await saveSettings(true);
  renderSavedScripts(cfg.scriptVersions);
  $('savedScripts').value = saved.id;
  return { saved, localOnly };
}
$('saveScripts').onclick = async () => { try { const name = $('scriptName').value.trim() || 'Scripts V10'; const content = getScriptPool(); if (!content.length) return alert('Preencha pelo menos uma variação.'); const { localOnly } = await saveScriptVersion(name, content); msg(localOnly ? 'scripts salvos neste dispositivo; backend indisponível' : 'scripts salvos'); } catch (e) { msg(e.message, true); } };
$('clearScripts').onclick = async () => { if (!confirm('Limpar as 20 variações do rascunho?')) return; renderScriptFields(); $('scriptName').value = ''; cfg.scriptPool = []; cfg.scriptName = ''; await saveSettings(true); msg('rascunho de scripts limpo e salvo'); };
$('deleteScripts').onclick = async () => { const select = $('savedScripts'); const id = select.value; if (!id) return msg('Selecione uma versão salva para excluir', true); if (!confirm('Excluir a versão selecionada?')) return; try { const option = select.selectedOptions[0]; if (option?.dataset.local !== 'true') { try { await call(`/api/scripts/${encodeURIComponent(id)}`, { method: 'DELETE' }); } catch (e) { return msg(e.message, true); } } cfg.scriptVersions = (cfg.scriptVersions || []).filter(x => x.id !== id); renderScriptFields(); $('scriptName').value = ''; cfg.scriptPool = []; cfg.scriptName = ''; await saveSettings(true); renderSavedScripts(cfg.scriptVersions); msg('versão excluída'); } catch (e) { msg(e.message, true); } };
$('exportScripts').onclick = () => { const data = JSON.stringify({ name: $('scriptName').value, scripts: getScriptPool() }, null, 2); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = `${$('scriptName').value || 'scripts-v10'}.json`; a.click(); };
$('importScripts').onclick = () => $('scriptsFile').click();
$('scriptsFile').onchange = async e => {
  const input = e.target;
  const file = e.target.files?.[0];
  if (!file) return;
  input.value = '';
  try {
    const scripts = parseScriptImport(file.name, await file.text());
    if (!scripts.length) throw new Error('O arquivo não contém scripts válidos.');
    const importedName = file.name.replace(/\.[^.]+$/, '').trim() || 'Scripts V10';
    const imported = scripts.slice(0, 20);
    $('scriptName').value = importedName;
    renderScriptFields(imported);
    const { localOnly } = await saveScriptVersion(importedName, imported);
    const extra = scripts.length > imported.length ? ` · ${scripts.length - imported.length} excedente(s) ignorado(s); limite de 20` : '';
    msg(`${imported.length} variação(ões) importada(s) e salvas${localOnly ? ' neste dispositivo' : ''}${extra}`);
  } catch (error) { msg(error.message, true); }
};

async function readFile(file) { const buf = await file.arrayBuffer(); if (window.XLSX && /\.(xlsx|xls)$/i.test(file.name)) { const wb = XLSX.read(buf, { type: 'array' }); return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ';' }); } return new TextDecoder().decode(buf); }
$('importContacts').onclick = () => $('file').click();
$('file').onchange = async e => { const input = e.target; const file = input.files?.[0]; if (!file) return; input.value = ''; try { $('contacts').value = await readFile(file); persistDraftSoon(); $('preview').click(); } catch (error) { $('previewBox').textContent = `Falha ao importar arquivo: ${error.message}`; } };
$('preview').onclick = () => { const rows = parseContactList($('contacts').value); const valid = rows.filter(x => x.valid); const invalid = rows.length - valid.length; const box = $('previewBox'); box.replaceChildren(); const summary = document.createElement('div'); summary.textContent = `${valid.length} válidos · ${invalid} inválidos`; box.appendChild(summary); const script = getScriptPool()[0] || ''; if (!script) { const hint = document.createElement('div'); hint.textContent = 'Cadastre scripts na aba Scripts.'; box.appendChild(hint); return; } valid.slice(0, 3).forEach(contact => { const sample = document.createElement('div'); sample.textContent = processSpintax(interpolate(script, contact)); box.appendChild(sample); }); };
function localDateKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
function successfulLog(log) { return ['OK', 'SENT', 'DELIVERED', 'READ'].includes(String(log.details?.status || '').toUpperCase()); }
async function dispatch(text = $('contacts').value, scriptOverride = null) {
  const state = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'storage:get', keys: ['v10ActiveDispatch'] }, resolve));
  if (state?.data?.v10ActiveDispatch?.active) throw new Error('Já existe um disparo em andamento. Pause ou pare a fila antes de iniciar outra.');
  let rows = parseContactList(text).filter(x => x.valid);
  if (cfg.ignoreDuplicates !== false) rows = [...new Map(rows.map(x => [x.phone, x])).values()];
  const scripts = Array.isArray(scriptOverride) && scriptOverride.length ? scriptOverride : getScriptPool();
  if (!scripts.length) throw new Error('Cadastre pelo menos um script na aba Scripts.');
  if (!rows.length) throw new Error('Importe uma lista CSV válida.');
  const logs = await localDispatchLogs();
  const sentDays = Math.max(0, Math.min(3650, Number(cfg.sentDays) || 0));
  if (sentDays > 0) {
    const cutoff = Date.now() - sentDays * 86400000;
    const recentlySent = new Set(logs.filter(x => successfulLog(x) && (Date.parse(x.created_at || '') || 0) >= cutoff).map(x => normalizePhone(x.details?.phone)).filter(Boolean));
    rows = rows.filter(x => !recentlySent.has(x.phone));
  }
  if (!rows.length) throw new Error(sentDays > 0 ? `Todos os contatos válidos já receberam uma mensagem nos últimos ${sentDays} dias.` : 'A lista não contém contatos válidos.');
  let warmUpLimite;
  if (cfg.warmupEnabled) {
    const start = cfg.warmupStart ? new Date(`${cfg.warmupStart}T00:00:00`) : new Date();
    const today = new Date();
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dayIndex = Math.max(0, Math.floor((todayDay - startDay) / 86400000));
    const dailyCaps = [10, 20, 30, 50, 80, 120, 180, 250, 350, 500];
    const cap = dailyCaps[Math.min(dayIndex, dailyCaps.length - 1)];
    const todayKey = localDateKey(today);
    const sentToday = logs.filter(x => successfulLog(x) && localDateKey(new Date(x.created_at || 0)) === todayKey).length;
    warmUpLimite = Math.max(0, cap - sentToday);
    if (!warmUpLimite) throw new Error(`Limite de warm-up de ${cap} mensagens atingido hoje.`);
  }
  // O popup pode ser fechado imediatamente após o clique; salve o rascunho
  // antes de entregar a execução à aba do WhatsApp e ao service worker.
  cfg.contacts = text;
  cfg.scriptPool = scripts;
  await saveSettings(true);
  const result = await dispatchOnWhatsApp(rows, scripts, warmUpLimite);
  if (result.stopped) { $('previewBox').textContent = `Disparo parado após ${result.queued} contato(s) processado(s).`; return result; }
  const progress = result.total ? Math.round(result.queued / result.total * 100) : 100;
  $('bar').style.width = `${progress}%`; $('percent').textContent = `${progress}%`;
  $('txtEnvios').textContent = `${result.queued} / ${result.total} mensagens`;
  $('previewBox').textContent = result.limited ? `Limite diário de warm-up atingido: ${result.queued} de ${result.total} contatos processados; os restantes continuam salvos para retomada.` : `${result.queued} mensagens enviadas pelo WhatsApp Web.`;
  return result;
}

$('queue').onclick = async () => { try { await dispatch(); } catch (e) { $('previewBox').textContent = e.message; } };
$('resumeDispatch').onclick = async () => {
  try {
    const result = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'storage:get', keys: ['v10LastDispatch', 'v10ActiveDispatch'] }, resolve));
    const last = result?.data?.v10LastDispatch;
    const active = result?.data?.v10ActiveDispatch;
    if (active?.active && active.paused) {
      const response = await sendWhatsAppCommand('pausar');
      if (!response?.ok || response.paused) throw new Error(response?.error || 'O WhatsApp não confirmou a retomada.');
      dispatchPaused = false;
      $('runStatus').textContent = 'Disparo em andamento...';
      msg('fila retomada');
      return;
    }
    if (active?.active) throw new Error('O disparo está em andamento; use Pausar ou Parar antes de retomá-lo.');
    if (!last?.rows?.length) throw new Error('Nenhum disparo anterior foi salvo.');
    const sent = Math.min(Number(active?.sent || 0), last.rows.length);
    const rows = last.rows.slice(sent);
    if (!rows.length) throw new Error('O último disparo já foi concluído.');
    const csvCell = value => { const text = String(value ?? ''); return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
    $('contacts').value = rows.map(x => [x.phone, x.name, ...Object.values(x.fields || {})].map(csvCell).join(';')).join('\n');
    cfg.contacts = $('contacts').value; await saveSettings(true);
    const resumed = await dispatch($('contacts').value, last.scripts || getScriptPool());
    $('previewBox').textContent = resumed.limited ? `Limite diário de warm-up atingido: ${resumed.queued} de ${resumed.total} contatos processados; os restantes continuam salvos para retomada.` : `${resumed.queued} contatos restantes processados pelo WhatsApp Web.`;
  } catch (e) { $('previewBox').textContent = e.message; msg(e.message, true); }
};
$('pause').onclick = async () => { try { const stored = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'storage:get', keys: ['v10ActiveDispatch'] }, resolve)); if (!stored?.data?.v10ActiveDispatch?.active) throw new Error('Não existe disparo ativo para pausar.'); const response = await sendWhatsAppCommand('pausar'); if (!response?.ok) throw new Error(response?.error || 'O WhatsApp não confirmou a pausa.'); dispatchPaused = response.paused; $('runStatus').textContent = dispatchPaused ? 'Fila pausada' : 'Disparo em andamento...'; msg(dispatchPaused ? 'fila pausada' : 'fila retomada'); } catch (e) { msg(e.message, true); } };
$('stop').onclick = async () => { try { const response = await sendWhatsAppCommand('parar'); dispatchPaused = false; $('pause').textContent = 'Ⅱ PAUSAR'; clearInterval(runState.timer); clearInterval(runState.poll); $('runStatus').textContent = response?.stopped ? 'Fila parada' : 'Nenhum disparo ativo'; msg(response?.stopped ? 'fila parada' : 'nenhum disparo ativo'); } catch (e) { msg(e.message, true); } };
if ($('undo')) $('undo').onclick = () => new Promise(r => chrome.runtime.sendMessage({ type: 'undo' }, r)).then(r => msg(r.ok ? 'alteração desfeita' : (r.error || 'nada para desfazer'), !r.ok));

function loadProfiles() { const select = $('profileSelect'); select.innerHTML = '<option value="">(nenhum)</option>'; Object.keys(cfg.profiles || {}).forEach(name => { const o = document.createElement('option'); o.value = name; o.textContent = name; select.appendChild(o); }); }
$('saveProfile').onclick = async () => { const name = $('profileName').value.trim(); if (!name) return msg('Informe um nome para o perfil.', true); cfg.profiles = cfg.profiles || {}; cfg.profiles[name] = { settings: collectSettings(), scripts: getScriptPool(), contacts: $('contacts').value }; await saveSettings(true); loadProfiles(); $('profileSelect').value = name; msg(`perfil ${name} salvo`); };
$('profileSelect').onchange = async e => { const p = cfg.profiles?.[e.target.value]; if (!p) return; Object.assign(cfg, p.settings || {}); loadSettingsForm(); renderScriptFields(p.scripts || []); $('scriptName').value = cfg.scriptName || ''; $('contacts').value = p.contacts ?? cfg.contacts ?? ''; $('batchLists').value = cfg.batchLists || ''; $('batchName').value = cfg.batchName || ''; await saveSettings(true); };
$('deleteProfile').onclick = async () => { const name = $('profileSelect').value; if (!name) return; delete cfg.profiles[name]; await saveSettings(true); loadProfiles(); msg('perfil removido'); };
$('save').onclick = () => saveSettings();
$('verifyConnection').onclick = async () => { try { const tab = await whatsappTab(); const r = await sendWhatsApp(tab.id, { type: 'whatsapp:status' }); const connected = Boolean(r?.data?.connected); $('connectionStatus').textContent = connected ? 'Conectado ao WhatsApp Web.' : 'A aba foi encontrada, mas a sessão não foi reconhecida.'; $('runConnectionStatus').textContent = connected ? '● Conectado: Conta Autenticada' : '● WhatsApp Web não autenticado'; $('runPhone').textContent = r?.data?.phone || '—'; } catch (e) { $('connectionStatus').textContent = e.message; } };
$('update').onclick = async () => { try { const u = await call('/api/updates/check'); const box = $('updateBox'); box.replaceChildren(); if (!u.available) { box.textContent = u.message || 'V10 atualizada.'; return; } const title = document.createElement('b'); title.textContent = `Nova versão ${u.latestVersion} disponível. `; box.appendChild(title); try { const url = new URL(u.url); if (!['https:', 'http:'].includes(url.protocol)) throw new Error('URL inválida'); const link = document.createElement('a'); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Ver notas e atualizar'; box.appendChild(link); } catch {} const notes = document.createElement('div'); notes.textContent = u.notes || ''; box.appendChild(notes); } catch (e) { $('updateBox').textContent = e.message; } };
$('restore').onclick = () => $('restoreFile').click(); $('restoreFile').onchange = async e => { const input = e.target; const file = input.files?.[0]; if (!file) return; input.value = ''; try { const parsed = JSON.parse(await file.text()); const envelope = parsed?.format === 'v10-backup-v1'; let localRestored = false, backendResult = null, warning = ''; if (envelope && parsed.extension) { const extensionData = { ...parsed.extension }; if (extensionData.v10ActiveDispatch?.active) extensionData.v10ActiveDispatch = { ...extensionData.v10ActiveDispatch, active: false, paused: false, stoppedAt: new Date().toISOString() }; const local = await new Promise(resolve => chrome.runtime.sendMessage({ type: 'restore', data: extensionData }, resolve)); if (!local?.ok) throw new Error(local?.error || 'Falha ao restaurar os dados locais.'); localRestored = true; cfg = extensionData.v10Settings || cfg; loadSettingsForm(); renderScriptFields(cfg.scriptPool || []); $('scriptName').value = cfg.scriptName || ''; $('contacts').value = cfg.contacts || ''; $('batchLists').value = cfg.batchLists || ''; $('batchName').value = cfg.batchName || ''; } const backendData = envelope ? parsed.backend : (Array.isArray(parsed.contacts) ? parsed : null); if (backendData) { try { backendResult = await call('/api/backups/restore', { method: 'POST', body: backendData }); } catch (error) { warning = ` Dados de backend não restaurados: ${error.message}`; } } else if (!localRestored) throw new Error('O arquivo não contém dados de backup reconhecidos.'); const c = backendResult?.collections || {}; const summary = backendResult ? `${backendResult.restored} contatos e ${c.campaigns || 0} campanhas do backend` : (localRestored ? 'dados locais da extensão' : 'dados'); alert(`Backup restaurado: ${summary}.${warning}`); await refreshDashboard(); } catch (e) { alert(`Falha ao restaurar: ${e.message}`); } };
$('startBatch').onclick = async () => { try { const lists = $('batchLists').value.split(/\n\s*\n/).filter(Boolean); if (!lists.length) throw new Error('Informe ao menos uma lista.'); $('contacts').value = lists[0]; switchTab('disparos'); await dispatch(lists[0]); $('batchStatus').textContent = `Primeira lista processada. ${lists.length - 1} lista(s) aguardando revisão.`; } catch (e) { $('batchStatus').textContent = e.message; } };
$('stopBatch').onclick = async () => { try { const response = await sendWhatsAppCommand('parar'); $('batchStatus').textContent = response?.stopped ? 'Disparo do lote parado no WhatsApp Web.' : 'Nenhum disparo ativo no WhatsApp Web.'; } catch (e) { $('batchStatus').textContent = e.message; } };

load().then(() => refreshWhatsAppConnection().catch(() => {}));

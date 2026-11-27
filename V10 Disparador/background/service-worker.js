const DEFAULTS = {
  backendUrl: 'http://localhost:3000',
  mode: 'web',
  theme: 'system',
  defaultCountry: '55',
  minDelay: 15,
  maxDelay: 30,
  batchPause: 0,
  backendApiKey: '',
  onboardingDone: false,
  filters: {}
};

async function settings() {
  const data = await chrome.storage.local.get('v10Settings');
  return { ...DEFAULTS, ...(data.v10Settings || {}) };
}

async function api(path, options = {}) {
  const cfg = await settings();
  const headers = { 'content-type': 'application/json', ...(options.headers || {}) };
  if (cfg.backendApiKey) headers.authorization = `Bearer ${cfg.backendApiKey}`;
  const requestOptions = { ...options, headers };
  if (typeof requestOptions.body !== 'string' && requestOptions.body != null) requestOptions.body = JSON.stringify(requestOptions.body);
  let response;
  try { response = await fetch(`${cfg.backendUrl.replace(/\/$/, '')}${path}`, requestOptions); }
  catch { throw new Error(`Backend indisponível em ${cfg.backendUrl}. Inicie o backend ou use o modo local da aba Scripts.`); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Backend ${response.status}`);
  return body;
}

async function readDispatch() {
  const stored = await chrome.storage.local.get('v10ActiveDispatch');
  if (stored.v10ActiveDispatch) return stored.v10ActiveDispatch;
  // Electron exposes only a subset of chrome.storage; session is not guaranteed.
  if (!chrome.storage.session?.get) return {};
  try {
    const session = await chrome.storage.session.get('v10ActiveDispatch');
    return session.v10ActiveDispatch || {};
  } catch (error) {
    console.warn('[V10] storage.session indisponível; usando storage.local:', error.message);
    return {};
  }
}

async function saveDispatch(patch) {
  const current = await readDispatch();
  const snapshot = { ...current, ...patch, heartbeatAt: new Date().toISOString() };
  await chrome.storage.local.set({ v10ActiveDispatch: snapshot });
  if (chrome.storage.session?.set) {
    try { await chrome.storage.session.set({ v10ActiveDispatch: snapshot }); }
    catch (error) { console.warn('[V10] storage.session indisponível; estado mantido em storage.local:', error.message); }
  }
}

// Mensagens de resultado e de posição da fila chegam quase simultaneamente.
// Serializar a leitura/escrita evita que uma resposta antiga grave um contador
// menor depois de uma resposta mais nova.
let dispatchMutationQueue = Promise.resolve();
function enqueueDispatchMutation(mutation) {
  const next = dispatchMutationQueue.then(mutation, mutation);
  dispatchMutationQueue = next.catch(() => {});
  return next;
}

async function scheduleMaintenanceAlarms() {
  // chrome.alarms is not part of Electron's documented supported extension APIs.
  if (!chrome.alarms?.create) return;
  chrome.alarms.create('v10-update-check', { periodInMinutes: 1440 });
  chrome.alarms.create('v10-weekly-backup', { periodInMinutes: 10080, delayInMinutes: 5 });
}

async function createWeeklyBackup() {
  if (!chrome.downloads?.download) throw new Error('Backup automático por downloads não está disponível neste ambiente.');
  const data = await chrome.storage.local.get(null);
  const date = new Date().toISOString().slice(0, 10);
  const payload = encodeURIComponent(JSON.stringify({ format: 'v10-backup-v1', createdAt: new Date().toISOString(), extension: data }, null, 2));
  await chrome.downloads.download({ url: `data:application/json;charset=utf-8,${payload}`, filename: `private_bot_backups/backup_${date}.json`, saveAs: false, conflictAction: 'overwrite' });
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await settings();
  await chrome.storage.local.set({ v10Settings: current, v10Version: '10.0.0' });
  await scheduleMaintenanceAlarms();
});
chrome.runtime.onStartup.addListener(() => scheduleMaintenanceAlarms());
if (chrome.alarms?.onAlarm?.addListener) chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'v10-update-check') {
    try { const result = await api('/api/updates/check'); await chrome.storage.local.set({ v10Update: result }); }
    catch (error) { console.warn('[V10] atualização:', error.message); }
  }
  if (alarm.name === 'v10-weekly-backup') {
    try { await createWeeklyBackup(); console.log('[V10][service-worker→downloads] backup semanal criado'); }
    catch (error) { console.warn('[V10] backup semanal:', error.message); }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.acao === 'log_resultado') {
        await enqueueDispatchMutation(async () => {
          const stored = await chrome.storage.local.get(['v10DispatchLogs', 'v10ActiveDispatch']);
          const logs = stored.v10DispatchLogs || [];
          const active = stored.v10ActiveDispatch || {};
          const item = {
            created_at: new Date().toISOString(),
            level: message.status === 'ERRO' ? 'error' : 'info',
            event: `web.${String(message.status || 'result').toLowerCase()}`,
            details: { name: message.nome || '', phone: message.numero || '', status: message.status || '', message: message.mensagem || '' }
          };
          await chrome.storage.local.set({
            v10DispatchLogs: [item, ...logs].slice(0, 500),
            v10ActiveDispatch: {
              ...active,
              active: Boolean(active.active),
              paused: Boolean(active.active && active.paused),
              total: Number(message.total || active.total || 0),
              sent: Math.max(Number(active.sent || 0), Number(message.enviados || 0)),
              lastContact: message.nome || message.numero || '—',
              lastStatus: message.status || '',
              heartbeatAt: item.created_at
            }
          });
        });
        return sendResponse({ ok: true });
      }
      if (message.acao === 'progresso_fila') {
        await enqueueDispatchMutation(async () => {
          const active = await readDispatch();
          await saveDispatch({ active: Boolean(active.active), sent: Math.max(Number(active.sent || 0), Number(message.indice || 0)) });
        });
        return sendResponse({ ok: true });
      }
      if (message.acao === 'dispatch_status') {
        await enqueueDispatchMutation(async () => {
          const active = await readDispatch();
          await saveDispatch({
            active: message.parado ? false : Boolean(active.active),
            paused: message.parado ? false : Boolean(active.active && message.pausado),
            waitingForBusinessHours: message.parado ? false : Boolean(message.esperandoHorario),
            sent: Math.max(Number(active.sent || 0), Number(message.enviados ?? 0)),
            total: Number(message.total ?? active.total ?? 0),
            currentContact: message.contato || active.currentContact || '',
            currentName: message.nome || active.currentName || '',
            phase: message.fase || (message.parado ? 'parado' : active.phase || ''),
            stoppedAt: message.parado ? new Date().toISOString() : active.stoppedAt
          });
        });
        return sendResponse({ ok: true });
      }
      if (message.acao === 'dispatch_concluido') {
        await enqueueDispatchMutation(async () => {
          const active = await readDispatch();
          await saveDispatch({
            ...active,
            active: false,
            paused: false,
            sent: Math.max(Number(active.sent || 0), Number(message.enviados ?? 0)),
            total: Number(message.total ?? active.total ?? 0),
            waitingForBusinessHours: false,
            completedAt: new Date().toISOString(),
            error: message.erro || ''
          });
        });
        return sendResponse({ ok: true });
      }
      if (message.type === 'settings:get') return sendResponse({ ok: true, data: await settings() });
      if (message.type === 'settings:set') { const next = { ...(await settings()), ...message.data }; await chrome.storage.local.set({ v10Settings: next }); return sendResponse({ ok: true, data: next }); }
      if (message.type === 'backend') return sendResponse({ ok: true, data: await api(message.path, message.options || {}) });
      if (message.type === 'storage:get') return sendResponse({ ok: true, data: await chrome.storage.local.get(message.keys || null) });
      if (message.type === 'storage:set') {
        const data = message.data || {};
        await chrome.storage.local.set(data);
        if (data.v10ActiveDispatch && chrome.storage.session?.set) {
          try { await chrome.storage.session.set({ v10ActiveDispatch: data.v10ActiveDispatch }); }
          catch (error) { console.warn('[V10] storage.session indisponível; estado mantido em storage.local:', error.message); }
        }
        return sendResponse({ ok: true });
      }
      if (message.type === 'backup') { const data = await chrome.storage.local.get(null); return sendResponse({ ok: true, data, createdAt: new Date().toISOString() }); }
      if (message.type === 'restore') { await chrome.storage.local.set(message.data || {}); return sendResponse({ ok: true }); }
      if (message.type === 'undo') { const d = await chrome.storage.local.get('v10Undo'); if (!d.v10Undo) return sendResponse({ ok: false, error: 'Nada para desfazer.' }); await chrome.storage.local.set(d.v10Undo.snapshot); await chrome.storage.local.remove('v10Undo'); return sendResponse({ ok: true }); }
      sendResponse({ ok: false, error: 'Mensagem desconhecida.' });
    } catch (error) { sendResponse({ ok: false, error: error.message }); }
  })();
  return true;
});

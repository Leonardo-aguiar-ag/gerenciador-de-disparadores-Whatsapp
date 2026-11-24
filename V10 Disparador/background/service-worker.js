const DEFAULTS = {
  backendUrl: 'http://localhost:3000',
  mode: 'web',
  theme: 'system',
  defaultCountry: '55',
  minDelay: 8,
  maxDelay: 20,
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
  const requestOptions = { ...options, headers }; if (typeof requestOptions.body !== 'string' && requestOptions.body != null) requestOptions.body = JSON.stringify(requestOptions.body); let response; try { response = await fetch(`${cfg.backendUrl.replace(/\/$/, '')}${path}`, requestOptions); } catch { throw new Error(`Backend indisponível em ${cfg.backendUrl}. Inicie o backend ou use o modo local da aba Scripts.`); }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Backend ${response.status}`);
  return body;
}

chrome.runtime.onInstalled.addListener(async () => {
  const current = await settings();
  await chrome.storage.local.set({ v10Settings: current, v10Version: '10.0.0' });
  chrome.alarms.create('v10-update-check', { periodInMinutes: 1440 });
});
chrome.runtime.onStartup.addListener(() => chrome.alarms.create('v10-update-check', { periodInMinutes: 1440 }));
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'v10-update-check') {
    try { const result = await api('/api/updates/check'); await chrome.storage.local.set({ v10Update: result }); } catch (error) { console.warn('[V10] atualização:', error.message); }
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message.acao === 'log_resultado') { const stored = await chrome.storage.local.get('v10DispatchLogs'); const logs = stored.v10DispatchLogs || []; const item = { created_at: new Date().toISOString(), level: message.status === 'ERRO' ? 'error' : 'info', event: `web.${String(message.status || 'result').toLowerCase()}`, details: { name: message.nome || '', phone: message.numero || '', status: message.status || '', message: message.mensagem || '' } }; await chrome.storage.local.set({ v10DispatchLogs: [item, ...logs].slice(0, 500), v10ActiveDispatch: { active: true, total: Number(message.total || 0), sent: Number(message.enviados || 0), lastContact: message.nome || message.numero || '—', lastStatus: message.status || '' } }); return sendResponse({ ok: true }); }
      if (message.acao === 'progresso_fila') { const active = (await chrome.storage.local.get('v10ActiveDispatch')).v10ActiveDispatch || {}; await chrome.storage.local.set({ v10ActiveDispatch: { ...active, active: true, sent: Number(message.indice || active.sent || 0) } }); return sendResponse({ ok: true }); }
      if (message.acao === 'dispatch_status') { const active = (await chrome.storage.local.get('v10ActiveDispatch')).v10ActiveDispatch || {}; await chrome.storage.local.set({ v10ActiveDispatch: { ...active, paused: Boolean(message.pausado) } }); return sendResponse({ ok: true }); }
      if (message.acao === 'dispatch_concluido') { const active = (await chrome.storage.local.get('v10ActiveDispatch')).v10ActiveDispatch || {}; await chrome.storage.local.set({ v10ActiveDispatch: { ...active, active: false, completedAt: new Date().toISOString(), error: message.erro || '' } }); return sendResponse({ ok: true }); }
      if (message.type === 'settings:get') return sendResponse({ ok: true, data: await settings() });
      if (message.type === 'settings:set') { const next = { ...(await settings()), ...message.data }; await chrome.storage.local.set({ v10Settings: next }); return sendResponse({ ok: true, data: next }); }
      if (message.type === 'backend') return sendResponse({ ok: true, data: await api(message.path, message.options || {}) });
      if (message.type === 'storage:get') return sendResponse({ ok: true, data: await chrome.storage.local.get(message.keys || null) });
      if (message.type === 'storage:set') { await chrome.storage.local.set(message.data || {}); return sendResponse({ ok: true }); }
      if (message.type === 'backup') { const data = await chrome.storage.local.get(null); return sendResponse({ ok: true, data, createdAt: new Date().toISOString() }); }
      if (message.type === 'restore') { await chrome.storage.local.set(message.data || {}); return sendResponse({ ok: true }); }
      if (message.type === 'undo') { const d = await chrome.storage.local.get('v10Undo'); if (!d.v10Undo) return sendResponse({ ok: false, error: 'Nada para desfazer.' }); await chrome.storage.local.set(d.v10Undo.snapshot); await chrome.storage.local.remove('v10Undo'); return sendResponse({ ok: true }); }
      sendResponse({ ok: false, error: 'Mensagem desconhecida.' });
    } catch (error) { sendResponse({ ok: false, error: error.message }); }
  })();
  return true;
});

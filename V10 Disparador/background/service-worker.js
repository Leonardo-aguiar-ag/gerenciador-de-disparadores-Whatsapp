const DEFAULTS = {
  backendUrl: 'http://localhost:3000',
  mode: 'simulation',
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
  const response = await fetch(`${cfg.backendUrl.replace(/\/$/, '')}${path}`, { ...options, headers });
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

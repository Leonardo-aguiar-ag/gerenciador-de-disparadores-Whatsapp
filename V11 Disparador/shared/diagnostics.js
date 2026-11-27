export async function platformDiagnostics() {
  const result = { timestamp: new Date().toISOString(), platform: globalThis.navigator?.userAgent || 'extension', apis: {}, checks: [] };
  result.apis.storageLocal = Boolean(globalThis.chrome?.storage?.local);
  result.apis.storageSession = Boolean(globalThis.chrome?.storage?.session);
  result.apis.tabs = Boolean(globalThis.chrome?.tabs?.query);
  result.apis.alarms = Boolean(globalThis.chrome?.alarms?.create);
  result.apis.downloads = Boolean(globalThis.chrome?.downloads?.download);
  result.checks.push({ name: 'storage.local', ok: result.apis.storageLocal, message: result.apis.storageLocal ? 'disponível' : 'indisponível' });
  result.checks.push({ name: 'storage.session', ok: result.apis.storageSession, message: result.apis.storageSession ? 'disponível' : 'opcional/indisponível' });
  if (result.apis.tabs) {
    try {
      const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
      result.whatsappTabs = tabs.length;
      result.checks.push({ name: 'whatsapp.tabs', ok: tabs.length > 0, message: tabs.length ? `${tabs.length} aba(s) encontrada(s)` : 'nenhuma aba encontrada' });
    } catch (error) { result.checks.push({ name: 'whatsapp.tabs', ok: false, message: error.message }); }
  }
  return result;
}

export function technicalLog(event, details = {}, level = 'info') {
  return { id: `log_${Date.now()}_${Math.random().toString(16).slice(2)}`, createdAt: new Date().toISOString(), level, event, details };
}

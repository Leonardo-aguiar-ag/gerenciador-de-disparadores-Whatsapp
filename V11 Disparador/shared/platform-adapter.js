export const platform = Object.freeze({
  hasStorageSession: () => Boolean(globalThis.chrome?.storage?.session),
  hasAlarms: () => Boolean(globalThis.chrome?.alarms?.create),
  hasTabs: () => Boolean(globalThis.chrome?.tabs?.query),
  hasDownloads: () => Boolean(globalThis.chrome?.downloads?.download),
  name: () => /Electron/i.test(globalThis.navigator?.userAgent || '') ? 'electron' : 'chrome'
});

export async function safeSessionSet(data) {
  if (!platform.hasStorageSession()) return { persisted: false, reason: 'storage.session indisponível' };
  try { await chrome.storage.session.set(data); return { persisted: true }; }
  catch (error) { return { persisted: false, reason: error.message }; }
}

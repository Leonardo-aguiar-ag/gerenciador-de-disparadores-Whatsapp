export function migrateV10(data = {}) {
  const settings = data.v11Settings || data.v10Settings || {};
  const legacy = data.v10LastDispatch;
  const migrated = { v11Settings: { ...settings, settingsVersion: 1 }, migratedFrom: data.v10Settings ? 'v10' : null };
  if (legacy?.rows?.length) migrated.legacyQueue = { rows: legacy.rows, scripts: legacy.scripts || [], savedAt: legacy.savedAt || new Date().toISOString(), status: 'READY' };
  return migrated;
}

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createApp } = require('../src/app');

(async () => {
  const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'v8-disparador-')), 'store.json');
  const app = createApp({ dataFile });
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (url, options) => fetch(base + url, { headers: { 'content-type': 'application/json' }, ...options }).then(async r => ({ status: r.status, body: await r.json() }));
    let r = await request('/health'); assert.equal(r.status, 200); assert.equal(r.body.ok, true);
    r = await request('/api/contacts', { method: 'POST', body: JSON.stringify({ name: 'Teste', phone: '5511999999999' }) }); assert.equal(r.status, 201);
    r = await request('/api/campaigns', { method: 'POST', body: JSON.stringify({ name: 'Campanha smoke' }) }); assert.equal(r.status, 201);
    r = await request('/api/messages', { method: 'POST', body: JSON.stringify({ to: '5511999999999', body: 'Olá', eventId: 'evt-1' }) }); assert.equal(r.status, 201);
    const duplicate = await request('/api/messages', { method: 'POST', body: JSON.stringify({ to: '5511999999999', body: 'Olá', eventId: 'evt-1' }) }); assert.equal(duplicate.status, 200);
    r = await request('/api/opt-out', { method: 'POST', body: JSON.stringify({ phone: '5511999999999' }) }); assert.equal(r.status, 200);
    r = await request('/api/messages/process', { method: 'POST', body: '{}' }); assert.equal(r.status, 200); assert.equal(r.body.cancelled, 1);
    r = await request('/api/reports/summary'); assert.equal(r.body.byState.cancelled, 1);
    r = await request('/api/integrations/google-sheets/status'); assert.equal(r.status, 200); assert.equal(r.body.connected, false);
    r = await request('/api/integrations/google-sheets/config', { method: 'POST', body: JSON.stringify({ clientId: 'client-test', clientSecret: 'secret-test', spreadsheetId: 'sheet-test', sheetName: 'Contatos' }) }); assert.equal(r.status, 200); assert.equal(r.body.secretStored, false);
    r = await request('/api/integrations/google-sheets/status'); assert.equal(r.body.spreadsheetId, 'sheet-test'); assert.equal(r.body.sheetName, 'Contatos');
    r = await request('/webhooks/whatsapp', { method: 'POST', body: JSON.stringify({ eventId: 'webhook-1' }) }); assert.equal(r.status, 202);
    r = await request('/webhooks/whatsapp', { method: 'POST', body: JSON.stringify({ eventId: 'webhook-1' }) }); assert.equal(r.body.duplicate, true);
    console.log('smoke: OK');
  } finally { server.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });

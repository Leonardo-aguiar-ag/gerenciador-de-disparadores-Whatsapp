import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v10-'));
process.env.DB_FILE = path.join(dir, 'v10.sqlite');
process.env.PORT = '0';
await import('../dist/server.js');
const { server } = await import('../dist/server.js');
await new Promise(resolve => server.listen(0, resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const request = (url, options) => fetch(base + url, { headers: { 'content-type': 'application/json' }, ...options }).then(async r => ({ status: r.status, body: await r.json() }));

test.after(() => server.close());

test('health e dashboard', async () => { const h = await request('/health'); assert.equal(h.body.version, '10.0.0'); const d = await request('/api/dashboard'); assert.equal(d.body.mode, 'simulation'); });
test('importação, opt-out e fila em simulação', async () => { const p = await request('/api/import/preview', { method: 'POST', body: JSON.stringify({ csv: '5511999999999;Maria\n5511888888888;João\n5511999999999;Duplicado' }) }); assert.equal(p.body.valid, 3); assert.equal(p.body.duplicates, 1); const c = await request('/api/import/commit', { method: 'POST', body: JSON.stringify({ rows: p.body.rows }) }); assert.equal(c.body.created, 2); const camp = await request('/api/campaigns', { method: 'POST', body: JSON.stringify({ name: 'Teste V10', body: 'Olá [NOME]', mode: 'simulation' }) }); assert.equal(camp.status, 201); const q = await request(`/api/campaigns/${camp.body.id}/queue`, { method: 'POST', body: JSON.stringify({ body: 'Olá [NOME]', mode: 'simulation' }) }); assert.equal(q.body.queued, 2); const o = await request('/api/opt-outs', { method: 'POST', body: JSON.stringify({ phone: '5511999999999' }) }); assert.equal(o.body.ok, true); const r = await request('/api/messages/process', { method: 'POST', body: JSON.stringify({ mode: 'simulation' }) }); assert.equal(r.body.cancelled, 1); assert.equal(r.body.simulated, 1); });

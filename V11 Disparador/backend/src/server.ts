// @ts-nocheck
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { createDb, normalizePhone, isValidPhone, now, makeId, json, parse, log } from './db.js';

const PORT = Number(process.env.PORT || 3000);
const REPOSITORY = process.env.GITHUB_REPOSITORY || 'Leonardo-aguiar-ag/gerenciador-de-disparadores-Whatsapp';
const VERSION = '11.0.0';
let queueControl: 'running' | 'paused' | 'stopped' = 'running';
const db = createDb();
const publicDir = path.resolve(new URL('../public/', import.meta.url).pathname);

function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
  res.end(payload);
}
function error(res: http.ServerResponse, status: number, message: string) { return send(res, status, { error: message }); }
async function body(req: http.IncomingMessage) {
  let data = ''; for await (const chunk of req) { data += chunk; if (data.length > 12_000_000) throw new Error('Payload muito grande'); }
  if (!data) return {};
  try { return JSON.parse(data); } catch { return { raw: data }; }
}
function auth(req: http.IncomingMessage) { const required = process.env.V10_API_KEY; return !required || req.headers.authorization === `Bearer ${required}` || req.headers['x-api-key'] === required; }
function rows(sql: string, ...args: any[]) { return db.prepare(sql).all(...args).map((row: any) => ({ ...row, fields: parse(row.fields, {}), tags: parse(row.tags, []), config: parse(row.config, {}) })); }
function contactRow(row: any) { return row ? { ...row, fields: parse(row.fields, {}), tags: parse(row.tags, []), optedOut: Boolean(row.opted_out), funnelStage: row.funnel_stage, consentSource: row.consent_source, consentAt: row.consent_at, createdAt: row.created_at, updatedAt: row.updated_at } : null; }
function messageRow(row: any) { return row ? { ...row, to: row.to_phone, providerMessageId: row.provider_message_id, createdAt: row.created_at, updatedAt: row.updated_at, nextAttemptAt: row.next_attempt_at } : null; }
function splitCsv(text: string) { return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => line.split(/[;,\t]/).map(v => v.trim())); }
function contactFromParts(parts: string[]) { const phone = normalizePhone(parts[0]); const fields: any = {}; parts.slice(2).forEach((v, i) => fields[`campo_${i + 1}`] = v); return { phone, name: parts[1] || '', fields }; }

async function processQueue(modeFilter?: string) {
  if (queueControl !== 'running') return { processed: 0, sent: 0, failed: 0, cancelled: 0, simulated: 0, queueState: queueControl };
  const candidates = db.prepare(`SELECT * FROM messages WHERE state='pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY created_at LIMIT 100`).all(now());
  let sent = 0, failed = 0, cancelled = 0, simulated = 0;
  for (const item of candidates as any[]) {
    const opt = db.prepare('SELECT 1 FROM opt_outs WHERE phone=?').get(item.to_phone); if (opt) { db.prepare("UPDATE messages SET state='cancelled', error=?, updated_at=? WHERE id=?").run('Contato em opt-out', now(), item.id); cancelled++; continue; }
    db.prepare("UPDATE messages SET state='processing', attempts=attempts+1, locked_at=?, updated_at=? WHERE id=? AND state='pending'").run(now(), now(), item.id);
    const fresh: any = db.prepare('SELECT * FROM messages WHERE id=?').get(item.id); if (!fresh || fresh.state !== 'processing') continue;
    try {
      const simulation = modeFilter === 'simulation' || fresh.mode === 'simulation' || !process.env.WHATSAPP_TOKEN;
      if (simulation) { simulated++; db.prepare("UPDATE messages SET state='sent', error=?, updated_at=?, locked_at=NULL WHERE id=?").run('simulation: nenhum envio real foi feito', now(), fresh.id); }
      else {
        const response = await fetch(`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || 'v20.0'}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, { method: 'POST', headers: { authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: fresh.to_phone, type: 'text', text: { body: fresh.body } }) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error?.message || `Cloud API ${response.status}`);
        db.prepare("UPDATE messages SET state='sent', provider_message_id=?, error=NULL, updated_at=?, locked_at=NULL WHERE id=?").run(result.messages?.[0]?.id || null, now(), fresh.id);
      }
      sent++;
    } catch (e) {
      const attempts = Number(fresh.attempts || 1); const terminal = attempts >= Number(fresh.max_attempts || 3);
      db.prepare(`UPDATE messages SET state=?, error=?, next_attempt_at=?, updated_at=?, locked_at=NULL WHERE id=?`).run(terminal ? 'failed' : 'pending', String(e.message), terminal ? null : new Date(Date.now() + Math.min(3600000, 30000 * attempts)).toISOString(), now(), fresh.id); if (terminal) failed++;
    }
  }
  log(db, 'info', 'queue.processed', { processed: candidates.length, sent, failed, cancelled, simulated });
  return { processed: candidates.length, sent, failed, cancelled, simulated };
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`); const method = req.method || 'GET';
  if (url.pathname.startsWith('/api/') && !auth(req)) return error(res, 401, 'API key inválida ou ausente');
  try {
    if (method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, version: VERSION, service: 'v11-backend', database: 'sqlite', queue: db.prepare("SELECT COUNT(*) count FROM messages WHERE state IN ('pending','processing')").get().count });
    if (method === 'GET' && url.pathname === '/api/dashboard') {
      const states = db.prepare('SELECT state, COUNT(*) count FROM messages GROUP BY state').all(); const byState = Object.fromEntries(states.map((x: any) => [x.state, x.count])); const total = Object.values(byState).reduce((a: any, b: any) => a + Number(b), 0) || 1;
      return send(res, 200, { version: VERSION, contacts: db.prepare('SELECT COUNT(*) count FROM contacts').get().count, campaigns: db.prepare('SELECT COUNT(*) count FROM campaigns').get().count, optOuts: db.prepare('SELECT COUNT(*) count FROM opt_outs').get().count, messages: total === 1 && !states.length ? 0 : total, deliveryRate: Math.round(((byState.delivered || 0) + (byState.read || 0)) / total * 100), byState, mode: process.env.WHATSAPP_TOKEN ? 'cloud_api' : 'simulation' });
    }
    if (method === 'GET' && url.pathname === '/api/contacts') { const q = `%${url.searchParams.get('q') || ''}%`; const data = rows('SELECT * FROM contacts WHERE name LIKE ? OR phone LIKE ? ORDER BY updated_at DESC LIMIT 500', q, q).map(contactRow); return send(res, 200, { data }); }
    if (method === 'POST' && url.pathname === '/api/contacts') { const b = await body(req); const phone = normalizePhone(b.phone); if (!isValidPhone(phone)) return error(res, 400, 'Telefone inválido. Use DDI + DDD + número.'); const existing: any = db.prepare('SELECT * FROM contacts WHERE phone=?').get(phone); const t = now(); if (existing) { db.prepare('UPDATE contacts SET name=?, fields=?, tags=?, updated_at=? WHERE id=?').run(b.name || existing.name, json(b.fields || {}), json(b.tags || []), t, existing.id); return send(res, 200, contactRow(db.prepare('SELECT * FROM contacts WHERE id=?').get(existing.id))); } const id = makeId('ct'); db.prepare('INSERT INTO contacts(id,phone,name,fields,tags,consent_source,consent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id, phone, b.name || '', json(b.fields || {}), json(b.tags || []), b.consentSource || null, b.consentSource ? t : null, t, t); return send(res, 201, contactRow(db.prepare('SELECT * FROM contacts WHERE id=?').get(id))); }
    if (method === 'POST' && url.pathname === '/api/import/preview') { const b = await body(req); const parts = b.rows || splitCsv(b.csv || b.raw || ''); const preview = parts.slice(0, 20).map(contactFromParts); const valid = parts.map(contactFromParts).filter(x => isValidPhone(x.phone)); const invalid = parts.length - valid.length; const unique = [...new Map(valid.map(x => [x.phone, x])).values()]; return send(res, 200, { total: parts.length, valid: valid.length, invalid, duplicates: valid.length - unique.length, preview, rows: unique }); }
    if (method === 'POST' && url.pathname === '/api/import/commit') { const b = await body(req); const list = b.rows || splitCsv(b.csv || '').map(contactFromParts); let created = 0, updated = 0, invalid = 0; const t = now(); for (const item of list) { const phone = normalizePhone(item.phone); if (!isValidPhone(phone)) { invalid++; continue; } const old: any = db.prepare('SELECT id FROM contacts WHERE phone=?').get(phone); if (old) { db.prepare('UPDATE contacts SET name=?, fields=?, updated_at=? WHERE id=?').run(item.name || '', json(item.fields || {}), t, old.id); updated++; } else { db.prepare('INSERT INTO contacts(id,phone,name,fields,tags,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').run(makeId('ct'), phone, item.name || '', json(item.fields || {}), '[]', t, t); created++; } } log(db, 'info', 'contacts.imported', { created, updated, invalid }); return send(res, 200, { ok: true, created, updated, invalid }); }
    if (method === 'GET' && url.pathname === '/api/scripts') { const data = db.prepare('SELECT * FROM script_versions ORDER BY script_id, version DESC').all().map((x: any) => ({ ...x, content: parse(x.content, []) })); return send(res, 200, { data }); }
    if (method === 'POST' && url.pathname === '/api/scripts') { const b = await body(req); if (!b.scriptId || !b.name) return error(res, 400, 'scriptId e name são obrigatórios'); const latest: any = db.prepare('SELECT MAX(version) version FROM script_versions WHERE script_id=?').get(b.scriptId); const version = Number(latest?.version || 0) + 1; const item = { id: makeId('scr'), scriptId: b.scriptId, version, name: b.name, content: b.content || [], createdAt: now() }; db.prepare('INSERT INTO script_versions(id,script_id,version,name,content,created_at) VALUES(?,?,?,?,?,?)').run(item.id, item.scriptId, item.version, item.name, json(item.content), item.createdAt); return send(res, 201, item); }
    if (method === 'DELETE' && url.pathname.startsWith('/api/scripts/')) { const id = decodeURIComponent(url.pathname.slice('/api/scripts/'.length)); const result = db.prepare('DELETE FROM script_versions WHERE id=?').run(id); if (!result.changes) return error(res, 404, 'Versão de script não encontrada'); return send(res, 200, { ok: true, id }); }
    if (method === 'GET' && url.pathname === '/api/campaigns') return send(res, 200, { data: rows('SELECT * FROM campaigns ORDER BY updated_at DESC').map(x => ({ ...x, config: parse(x.config, {}), createdAt: x.created_at, updatedAt: x.updated_at })) });
    if (method === 'POST' && url.pathname === '/api/campaigns') { const b = await body(req); if (!b.name) return error(res, 400, 'Nome da campanha é obrigatório'); const id = makeId('cmp'); const t = now(); db.prepare('INSERT INTO campaigns(id,name,status,mode,body,config,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(id, b.name, b.status || 'draft', b.mode || 'simulation', b.body || '', json(b.config || {}), t, t); return send(res, 201, { id, name: b.name, status: b.status || 'draft', mode: b.mode || 'simulation' }); }
    if (method === 'POST' && /^\/api\/campaigns\/[^/]+\/queue$/.test(url.pathname)) { const id = url.pathname.split('/')[3]; const b = await body(req); const campaign: any = db.prepare('SELECT * FROM campaigns WHERE id=?').get(id); if (!campaign) return error(res, 404, 'Campanha não encontrada'); const savedConfig = parse(campaign.config, {}); const scriptPool = [...new Set((b.scripts || savedConfig.scriptPool || []).map((x: any) => String(x || '').trim()).filter(Boolean))]; let order = scriptPool.map((_: any, i: number) => i); const shuffle = (a: number[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }; shuffle(order); let orderIndex = 0; const nextScript = () => { if (!scriptPool.length) return String(b.body || campaign.body || ''); if (orderIndex >= order.length) { shuffle(order); orderIndex = 0; } return scriptPool[order[orderIndex++]]; }; const contacts = (b.contactIds || []).length ? db.prepare(`SELECT * FROM contacts WHERE id IN (${b.contactIds.map(() => '?').join(',')})`).all(...b.contactIds) : (b.phones || []).length ? db.prepare(`SELECT * FROM contacts WHERE opted_out=0 AND phone IN (${b.phones.map(() => '?').join(',')})`).all(...b.phones) : db.prepare('SELECT * FROM contacts WHERE opted_out=0 LIMIT 10000').all(); let queued = 0, skipped = 0; for (const c of contacts as any[]) { if (c.opted_out) { skipped++; continue; } const eventId = `${id}:${c.id}:${b.variant || 'default'}`; try { const fields = parse(c.fields, {}); const selected = nextScript(); const bodyText = selected.replace(/\[NOME\]/gi, c.name).replace(/\[([A-Z0-9_]+)\]/gi, (_: any, k: string) => fields[k.toLowerCase()] || ''); db.prepare('INSERT INTO messages(id,campaign_id,contact_id,to_phone,body,mode,state,event_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(makeId('msg'), id, c.id, c.phone, bodyText, b.mode || campaign.mode, 'pending', eventId, now(), now()); queued++; } catch { skipped++; } } return send(res, 200, { ok: true, queued, skipped, scriptCount: scriptPool.length, noRepeatCycle: true, simulation: (b.mode || campaign.mode) === 'simulation' }); }
    if (method === 'GET' && url.pathname === '/api/messages') return send(res, 200, { data: db.prepare('SELECT * FROM messages ORDER BY created_at DESC LIMIT 1000').all().map(messageRow) });
    if (method === 'GET' && /^\/api\/campaigns\/[^/]+\/report$/.test(url.pathname)) {
      const id = url.pathname.split('/')[3];
      const campaign = db.prepare('SELECT * FROM campaigns WHERE id=?').get(id);
      if (!campaign) return error(res, 404, 'Campanha não encontrada');
      const messages = db.prepare('SELECT * FROM messages WHERE campaign_id=? ORDER BY created_at').all(id);
      const byState = Object.fromEntries(db.prepare('SELECT state, COUNT(*) count FROM messages WHERE campaign_id=? GROUP BY state').all(id).map((x: any) => [x.state, x.count]));
      return send(res, 200, { campaign: { ...campaign, config: parse(campaign.config, {}) }, summary: { total: messages.length, byState }, messages: messages.map(messageRow), generatedAt: now() });
    }
    if (method === 'GET' && url.pathname === '/api/diagnostics') return send(res, 200, { version: VERSION, database: 'sqlite', queueState: queueControl, pending: db.prepare("SELECT COUNT(*) count FROM messages WHERE state IN ('pending','processing')").get().count, logs: db.prepare('SELECT COUNT(*) count FROM audit_logs').get().count, timestamp: now() });
    if (method === 'POST' && url.pathname === '/api/messages/control') { const b = await body(req); const action = b.action; if (!['pause', 'resume', 'stop'].includes(action)) return error(res, 400, 'Ação inválida'); queueControl = action === 'pause' ? 'paused' : action === 'stop' ? 'stopped' : 'running'; if (action === 'stop') db.prepare("UPDATE messages SET state='cancelled', error=?, updated_at=? WHERE state='pending'").run('Fila parada pelo operador', now()); log(db, 'warn', `queue.${action}`, {}); return send(res, 200, { ok: true, queueState: queueControl }); }
    if (method === 'POST' && url.pathname === '/api/messages/process') return send(res, 200, await processQueue((await body(req)).mode));
    if (method === 'POST' && url.pathname === '/api/messages/retry') { const result = db.prepare("UPDATE messages SET state='pending', next_attempt_at=NULL, error=NULL, updated_at=? WHERE state='failed' AND attempts < max_attempts").run(now()); return send(res, 200, { ok: true, requeued: result.changes }); }
    if (method === 'POST' && url.pathname === '/api/opt-outs') { const b = await body(req); const phone = normalizePhone(b.phone); if (!isValidPhone(phone)) return error(res, 400, 'Telefone inválido'); const t = now(); db.prepare('INSERT OR IGNORE INTO opt_outs(id,phone,reason,source,created_at) VALUES(?,?,?,?,?)').run(makeId('out'), phone, b.reason || 'user_request', b.source || 'manual', t); db.prepare('UPDATE contacts SET opted_out=1, updated_at=? WHERE phone=?').run(t, phone); log(db, 'warn', 'contact.opted_out', { phone, source: b.source || 'manual' }); return send(res, 200, { ok: true, phone }); }
    if (method === 'GET' && url.pathname === '/api/opt-outs') return send(res, 200, { data: db.prepare('SELECT * FROM opt_outs ORDER BY created_at DESC').all() });
    if (method === 'DELETE' && url.pathname.startsWith('/api/opt-outs/')) { const phone = normalizePhone(url.pathname.split('/').pop()); db.prepare('DELETE FROM opt_outs WHERE phone=?').run(phone); db.prepare('UPDATE contacts SET opted_out=0, updated_at=? WHERE phone=?').run(now(), phone); return send(res, 200, { ok: true }); }
    if (method === 'GET' && url.pathname === '/api/logs') return send(res, 200, { data: db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 500').all().map((x: any) => ({ ...x, details: parse(x.details, {}) })) });
    if (method === 'POST' && url.pathname === '/api/backups') {
      const dir = path.resolve(process.env.BACKUP_DIR || './data/backups'); fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `v11-${Date.now()}.json`);
      const data = { version: VERSION, exportedAt: now(), contacts: db.prepare('SELECT * FROM contacts').all(), campaigns: db.prepare('SELECT * FROM campaigns').all(), messages: db.prepare('SELECT * FROM messages').all(), optOuts: db.prepare('SELECT * FROM opt_outs').all(), scriptVersions: db.prepare('SELECT * FROM script_versions').all(), auditLogs: db.prepare('SELECT * FROM audit_logs').all() };
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
      db.prepare('INSERT INTO backups(id,file_path,created_at,size_bytes) VALUES(?,?,?,?)').run(makeId('bak'), file, now(), fs.statSync(file).size);
      return send(res, 201, { ok: true, file, data });
    }
    if (method === 'POST' && url.pathname === '/api/backups/restore') {
      const b = await body(req); const source = b.data || b;
      if (!source || !Array.isArray(source.contacts)) return error(res, 400, 'Backup inválido');
      const t = now(); const counts = { contacts: 0, campaigns: 0, messages: 0, optOuts: 0, scriptVersions: 0, auditLogs: 0 };
      const stored = (value: any, fallback: any) => typeof value === 'string' ? parse(value, fallback) : (value ?? fallback);
      db.exec('BEGIN');
      try {
        for (const c of source.contacts) {
          const phone = normalizePhone(c.phone); if (!isValidPhone(phone)) continue;
          db.prepare('INSERT OR REPLACE INTO contacts(id,phone,name,fields,tags,funnel_stage,opted_out,consent_source,consent_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(c.id || makeId('ct'), phone, c.name || '', json(stored(c.fields, {})), json(stored(c.tags, [])), c.funnel_stage || c.funnelStage || 'novo', c.opted_out || c.optedOut ? 1 : 0, c.consent_source || c.consentSource || null, c.consent_at || c.consentAt || null, c.created_at || c.createdAt || t, t);
          counts.contacts++;
        }
        for (const c of source.campaigns || []) {
          if (!c.name) continue;
          db.prepare('INSERT OR REPLACE INTO campaigns(id,name,status,mode,body,config,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(c.id || makeId('cmp'), c.name, c.status || 'draft', c.mode || 'simulation', c.body || '', json(stored(c.config, {})), c.created_at || c.createdAt || t, t);
          counts.campaigns++;
        }
        for (const item of source.optOuts || source.opt_outs || []) {
          const phone = normalizePhone(item.phone); if (!isValidPhone(phone)) continue;
          db.prepare('INSERT OR REPLACE INTO opt_outs(id,phone,reason,source,created_at) VALUES(?,?,?,?,?)').run(item.id || makeId('out'), phone, item.reason || 'user_request', item.source || 'manual', item.created_at || item.createdAt || t);
          db.prepare('UPDATE contacts SET opted_out=1, updated_at=? WHERE phone=?').run(t, phone);
          counts.optOuts++;
        }
        for (const m of source.messages || []) {
          const phone = normalizePhone(m.to_phone || m.to); if (!isValidPhone(phone)) continue;
          db.prepare('INSERT OR REPLACE INTO messages(id,campaign_id,contact_id,to_phone,body,mode,state,attempts,max_attempts,next_attempt_at,provider_message_id,event_id,error,created_at,updated_at,locked_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(m.id || makeId('msg'), m.campaign_id || m.campaignId || null, m.contact_id || m.contactId || null, phone, m.body || '', m.mode || 'simulation', m.state || 'pending', Number(m.attempts || 0), Number(m.max_attempts || m.maxAttempts || 3), m.next_attempt_at || m.nextAttemptAt || null, m.provider_message_id || m.providerMessageId || null, m.event_id || m.eventId || null, m.error || null, m.created_at || m.createdAt || t, m.updated_at || m.updatedAt || t, m.locked_at || m.lockedAt || null);
          counts.messages++;
        }
        for (const s of source.scriptVersions || source.script_versions || []) {
          if (!s.script_id && !s.scriptId) continue;
          db.prepare('INSERT OR REPLACE INTO script_versions(id,script_id,version,name,content,created_at) VALUES(?,?,?,?,?,?)').run(s.id || makeId('scr'), s.script_id || s.scriptId, Number(s.version || 1), s.name || 'Scripts', json(stored(s.content, [])), s.created_at || s.createdAt || t);
          counts.scriptVersions++;
        }
        for (const item of source.auditLogs || source.audit_logs || []) {
          db.prepare('INSERT OR REPLACE INTO audit_logs(id,level,event,details,created_at) VALUES(?,?,?,?,?)').run(item.id || makeId('log'), item.level || 'info', item.event || 'backup.imported', json(stored(item.details, {})), item.created_at || item.createdAt || t);
          counts.auditLogs++;
        }
        db.exec('COMMIT');
        log(db, 'warn', 'backup.restored', counts);
        return send(res, 200, { ok: true, restored: counts.contacts, collections: counts });
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    }
    if (method === 'GET' && url.pathname === '/api/updates/check') { const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/releases/latest`, { headers: { 'user-agent': 'gerenciador-disparadores-v11' } }); if (!response.ok) return send(res, 200, { currentVersion: VERSION, available: false, message: 'Nenhuma release publicada ainda.' }); const release: any = await response.json(); const latestVersion = String(release.tag_name || '').replace(/^v/, ''); const parts = (value: string) => value.split('.').map(x => Number.parseInt(x, 10) || 0); const latest = parts(latestVersion), current = parts(VERSION); let comparison = 0; for (let i = 0; i < Math.max(latest.length, current.length); i++) { if ((latest[i] || 0) !== (current[i] || 0)) { comparison = (latest[i] || 0) > (current[i] || 0) ? 1 : -1; break; } } return send(res, 200, { currentVersion: VERSION, latestVersion, available: comparison > 0, notes: release.body || '', url: release.html_url, publishedAt: release.published_at }); }
    if (method === 'GET' && url.pathname === '/api/metrics') return send(res, 200, { campaignsCreated: db.prepare('SELECT COUNT(*) count FROM campaigns').get().count, contactsImported: db.prepare('SELECT COUNT(*) count FROM contacts').get().count, messagesQueued: db.prepare('SELECT COUNT(*) count FROM messages').get().count, optOuts: db.prepare('SELECT COUNT(*) count FROM opt_outs').get().count });
    if (url.pathname.startsWith('/api/')) return error(res, 404, 'Rota não encontrada');
    if (method === 'GET') { const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1); const target = path.resolve(publicDir, file); if (!target.startsWith(publicDir) || !fs.existsSync(target)) return error(res, 404, 'Não encontrado'); res.writeHead(200, { 'content-type': target.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8' }); return res.end(fs.readFileSync(target)); }
    return error(res, 404, 'Não encontrado');
  } catch (e) { log(db, 'error', 'request.failed', { path: url.pathname, message: e.message }); return error(res, 500, e.message || 'Erro interno'); }
}

export const server = http.createServer(handle);
if (process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')) server.listen(PORT, () => console.log(`V10 backend ouvindo em http://localhost:${PORT}`));

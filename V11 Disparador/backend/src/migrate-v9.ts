// @ts-nocheck
import fs from 'node:fs';
import { createDb, normalizePhone, now, makeId, json } from './db.js';

const source = process.argv[2];
if (!source) { console.error('Uso: npm run migrate:v9 -- /caminho/store.json'); process.exit(1); }
const input = JSON.parse(fs.readFileSync(source, 'utf8'));
const db = createDb();
let counts = { contacts: 0, campaigns: 0, messages: 0, optOuts: 0 };
for (const item of input.contacts || []) { const phone = normalizePhone(item.phone); if (!phone) continue; const t = now(); db.prepare('INSERT OR IGNORE INTO contacts(id,phone,name,fields,tags,funnel_stage,opted_out,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(item.id || makeId('ct'), phone, item.name || '', json(item.fields || item.metadata || {}), json(item.tags || []), item.funnelStage || 'novo', item.optedOut ? 1 : 0, item.createdAt || t, item.updatedAt || t); counts.contacts++; }
for (const item of input.campaigns || []) { const t = now(); db.prepare('INSERT OR IGNORE INTO campaigns(id,name,status,mode,body,config,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').run(item.id || makeId('cmp'), item.name || 'Campanha importada', item.status || 'draft', item.mode || 'simulation', item.body || '', json(item.metadata || item.config || {}), item.createdAt || t, item.updatedAt || t); counts.campaigns++; }
for (const item of input.optOuts || []) { const phone = normalizePhone(item.phone); if (!phone) continue; db.prepare('INSERT OR IGNORE INTO opt_outs(id,phone,reason,source,created_at) VALUES(?,?,?,?,?)').run(item.id || makeId('out'), phone, item.reason || 'migration_v9', 'migration_v9', item.createdAt || now()); db.prepare('UPDATE contacts SET opted_out=1 WHERE phone=?').run(phone); counts.optOuts++; }
for (const item of input.messages || []) { const t = now(); db.prepare('INSERT OR IGNORE INTO messages(id,campaign_id,contact_id,to_phone,body,mode,state,attempts,max_attempts,event_id,provider_message_id,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(item.id || makeId('msg'), item.campaignId || null, item.contactId || null, normalizePhone(item.to), item.body || '', item.mode || 'simulation', item.state || 'pending', item.attempts || 0, item.maxAttempts || 3, item.eventId || null, item.providerMessageId || null, item.error || null, item.createdAt || t, item.updatedAt || t); counts.messages++; }
console.log(JSON.stringify({ ok: true, source, counts }, null, 2));

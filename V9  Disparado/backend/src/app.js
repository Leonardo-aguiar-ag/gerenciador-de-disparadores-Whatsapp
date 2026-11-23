require('dotenv').config();
const express = require('express');
const path = require('path');
const { createStore } = require('./storage');
const { campaign, contact, message, scriptVersion, businessNumber, MESSAGE_STATES, now, id } = require('./models');
const { sendWhatsAppMessage } = require('./whatsappCloudApi');

function createApp(options = {}) {
  const store = options.store || createStore(options.dataFile);
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.static(path.join(__dirname, '../public')));
  const fail = (res, status, error) => res.status(status).json({ error });
  const contacts = () => store.all().contacts;
  const findContact = value => contacts().find(c => c.id === value || c.phone === String(value || '').replace(/\D/g, ''));
  const isOptedOut = phone => store.all().optOuts.some(x => x.phone === String(phone || '').replace(/\D/g, ''));

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'v8-disparador-backend', timestamp: now(), queue: store.all().messages.filter(m => ['pending', 'processing'].includes(m.state)).length }));

  // Campanhas, scripts versionados e relatórios
  app.get('/api/campaigns', (req, res) => { let data = store.all().campaigns; if (req.query.status) data = data.filter(x => x.status === req.query.status); res.json({ data }); });
  app.post('/api/campaigns', (req, res) => { if (!req.body?.name) return fail(res, 400, 'name é obrigatório'); const item = store.insert('campaigns', campaign(req.body)); res.status(201).json(item); });
  app.get('/api/campaigns/:id', (req, res) => { const item = store.all().campaigns.find(x => x.id === req.params.id); return item ? res.json(item) : fail(res, 404, 'Campanha não encontrada'); });
  app.patch('/api/campaigns/:id', (req, res) => { const item = store.all().campaigns.find(x => x.id === req.params.id); if (!item) return fail(res, 404, 'Campanha não encontrada'); Object.assign(item, req.body, { id: item.id, updatedAt: now() }); res.json(store.replace('campaigns', item)); });
  app.get('/api/scripts', (_req, res) => res.json({ data: store.all().scriptVersions }));
  app.post('/api/scripts', (req, res) => { const latest = store.all().scriptVersions.filter(x => x.scriptId === req.body.scriptId).sort((a, b) => b.version - a.version)[0]; const item = store.insert('scriptVersions', scriptVersion({ ...req.body, version: (latest?.version || 0) + 1 })); res.status(201).json(item); });

  // CRM: contatos, tags, funil e histórico
  app.get('/api/contacts', (req, res) => { let data = contacts(); if (req.query.tag) data = data.filter(x => x.tags.includes(req.query.tag)); if (req.query.stage) data = data.filter(x => x.funnelStage === req.query.stage); res.json({ data }); });
  app.post('/api/contacts', (req, res) => { if (!req.body?.phone) return fail(res, 400, 'phone é obrigatório'); const phone = String(req.body.phone).replace(/\D/g, ''); const existing = findContact(phone); if (existing) { Object.assign(existing, req.body, { phone, id: existing.id, updatedAt: now() }); return res.json(store.replace('contacts', existing)); } const item = store.insert('contacts', contact({ ...req.body, phone })); res.status(201).json(item); });
  app.patch('/api/contacts/:id', (req, res) => { const item = findContact(req.params.id); if (!item) return fail(res, 404, 'Contato não encontrado'); Object.assign(item, req.body, { id: item.id, updatedAt: now() }); res.json(store.replace('contacts', item)); });
  app.post('/api/contacts/:id/events', (req, res) => { const item = findContact(req.params.id); if (!item) return fail(res, 404, 'Contato não encontrado'); const event = { id: id('evt'), contactId: item.id, type: req.body.type || 'note', body: req.body.body || '', createdAt: now() }; item.history = item.history || []; item.history.push(event); store.insert('contactEvents', event); store.replace('contacts', item); res.status(201).json(event); });
  app.post('/api/contacts/:id/tags', (req, res) => { const item = findContact(req.params.id); if (!item || !req.body.tag) return fail(res, 400, 'contato e tag são obrigatórios'); item.tags = [...new Set([...(item.tags || []), String(req.body.tag)])]; res.json(store.replace('contacts', item)); });
  app.delete('/api/contacts/:id/tags/:tag', (req, res) => { const item = findContact(req.params.id); if (!item) return fail(res, 404, 'Contato não encontrado'); item.tags = (item.tags || []).filter(t => t !== req.params.tag); res.json(store.replace('contacts', item)); });
  app.post('/api/contacts/:id/funnel', (req, res) => { const item = findContact(req.params.id); if (!item || !req.body.stage) return fail(res, 400, 'contato e stage são obrigatórios'); item.funnelStage = req.body.stage; res.json(store.replace('contacts', item)); });

  // Opt-out persistente
  app.post('/api/opt-out', (req, res) => { const phone = String(req.body?.phone || '').replace(/\D/g, ''); if (!phone) return fail(res, 400, 'phone é obrigatório'); const existing = store.all().optOuts.find(x => x.phone === phone); const record = existing || { id: id('out'), phone, reason: req.body.reason || 'user_request', createdAt: now() }; if (!existing) store.insert('optOuts', record); const c = findContact(phone); if (c && !c.optedOut) { c.optedOut = true; store.replace('contacts', c); } res.json({ ok: true, optOut: record }); });
  app.get('/api/opt-out', (_req, res) => res.json({ data: store.all().optOuts }));
  app.delete('/api/opt-out/:phone', (req, res) => { const phone = String(req.params.phone).replace(/\D/g, ''); store.remove('optOuts', x => x.phone === phone); const c = findContact(phone); if (c) { c.optedOut = false; store.replace('contacts', c); } res.json({ ok: true }); });

  // Números comerciais
  app.get('/api/business-numbers', (_req, res) => res.json({ data: store.all().businessNumbers }));
  app.post('/api/business-numbers', (req, res) => { if (!req.body?.phoneNumberId) return fail(res, 400, 'phoneNumberId é obrigatório'); const item = store.insert('businessNumbers', businessNumber(req.body)); res.status(201).json(item); });
  app.patch('/api/business-numbers/:id', (req, res) => { const item = store.all().businessNumbers.find(x => x.id === req.params.id); if (!item) return fail(res, 404, 'Número comercial não encontrado'); Object.assign(item, req.body, { id: item.id }); res.json(store.replace('businessNumbers', item)); });

  // Fila avançada e mídia
  app.get('/api/messages', (req, res) => { let data = store.all().messages; if (req.query.campaignId) data = data.filter(x => x.campaignId === req.query.campaignId); if (req.query.state) data = data.filter(x => x.state === req.query.state); res.json({ data }); });
  app.post('/api/messages', (req, res) => { const body = req.body || {}; const to = String(body.to || body.phone || '').replace(/\D/g, ''); if (!to || (!body.body && !body.media && !body.template)) return fail(res, 400, 'to e body, media ou template são obrigatórios'); if (isOptedOut(to)) return fail(res, 409, 'Contato opt-out: mensagem não criada'); if (body.eventId) { const duplicate = store.all().messages.find(x => x.eventId === body.eventId); if (duplicate) return res.status(200).json(duplicate); } const c = findContact(to); const item = store.insert('messages', message({ ...body, to, contactId: body.contactId || c?.id || null })); res.status(201).json(item); });
  app.post('/api/messages/:id/cancel', (req, res) => { const item = store.all().messages.find(x => x.id === req.params.id); if (!item) return fail(res, 404, 'Mensagem não encontrada'); if (!['pending', 'failed'].includes(item.state)) return fail(res, 409, 'Mensagem não pode ser cancelada neste estado'); item.state = 'cancelled'; item.updatedAt = now(); res.json(store.replace('messages', item)); });
  app.post('/api/messages/retry-failed', (_req, res) => { let count = 0; for (const item of store.all().messages.filter(x => x.state === 'failed' && x.attempts < x.maxAttempts)) { item.state = 'pending'; item.nextAttemptAt = null; store.replace('messages', item); count++; } res.json({ ok: true, requeued: count }); });
  app.post('/api/messages/process', async (_req, res) => res.json(await processQueue(store)));

  app.get('/api/reports/summary', (req, res) => { const d = store.all(); let msgs = d.messages; if (req.query.campaignId) msgs = msgs.filter(m => m.campaignId === req.query.campaignId); const byState = Object.fromEntries(MESSAGE_STATES.map(s => [s, msgs.filter(m => m.state === s).length])); const total = msgs.length || 1; const byVariant = {}; for (const m of msgs) { const key = m.variant || 'default'; byVariant[key] = byVariant[key] || { total: 0, sent: 0, failed: 0 }; byVariant[key].total++; if (['sent', 'delivered', 'read'].includes(m.state)) byVariant[key].sent++; if (m.state === 'failed') byVariant[key].failed++; } res.json({ campaigns: d.campaigns.length, contacts: d.contacts.length, optedOut: d.optOuts.length, messages: msgs.length, deliveryRate: Math.round(((byState.delivered + byState.read) / total) * 100), responseRate: 0, byState, byVariant }); });

  // Integração opcional com Google Sheets via Apps Script ou endpoint compatível
  app.get('/api/integrations/google-sheets/status', (_req, res) => {
    const config = store.all().settings.find(x => x.key === 'googleSheets')?.value || {};
    res.json({ connected: Boolean(config.endpoint || process.env.GOOGLE_SHEETS_WEBHOOK_URL), provider: 'google-sheets', spreadsheetId: config.spreadsheetId || '', sheetName: config.sheetName || '', redirectUri: config.redirectUri || '', message: config.endpoint || process.env.GOOGLE_SHEETS_WEBHOOK_URL ? 'Conectado' : 'Configure o OAuth Client ou um Apps Script Web App.' });
  });
  app.post('/api/integrations/google-sheets/config', (req, res) => {
    const current = store.all().settings.find(x => x.key === 'googleSheets');
    const value = { clientId: String(req.body.clientId || ''), spreadsheetId: String(req.body.spreadsheetId || ''), sheetName: String(req.body.sheetName || ''), endpoint: String(req.body.endpoint || '') };
    if (current) { current.value = value; store.replace('settings', current); } else store.insert('settings', { id: id('setting'), key: 'googleSheets', value, updatedAt: now() });
    res.json({ ok: true, configured: Boolean(value.clientId || value.endpoint), secretStored: Boolean(process.env.GOOGLE_CLIENT_SECRET) });
  });
  app.post('/api/integrations/google-sheets/sync', async (req, res) => { const endpoint = process.env.GOOGLE_SHEETS_WEBHOOK_URL || req.body.endpoint; if (!endpoint) return fail(res, 400, 'Configure GOOGLE_SHEETS_WEBHOOK_URL ou envie endpoint.'); const payload = { campaignId: req.body.campaignId || null, contacts: store.all().contacts, messages: store.all().messages }; try { const r = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); res.status(r.ok ? 200 : 502).json({ ok: r.ok, status: r.status }); } catch (err) { fail(res, 502, err.message); } });

  // Webhook oficial da Meta: deduplica e atualiza entrega/resposta
  app.get('/webhooks/whatsapp', (req, res) => { if (req.query['hub.verify_token'] !== process.env.WHATSAPP_VERIFY_TOKEN) return res.sendStatus(403); res.status(200).send(req.query['hub.challenge']); });
  app.post('/webhooks/whatsapp', (req, res) => { const eventId = req.body?.eventId || req.body?.id || req.headers['x-event-id']; if (eventId && store.all().processedEvents.some(e => e.eventId === String(eventId))) return res.json({ ok: true, duplicate: true }); if (eventId) store.insert('processedEvents', { id: id('pe'), eventId: String(eventId), createdAt: now() }); const value = req.body?.entry?.[0]?.changes?.[0]?.value || req.body; const status = value?.statuses?.[0]; const incoming = value?.messages?.[0]; const providerId = status?.id || req.body?.providerMessageId; const nextState = status?.status === 'read' ? 'read' : status?.status === 'delivered' ? 'delivered' : status?.status === 'failed' ? 'failed' : null; if (providerId && nextState) { const m = store.all().messages.find(x => x.providerMessageId === providerId); if (m) { m.state = nextState; m.error = status.errors?.[0]?.title || null; store.replace('messages', m); } } if (incoming?.from) { const c = findContact(incoming.from) || store.insert('contacts', contact({ phone: incoming.from, name: value.contacts?.[0]?.profile?.name || '' })); c.history = c.history || []; c.history.push({ id: id('evt'), type: 'reply', body: incoming.text?.body || '', createdAt: now() }); store.replace('contacts', c); } res.status(202).json({ ok: true, eventId: eventId || null }); });

  return app;
}

async function processQueue(store) {
  const candidates = store.all().messages.filter(m => m.state === 'pending' && (!m.nextAttemptAt || m.nextAttemptAt <= now()));
  let sent = 0, failed = 0, cancelled = 0;
  for (const item of candidates) {
    if (store.all().optOuts.some(x => x.phone === item.to)) { item.state = 'cancelled'; item.error = 'Contato opt-out'; cancelled++; store.replace('messages', item); continue; }
    item.state = 'processing'; item.attempts = (item.attempts || 0) + 1; store.replace('messages', item);
    try { const result = await sendWhatsAppMessage(item, { phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID }); if (!result.ok) throw new Error(result.error); item.state = 'sent'; item.providerMessageId = result.providerMessageId || null; item.error = result.dryRun ? `dry-run: ${result.error}` : null; sent++; }
    catch (err) { item.error = err.message; if (item.attempts < item.maxAttempts) { item.state = 'pending'; item.nextAttemptAt = new Date(Date.now() + Math.min(3600000, 30000 * item.attempts)).toISOString(); } else { item.state = 'failed'; failed++; } }
    store.replace('messages', item);
  }
  return { processed: candidates.length, sent, failed, cancelled };
}
module.exports = { createApp, processQueue };

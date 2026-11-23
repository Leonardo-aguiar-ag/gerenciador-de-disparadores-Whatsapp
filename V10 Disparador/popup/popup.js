import { parseContactLine, interpolate, processSpintax } from '../shared/phone.js';
const $ = id => document.getElementById(id);
let cfg = {}, allLogs = [], currentFilter = 'all';
const call = (path, options = {}) => new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'backend', path, options: { ...options, body: options.body == null ? undefined : JSON.stringify(options.body) } }, r => r?.ok ? resolve(r.data) : reject(new Error(r?.error || 'Backend indisponível'))));
const msg = (text, error = false) => { $('status').textContent = ` ${text}`; $('status').style.color = error ? 'var(--bad)' : 'var(--ok)'; };

function switchTab(name) { document.querySelectorAll('.tab-btn').forEach(x => x.classList.toggle('active', x.dataset.target === name)); document.querySelectorAll('.aba').forEach(x => x.classList.toggle('active', x.id === name)); }
document.querySelectorAll('.tab-btn').forEach(btn => btn.onclick = () => switchTab(btn.dataset.target));

async function load() {
  const result = await new Promise(r => chrome.runtime.sendMessage({ type: 'settings:get' }, r));
  cfg = result?.data || {};
  $('onboarding').style.display = cfg.onboardingDone ? 'none' : 'block';
  document.body.classList.toggle('light-mode', cfg.theme === 'light');
  loadSettingsForm(); renderScriptFields(cfg.scriptPool || []); loadProfiles();
  await refreshDashboard(); await loadSavedScripts();
}
function loadSettingsForm() {
  $('mode').value = cfg.mode || 'web'; $('minDelay').value = cfg.minDelay ?? 15; $('maxDelay').value = cfg.maxDelay ?? 30;
  $('pauseEvery').value = cfg.pauseEvery ?? 20; $('pauseMinutes').value = cfg.pauseMinutes ?? 5; $('businessEnabled').checked = Boolean(cfg.businessEnabled);
  $('businessStart').value = cfg.businessStart || '08:00'; $('businessEnd').value = cfg.businessEnd || '20:00'; $('ignoreDuplicates').checked = cfg.ignoreDuplicates !== false; $('sentDays').value = cfg.sentDays ?? 30;
  $('warmupEnabled').checked = Boolean(cfg.warmupEnabled); $('warmupStart').value = cfg.warmupStart || '';
  document.querySelectorAll('.weekday').forEach(x => x.checked = (cfg.weekdays || [1,2,3,4,5]).includes(Number(x.value)));
}
function collectSettings() { const minDelay = Math.max(15, Math.min(30, Number($('minDelay').value) || 15)); const maxDelay = Math.max(minDelay, Math.min(30, Number($('maxDelay').value) || 30)); $('minDelay').value = minDelay; $('maxDelay').value = maxDelay; return { ...cfg, mode: $('mode').value, minDelay, maxDelay, pauseEvery: Number($('pauseEvery').value), pauseMinutes: Number($('pauseMinutes').value), businessEnabled: $('businessEnabled').checked, businessStart: $('businessStart').value, businessEnd: $('businessEnd').value, weekdays: [...document.querySelectorAll('.weekday:checked')].map(x => Number(x.value)), ignoreDuplicates: $('ignoreDuplicates').checked, sentDays: Number($('sentDays').value), warmupEnabled: $('warmupEnabled').checked, warmupStart: $('warmupStart').value, scriptPool: getScriptPool(), filters: { ...(cfg.filters || {}), query: $('logSearch').value || '' } }; }
async function saveSettings(silent = false) { cfg = collectSettings(); await new Promise(r => chrome.runtime.sendMessage({ type: 'settings:set', data: cfg }, r)); if (!silent) msg('configurações salvas'); }

async function refreshDashboard() {
  try {
    const d = await call('/api/dashboard');
    const by = d.byState || {}; const ok = (by.sent || 0) + (by.delivered || 0) + (by.read || 0); const errors = by.failed || 0;
    $('mTotal').textContent = d.messages || 0; $('mOk').textContent = ok; $('mErrors').textContent = errors; $('mResponded').textContent = 0; $('mTyping').textContent = 0;
    $('conversion').textContent = d.messages ? `${Math.round((ok / d.messages) * 100)}% de entrega` : 'Sem dados';
    const logs = await call('/api/logs'); allLogs = logs.data || []; renderLogs(); renderChart(); msg(`${d.mode || 'offline'}`);
  } catch (e) { msg(`offline: ${e.message}`, true); }
}
function renderChart() { const days = []; for (let i = 6; i >= 0; i--) { const date = new Date(Date.now() - i * 86400000); const key = date.toISOString().slice(0, 10); const count = allLogs.filter(x => String(x.created_at || '').slice(0, 10) === key && /sent|delivered|read|queue.processed/.test(x.event || '')).length; days.push({ label: `${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}`, count }); } const max = Math.max(1, ...days.map(x => x.count)); $('chart').innerHTML = days.map(x => `<div class="chart-col"><div class="chart-bar" style="height:${Math.max(3, x.count / max * 78)}px" title="${x.count}"></div><span>${x.label}</span></div>`).join(''); }
function renderLogs() { const query = ($('logSearch').value || '').toLowerCase(); const data = allLogs.filter(x => !query || JSON.stringify(x).toLowerCase().includes(query)); $('logBody').innerHTML = data.slice(0, 100).map((x, i) => { const detail = x.details || {}; const status = x.level === 'error' ? 'ERRO' : String(x.event || '').replace(/^queue\./, '').toUpperCase(); return `<tr><td>${i + 1}</td><td>${detail.name || detail.phone || 'Sistema'}</td><td>${detail.phone || '—'}</td><td><span class="status-chip ${x.level === 'error' ? 'error' : ''}">${status}</span></td><td>${detail.variant || '—'}</td><td>${String(x.created_at || '').slice(11, 19)}</td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">Sem registros.</td></tr>'; }
$('logSearch').oninput = renderLogs;
document.querySelectorAll('.date-filter').forEach(b => b.onclick = () => { document.querySelectorAll('.date-filter').forEach(x => x.classList.remove('active')); b.classList.add('active'); currentFilter = b.dataset.days; renderLogs(); });

$('theme').onclick = async () => { cfg.theme = document.body.classList.contains('light-mode') ? 'dark' : 'light'; document.body.classList.toggle('light-mode', cfg.theme === 'light'); await saveSettings(true); };
$('finishOnboarding').onclick = async () => { cfg.onboardingDone = true; $('onboarding').style.display = 'none'; await saveSettings(true); };
$('backup').onclick = async () => { try { const b = await call('/api/backups', { method: 'POST', body: {} }); alert(`Backup criado: ${b.file}`); } catch (e) { msg(e.message, true); } };
$('exportLogs').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(allLogs, null, 2)], { type: 'application/json' })); a.download = 'logs-v10.json'; a.click(); };
$('clearLogs').onclick = () => { allLogs = []; renderLogs(); msg('visualização limpa; histórico do backend preservado'); };
$('markLogs').onclick = () => msg('registros marcados como revisados');
$('openScripts').onclick = () => switchTab('scripts');

function renderScriptFields(values = []) { const box = $('scriptFields'); box.innerHTML = ''; for (let i = 0; i < 20; i++) { const wrap = document.createElement('div'); wrap.className = 'list-card'; wrap.innerHTML = `<label>Variação ${i + 1}</label><textarea class="script-variation" data-index="${i}" placeholder="Variação ${i + 1}"></textarea>`; box.appendChild(wrap); wrap.querySelector('textarea').value = values[i] || ''; } }
function getScriptPool() { return [...document.querySelectorAll('.script-variation')].map(x => x.value.trim()).filter(Boolean); }
async function loadSavedScripts() { try { const d = await call('/api/scripts'); const select = $('savedScripts'); select.innerHTML = '<option value="">-- Scripts em Edição --</option>'; (d.data || []).forEach(x => { const o = document.createElement('option'); o.value = x.id; o.textContent = `${x.name} · versão ${x.version}`; o.dataset.content = JSON.stringify(x.content || []); select.appendChild(o); }); } catch {} }
$('savedScripts').onchange = e => { const o = e.target.selectedOptions[0]; if (!o?.dataset.content) return; renderScriptFields(JSON.parse(o.dataset.content)); $('scriptName').value = o.textContent.split(' · versão')[0]; };
$('saveScripts').onclick = async () => { try { const name = $('scriptName').value.trim() || 'Scripts V10'; const content = getScriptPool(); if (!content.length) return alert('Preencha pelo menos uma variação.'); const r = await call('/api/scripts', { method: 'POST', body: { scriptId: name.toLowerCase().replace(/\s+/g, '-'), name, content } }); cfg.scriptPool = content; await saveSettings(true); $('scriptsList').innerHTML = `<h2>Histórico de versões</h2><div class="list-card"><b>${r.name}</b><div class="muted">Versão ${r.version} · ${content.length} variações</div></div>`; await loadSavedScripts(); msg('scripts salvos'); } catch (e) { msg(e.message, true); } };
$('clearScripts').onclick = () => { if (confirm('Limpar as 20 variações?')) renderScriptFields(); };
$('deleteScripts').onclick = () => { if (confirm('Limpar a versão selecionada da edição atual?')) { renderScriptFields(); $('scriptName').value = ''; } };
$('exportScripts').onclick = () => { const data = JSON.stringify({ name: $('scriptName').value, scripts: getScriptPool() }, null, 2); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' })); a.download = `${$('scriptName').value || 'scripts-v10'}.json`; a.click(); };
$('importScripts').onclick = () => $('scriptsFile').click();
$('scriptsFile').onchange = async e => { const file = e.target.files?.[0]; if (!file) return; const text = await file.text(); try { const data = JSON.parse(text); $('scriptName').value = data.name || ''; renderScriptFields(data.scripts || data.content || []); } catch { renderScriptFields(text.split(/\r?\n/)); } msg('scripts importados para edição'); };

async function readFile(file) { const buf = await file.arrayBuffer(); if (window.XLSX && /xlsx|xls/.test(file.name)) { const wb = XLSX.read(buf, { type: 'array' }); return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { FS: ';' }); } return new TextDecoder().decode(buf); }
$('file').onchange = async e => { const file = e.target.files?.[0]; if (!file) return; $('contacts').value = await readFile(file); $('preview').click(); };
$('preview').onclick = () => { const rows = $('contacts').value.split(/\r?\n/).filter(Boolean).map(parseContactLine); const valid = rows.filter(x => x.valid); const invalid = rows.length - valid.length; const examples = valid.slice(0, 3).map(x => processSpintax(interpolate(getScriptPool()[0] || '', x))).join('<br>'); $('previewBox').innerHTML = `<b>${valid.length}</b> válidos · <b>${invalid}</b> inválidos<br>${examples || 'Cadastre scripts na aba Scripts.'}`; };
async function dispatch(text = $('contacts').value) { let rows = text.split(/\r?\n/).filter(Boolean).map(parseContactLine).filter(x => x.valid); if (cfg.ignoreDuplicates !== false) rows = [...new Map(rows.map(x => [x.phone, x])).values()]; const scripts = getScriptPool(); if (!scripts.length) throw new Error('Cadastre pelo menos um script na aba Scripts.'); if (!rows.length) throw new Error('Importe uma lista CSV válida.'); const before = await new Promise(r => chrome.runtime.sendMessage({ type: 'storage:get', keys: null }, r)); await new Promise(r => chrome.runtime.sendMessage({ type: 'storage:set', data: { v10Undo: { snapshot: before.data, createdAt: Date.now() } } }, r)); const name = $('scriptName').value.trim() || 'Disparo V10'; const campaign = await call('/api/campaigns', { method: 'POST', body: { name, mode: cfg.mode || 'web', config: { scriptPool: scripts, settings: collectSettings() } } }); const imported = await call('/api/import/commit', { method: 'POST', body: { rows } }); const result = await call(`/api/campaigns/${campaign.id}/queue`, { method: 'POST', body: { mode: cfg.mode || 'web', scripts, phones: rows.map(x => x.phone) } }); $('bar').style.width = '100%'; $('percent').textContent = '100%'; $('txtEnvios').textContent = `${result.queued} mensagens`; $('previewBox').textContent = `${result.queued} mensagens na fila; ${result.skipped} ignoradas; ${imported.invalid} inválidas.`; if ((cfg.mode || 'web') === 'simulation') await call('/api/messages/process', { method: 'POST', body: { mode: 'simulation' } }); await refreshDashboard(); }
$('queue').onclick = async () => { try { await dispatch(); } catch (e) { $('previewBox').textContent = e.message; } };
$('pause').onclick = async () => { try { const r = await call('/api/messages/control', { method: 'POST', body: { action: 'pause' } }); msg(`fila ${r.queueState}`); } catch (e) { msg(e.message, true); } };
$('stop').onclick = async () => { try { const r = await call('/api/messages/control', { method: 'POST', body: { action: 'stop' } }); msg(`fila ${r.queueState}`); } catch (e) { msg(e.message, true); } };
$('undo').onclick = () => new Promise(r => chrome.runtime.sendMessage({ type: 'undo' }, r)).then(r => msg(r.ok ? 'alteração desfeita' : (r.error || 'nada para desfazer'), !r.ok));

function loadProfiles() { const select = $('profileSelect'); select.innerHTML = '<option value="">(nenhum)</option>'; Object.keys(cfg.profiles || {}).forEach(name => { const o = document.createElement('option'); o.value = name; o.textContent = name; select.appendChild(o); }); }
$('saveProfile').onclick = async () => { const name = $('profileName').value.trim(); if (!name) return; cfg.profiles = cfg.profiles || {}; cfg.profiles[name] = { settings: collectSettings(), scripts: getScriptPool(), contacts: $('contacts').value }; await saveSettings(true); loadProfiles(); $('profileSelect').value = name; msg(`perfil ${name} salvo`); };
$('profileSelect').onchange = async e => { const p = cfg.profiles?.[e.target.value]; if (!p) return; Object.assign(cfg, p.settings || {}); loadSettingsForm(); renderScriptFields(p.scripts || []); $('contacts').value = p.contacts || ''; };
$('deleteProfile').onclick = async () => { const name = $('profileSelect').value; if (!name) return; delete cfg.profiles[name]; await saveSettings(true); loadProfiles(); msg('perfil removido'); };
$('save').onclick = () => saveSettings();
$('verifyConnection').onclick = async () => { try { if ($('mode').value === 'web') { const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }); const tab = tabs[0]; if (!tab) throw new Error('Nenhuma aba do WhatsApp Web encontrada.'); const r = await chrome.tabs.sendMessage(tab.id, { type: 'whatsapp:status' }); $('connectionStatus').textContent = r.data?.connected ? 'Conectado ao WhatsApp Web.' : 'A aba foi encontrada, mas a sessão não foi reconhecida.'; } else { const h = await call('/health'); $('connectionStatus').textContent = `Backend conectado · ${h.database}`; } } catch (e) { $('connectionStatus').textContent = e.message; } };
$('update').onclick = async () => { try { const u = await call('/api/updates/check'); $('updateBox').innerHTML = u.available ? `Nova versão <b>${u.latestVersion}</b> disponível. <a href="${u.url}" target="_blank">Ver notas e atualizar</a><br>${u.notes || ''}` : (u.message || 'V10 atualizada.'); } catch (e) { $('updateBox').textContent = e.message; } };
$('restore').onclick = () => $('restoreFile').click(); $('restoreFile').onchange = async e => { const file = e.target.files?.[0]; if (!file) return; try { const r = await call('/api/backups/restore', { method: 'POST', body: JSON.parse(await file.text()) }); alert(`Backup restaurado: ${r.restored} contatos.`); await refreshDashboard(); } catch (e) { alert(`Falha ao restaurar: ${e.message}`); } };
$('startBatch').onclick = async () => { try { const lists = $('batchLists').value.split(/\n\s*\n/).filter(Boolean); if (!lists.length) throw new Error('Informe ao menos uma lista.'); $('contacts').value = lists[0]; switchTab('disparos'); await dispatch(lists[0]); $('batchStatus').textContent = `Primeira lista processada. ${lists.length - 1} lista(s) aguardando revisão.`; } catch (e) { $('batchStatus').textContent = e.message; } };
$('stopBatch').onclick = async () => { try { await call('/api/messages/control', { method: 'POST', body: { action: 'stop' } }); $('batchStatus').textContent = 'Lote parado e mensagens pendentes canceladas.'; } catch (e) { $('batchStatus').textContent = e.message; } };

load();

const TERMINAL = new Set(['SENT', 'ERROR', 'DUPLICATE', 'OPT_OUT', 'INVALID']);

export const QUEUE_STATES = Object.freeze({ PENDING: 'PENDING', PROCESSING: 'PROCESSING', SENT: 'SENT', ERROR: 'ERROR', DUPLICATE: 'DUPLICATE', OPT_OUT: 'OPT_OUT', INVALID: 'INVALID', PAUSED: 'PAUSED' });

export function createQueue(rows, { campaignId = `cmp_${Date.now()}`, scripts = [], config = {} } = {}) {
  const now = new Date().toISOString();
  return {
    version: 1, campaignId, status: 'READY', createdAt: now, updatedAt: now,
    startedAt: null, finishedAt: null, lastError: null, lastContact: null,
    scripts: scripts.filter(Boolean), config,
    items: rows.map((row, index) => ({ id: `${campaignId}:${index}:${row.phone}`, index, phone: row.phone, name: row.name || '', fields: row.fields || {}, status: QUEUE_STATES.PENDING, attempts: 0, message: '', variant: null, error: null, createdAt: now, updatedAt: now }))
  };
}

export function summarizeQueue(queue) {
  const counts = Object.fromEntries(Object.values(QUEUE_STATES).map(state => [state, 0]));
  for (const item of queue?.items || []) counts[item.status] = (counts[item.status] || 0) + 1;
  const total = queue?.items?.length || 0;
  const done = total - counts.PENDING - counts.PROCESSING - counts.PAUSED;
  return { total, done, percent: total ? Math.round(done / total * 100) : 0, ...counts };
}

export function nextPending(queue) { return (queue.items || []).find(item => item.status === QUEUE_STATES.PENDING); }

export function transition(queue, itemId, status, patch = {}) {
  const item = queue.items.find(row => row.id === itemId);
  if (!item) throw new Error(`Item da fila não encontrado: ${itemId}`);
  if (TERMINAL.has(item.status) && status !== item.status) throw new Error(`Transição inválida para item finalizado: ${item.status} → ${status}`);
  const now = new Date().toISOString();
  Object.assign(item, patch, { status, updatedAt: now });
  queue.lastContact = item.name || item.phone;
  queue.updatedAt = now;
  if (status === QUEUE_STATES.PROCESSING && !queue.startedAt) { queue.startedAt = now; queue.status = 'RUNNING'; }
  if (summarizeQueue(queue).done >= summarizeQueue(queue).total && queue.items.length) { queue.status = 'COMPLETED'; queue.finishedAt ||= now; }
  return queue;
}

export function checkpoint(queue) { return JSON.parse(JSON.stringify({ ...queue, updatedAt: new Date().toISOString() })); }

export function parseQueueRows(text, normalize = value => String(value || '').replace(/\D/g, '')) {
  return String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
    const parts = line.split(/[;\t,]/).map(value => value.trim());
    const phone = normalize(parts[0]);
    const fields = Object.fromEntries(parts.slice(2).map((value, i) => [`campo_${i + 1}`, value]));
    return { index, phone, name: parts[1] || '', fields, raw: line };
  });
}

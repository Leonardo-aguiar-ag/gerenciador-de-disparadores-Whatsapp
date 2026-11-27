import { summarizeQueue } from './queue-manager.js';

export function campaignReport(queue, logs = []) {
  const summary = summarizeQueue(queue);
  const durationMs = queue?.startedAt && queue?.finishedAt ? Date.parse(queue.finishedAt) - Date.parse(queue.startedAt) : 0;
  const byVariant = {};
  for (const item of queue?.items || []) byVariant[item.variant ?? 'none'] = (byVariant[item.variant ?? 'none'] || 0) + 1;
  return { campaignId: queue?.campaignId, generatedAt: new Date().toISOString(), summary, durationMs, averageMs: summary.done && durationMs ? Math.round(durationMs / summary.done) : 0, byVariant, technicalLogs: logs.length, items: queue?.items || [] };
}

export function reportCsv(report) {
  const header = ['Nome', 'Telefone', 'Status', 'Variante', 'Tentativas', 'Data/hora', 'Erro'];
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [header, ...(report.items || []).map(item => [item.name, item.phone, item.status, item.variant, item.attempts, item.updatedAt, item.error])].map(row => row.map(escape).join(';')).join('\n');
}

export function downloadText(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

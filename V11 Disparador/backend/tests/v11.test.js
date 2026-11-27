import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createQueue, summarizeQueue, transition } from '../../shared/queue-manager.js';
import { validateRows, renderTemplate, previewMessages } from '../../shared/validation.js';
import { campaignReport, reportCsv } from '../../shared/report.js';

const root = path.resolve(import.meta.dirname, '../..');
test('manifesto V11 aponta para popup e service worker próprios', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.version, '11.0.0');
  assert.equal(manifest.action.default_popup, 'popup/popup.html');
  assert.equal(manifest.background.service_worker, 'background/service-worker.js');
});
test('motor de fila calcula estados e checkpoint sem perder o item', () => {
  const queue = createQueue([{ phone: '5511999999999', name: 'Maria' }, { phone: '5511888888888', name: 'João' }], { scripts: ['Olá {{nome}}'] });
  transition(queue, queue.items[0].id, 'PROCESSING');
  transition(queue, queue.items[0].id, 'SENT', { attempts: 1 });
  const summary = summarizeQueue(queue);
  assert.equal(summary.SENT, 1); assert.equal(summary.PENDING, 1); assert.equal(summary.done, 1); assert.equal(summary.percent, 50);
});
test('validação detecta duplicado, telefone inválido e variável ausente', () => {
  const result = validateRows([{ phone: '5511999999999', name: 'Maria', fields: {} }, { phone: '5511999999999', name: 'Outra', fields: {} }, { phone: 'x', name: '' }], ['Olá {{nome}} em {{cidade}}']);
  assert.equal(result.duplicates, 1); assert.equal(result.invalid, 1); assert.ok(result.variableErrors >= 2); assert.equal(result.ready, false);
});
test('variáveis personalizadas e fallback são renderizados', () => {
  assert.equal(renderTemplate('Olá {{nome|cliente}} de {{cidade|sua cidade}}', { name: 'Maria', fields: {} }), 'Olá Maria de sua cidade');
  assert.equal(previewMessages([{ phone: '5511999999999', name: 'Maria', fields: { cidade: 'Recife' } }], ['Oi {{nome}} de {{cidade}}'])[0].message, 'Oi Maria de Recife');
});
test('relatório possui métricas e CSV exportável', () => {
  const queue = createQueue([{ phone: '5511999999999', name: 'Maria' }]);
  transition(queue, queue.items[0].id, 'SENT', { variant: 0 }); queue.finishedAt = new Date().toISOString();
  const report = campaignReport(queue, [{ event: 'dispatch.sent' }]);
  assert.equal(report.summary.SENT, 1); assert.match(reportCsv(report), /Maria/); assert.equal(report.technicalLogs, 1);
});

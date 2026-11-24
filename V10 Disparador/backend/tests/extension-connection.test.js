import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sendWithRetry } from '../../shared/message-retry.js';

const popup = await readFile(new URL('../../popup/popup.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../../manifest.json', import.meta.url), 'utf8'));

test('popup não depende do status complete da aba para falar com o WhatsApp', () => {
  assert.doesNotMatch(popup, /waitForTabComplete|tabs\.onUpdated\.addListener|chrome\.tabs\.get/);
  assert.match(popup, /sendWithRetry/);
  assert.match(popup, /chrome\.tabs\.sendMessage/);
});

test('popup pode carregar os content scripts na aba já aberta', () => {
  assert.ok(manifest.permissions.includes('scripting'));
  assert.match(popup, /chrome\.scripting\.executeScript/);
  assert.match(popup, /content\/whatsapp-adapter\.js'[\s\S]*content\/content-legacy\.js'/);
  assert.match(popup, /hostname !== 'web\.whatsapp\.com'/);
});

test('sendWithRetry recupera quando o content script responde depois', async () => {
  let calls = 0;
  const waits = [];
  const response = await sendWithRetry(async () => {
    calls += 1;
    if (calls < 3) throw new Error('Receiving end does not exist');
    return { ok: true, data: { connected: true } };
  }, {
    delays: [0, 10, 20],
    wait: async ms => waits.push(ms)
  });

  assert.deepEqual(response, { ok: true, data: { connected: true } });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [10, 20]);
});

test('sendWithRetry termina com mensagem clara após esgotar as tentativas', async () => {
  let calls = 0;
  await assert.rejects(
    () => sendWithRetry(async () => {
      calls += 1;
      throw new Error('Receiving end does not exist');
    }, {
      delays: [0, 0, 0],
      wait: async () => {},
      errorMessage: 'Atualize a aba e tente novamente.'
    }),
    error => error.message === 'Atualize a aba e tente novamente.' &&
      error.cause?.message === 'Receiving end does not exist'
  );
  assert.equal(calls, 3);
});

test('compatibilidade Electron: service worker não exige storage.session nem alarms', async () => {
  const worker = await readFile(new URL('../../background/service-worker.js', import.meta.url), 'utf8');
  assert.match(worker, /chrome\.storage\.session\?\.get/);
  assert.match(worker, /chrome\.storage\.session\?\.set/);
  assert.match(worker, /if \(chrome\.alarms\?\.onAlarm\?\.addListener\)/);
  assert.match(worker, /if \(!chrome\.alarms\?\.create\) return/);
  assert.match(worker, /chrome\.downloads\?\.download/);
});

test('a busca de WhatsApp é filtrada por URL, compatível com tabs.query do Electron', () => {
  assert.match(popup, /chrome\.tabs\.query\(\{ url: 'https:\/\/web\.whatsapp\.com\/\*' \}\)/);
  assert.match(popup, /NO_WHATSAPP_SESSION/);
});

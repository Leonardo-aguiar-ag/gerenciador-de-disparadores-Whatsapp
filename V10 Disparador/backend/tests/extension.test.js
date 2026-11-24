import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseScriptImport, parseScriptText } from '../../shared/script-format.js';
import { parseContactList, parseContactLine } from '../../shared/phone.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('scripts de conteúdo do manifesto existem e usam sintaxe clássica válida', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const contentScripts = manifest.content_scripts.flatMap(entry => entry.js || []);

  assert.ok(contentScripts.length > 0, 'o manifesto deve declarar scripts de conteúdo');
  for (const relativePath of contentScripts) {
    const file = path.join(root, relativePath);
    assert.ok(fs.existsSync(file), `arquivo declarado não encontrado: ${relativePath}`);
    const source = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /^\s*(?:import|export)\s/m, `${relativePath} usa sintaxe de módulo, incompatível com content_scripts`);
    const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    assert.equal(check.status, 0, `${relativePath} tem erro de sintaxe: ${check.stderr}`);
  }
});

test('importação de scripts aceita TXT por blocos e JSON compatível com a V9/V10', () => {
  assert.deepEqual(parseScriptText('\uFEFFPrimeira\r\nlinha\r\n---\r\nSegunda'), ['Primeira\nlinha', 'Segunda']);
  assert.deepEqual(parseScriptImport('campanha.JSON', '["Olá", "Oi"]'), ['Olá', 'Oi']);
  assert.deepEqual(parseScriptImport('scripts.json', '{"scripts":["A"],"content":["B"]}'), ['A']);
  assert.deepEqual(parseScriptImport('versao.json', '[{"texto":"Mensagem A"},{"text":"Mensagem B"}]'), ['Mensagem A', 'Mensagem B']);
  assert.deepEqual(parseScriptImport('scripts.txt', 'A\n---\nB'), ['A', 'B']);
  assert.throws(() => parseScriptImport('invalid.json', '{'), /JSON inválido/);
});

test('parser de contatos respeita CSV com aspas, delimitadores embutidos e campos multilinha', () => {
  const input = '\uFEFFtelefone,nome,observacao\r\n"85999999999","Silva, João","cliente; premium"\r\n"85888888888","Maria","linha 1\nlinha 2"';
  const rows = parseContactList(input);
  assert.equal(rows.length, 3, 'inclui o cabeçalho para ser exibido como inválido na prévia');
  assert.equal(rows[0].valid, false);
  assert.equal(rows[1].phone, '5585999999999');
  assert.equal(rows[1].name, 'Silva, João');
  assert.equal(rows[1].fields.campo_1, 'cliente; premium');
  assert.equal(rows[2].fields.campo_1, 'linha 1\nlinha 2');
  assert.equal(rows[2].valid, true);
});

test('parser mantém compatibilidade com linhas simples separadas por ponto e vírgula ou tabulação', () => {
  assert.equal(parseContactLine('85999999999;João').name, 'João');
  const rows = parseContactList('85888888888\tMaria\tVIP');
  assert.equal(rows[0].phone, '5585888888888');
  assert.equal(rows[0].fields.campo_1, 'VIP');
});

test('início do disparo exige conexão e pausa sem execução não ativa estado fantasma', () => {
  const content = fs.readFileSync(path.join(root, 'content/content-legacy.js'), 'utf8');
  const adapter = fs.readFileSync(path.join(root, 'content/whatsapp-adapter.js'), 'utf8');
  const worker = fs.readFileSync(path.join(root, 'background/service-worker.js'), 'utf8');
  const popup = fs.readFileSync(path.join(root, 'popup/popup.js'), 'utf8');
  assert.match(content, /if\s*\(!verificarConexao\(\)\)/);
  assert.match(content, /conversation-panel-wrapper/);
  assert.match(content, /function elementoVisivel/);
  assert.match(adapter, /function isVisible/);
  assert.match(adapter, /chat-list-search/);
  assert.doesNotMatch(content, /document\.querySelector\([^\n]*canvas/);
  assert.match(content, /if \(!dispatchState\.rodando\).*Não existe disparo ativo para pausar/);
  assert.match(content, /dispatchState\.warmUpLimite = warmUpLimite == null \? null/);
  assert.match(content, /dispatch_concluido", limiteAtingido: true, enviados: dispatchState\.enviados/);
  assert.match(worker, /active:\s*message\.parado\s*\?\s*false\s*:\s*Boolean\(active\.active\)/);
  assert.match(worker, /active: Boolean\(active\.active\)/, 'resultados tardios não devem reativar uma fila parada');
  assert.match(worker, /heartbeatAt/);
  assert.match(popup, /A ausência de um snapshot vivo não autoriza apagar/);
  assert.match(popup, /Fila persistida; monitorando a aba/);
  assert.match(popup, /Último disparo concluído/);
});

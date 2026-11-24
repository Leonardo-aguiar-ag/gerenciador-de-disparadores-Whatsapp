import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseScriptImport, parseScriptText } from '../../shared/script-format.js';

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

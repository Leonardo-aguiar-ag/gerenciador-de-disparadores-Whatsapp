/**
 * Converte o formato TXT da aba Scripts em variações completas.
 *
 * Cada bloco separado por uma linha com apenas "---" representa uma variação.
 * Quebras de linha dentro do bloco fazem parte da mensagem e são preservadas.
 */
export function parseScriptText(text) {
  const normalized = String(text ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();

  if (!normalized) return [];

  return normalized
    .split(/^\s*---\s*$/gm)
    .map(script => script.trim())
    .filter(Boolean);
}

export function parseScriptImport(fileName, text) {
  if (!/\.json$/i.test(String(fileName ?? ''))) return parseScriptText(text);

  let data;
  try {
    data = JSON.parse(String(text ?? ''));
  } catch {
    throw new Error('JSON inválido. Verifique o arquivo e tente novamente.');
  }

  const items = Array.isArray(data) ? data : (data?.scripts ?? data?.content);
  if (!Array.isArray(items)) {
    throw new Error('O JSON deve ser uma lista de scripts ou conter "scripts"/"content".');
  }

  return items
    .map(item => typeof item === 'string' ? item : (item?.texto ?? item?.text ?? ''))
    .map(script => String(script).trim())
    .filter(Boolean);
}

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

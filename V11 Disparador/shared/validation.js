const PHONE_RE = /^\d{10,15}$/;
export const VARIABLE_RE = /\{\{\s*([\w.-]+)(?:\|([^}]+))?\s*\}\}/g;

export function renderTemplate(template, row = {}) {
  const fields = { nome: row.name || '', name: row.name || '', telefone: row.phone || '', phone: row.phone || '', ...(row.fields || {}) };
  return String(template || '').replace(VARIABLE_RE, (_, key, fallback) => String(fields[key] ?? fallback ?? `{{${key}}}`));
}

export function extractVariables(template) {
  return [...String(template || '').matchAll(VARIABLE_RE)].map(match => match[1]);
}

export function validateRows(rows, scripts = []) {
  const issues = [], seen = new Set();
  const usableScripts = scripts.map(String).map(x => x.trim()).filter(Boolean);
  rows.forEach((row, index) => {
    const phone = String(row.phone || '').replace(/\D/g, '');
    if (!PHONE_RE.test(phone)) issues.push({ index, type: 'INVALID', message: 'Telefone inválido', row });
    if (seen.has(phone) && phone) issues.push({ index, type: 'DUPLICATE', message: 'Telefone duplicado', row });
    seen.add(phone);
    if (!row.name) issues.push({ index, type: 'WARNING', message: 'Nome ausente', row });
    if (!usableScripts.length) issues.push({ index, type: 'ERROR', message: 'Nenhuma mensagem cadastrada', row });
    for (const script of usableScripts) for (const key of extractVariables(script)) {
      const values = { nome: row.name, name: row.name, telefone: phone, phone, ...(row.fields || {}) };
      if (values[key] == null || values[key] === '') issues.push({ index, type: 'VARIABLE', message: `Variável {{${key}}} sem valor`, row });
    }
  });
  const invalid = issues.filter(x => x.type === 'INVALID').length;
  const duplicates = issues.filter(x => x.type === 'DUPLICATE').length;
  const variableErrors = issues.filter(x => x.type === 'VARIABLE').length;
  return { total: rows.length, valid: rows.length - invalid, invalid, duplicates, variableErrors, ready: rows.length > 0 && invalid === 0 && variableErrors === 0 && usableScripts.length > 0, issues, scripts: usableScripts };
}

export function previewMessages(rows, scripts, limit = 3) {
  const usable = scripts.filter(Boolean);
  return rows.slice(0, limit).map((row, index) => ({ ...row, variant: index % Math.max(1, usable.length), message: renderTemplate(usable[index % Math.max(1, usable.length)] || '', row) }));
}

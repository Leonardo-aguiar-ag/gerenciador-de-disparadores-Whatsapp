export function normalizePhone(value, defaultCountry = '55') {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = defaultCountry + digits.slice(1);
  if (digits.length >= 10 && digits.length <= 11 && defaultCountry) digits = defaultCountry + digits;
  return digits;
}

export function isValidPhone(value) {
  const digits = normalizePhone(value);
  return /^\d{12,15}$/.test(digits);
}

function detectDelimiter(text) {
  const counts = new Map([[';', 0], [',', 0], ['\t', 0]]);
  let quoted = false;
  let records = 0;
  for (let i = 0; i < text.length && records < 5; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { i++; continue; }
      quoted = !quoted;
    } else if (!quoted && counts.has(char)) {
      counts.set(char, counts.get(char) + 1);
    } else if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      records++;
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function parseDelimitedRows(input) {
  const text = String(input ?? '').replace(/^\uFEFF/, '');
  if (!text) return [];
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const finishCell = () => { row.push(cell.trim()); cell = ''; };
  const finishRow = () => {
    finishCell();
    if (row.some(value => value !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"' && (quoted || cell.trim() === '')) {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
      continue;
    }
    if (!quoted && char === delimiter) { finishCell(); continue; }
    if (!quoted && (char === '\n' || char === '\r')) {
      finishRow();
      if (char === '\r' && text[i + 1] === '\n') i++;
      continue;
    }
    cell += char;
  }
  if (cell !== '' || row.length) finishRow();
  return rows;
}

function contactFromParts(parts) {
  const values = [...parts];
  const phone = normalizePhone(values.shift() || '');
  const name = values.shift() || '';
  const fields = {};
  values.forEach((value, index) => { fields[`campo_${index + 1}`] = value; });
  return { phone, name, fields, valid: isValidPhone(phone) };
}

export function parseContactLine(line) {
  return contactFromParts(parseDelimitedRows(String(line ?? ''))[0] || []);
}

export function parseContactList(text) {
  return parseDelimitedRows(text).map(contactFromParts);
}

export function interpolate(template, contact = {}) {
  return String(template ?? '').replace(/\[([A-Z0-9_]+)\]/gi, (_, key) => {
    const normalized = key.toLowerCase();
    if (normalized === 'nome') return contact.name || '';
    if (normalized === 'telefone' || normalized === 'phone') return contact.phone || '';
    return contact.fields?.[normalized] ?? contact.fields?.[key] ?? '';
  });
}

export function processSpintax(text) {
  return String(text ?? '').replace(/\{([^{}]+)\}/g, (_, options) => {
    const values = options.split('|');
    return values[Math.floor(Math.random() * values.length)] || '';
  });
}

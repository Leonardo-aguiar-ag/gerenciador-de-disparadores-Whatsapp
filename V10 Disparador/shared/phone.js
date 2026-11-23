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

export function parseContactLine(line) {
  const parts = String(line ?? '').split(/[;,\t]/).map(v => v.trim());
  const phone = normalizePhone(parts.shift() || '');
  const name = parts.shift() || '';
  const fields = {};
  parts.forEach((value, index) => { fields[`campo_${index + 1}`] = value; });
  return { phone, name, fields, valid: isValidPhone(phone) };
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

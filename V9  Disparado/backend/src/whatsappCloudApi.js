const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v23.0';

function getCredentials(input = {}) {
  return {
    token: input.token || process.env.WHATSAPP_TOKEN,
    phoneNumberId: input.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID
  };
}

async function sendWhatsAppMessage(message = {}, credentials = {}) {
  const { token, phoneNumberId } = getCredentials(credentials);
  if (!token || !phoneNumberId) {
    return { ok: false, dryRun: true, error: 'WhatsApp Cloud API não configurada: defina WHATSAPP_TOKEN e WHATSAPP_PHONE_NUMBER_ID.' };
  }
  const type = message.media?.type || message.type || 'text';
  const to = String(message.to || '').replace(/\D/g, '');
  if (!to) return { ok: false, error: 'Número de destino inválido.' };
  const payload = { messaging_product: 'whatsapp', recipient_type: 'individual', to, type };
  if (type === 'text') payload.text = { body: String(message.body || '') };
  else if (['image', 'video', 'audio', 'document'].includes(type)) {
    const media = message.media || {};
    payload[type] = { link: media.url, caption: media.caption || undefined, filename: media.filename || undefined };
  } else if (type === 'template') payload.template = message.template;
  else return { ok: false, error: `Tipo de mídia não suportado: ${type}` };

  const response = await fetch(`https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { ok: false, dryRun: false, error: data.error?.message || `WhatsApp API HTTP ${response.status}`, providerResponse: data };
  return { ok: true, dryRun: false, providerMessageId: data.messages?.[0]?.id || null, providerResponse: data };
}

async function sendTextMessage(message, credentials) { return sendWhatsAppMessage({ ...message, type: 'text' }, credentials); }
module.exports = { sendTextMessage, sendWhatsAppMessage };

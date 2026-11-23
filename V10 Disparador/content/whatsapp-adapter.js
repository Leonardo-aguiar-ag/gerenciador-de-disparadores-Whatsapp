const state = { connected: false, lastError: null };

function detectConnection() {
  const loggedOut = Boolean(document.querySelector('[data-testid="intro-md-chat-list"], [data-testid="qr-code"]'));
  const hasChat = Boolean(document.querySelector('[data-testid="conversation-panel-wrapper"], [data-testid="chat-list"]'));
  state.connected = !loggedOut && hasChat;
  if (!state.connected && !loggedOut) state.lastError = 'A interface do WhatsApp não foi reconhecida.';
  return { ...state, url: location.href, adapter: 'whatsapp-web-v10' };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'whatsapp:status') { sendResponse({ ok: true, data: detectConnection() }); return true; }
  if (message.type === 'whatsapp:ping') { sendResponse({ ok: true, data: { ...detectConnection(), version: '10.0.0' } }); return true; }
  if (message.type === 'whatsapp:simulate') { sendResponse({ ok: true, data: { simulated: true, phone: message.phone, body: message.body } }); return true; }
});

setInterval(() => detectConnection(), 15000);

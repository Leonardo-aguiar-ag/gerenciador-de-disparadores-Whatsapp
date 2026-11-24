if (!window.__v10WhatsAppAdapterInstalled) {
  window.__v10WhatsAppAdapterInstalled = true;
  const state = { connected: false, lastError: null };

  function detectConnection() {
    const loggedOut = Boolean(document.querySelector(
      '[data-testid="intro-md-chat-list"], [data-testid="qr-code"], [data-testid="qrcode"], [aria-label*="QR code" i], [aria-label*="QR Code" i]'
    ));
    // Keep this in sync with the legacy sender, which recognizes #pane-side
    // and the WhatsApp message composer when the newer test IDs are absent.
    const hasChat = Boolean(document.querySelector(
      '#pane-side, [data-testid="conversation-panel-wrapper"], [data-testid="chat-list"]'
    ));
    const hasComposer = Boolean(document.querySelector(
      'footer div[contenteditable="true"]'
    ));
    state.connected = !loggedOut && (hasChat || hasComposer);
    state.lastError = state.connected ? null : 'WhatsApp Web não conectado ou interface não reconhecida.';
    const current = window.__v10DispatchState;
    const dispatch = current ? { active: Boolean(current.rodando), paused: Boolean(current.pausado), waitingForBusinessHours: Boolean(current.esperandoHorario), sent: Number(current.enviados || 0), total: Number(current.total || 0) } : null;
    return { ...state, dispatch, phone: current?.numeroConta || '', url: location.href, adapter: 'whatsapp-web-v10' };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'whatsapp:status') { sendResponse({ ok: true, data: detectConnection() }); return true; }
    if (message.type === 'whatsapp:ping') { sendResponse({ ok: true, data: { ...detectConnection(), version: '10.0.0' } }); return true; }
    if (message.type === 'whatsapp:simulate') { sendResponse({ ok: true, data: { simulated: true, phone: message.phone, body: message.body } }); return true; }
  });

  setInterval(() => detectConnection(), 15000);
}

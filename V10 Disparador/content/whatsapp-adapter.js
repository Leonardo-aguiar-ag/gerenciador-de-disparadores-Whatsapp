if (!window.__v10WhatsAppAdapterInstalled) {
  window.__v10WhatsAppAdapterInstalled = true;
  const state = { connected: false, lastError: null };

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0 && element.getClientRects().length > 0;
  }
  function firstVisible(selectors) {
    return [...document.querySelectorAll(selectors)].find(isVisible) || null;
  }

  function isWhatsAppReady() {
    const qr = firstVisible('[data-testid="qr-code"], [data-testid="qrcode"], [aria-label*="QR code" i], [aria-label*="código QR" i]');
    const intro = firstVisible('[data-testid="intro-md-chat-list"]');
    const chat = firstVisible('#pane-side, [data-testid="conversation-panel-wrapper"], [data-testid="chat-list"], [data-testid="chat-list-search"]');
    const composer = firstVisible('footer div[contenteditable="true"], div[contenteditable="true"][role="textbox"]');
    if (qr) return { ready: false, reason: 'QR Code visível: sessão não autenticada.' };
    if (intro && !chat && !composer) return { ready: false, reason: 'Tela de introdução do WhatsApp Web visível.' };
    if (!chat && !composer) return { ready: false, reason: 'Interface autenticada ainda não foi encontrada.' };
    return { ready: true, reason: 'Sessão autenticada e interface disponível.' };
  }
  window.__v10IsWhatsAppReady = isWhatsAppReady;

  function detectConnection() {
    const readiness = isWhatsAppReady();
    state.connected = readiness.ready;
    state.lastError = readiness.ready ? null : readiness.reason;
    const current = window.__v10DispatchState;
    const dispatch = current ? { active: Boolean(current.rodando), paused: Boolean(current.pausado), waitingForBusinessHours: Boolean(current.esperandoHorario), sent: Number(current.enviados || 0), total: Number(current.total || 0) } : null;
    return { ...state, reason: readiness.reason, dispatch, phone: current?.numeroConta || '', url: location.href, adapter: 'whatsapp-web-v10' };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'whatsapp:status') { sendResponse({ ok: true, data: detectConnection() }); return true; }
    if (message.type === 'whatsapp:ping') { sendResponse({ ok: true, data: { ...detectConnection(), version: '10.0.0' } }); return true; }
    if (message.type === 'whatsapp:simulate') { sendResponse({ ok: true, data: { simulated: true, phone: message.phone, body: message.body } }); return true; }
  });

  setInterval(() => detectConnection(), 15000);
}

if (!window.__v10WhatsAppAdapterInstalled) {
  window.__v10WhatsAppAdapterInstalled = true;
  const state = { connected: false, lastError: null };

  const SELECTORS = {
    chatPanels: [
      '#pane-side',
      'div[data-testid="chat-list"]',
      '[data-testid="chat-list"]',
      '[data-testid="conversation-panel-wrapper"]',
      '[data-testid="chat-list-search"]',
      '[aria-label="Lista de conversas"]',
      '[aria-label="Chat list" i]',
      'div[role="grid"][aria-label*="conversa" i]'
    ],
    messageInputs: [
      'footer div[contenteditable="true"]',
      'div[contenteditable="true"][data-tab]',
      'div[contenteditable="true"][role="textbox"]',
      '[aria-label*="Digite uma mensagem" i]',
      '[aria-label*="Type a message" i]'
    ],
    qrIndicators: [
      '[data-testid="qrcode"]',
      '[data-testid="qr-code"]',
      '[aria-label*="QR code" i]',
      '[aria-label*="código QR" i]',
      'canvas[aria-label*="QR" i]',
      '[data-ref] canvas',
      'div[data-testid="intro-md"] canvas'
    ],
    loadingIndicators: [
      '[data-testid="intro-md"]',
      '[data-testid="intro-md-chat-list"]',
      '[data-testid="progressbar"]'
    ]
  };

  function isVisible(element) {
    if (!element) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || 1) > 0 &&
      element.getClientRects().length > 0;
  }

  function firstVisible(selectors) {
    for (const selector of selectors) {
      let elements = [];
      try { elements = document.querySelectorAll(selector); } catch (error) {
        console.warn('[V10][adapter] seletor inválido', { selector, error: error.message });
      }
      for (const element of elements) if (isVisible(element)) return element;
    }
    return null;
  }

  function isWhatsAppReady() {
    const panel = firstVisible(SELECTORS.chatPanels);
    const input = firstVisible(SELECTORS.messageInputs);
    const qr = firstVisible(SELECTORS.qrIndicators);
    const loading = firstVisible(SELECTORS.loadingIndicators);

    let result;
    if (qr) result = { ready: false, reason: 'qr_code_visivel', etapa: 'login' };
    else if (loading && !panel) result = { ready: false, reason: 'carregando', etapa: 'boot' };
    else if (panel) result = {
      ready: true,
      reason: input ? 'conectado' : 'painel_sem_input',
      etapa: input ? 'pronto' : 'pronto_parcial'
    };
    else if (input) result = { ready: true, reason: 'campo_mensagem_visivel', etapa: 'pronto_parcial' };
    else result = { ready: false, reason: 'sem_indicadores', etapa: 'desconhecido' };

    console.log('[V10][adapter] detecção de sessão', {
      ...result,
      painel: Boolean(panel),
      campoMensagem: Boolean(input),
      qr: Boolean(qr),
      carregando: Boolean(loading)
    });
    return result;
  }

  window.__v10IsWhatsAppReady = isWhatsAppReady;

  function detectConnection() {
    const readiness = isWhatsAppReady();
    state.connected = readiness.ready;
    state.lastError = readiness.ready ? null : readiness.reason;
    const current = window.__v10DispatchState;
    const dispatch = current ? {
      active: Boolean(current.rodando),
      paused: Boolean(current.pausado),
      waitingForBusinessHours: Boolean(current.esperandoHorario),
      sent: Number(current.enviados || 0),
      total: Number(current.total || 0)
    } : null;
    return {
      ...state,
      ready: readiness.ready,
      connected: readiness.ready,
      reason: readiness.reason,
      etapa: readiness.etapa,
      dispatch,
      phone: current?.numeroConta || '',
      url: location.href,
      adapter: 'whatsapp-web-v10'
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'whatsapp:status') {
      const data = detectConnection();
      console.log('[V10][adapter] status respondido', data);
      sendResponse({ ok: true, data });
      return true;
    }
    if (message.type === 'whatsapp:ping') {
      sendResponse({ ok: true, data: { ...detectConnection(), version: '10.0.0' } });
      return true;
    }
    if (message.type === 'whatsapp:simulate') {
      sendResponse({ ok: true, data: { simulated: true, phone: message.phone, body: message.body } });
      return true;
    }
  });

  setInterval(() => detectConnection(), 15000);
}

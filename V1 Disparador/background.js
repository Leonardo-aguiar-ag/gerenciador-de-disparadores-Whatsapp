let estado = { rodando: false, pausado: false, index: 0, lista: [], scripts: [] };

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.acao === "iniciar") {
        if (estado.pausado) {
            estado.pausado = false;
            estado.rodando = true;
        } else {
            estado = { rodando: true, pausado: false, index: 0, lista: msg.lista, scripts: msg.scripts };
        }
        processarFila();
    }
    if (msg.acao === "pausar") {
        estado.pausado = true;
        estado.rodando = false;
        salvarNoStorage();
    }
    if (msg.acao === "parar") {
        estado.rodando = false;
        estado.pausado = false;
        estado.index = 0;
        salvarNoStorage();
    }
});

async function processarFila() {
    if (!estado.rodando || estado.pausado || estado.index >= estado.lista.length) return;

    const num = estado.lista[estado.index];
    const msgSorteada = estado.scripts[Math.floor(Math.random() * estado.scripts.length)];
    const numLimpo = num.startsWith('55') ? num : '55' + num;

    chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { 
                acao: "trocarChatESenviar", 
                numero: numLimpo, 
                mensagem: msgSorteada 
            });
        }
    });

    estado.index++;
    salvarNoStorage();

    const d = await chrome.storage.local.get(['min', 'max']);
    const delay = (Math.floor(Math.random() * (parseInt(d.max) - parseInt(d.min) + 1)) + parseInt(d.min)) * 1000;
    
    setTimeout(() => {
        if (estado.rodando && !estado.pausado) processarFila();
    }, delay + 5000); // 5s fixos de carregamento interno
}

function salvarNoStorage() {
    chrome.storage.local.set({ 
        index: estado.index, 
        total: estado.lista.length, 
        rodando: estado.rodando,
        pausado: estado.pausado 
    });
}
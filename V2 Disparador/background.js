let estado = { rodando: false, pausado: false, index: 0, lista: [], scripts: [] };

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.acao === "iniciar") {
        estado = { rodando: true, pausado: false, index: 0, lista: msg.lista, scripts: msg.scripts };
        chrome.storage.local.set({ logs: [] });
        loop();
    }
    if (msg.acao === "pausar") { estado.pausado = !estado.pausado; salvar(); }
    if (msg.acao === "parar") { estado.rodando = false; estado.index = 0; salvar(); }
});

async function loop() {
    if (!estado.rodando || estado.index >= estado.lista.length) { estado.rodando = false; salvar(); return; }
    if (estado.pausado) { setTimeout(loop, 1000); return; }

    const num = estado.lista[estado.index];
    const numLimpo = num.replace(/\D/g, '');
    const fone = numLimpo.startsWith('55') ? numLimpo : '55' + numLimpo;
    const msg = estado.scripts[Math.floor(Math.random() * estado.scripts.length)];

    chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { acao: "env", num: fone, msg: msg });
            salvarLog(fone);
        }
    });

    estado.index++;
    salvar();
    const d = await chrome.storage.local.get(['min', 'max']);
    const delay = (Math.floor(Math.random() * (parseInt(d.max) - parseInt(d.min) + 1)) + parseInt(d.min)) * 1000;
    setTimeout(loop, delay + 10000); // 10s de espera segura
}

function salvarLog(num) {
    chrome.storage.local.get({logs: []}, (d) => {
        chrome.storage.local.set({ logs: [...d.logs, { num, hora: new Date().toLocaleTimeString(), status: 'OK' }] });
    });
}

function salvar() {
    chrome.storage.local.set({ index: estado.index, total: estado.lista.length, rodando: estado.rodando, pausado: estado.pausado });
}
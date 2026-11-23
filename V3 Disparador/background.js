let estado = { rodando: false, pausado: false, index: 0, lista: [], scripts: [], enviadosLote: 0 };
let timer;

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.acao === "iniciar") {
        estado = { rodando: true, pausado: false, index: 0, lista: msg.lista, scripts: msg.scripts, enviadosLote: 0 };
        chrome.storage.local.set({ logs: [] });
        proximo();
    }
    if (msg.acao === "pausar") { estado.pausado = !estado.pausado; salvar(); }
    if (msg.acao === "parar") { estado.rodando = false; clearTimeout(timer); salvar(); }
    if (msg.acao === "resultadoEnvio") {
        salvarLog(msg.num, msg.status);
        estado.index++;
        estado.enviadosLote++;
        salvar();
        agendar();
    }
});

function proximo() {
    if (!estado.rodando || estado.index >= estado.lista.length) return;
    if (estado.pausado) { timer = setTimeout(proximo, 1000); return; }
    chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, async (tabs) => {
        if (tabs[0]) {
            const d = await chrome.storage.local.get(['anexoB64', 'anexoNome', 'anexoType']);
            chrome.tabs.sendMessage(tabs[0].id, { acao: "env", num: estado.lista[estado.index], msg: estado.scripts[Math.floor(Math.random() * estado.scripts.length)], anexoB64: d.anexoB64, anexoNome: d.anexoNome, anexoType: d.anexoType });
        }
    });
}

async function agendar() {
    const d = await chrome.storage.local.get(['min', 'max', 'loteAtivo', 'loteQtd', 'lotePausa']);
    let delay = (Math.floor(Math.random() * (parseInt(d.max) - parseInt(d.min) + 1)) + parseInt(d.min)) * 1000;
    if (d.loteAtivo && estado.enviadosLote >= parseInt(d.loteQtd)) { delay = parseInt(d.lotePausa) * 1000; estado.enviadosLote = 0; }
    timer = setTimeout(proximo, delay);
}

function salvarLog(num, status) {
    chrome.storage.local.get({logs: []}, (d) => { chrome.storage.local.set({ logs: [...d.logs, { num, hora: new Date().toLocaleTimeString(), status }] }); });
}

function salvar() { chrome.storage.local.set({ index: estado.index, total: estado.lista.length, rodando: estado.rodando, pausado: estado.pausado }); }
const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxm7Nty_BROdsNh1SM17Npm9LIiVMSHfISXPRaav6obSsUvwIcgz8-veOjVPbNur6FF/exec";

let rodando = false;
let pausado = false;
let waConectado = false;
let contadorEnvioLote = 0;
let pausaProgramada = false;

chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.acao === "wa_status") {
        waConectado = msg.info.conectado;
        if (!waConectado && rodando && !pausado) {
            pausado = true;
            atualizarTimerStorage('pausado');
        }
    }

    if (msg.acao === "iniciar") {
        if (rodando || !waConectado) return;
        rodando = true;
        pausado = false;
        contadorEnvioLote = 0;
        const { lista, scripts } = msg;

        const cfg = await chrome.storage.local.get(["appData"]);
        const pausaLoteAtiva = cfg.appData?.chkPausaLote || false;
        const qtdLote = parseInt(cfg.appData?.qtdLote) || 20;
        const tempoLoteMin = parseInt(cfg.appData?.tempoLote) || 5;

        for (let i = 0; i < lista.length; i++) {
            if (!rodando) break;

            while ((pausado || !waConectado || pausaProgramada) && rodando) {
                if (!rodando) break;
                if (!pausado && !waConectado) pausado = true;
                await sleep(1000);
            }
            if (!rodando) break;

            const cliente = lista[i];
            let numeroDestino = "";
            let nomeCliente = "Cliente";

            if (cliente && typeof cliente === 'object') {
                numeroDestino = cliente.num || "";
                nomeCliente = cliente.nome || "Cliente";
            } else {
                numeroDestino = cliente || "";
            }

            let textoSorteado = scripts[Math.floor(Math.random() * scripts.length)];
            let textoFinal = processarSpintax(textoSorteado);
            let nomeFormatado = nomeCliente.charAt(0).toUpperCase() + nomeCliente.slice(1).toLowerCase();
            textoFinal = textoFinal.replace(/\[NOME\]/g, nomeFormatado);

            const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
            if (!tabs[0]) {
                pausado = true;
                break;
            }

            const resposta = await enviarMensagem(tabs[0].id, numeroDestino, textoFinal);
            await registrarLog(numeroDestino, nomeCliente, resposta, textoFinal);

            if (pausaLoteAtiva && rodando && !pausado) {
                contadorEnvioLote++;
                if (contadorEnvioLote >= qtdLote) {
                    contadorEnvioLote = 0;
                    pausaProgramada = true;
                    pausado = true;
                    atualizarTimerStorage('pausado');
                    await sleep(tempoLoteMin * 60 * 1000);
                    pausaProgramada = false;
                    pausado = false;
                    atualizarTimerStorage('rodando');
                }
            }

            if (i < lista.length - 1 && rodando && !pausado) {
                const min = cfg.appData ? parseInt(cfg.appData.min) : 15;
                const max = cfg.appData ? parseInt(cfg.appData.max) : 30;
                const delayMs = (Math.random() * (max - min) + min) * 1000;
                await sleep(resposta === "OK" ? delayMs : 2000);
            }
        }
        rodando = false;
        pausado = false;
        pausaProgramada = false;
        atualizarTimerStorage('concluido');
    }

    if (msg.acao === "pausar") {
        pausado = !pausado;
        atualizarTimerStorage(pausado ? 'pausado' : 'rodando');
    }
    if (msg.acao === "parar") {
        rodando = false;
        pausado = false;
        pausaProgramada = false;
        atualizarTimerStorage('parado');
    }
});

function processarSpintax(texto) {
    let regex = /{([^{}]*)}/g;
    let match;
    while ((match = regex.exec(texto)) !== null) {
        let opcoes = match[1].split('|');
        let escolhida = opcoes[Math.floor(Math.random() * opcoes.length)];
        texto = texto.replace(match[0], escolhida);
        regex.lastIndex = 0;
    }
    return texto;
}

function enviarMensagem(tabId, numero, texto) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { acao: "env", num: numero, msg: texto }).catch(() => resolve("TIMEOUT"));

        const listener = (msg) => {
            if (msg.acao === "resultado" && msg.num === numero) {
                chrome.runtime.onMessage.removeListener(listener);
                resolve(msg.status);
            }
        };
        chrome.runtime.onMessage.addListener(listener);

        setTimeout(() => {
            chrome.runtime.onMessage.removeListener(listener);
            resolve("TIMEOUT");
        }, 25000);
    });
}

function registrarLog(numero, nomeCliente, status, textoEnviado) {
    return new Promise(resolve => {
        chrome.storage.local.get(['logs', 'progresso'], async (d) => {
            let logs = d.logs || [];
            let prog = d.progresso || { total: 0, enviados: 0 };

            logs.push({
                numero: numero,
                nome: nomeCliente,
                status: status,
                data: new Date().toLocaleDateString('pt-BR'),
                hora: new Date().toLocaleTimeString('pt-BR'),
                mensagem: textoEnviado
            });

            prog.enviados++;

            try {
                await fetch(WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        numero: numero,
                        nomeCliente: nomeCliente,
                        status: status,
                        data: new Date().toISOString(),
                        mensagem: textoEnviado
                    })
                });
            } catch (e) {
                console.log("Erro ao tentar atualizar planilha: ", e);
            }

            chrome.storage.local.set({ logs, progresso: prog }, resolve);
        });
    });
}

function atualizarTimerStorage(status) {
    chrome.storage.local.get(['timerData'], d => {
        let timer = d.timerData || { inicio: Date.now(), estimativa: 0, totalPausado: 0, ultimoPause: 0, status: 'rodando' };
        timer.status = status;
        if (status === 'pausado' && timer.ultimoPause === 0) timer.ultimoPause = Date.now();
        if (status === 'rodando' && timer.ultimoPause > 0) {
            timer.totalPausado += (Date.now() - timer.ultimoPause);
            timer.ultimoPause = 0;
        }
        if (status === 'parado' || status === 'concluido') timer.ultimoPause = Date.now();
        chrome.storage.local.set({ timerData: timer });
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
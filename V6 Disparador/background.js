const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxm7Nty_BROdsNh1SM17Npm9LIiVMSHfISXPRaav6obSsUvwIcgz8-veOjVPbNur6FF/exec";

let waConectado = false;
let pausado = false;

chrome.runtime.onMessage.addListener(async (msg) => {

    // ===== Status do WhatsApp vindo do content =====
    if (msg.acao === "wa_status") {
        waConectado = msg.info.conectado;
        if (!waConectado && !pausado) {
            const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
            if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { acao: "pausar" }).catch(() => {});
            pausado = true;
            atualizarTimerStorage('pausado');
        }
    }

    // ===== Iniciar disparo: repassa fila para o content da aba =====
    if (msg.acao === "iniciar") {
        if (!waConectado) return;
        pausado = false;

        const cfg = await chrome.storage.local.get(["appData"]);
        const config = {
            min: parseInt(cfg.appData?.min) || 15,
            max: parseInt(cfg.appData?.max) || 30,
            pausaLoteAtiva: cfg.appData?.chkPausaLote || false,
            qtdLote: parseInt(cfg.appData?.qtdLote) || 20,
            tempoLoteMin: parseInt(cfg.appData?.tempoLote) || 5
        };

        const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
        if (!tabs[0]) return;

        chrome.tabs.sendMessage(tabs[0].id, {
            acao: "iniciar_disparo",
            lista: msg.lista,
            scripts: msg.scripts,
            config: config
        }).catch(() => {});
    }

    // ===== Cada envio concluído: grava log + envia webhook =====
    if (msg.acao === "log_resultado") {
        const d = await chrome.storage.local.get(['logs', 'progresso']);
        let logs = d.logs || [];
        let prog = d.progresso || { total: msg.total || 0, enviados: 0 };

        logs.push({
            numero: msg.numero,
            nome: msg.nome,
            status: msg.status,
            data: new Date().toLocaleDateString('pt-BR'),
            hora: new Date().toLocaleTimeString('pt-BR'),
            mensagem: msg.mensagem
        });

        prog.enviados = msg.enviados;
        prog.total = msg.total;

        await chrome.storage.local.set({ logs, progresso: prog });

        try {
            await fetch(WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    numero: msg.numero,
                    nomeCliente: msg.nome,
                    status: msg.status,
                    data: new Date().toISOString(),
                    mensagem: msg.mensagem
                })
            });
        } catch (e) {
            console.log("Erro ao tentar atualizar planilha: ", e);
        }
    }

    // ===== Fila terminou no content =====
    if (msg.acao === "dispatch_concluido") {
        pausado = false;
        atualizarTimerStorage('concluido');
    }

    // ===== Status em tempo real vindo do content =====
    if (msg.acao === "dispatch_status") {
        pausado = msg.pausado;
        atualizarTimerStorage(pausado ? 'pausado' : 'rodando');
    }

    // ===== Botão Pausar/Retomar do popup =====
    if (msg.acao === "pausar") {
        pausado = !pausado;
        const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { acao: "pausar" }).catch(() => {});
        atualizarTimerStorage(pausado ? 'pausado' : 'rodando');
    }

    // ===== Botão Parar do popup =====
    if (msg.acao === "parar") {
        pausado = false;
        const tabs = await chrome.tabs.query({ url: "https://web.whatsapp.com/*" });
        if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { acao: "parar" }).catch(() => {});
        atualizarTimerStorage('parado');
    }
});

// ===== Timer =====
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
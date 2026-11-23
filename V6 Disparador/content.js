if (!window.botListenerAdded) {
    window.botListenerAdded = true;
    let ID_DISPARO = 0;

    // ====== ESTADO DO DISPARO (vive dentro da aba, não é morto pelo Chrome) ======
    const dispatchState = {
        rodando: false,
        pausado: false,
        total: 0,
        enviados: 0,
        contadorLote: 0,
        indice: 0
    };

    // ====== VERIFICAÇÃO DE CONEXÃO ======
    function verificarConexao() {
        try {
            const painelConversas = document.querySelector('#pane-side, div[data-testid="chat-list"]');
            const qrCode = document.querySelector('[data-testid="qrcode"], canvas');
            const inputMensagem = document.querySelector('footer div[contenteditable="true"]');

            let conectado = false;
            let numero = "Número Oculto";
            let nome = "Conta Autenticada";

            if ((painelConversas || inputMensagem) && !qrCode) {
                conectado = true;
                let rawNum = window.localStorage.getItem('last-wid-md') ||
                             window.localStorage.getItem('last-wid') ||
                             document.body.getAttribute('data-number') || "";
                numero = rawNum.replace(/[^0-9]/g, '');
                if (numero.length < 8) numero = "Número Oculto";

                let rawNome = window.localStorage.getItem('smb_business_name') ||
                              window.localStorage.getItem('pushname') ||
                              window.localStorage.getItem('name') ||
                              document.querySelector('header ._amkf')?.innerText || "";
                nome = rawNome.replace(/"/g, '').trim();
                if (!nome || nome === "undefined" || nome === "null") nome = "Conta Autenticada";
            }

            chrome.runtime.sendMessage({ acao: "wa_status", info: { conectado, numero, nome } });
        } catch (e) {
            chrome.runtime.sendMessage({ acao: "wa_status", info: { conectado: false } });
        }
    }

    setInterval(verificarConexao, 2000);
    verificarConexao();

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // ====== LISTENER DE MENSAGENS ======
    chrome.runtime.onMessage.addListener((req) => {
        if (req.acao === "env") {
            // disparo avulso (compatibilidade)
            ID_DISPARO++;
            const idAtual = ID_DISPARO;
            disparar(req, idAtual).then(status => {
                chrome.runtime.sendMessage({ acao: "resultado", num: req.num, status });
            });
        } else if (req.acao === "ping") {
            verificarConexao();
        } else if (req.acao === "iniciar_disparo") {
            iniciarDisparo(req.lista, req.scripts, req.config);
        } else if (req.acao === "pausar") {
            dispatchState.pausado = !dispatchState.pausado;
            chrome.runtime.sendMessage({
                acao: "dispatch_status",
                pausado: dispatchState.pausado,
                rodando: dispatchState.rodando
            });
        } else if (req.acao === "parar") {
            dispatchState.rodando = false;
            dispatchState.pausado = false;
            chrome.runtime.sendMessage({ acao: "dispatch_status", pausado: false, rodando: false });
        }
    });

    // ====== SPINTAX ======
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

    // ====== LAÇO PRINCIPAL DO DISPARO ======
    async function iniciarDisparo(lista, scripts, config) {
        if (dispatchState.rodando) return;

        dispatchState.rodando = true;
        dispatchState.pausado = false;
        dispatchState.total = lista.length;
        dispatchState.enviados = 0;
        dispatchState.contadorLote = 0;
        dispatchState.indice = 0;

        for (let i = 0; i < lista.length; i++) {
            if (!dispatchState.rodando) break;

            // Aguarda enquanto pausado
            while (dispatchState.pausado && dispatchState.rodando) {
                await sleep(1000);
            }
            if (!dispatchState.rodando) break;

            dispatchState.indice = i;

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

            const status = await dispararLocal(numeroDestino, textoFinal);

            dispatchState.enviados++;

            // Avisa o background (grava log + webhook + progresso)
            chrome.runtime.sendMessage({
                acao: "log_resultado",
                numero: numeroDestino,
                nome: nomeCliente,
                status: status,
                mensagem: textoFinal,
                enviados: dispatchState.enviados,
                total: dispatchState.total
            });

            // Pausa por lote
            if (config.pausaLoteAtiva && dispatchState.rodando && !dispatchState.pausado) {
                dispatchState.contadorLote++;
                if (dispatchState.contadorLote >= config.qtdLote) {
                    dispatchState.contadorLote = 0;
                    dispatchState.pausado = true;
                    chrome.runtime.sendMessage({ acao: "dispatch_status", pausado: true, rodando: true });
                    await sleep(config.tempoLoteMin * 60 * 1000);
                    dispatchState.pausado = false;
                    chrome.runtime.sendMessage({ acao: "dispatch_status", pausado: false, rodando: true });
                }
            }

            // Delay aleatório entre envios
            if (i < lista.length - 1 && dispatchState.rodando && !dispatchState.pausado) {
                const delayMs = (Math.random() * (config.max - config.min) + config.min) * 1000;
                await sleep(status === "OK" ? delayMs : 2000);
            }
        }

        dispatchState.rodando = false;
        dispatchState.pausado = false;
        chrome.runtime.sendMessage({ acao: "dispatch_concluido" });
    }

    // ====== ENVIO LOCAL ======
    function dispararLocal(numero, texto) {
        ID_DISPARO++;
        const idAtual = ID_DISPARO;
        return disparar({ num: numero, msg: texto }, idAtual);
    }

    // ====== FUNÇÃO DE ENVIO ======
    async function disparar(req, idAtual) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        document.querySelectorAll('button').forEach(btn => { if (btn.innerText.toLowerCase() === 'ok') btn.click(); });
        await sleep(500);

        if (idAtual !== ID_DISPARO) return "CANCELADO";

        const link = document.createElement('a');
        link.href = `https://web.whatsapp.com/send?phone=${req.num}&text=${encodeURIComponent(req.msg)}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        let box = null;
        let erroEncontrado = false;

        for (let i = 0; i < 20; i++) {
            if (idAtual !== ID_DISPARO) return "CANCELADO";
            await sleep(1000);
            const textoTela = document.body.innerText.toLowerCase();
            if (textoTela.includes("url é inválido") || textoTela.includes("telefone compartilhado") || textoTela.includes("não existe no whatsapp")) {
                erroEncontrado = true;
                document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                document.querySelectorAll('button').forEach(b => { if (b.innerText.toLowerCase() === 'ok') b.click(); });
                break;
            }
            box = document.querySelector('footer div[contenteditable="true"]') || document.querySelector('div[contenteditable="true"][data-tab="10"]');
            if (box && box.innerText.trim().length > 0) break;
        }

        if (idAtual !== ID_DISPARO) return "CANCELADO";
        if (erroEncontrado) return "INVÁLIDO";
        if (!box) return "TIMEOUT";

        await sleep(1500);
        if (idAtual !== ID_DISPARO) return "CANCELADO";

        let btnTexto = document.querySelector('button[aria-label="Enviar"]') || document.querySelector('span[data-icon="send"]');
        if (btnTexto) {
            if (btnTexto.tagName !== 'BUTTON' && btnTexto.parentElement) btnTexto = btnTexto.parentElement;
            btnTexto.click();
        } else {
            box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }

        return "OK";
    }
}
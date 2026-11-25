/* ============================================================
   CONTENT — v10.0
   - Web Worker anti-throttling
   - Detecção de "digitando..." do contato
   - Envio de texto puro
   ============================================================ */

if (!window.botListenerAdded) {
    window.botListenerAdded = true;
    let ID_DISPARO = 0;

    /* Web Worker anti-throttling */
    let botWorker = null;
    let sleepId = 0;
    const sleepCallbacks = new Map();

    try {
        const workerCode = `self.onmessage = (e) => { const d = e.data || {}; if (d.acao === 'sleep') { setTimeout(() => self.postMessage({ acao: 'done', id: d.id }), d.ms); } };`;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        botWorker = new Worker(URL.createObjectURL(blob));
        botWorker.onmessage = (e) => {
            if (e.data && e.data.acao === 'done') {
                const cb = sleepCallbacks.get(e.data.id);
                if (cb) { sleepCallbacks.delete(e.data.id); cb(); }
            }
        };
        botWorker.onerror = () => { botWorker = null; };
    } catch (e) { botWorker = null; }

    function sleep(ms) {
        // O worker reduz o throttling, mas nunca pode bloquear a fila sozinho:
        // se ele for descartado pelo navegador, o fallback libera a promessa.
        return new Promise(resolve => {
            let settled = false;
            const finish = () => { if (settled) return; settled = true; resolve(); };
            const fallback = setTimeout(finish, Math.max(0, Number(ms) || 0) + 250);
            if (!botWorker) return;
            const id = ++sleepId;
            sleepCallbacks.set(id, () => { clearTimeout(fallback); finish(); });
            try { botWorker.postMessage({ acao: 'sleep', ms, id }); }
            catch { sleepCallbacks.delete(id); }
        });
    }

    const dispatchState = {
        rodando: false, pausado: false, manualPause: false, autoPause: false, esperandoHorario: false, total: 0, enviados: 0,
        contadorLote: 0, fila: null, duplicatas: {}, optOut: {}, warmUpLimite: null,
        ignoraDuplicatas: false, numeroConta: null, runId: 0
    };
    window.__v10DispatchState = dispatchState;

    function sendMsg(msg) { try { chrome.runtime.sendMessage(msg); } catch (e) {} }

    /* CONEXÃO */
    let ultimoEstadoConectado = null;
    function verificarConexao() {
        try {
            const readiness = typeof window.__v10IsWhatsAppReady === 'function'
                ? window.__v10IsWhatsAppReady()
                : { ready: false, reason: 'adaptador_indisponivel', etapa: 'boot' };
            const conectado = readiness.ready === true;
            dispatchState.numeroConta = 'Número Oculto';
            console.log('[V10][content] verificarConexao', readiness);
            sendMsg({ acao: "wa_status", info: { conectado, numero: dispatchState.numeroConta, nome: conectado ? "Conta Autenticada" : readiness.reason } });
            if (conectado && ultimoEstadoConectado !== true) {
                ultimoEstadoConectado = true;
                sendMsg({ acao: "content_ready", numero: dispatchState.numeroConta, nome: "Conta Autenticada" });
            } else if (!conectado) {
                ultimoEstadoConectado = false;
            }
            return conectado;
        } catch (error) {
            console.error('[V10][content] falha ao verificar conexão', error);
            sendMsg({ acao: "wa_status", info: { conectado: false, numero: "Número Oculto", nome: error.message } });
            return false;
        }
    }
    setInterval(verificarConexao, 2000);
    verificarConexao();

    /* RESPOSTAS + DIGITANDO */
    const respostasVistas = new Set();
    const digitandoVistos = new Map();

    function iniciarObserver() {
        const pane = document.querySelector('#pane-side');
        if (!pane) { setTimeout(iniciarObserver, 3000); return; }
        new MutationObserver(() => { checarRespostas(pane); checarDigitando(); })
            .observe(pane, { childList: true, subtree: true, characterData: true });
        checarRespostas(pane);
        checarDigitando();
    }
    setTimeout(iniciarObserver, 5000);

    function extrairNumeroDoChat(chat) {
        const elementos = [chat, ...chat.querySelectorAll('[data-id], [data-testid]')];
        for (const el of elementos) {
            const valor = [el.getAttribute?.('data-id'), el.getAttribute?.('data-testid'), el.getAttribute?.('aria-label')]
                .filter(Boolean).join(' ');
            const achados = valor.match(/\d{10,15}/g) || [];
            const numero = achados.find(n => n.length >= 10 && n.length <= 15);
            if (numero) return numero;
        }
        return null;
    }

    function checarRespostas(pane) {
        try {
            pane.querySelectorAll('div[role="listitem"]').forEach(chat => {
                const badge = chat.querySelector('span[aria-label*="não lid"], span[aria-label*="unread"], [data-testid="icon-unread-count"]');
                if (!badge) return;
                const nomeEl = chat.querySelector('span[title]');
                const nome = nomeEl ? nomeEl.getAttribute('title') : '';
                const prevEl = chat.querySelector('span[dir="ltr"]:not([title])');
                const preview = prevEl ? prevEl.innerText : '';
                const numero = extrairNumeroDoChat(chat);
                if (!nome || !numero) return;
                const chave = numero + '::' + preview.slice(0, 40);
                if (respostasVistas.has(chave)) return;
                respostasVistas.add(chave);
                sendMsg({ acao: "resposta_cliente", numero, texto: preview });
            });
        } catch (e) {}
    }

    // Detecção de "digitando..." no chat aberto
    function checarDigitando() {
        try {
            const header = document.querySelector('header');
            if (!header) return;
            const txt = (header.innerText || '').toLowerCase();
            // WhatsApp mostra "digitando..." ou "typing..." no header do chat aberto
            const estaDigitando = txt.includes('digitando') || txt.includes('typing') || txt.includes('gravando') || txt.includes('recording');
            if (!estaDigitando) return;

            // Pega o nome do contato no header (primeiro span com title)
            const nomeEl = header.querySelector('span[title]');
            const nome = nomeEl ? nomeEl.getAttribute('title') : '';
            if (!nome) return;

            // Evita duplicar eventos a cada 2s — só manda 1x por minuto por contato
            const ultimo = digitandoVistos.get(nome) || 0;
            if (Date.now() - ultimo < 60000) return;
            digitandoVistos.set(nome, Date.now());
            sendMsg({ acao: "digitando_cliente", numero: nome });
        } catch (e) {}
    }

    /* LISTENER */
    chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
        if (req.acao === "iniciar_disparo") {
            console.log('[V10][popup→content] iniciar_disparo recebido', { msgCount: req.fila?.lista?.length || 0, timestamp: Date.now() });
            const fila = req.fila;
            if (dispatchState.rodando) {
                sendResponse({ accepted: false, error: "Já existe um disparo em andamento nesta aba." });
                return true;
            }
            if (!verificarConexao()) {
                console.warn('[V10][content] início bloqueado: sessão não pronta');
                sendResponse({ accepted: false, error: "WhatsApp Web não está conectado. Conecte a sessão e tente novamente." });
                return true;
            }
            if (!fila || !Array.isArray(fila.lista) || !fila.lista.length || !Array.isArray(fila.scripts) || !fila.scripts.filter(s => String(s || '').trim()).length) {
                sendResponse({ accepted: false, error: "Lista ou scripts vazios." });
                return true;
            }
            iniciarDisparo(fila, req.duplicatas || {}, req.optOut || {}, req.warmUpLimite, req.ignoraDuplicatas);
            sendResponse({ accepted: dispatchState.rodando });
            return true;
        }
        else if (req.acao === "pausar") {
            if (!dispatchState.rodando) { sendResponse({ ok: false, error: "Não existe disparo ativo para pausar." }); return true; }
            dispatchState.manualPause = !dispatchState.manualPause;
            dispatchState.pausado = dispatchState.manualPause || dispatchState.autoPause;
            sendMsg({ acao: "dispatch_status", pausado: dispatchState.pausado, enviados: dispatchState.enviados, total: dispatchState.total });
            sendResponse({ ok: true, paused: dispatchState.pausado });
            return true;
        }
        else if (req.acao === "pausar_auto") { dispatchState.pausado = true; sendMsg({ acao: "dispatch_status", pausado: true }); }
        else if (req.acao === "parar") { const wasRunning = dispatchState.rodando; dispatchState.rodando = false; dispatchState.pausado = false; dispatchState.manualPause = false; dispatchState.autoPause = false; dispatchState.esperandoHorario = false; dispatchState.runId++; ID_DISPARO++; sendMsg({ acao: "dispatch_status", parado: true, enviados: dispatchState.enviados, total: dispatchState.total }); sendResponse({ ok: true, stopped: wasRunning }); return true; }
        else if (req.acao === "ping") verificarConexao();
    });

    /* SPINTAX */
    function processarSpintax(texto) {
        let regex = /{([^{}]*)}/g, match, iteracoes = 0;
        while ((match = regex.exec(texto)) !== null && iteracoes++ < 50) {
            const opcoes = match[1].split('|');
            if (!opcoes.length || opcoes.some(op => op.length > 2000)) break;
            texto = texto.replace(match[0], opcoes[Math.floor(Math.random() * opcoes.length)]);
            regex.lastIndex = 0;
        }
        return texto;
    }

    /* HELPERS */
    function detectarErroNumero() {
        const txt = document.body.innerText.toLowerCase();
        const padroes = ["url é inválido", "telefone compartilhado", "não existe no whatsapp",
            "phone number shared via url is invalid", "não é um número de telefone válido",
            "invalid phone number", "número de telefone inválido"];
        for (const p of padroes) if (txt.includes(p)) return true;
        return false;
    }
    function pressionarEnter(campo) {
        if (!campo) return false;
        try {
            campo.focus();
            const opts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true };
            campo.dispatchEvent(new KeyboardEvent('keydown', opts));
            campo.dispatchEvent(new KeyboardEvent('keypress', opts));
            campo.dispatchEvent(new KeyboardEvent('keyup', opts));
            return true;
        } catch (e) { return false; }
    }

    function dentroHorarioComercial(config = {}) {
        if (!config.businessEnabled) return true;
        const now = new Date();
        const weekdays = Array.isArray(config.weekdays) ? config.weekdays.map(Number) : [1, 2, 3, 4, 5];
        if (!weekdays.includes(now.getDay())) return false;
        const toMinutes = value => { const match = /^(\d{2}):(\d{2})$/.exec(String(value || '')); return match ? Number(match[1]) * 60 + Number(match[2]) : 0; };
        const current = now.getHours() * 60 + now.getMinutes();
        const start = toMinutes(config.businessStart || '08:00');
        const end = toMinutes(config.businessEnd || '20:00');
        return start <= end ? current >= start && current < end : current >= start || current < end;
    }

    /* ENVIO */
    async function enviarMensagem(numero, texto) {
        ID_DISPARO++;
        const idAtual = ID_DISPARO;
        console.log("[V10][content→WhatsApp] enviando mensagem", { numero, timestamp: Date.now() });
        for (let k = 0; k < 3; k++) {
            document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            await sleep(150);
        }
        const link = document.createElement('a');
        link.href = `https://web.whatsapp.com/send?phone=${numero}&text=${encodeURIComponent(texto)}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        let box = null;
        for (let i = 0; i < 20; i++) {
            if (idAtual !== ID_DISPARO) return "CANCELADO";
            await sleep(1000);
            if (detectarErroNumero()) {
                for (let k = 0; k < 3; k++) { document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(200); }
                document.querySelectorAll('button').forEach(b => { if (b.innerText && b.innerText.toLowerCase().trim() === 'ok') b.click(); });
                return "INVÁLIDO";
            }
            box = document.querySelector('footer div[contenteditable="true"]');
            if (box && box.innerText.trim().length > 0) break;
        }
        if (idAtual !== ID_DISPARO) return "CANCELADO";
        if (!box) return "TIMEOUT";
        await sleep(1000);
        if (!box.innerText.trim().length) {
            box.focus();
            await sleep(200);
            try { document.execCommand('insertText', false, texto); } catch (e) {}
            await sleep(300);
        }
        pressionarEnter(box);
        await sleep(1500);
        if (box.innerText.trim().length > 0) { pressionarEnter(box); await sleep(1500); }
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await sleep(300);
        console.log("[V10][content→WhatsApp] mensagem processada", { numero, timestamp: Date.now() });
        return "OK";
    }

    /* LOOP */
    async function iniciarDisparo(fila, duplicatas, optOut, warmUpLimite, ignoraDuplicatas) {
        if (dispatchState.rodando) return;
        if (!fila || !Array.isArray(fila.lista) || !fila.lista.length || !Array.isArray(fila.scripts) || !fila.scripts.filter(s => String(s || '').trim()).length) {
            sendMsg({ acao: "dispatch_concluido", erro: "Lista ou scripts vazios" });
            return;
        }
        const runId = ++dispatchState.runId;
        dispatchState.rodando = true;
        dispatchState.pausado = false;
        dispatchState.manualPause = false;
        dispatchState.autoPause = false;
        dispatchState.esperandoHorario = false;
        dispatchState.fila = fila;
        dispatchState.duplicatas = duplicatas || {};
        dispatchState.optOut = optOut || {};
        dispatchState.warmUpLimite = warmUpLimite == null ? null : Math.max(0, Number(warmUpLimite));
        dispatchState.ignoraDuplicatas = !!ignoraDuplicatas;
        dispatchState.total = fila.lista.length;
        dispatchState.enviados = fila.indice || 0;
        dispatchState.contadorLote = 0;
        console.log("[V10][content] fila iniciada", { total: fila.lista.length, worker: botWorker ? "ativo" : "fallback", timestamp: Date.now() });

        for (let i = fila.indice || 0; i < fila.lista.length; i++) {
            if (!dispatchState.rodando || dispatchState.runId !== runId) break;
            const runConfig = fila.config || {};
            while (dispatchState.rodando && dispatchState.runId === runId) {
                if (dispatchState.pausado) { await sleep(1000); continue; }
                if (dentroHorarioComercial(runConfig)) break;
                if (!dispatchState.esperandoHorario) {
                    dispatchState.esperandoHorario = true;
                    sendMsg({ acao: "dispatch_status", esperandoHorario: true, enviados: dispatchState.enviados, total: dispatchState.total });
                }
                await sleep(30000);
            }
            if (dispatchState.esperandoHorario) {
                dispatchState.esperandoHorario = false;
                sendMsg({ acao: "dispatch_status", esperandoHorario: false, enviados: dispatchState.enviados, total: dispatchState.total });
            }
            if (!dispatchState.rodando || dispatchState.runId !== runId) break;
            if (dispatchState.warmUpLimite !== null && dispatchState.warmUpLimite <= 0) {
                dispatchState.rodando = false;
                sendMsg({ acao: "dispatch_concluido", limiteAtingido: true, enviados: dispatchState.enviados, total: dispatchState.total });
                return;
            }
            console.log("[V10][content] processando contato", { indice: i + 1, total: fila.lista.length, timestamp: Date.now() });
            const cliente = fila.lista[i];
            let numeroDestino = "", nomeCliente = "Cliente";
            if (cliente && typeof cliente === 'object') {
                numeroDestino = cliente.num || "";
                nomeCliente = cliente.nome || "Cliente";
            } else numeroDestino = cliente || "";

            if (dispatchState.optOut[numeroDestino]) {
                dispatchState.enviados++;
                sendMsg({ acao: "log_resultado", numero: numeroDestino, nome: nomeCliente, status: "OPT_OUT", mensagem: "(bloqueado)", enviados: dispatchState.enviados, total: dispatchState.total, campanhaId: fila.campanhaId, eventoId: `${fila.campanhaId}:${numeroDestino}:OPT_OUT` });
                await sleep(100);
                continue;
            }
            if (!ignoraDuplicatas && dispatchState.duplicatas[numeroDestino]) {
                dispatchState.enviados++;
                sendMsg({ acao: "log_resultado", numero: numeroDestino, nome: nomeCliente, status: "DUPLICADO", mensagem: "(pulou)", enviados: dispatchState.enviados, total: dispatchState.total, campanhaId: fila.campanhaId, eventoId: `${fila.campanhaId}:${numeroDestino}:DUPLICADO` });
                await sleep(200);
                continue;
            }

            let scripts = fila.scripts;
            let variante = null;
            if (fila.tipo === 'ab' && fila.variantes && fila.atribuicoes) {
                variante = fila.atribuicoes[numeroDestino];
                const v = fila.variantes.find(x => x.id === variante);
                if (v) scripts = v.scripts;
            }
            if (!Array.isArray(scripts) || !scripts.length) {
                sendMsg({ acao: "log_resultado", numero: numeroDestino, nome: nomeCliente, status: "ERRO", mensagem: "Nenhum script válido", enviados: dispatchState.enviados, total: dispatchState.total, variante });
                continue;
            }
            sendMsg({ acao: "dispatch_status", fase: "enviando", contato: numeroDestino, nome: nomeCliente, enviados: dispatchState.enviados, total: dispatchState.total });
            const textoSorteado = scripts[Math.floor(Math.random() * scripts.length)];
            let textoFinal = processarSpintax(textoSorteado);
            const nomeFormatado = nomeCliente.charAt(0).toUpperCase() + nomeCliente.slice(1).toLowerCase();
            textoFinal = textoFinal.replace(/\[NOME\]/g, nomeFormatado);
            const campos = cliente && typeof cliente === 'object' ? (cliente.campos || {}) : {};
            textoFinal = textoFinal.replace(/\[([A-Z0-9_]+)\]/g, (token, chave) => {
                if (chave === 'NOME') return nomeFormatado;
                return campos[chave] != null ? String(campos[chave]) : token;
            });

            const status = await enviarMensagem(numeroDestino, textoFinal);
            if (!dispatchState.rodando || dispatchState.runId !== runId) return;
            dispatchState.enviados++;
            if (dispatchState.warmUpLimite !== null) dispatchState.warmUpLimite--;

            sendMsg({ acao: "log_resultado", numero: numeroDestino, nome: nomeCliente, status, mensagem: textoFinal, enviados: dispatchState.enviados, total: dispatchState.total, variante, campanhaId: fila.campanhaId, eventoId: `${fila.campanhaId}:${numeroDestino}:${i}` });
            sendMsg({ acao: "progresso_fila", indice: i + 1 });

            const configFila = fila.config || {};
            if (configFila.pausaLoteAtiva && dispatchState.rodando && dispatchState.runId === runId && !dispatchState.pausado) {
                dispatchState.contadorLote++;
                if (dispatchState.contadorLote >= (Number(configFila.qtdLote) || 20)) {
                    dispatchState.contadorLote = 0;
                    dispatchState.autoPause = true;
                    dispatchState.pausado = true;
                    sendMsg({ acao: "dispatch_status", pausado: true, enviados: dispatchState.enviados, total: dispatchState.total });
                    await sleep((Number(configFila.tempoLoteMin) || 5) * 60 * 1000);
                    dispatchState.autoPause = false;
                    dispatchState.pausado = dispatchState.manualPause;
                    sendMsg({ acao: "dispatch_status", pausado: dispatchState.pausado, enviados: dispatchState.enviados, total: dispatchState.total });
                }
            }
            if (i < fila.lista.length - 1 && dispatchState.rodando && dispatchState.runId === runId && !dispatchState.pausado) {
                const minDelay = Math.max(0, Number(fila.config?.min) || 0);
                const maxDelay = Math.max(minDelay, Number(fila.config?.max) || minDelay);
                const delayMs = (Math.random() * (maxDelay - minDelay) + minDelay) * 1000;
                await sleep(status === "OK" ? delayMs : 2000);
            }
        }
        if (dispatchState.runId !== runId) return;
        dispatchState.rodando = false;
        dispatchState.pausado = false;
        console.log("[V10][content] fila concluída", { enviados: dispatchState.enviados, total: dispatchState.total, timestamp: Date.now() });
        sendMsg({ acao: "dispatch_concluido", enviados: dispatchState.enviados, total: dispatchState.total });
    }
}

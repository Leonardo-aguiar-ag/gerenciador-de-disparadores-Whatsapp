if (!window.botListenerAdded) {
    window.botListenerAdded = true;
    let ID_DISPARO = 0;

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
        } catch(e) {
            chrome.runtime.sendMessage({ acao: "wa_status", info: { conectado: false } });
        }
    }

    setInterval(verificarConexao, 2000);
    verificarConexao();

    chrome.runtime.onMessage.addListener((req) => {
        if (req.acao === "env") {
            ID_DISPARO++;
            disparar(req, ID_DISPARO);
        } else if (req.acao === "ping") {
            verificarConexao();
        }
    });

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    async function disparar(req, idAtual) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        document.querySelectorAll('button').forEach(btn => { if (btn.innerText.toLowerCase() === 'ok') btn.click(); });
        await sleep(500);

        const link = document.createElement('a');
        link.href = `https://web.whatsapp.com/send?phone=${req.num}&text=${encodeURIComponent(req.msg)}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        let box = null;
        let erroEncontrado = false;

        for (let i = 0; i < 20; i++) {
            if (idAtual !== ID_DISPARO) return;
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

        if (idAtual !== ID_DISPARO) return;

        if (erroEncontrado) {
            chrome.runtime.sendMessage({ acao: "resultado", num: req.num, status: "INVÁLIDO" });
            return;
        }
        if (!box) {
            chrome.runtime.sendMessage({ acao: "resultado", num: req.num, status: "TIMEOUT" });
            return;
        }

        await sleep(1500);
        if (idAtual !== ID_DISPARO) return;

        let btnTexto = document.querySelector('button[aria-label="Enviar"]') || document.querySelector('span[data-icon="send"]');
        if (btnTexto) {
            if (btnTexto.tagName !== 'BUTTON' && btnTexto.parentElement) btnTexto = btnTexto.parentElement;
            btnTexto.click();
        } else {
            box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }

        chrome.runtime.sendMessage({ acao: "resultado", num: req.num, status: "OK" });
    }
}
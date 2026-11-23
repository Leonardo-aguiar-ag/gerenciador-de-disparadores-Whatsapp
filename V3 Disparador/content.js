chrome.runtime.onMessage.addListener((request) => {
    if (request.acao === "env") executarDisparo(request);
});

const esperar = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function executarDisparo(req) {
    try {
        const temTexto = req.msg && req.msg.trim().length > 0;

        // 1. Abre o contato sem dar F5
        const link = document.createElement('a');
        link.href = `https://web.whatsapp.com/send?phone=${req.num}` + (temTexto ? `&text=${encodeURIComponent(req.msg)}` : '');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // 2. Espera o chat abrir
        let caixaPrincipal = null;
        for (let i = 0; i < 30; i++) {
            await esperar(1000);
            
            const aviso = document.querySelector('div[role="dialog"]');
            if (aviso && aviso.innerText.toLowerCase().includes('inválido')) {
                aviso.querySelector('button')?.click();
                chrome.runtime.sendMessage({ acao: "resultadoEnvio", num: req.num, status: "Falhou (Inválido)" });
                return;
            }

            caixaPrincipal = document.querySelector('div[contenteditable="true"][data-tab="10"]') || 
                             document.querySelector('#main footer div[contenteditable="true"]');
            if (caixaPrincipal) break;
        }

        if (!caixaPrincipal) {
            chrome.runtime.sendMessage({ acao: "resultadoEnvio", num: req.num, status: "Falhou (Não abriu)" });
            return;
        }

        // 3. Envia o texto (se existir)
        if (temTexto) {
            caixaPrincipal.focus();
            document.execCommand('insertText', false, ' '); 
            document.execCommand('delete', false);
            caixaPrincipal.dispatchEvent(new InputEvent('input', { bubbles: true }));

            await esperar(800);
            
            const btnTxt = document.querySelector('span[data-icon="send"]')?.closest('button, div[role="button"]');
            if (btnTxt) {
                btnTxt.click();
            } else {
                caixaPrincipal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
            }
            await esperar(1500); // Aguarda o texto subir
        }

        // 4. Cola e Envia o Anexo (Imagem/Planilha)
        if (req.anexoB64) {
            
            // Recaptura a caixa caso a página tenha oscilado
            caixaPrincipal = document.querySelector('div[contenteditable="true"][data-tab="10"]') || document.querySelector('#main footer div[contenteditable="true"]');
            if(!caixaPrincipal) throw new Error("Caixa sumiu");

            // Prepara o arquivo
            const res = await fetch(req.anexoB64);
            const blob = await res.blob();
            const arquivo = new File([blob], req.anexoNome, { type: req.anexoType });
            const dt = new DataTransfer();
            dt.items.add(arquivo);

            // COLA O ARQUIVO
            caixaPrincipal.focus();
            caixaPrincipal.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));

            let enviouAnexo = false;

            // LOOP DE ATAQUE AO BOTÃO DE ENVIAR ANEXO (Tenta por 15 segundos)
            for (let j = 0; j < 15; j++) {
                await esperar(1000);
                
                // ATAQUE 1: Procura pelo nome "Enviar" escondido no código (Focado para PT-BR)
                const btnAriaLabel = document.querySelector('div[aria-label="Enviar"]');
                if (btnAriaLabel) {
                    btnAriaLabel.click();
                }

                // ATAQUE 2: Procura o ícone de enviar DENTRO da janela da foto
                const btnIcone = document.querySelector('div[role="dialog"] span[data-icon="send"]')?.closest('div[role="button"]');
                if (btnIcone) {
                    // Simula clique real com coordenadas
                    const cliqueReal = new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: 100, clientY: 100 });
                    btnIcone.dispatchEvent(cliqueReal);
                    btnIcone.click();
                }

                // ATAQUE 3: Aperta "Enter" violentamente na caixa de legenda da foto
                const caixaLegenda = document.querySelector('div[role="dialog"] div[contenteditable="true"]') || document.activeElement;
                if (caixaLegenda) {
                    caixaLegenda.focus();
                    caixaLegenda.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }));
                }

                // VERIFICA SE DEU CERTO: Se a janela da imagem sumir, o envio foi sucesso!
                await esperar(500);
                const telaAnexo = document.querySelector('div[role="dialog"] div[contenteditable="true"]');
                if (!telaAnexo) {
                    enviouAnexo = true;
                    break;
                }
            }

            if (enviouAnexo) {
                chrome.runtime.sendMessage({ acao: "resultadoEnvio", num: req.num, status: "OK" });
            } else {
                chrome.runtime.sendMessage({ acao: "resultadoEnvio", num: req.num, status: "Falhou (Botão Travado)" });
                // Força o fechamento da tela para não travar o próximo número
                document.querySelector('span[data-icon="x"]')?.closest('button, div[role="button"]')?.click();
            }

        } else {
            chrome.runtime.sendMessage({ acao: "resultadoEnvio", num: req.num, status: "OK" });
        }

    } catch (e) {
        chrome.runtime.sendMessage({ acao: "resultadoEnvio", num: req.num, status: "Falhou" });
    }
}
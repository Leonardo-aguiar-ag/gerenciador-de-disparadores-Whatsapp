chrome.runtime.onMessage.addListener((request) => {
    // Compatível com a ação da versão antiga e da nova
    if (request.acao === "trocarChatESenviar" || request.acao === "env") {
        const num = request.numero || request.num;
        const msg = request.mensagem || request.msg;

        // 1. NAVEGAÇÃO ANTI-RELOAD (Código recuperado da sua versão antiga)
        // Isso evita que a página dê F5 e quebre o script
        const chatLink = document.createElement('a');
        chatLink.href = `https://web.whatsapp.com/send?phone=${num}&text=${encodeURIComponent(msg)}`;
        document.body.appendChild(chatLink);
        chatLink.click();
        document.body.removeChild(chatLink);

        // 2. MONITORAMENTO E ENVIO
        let tentativas = 0;
        const monitorar = setInterval(() => {
            tentativas++;

            // Localiza o botão de enviar e a caixa de texto
            const btnSend = document.querySelector('span[data-icon="send"]')?.closest('button') || 
                            document.querySelector('button[aria-label="Enviar"]');
            
            const caixaTexto = document.querySelector('div[contenteditable="true"][data-tab="10"]') || 
                               document.querySelector('#main footer div[contenteditable="true"]');

            // Cenário A: Se o botão já estiver visível e ativo, clica direto (Comportamento antigo)
            if (btnSend && !btnSend.disabled) {
                btnSend.click();
                clearInterval(monitorar);
            } 
            // Cenário B: Se a mensagem colou, mas o botão está escondido/desativado (Comportamento novo do WhatsApp)
            else if (caixaTexto && caixaTexto.innerText.trim().length > 0) {
                caixaTexto.focus();
                
                // Simula digitação para forçar o WhatsApp a habilitar o botão
                document.execCommand('insertText', false, ' ');
                document.execCommand('delete', false);
                caixaTexto.dispatchEvent(new InputEvent('input', { bubbles: true }));
                
                // Não damos clearInterval aqui. No próximo segundo (próximo loop do setInterval), 
                // o botão já estará ativo e cairá no "Cenário A" para ser clicado.
            }

            // Para de tentar após 30 segundos para não travar a fila de disparos
            if (tentativas > 30) {
                clearInterval(monitorar);
            }
        }, 1000);
    }
});
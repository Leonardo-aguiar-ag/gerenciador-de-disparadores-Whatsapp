chrome.runtime.onMessage.addListener((request) => {
    if (request.acao === "trocarChatESenviar") {
        // Navegação interna sem recarregar a página (Anti-F5)
        const chatLink = document.createElement('a');
        chatLink.href = `https://web.whatsapp.com/send?phone=${request.numero}&text=${encodeURIComponent(request.mensagem)}`;
        document.body.appendChild(chatLink);
        chatLink.click();
        document.body.removeChild(chatLink);

        const verificarBotao = () => {
            const btn = document.querySelector('span[data-icon="send"]')?.closest('button') || 
                        document.querySelector('button[aria-label="Enviar"]');
            
            if (btn && !btn.disabled) {
                btn.click();
            } else {
                setTimeout(verificarBotao, 1000); // Tenta de novo se o chat ainda estiver carregando
            }
        };
        verificarBotao();
    }
});
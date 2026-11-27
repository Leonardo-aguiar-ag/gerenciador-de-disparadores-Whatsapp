# Gerenciador de Campanhas WhatsApp V11

A V11 é a evolução modular da V10 para campanhas persistentes. A V10 permanece disponível na pasta original; a V11 possui seu próprio `manifest.json`, service worker, motor de fila e backend opcional.

## Recursos implementados

- **Novo motor de fila:** estados individuais (`PENDING`, `PROCESSING`, `SENT`, `ERROR`, `DUPLICATE`, `OPT_OUT`, `INVALID`, `PAUSED`), checkpoint persistente, retomada e transições protegidas.
- **Painel de acompanhamento:** total, concluídos, enviados, erros, pendentes, duplicados, opt-out, inválidos, percentual e últimos contatos.
- **Validação pré-disparo:** telefones inválidos, duplicados, mensagens ausentes e variáveis sem valor.
- **Variáveis personalizadas:** `{{nome}}`, `{{telefone}}`, `{{campo_1}}` e campos adicionais com fallback `{{campo|valor padrão}}`.
- **Editor e prévia:** até cinco prévias usando os dados reais dos primeiros contatos.
- **Modo recuperação:** pausa e checkpoint quando a comunicação falha; reprocessamento de erros.
- **Compatibilidade e diagnóstico:** verificação de abas WhatsApp, storage local/session, tabs, alarms e downloads.
- **Logs técnicos:** eventos estruturados locais, consulta e exportação de diagnóstico.
- **Relatórios e métricas:** exportação JSON/CSV, duração, média por contato, estados e distribuição por variante.
- **Backend separado e opcional:** SQLite, campanhas, mensagens, métricas, fila, relatório por campanha e endpoint de diagnóstico.

## Instalação

Abra `chrome://extensions`, ative o modo de desenvolvedor e use **Carregar sem compactação**, selecionando diretamente a pasta `V11 Disparador`.

Abra o WhatsApp Web na mesma sessão antes de iniciar. Valide a campanha e confira a prévia antes do envio. Use somente contatos que autorizaram o recebimento.

## Backend opcional

```bash
cd "V11 Disparador/backend"
npm install
npm test
npm start
```

O backend local usa a porta 3000. Sem `WHATSAPP_TOKEN`, o processamento do backend permanece em modo de simulação. A extensão local do WhatsApp Web continua funcionando sem o backend.

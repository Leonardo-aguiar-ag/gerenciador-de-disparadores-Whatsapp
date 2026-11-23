# Status atual das implementações — V8 Disparador

## Implementado

- Extensão Chrome Manifest V3 com fila local, campanhas, CRM, opt-out, scripts, importação Excel/CSV e exportação local.
- Backend Node.js com campanhas, contatos, tags, funil, histórico, mensagens, tentativas, estados de entrega, webhooks Meta e números comerciais.
- Adapter estrutural para WhatsApp Cloud API com texto, mídia e templates.
- Painel web local com relatórios básicos e cartão de configuração Google Sheets.
- Configuração de Google Sheets via webhook/Apps Script, sem expor segredo na resposta da API.
- Teste smoke e validações sintáticas executados com sucesso.

## Ainda pendente

- OAuth oficial completo do Google Sheets, incluindo autorização, callback, refresh token e chamadas nativas à Sheets API.
- Integração remota completa do popup com o backend; a extensão ainda suporta o fluxo pelo WhatsApp Web.
- Exportação filtrada por campanha, script e variante no backend.
- Alertas completos para sessão expirada e excesso de erros; há alerta básico de desconexão.
- Separação física completa da extensão nos diretórios `shared/`, `background/`, `content/` e `popup/`.
- Envio independente do Chrome e WhatsApp Web até configurar e testar credenciais reais da Cloud API da Meta.
- Banco externo de produção; a persistência padrão ainda é JSON local.

## Configuração necessária para Cloud API

```env
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_API_VERSION=v20.0
```

Não foram incluídas credenciais reais no pacote.

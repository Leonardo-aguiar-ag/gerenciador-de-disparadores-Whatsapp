# V8 Disparador — backend

Backend Node.js minimalista para preparar a evolução da extensão, sem modificar os arquivos da extensão. Usa Express e persistência local em JSON (sem banco externo). O arquivo padrão é `data/store.json`; altere com `DATA_FILE`.

## Instalação e execução

Requer Node.js 18+ (o `fetch` nativo é usado pelo adapter). Copie `.env.example` para `.env`, se desejar configurar a Cloud API:

```bash
cd "/home/ubuntu/work/V8Disparador/backend"
cp .env.example .env
npm install
npm test
npm start
```

O processo só é iniciado quando `npm start` é executado; os testes usam um servidor temporário e o encerram.

## API

- `GET /health`
- `GET/POST /api/campaigns` e `GET /api/campaigns/:id`
- `GET/POST /api/contacts` e `PATCH /api/contacts/:id`
- `POST /api/opt-out` — grava opt-out de forma persistente por telefone e marca o contato.
- `GET/POST /api/messages` — criação idempotente por `eventId`.
- `POST /api/messages/:id/cancel`
- `POST /api/messages/process` — processa a fila `pending`; estados: `pending`, `processing`, `sent`, `failed`, `cancelled`.
- `GET /api/reports/summary`
- `POST /webhooks/whatsapp` — deduplica eventos por `eventId` (ou `id`/`X-Event-Id`) e atualiza status por `providerMessageId`.
- `GET/POST /api/integrations/google-sheets/status|config` — status e configuração do Client ID, planilha e aba; o Client Secret não é persistido nem retornado.
- `POST /api/integrations/google-sheets/sync` — envia contatos e mensagens para `GOOGLE_SHEETS_WEBHOOK_URL` ou endpoint informado.

Exemplo de mensagem:

```bash
curl -X POST http://localhost:3000/api/messages \
  -H 'content-type: application/json' \
  -d '{"to":"5511999999999","body":"Olá","eventId":"evt-123"}'
```

## WhatsApp Cloud API

`src/whatsappCloudApi.js` só faz chamada real quando **ambas** `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` existem. Sem elas, retorna um erro explícito de dry-run; nenhuma credencial é inventada. Configure também opcionalmente `WHATSAPP_API_VERSION`.

## Modelo

`schema.json` documenta campanhas, CRM, fila, números comerciais, eventos processados e configurações. A escrita do JSON é atômica no sentido operacional (uma gravação serial por mutação); para produção, substitua `storage.js` por SQLite/PostgreSQL e mova o processamento para um worker. OAuth interativo ainda requer implementar a rota de autorização/callback e armazenar tokens em um cofre de segredos; o cartão do painel já permite salvar a configuração não sensível e testar/sincronizar por webhook.

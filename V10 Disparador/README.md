# V10 — Gerenciador de Disparadores WhatsApp

A V10 é uma reestruturação modular da V9, mantendo as versões anteriores intactas. Ela separa o painel, o worker da extensão, o adaptador WhatsApp Web, utilitários compartilhados e um backend TypeScript com SQLite.

## O que foi implementado nesta base

- versão padronizada `10.0.0`;
- arquitetura modular (`popup`, `background`, `content`, `shared` e `backend`);
- dois modos explícitos: `simulation` e `cloud_api`;
- API integrada para CRM, campanhas, importação, fila e opt-out;
- SQLite com migração inicial, WAL e índices;
- fila com estados, retentativas, lock, idempotência por `event_id` e métricas;
- CRM com campos, tags, funil, consentimento e opt-out permanente;
- prévia/validação de CSV com duplicados e telefones inválidos;
- dashboard web, logs estruturados e métricas;
- backup JSON do banco lógico;
- verificação de novas releases pelo GitHub com notas e link de atualização;
- teste automatizado de smoke;
- modo de simulação que nunca chama a Cloud API.

## Instalar a extensão

Abra `chrome://extensions`, ative o modo do desenvolvedor e escolha **Carregar sem compactação**. Selecione a pasta `V10 Disparador`. Depois abra o WhatsApp Web e autentique a sessão.

O painel completo da V10 é separado do worker e mantém onboarding, tema, filtros, undo, perfis e configurações operacionais sem repetir o monólito da V9.

## Backend

Requer Node.js 22.13 ou superior por usar `node:sqlite` sem a flag experimental:

```bash
cd "V10 Disparador/backend"
cp .env.example .env
npm install
npm run build
npm test
npm start
```

Acesse `http://localhost:3000`. Para simulação, deixe `WHATSAPP_TOKEN` vazio. Para Cloud API, configure `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION` e o webhook oficial antes de usar produção.

Defina `V10_API_KEY` para proteger a API; o cliente da extensão deve usar a mesma chave nas configurações. Nunca faça commit do `.env`.

## Atualização

A V10 consulta as releases do repositório GitHub. A interface exibe a versão atual, a versão disponível, as notas e um link para a release. Em extensões carregadas sem compactação, o Chrome não permite autoatualização silenciosa: o usuário escolhe abrir a release, baixar a nova versão e recarregar a pasta. Publicação na Chrome Web Store pode fornecer atualização nativa em uma etapa posterior.

## Limitações conhecidas

- O adaptador WhatsApp Web possui detecção de compatibilidade e ainda depende do DOM da aplicação.
- A Cloud API exige credenciais oficiais e configuração de webhook.
- Autenticação de usuários, multi-tenant e OAuth completo do Google Sheets ainda são etapas posteriores.
- O banco SQLite é adequado para uma instalação local ou servidor pequeno; produção multioperador deve usar PostgreSQL/Redis e um worker dedicado.

## Navegação da V10

A interface segue a identidade visual da V9: tema escuro/azul, cartões compactos, avatar no cabeçalho, abas horizontais, indicadores por cor e barra de progresso. A ordem principal é: **Dashboard/CRM**, **Disparos**, **Scripts**, **Lote**, **Configurações** e **Ajuda**. A aba Campanhas foi removida da navegação; campanhas continuam sendo apenas um recurso interno da fila.

## Scripts com 20 variações

Na aba **Scripts**, existem 20 campos `Variação 1` a `Variação 20`. Preencha as mensagens, salve a versão e inicie o disparo pela aba **Disparos**. A fila embaralha as variações e usa cada uma no máximo uma vez por ciclo; quando todas as opções preenchidas forem usadas, um novo ciclo é embaralhado. Assim, com 20 variações e contatos suficientes, não há repetição até completar as 20 opções.

Os scripts podem ser salvos em versões, importados em JSON/TXT, exportados e limpos. No TXT, cada variação deve ficar em um bloco separado por uma linha contendo apenas `---`; quebras de linha dentro do bloco são preservadas. Por exemplo: `mensagem 1\n---\nmensagem 2`. A aba **Disparos** aceita CSV/TXT colado, faz prévia, valida telefones e remove duplicatas quando essa opção está ativa. **Configurações** concentra perfis, conta, delays de 15–30 segundos, pausa por lote, horário comercial, duplicatas, warm-up, atualização, backup e verificação de conexão.


## Pacote da release

Ao publicar alterações na pasta `V10 Disparador` na branch `main`, o workflow `.github/workflows/package-v10-release.yml` executa a suíte de testes, gera `V10-Disparador.zip`, substitui esse arquivo na release `v10.0.0-pacotes` e guarda uma cópia como artefato do workflow. Arquivos locais `.env`, dependências `node_modules` e build `dist` não entram no pacote.

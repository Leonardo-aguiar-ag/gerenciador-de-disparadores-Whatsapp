# Gerenciador de Disparadores WhatsApp

Coleção de versões de uma extensão Chrome para organizar e executar disparos pelo WhatsApp Web, evoluindo de um fluxo básico de fila até campanhas, CRM, importação de planilhas, lotes e um backend Node.js experimental.

> **Uso responsável:** utilize a ferramenta somente com contatos que autorizaram receber mensagens. Respeite a legislação aplicável, as políticas do WhatsApp e os limites da sua conta. A extensão automatiza a interface do WhatsApp Web; ela não elimina o risco de bloqueio ou de mensagens consideradas spam.

## Conteúdo do repositório

Cada pasta `Vn Disparador` contém uma versão independente da extensão Chrome:

- `background.js`: service worker da extensão;
- `content.js`: código que interage com a aba do WhatsApp Web;
- `popup.html` e `popup.js`: painel de controle;
- `manifest.json`: configuração e permissões da extensão;
- `xlsx.full.min.js`: biblioteca local para leitura/exportação de planilhas em algumas versões;
- `foto perfil.jpeg`: imagem usada pela interface em algumas versões.

A pasta `V9  Disparado/backend` contém o backend Node.js opcional associado à versão mais completa.

## Histórico das versões

### V1 — fluxo básico de disparo

Pasta: `V1 Disparador`

É a versão inicial e mais simples. Possui painel com as áreas de disparo, scripts e configuração, além dos controles **Iniciar**, **Pausar** e **Parar**. Trabalha com fila local, mensagens e intervalo mínimo/máximo entre envios.

Use esta versão quando precisar testar o fluxo básico com o mínimo de recursos. Ela não possui CRM, importação de planilhas ou campanhas avançadas.

### V2 — relatório e exportação

Pasta: `V2 Disparador`

Adiciona uma área de relatório, registro dos envios e exportação do relatório para Excel. Também inclui a biblioteca `xlsx.full.min.js` e o arquivo de exemplo `Meus_Grupos.csv`.

Em relação à V1, é indicada quando você precisa acompanhar o histórico do disparo e salvar os resultados para análise posterior.

### V3 — importação de planilhas e lotes

Pasta: `V3 Disparador`

Inclui o fluxo de importação de planilhas, leitura de contatos e opções de lote, como pausar a cada determinada quantidade de contatos e aguardar um intervalo de descanso. Também mantém a exportação do relatório.

Use quando a lista de contatos estiver em Excel/CSV ou quando quiser dividir o envio em pequenos lotes.

### V4 — CRM, campanhas e mensagens personalizadas

Pasta: `V4 Disparador`

Marca a evolução para uma interface de gestão mais completa, com:

- CRM de contatos;
- campanhas salvas;
- scripts/mensagens editáveis;
- variáveis como `[NOME]`;
- spintax, por exemplo `{Oi|Olá}`;
- importação de contatos no formato `número;nome`;
- controle de delay e pausa por lote;
- verificação de conexão com o WhatsApp Web.

É uma boa opção para testar campanhas personalizadas sem os recursos mais avançados das versões posteriores.

### V5 — importar e exportar scripts

Pasta: `V5 Disparador`

Mantém o CRM, as campanhas e a personalização da V4 e acrescenta ações para **importar** e **exportar scripts**. Isso facilita reaproveitar modelos de mensagens entre instalações ou versões.

### V6 — refinamento do disparo local

Pasta: `V6 Disparador`

Aprimora a execução local da fila, separando o início do disparo e o envio local. Mantém CRM, campanhas, scripts, spintax, importação/exportação e controles de delay da V5.

Use como uma versão intermediária mais refinada antes dos recursos de retomada, campanhas A/B e automações da V7.

### V7 — campanhas avançadas e retomada

Pasta: `V7 Disparador`

É a primeira versão com uma camada mais completa de operação. Inclui:

- retomada do último disparo;
- pré-visualização de mensagens;
- campanhas normais, A/B Testing e Drip/Sequência;
- variantes de mensagem;
- passos de sequência;
- agendamento;
- CRM e perfis;
- importação Excel/CSV;
- horário comercial;
- controle de duplicatas;
- warm-up/aquecimento;
- alarmes, notificações e downloads;
- backup local e undo em algumas operações;
- observação de respostas e eventos da aba do WhatsApp Web.

É a versão indicada para testar campanhas com mais controle de fluxo.

### V8 — envio sequencial em lotes

Pasta: `V8 Disparador`

Estende a V7 com a área **Lote**, permitindo organizar várias listas sequenciais e executar um lote de listas. Também apresenta estado das listas, retomada/parada do lote e gráficos/indicadores no painel.

Use quando o trabalho precisar de várias listas ou etapas de envio executadas em sequência.

### V9 — extensão completa + backend experimental

Pasta: `V9  Disparado`

A extensão mantém os recursos da V8 e adiciona melhorias no CRM e na proteção de contatos, incluindo normalização de números, atualização de contatos e opt-out. A pasta também inclui um backend Node.js em `backend/` com:

- campanhas, contatos, tags e funil;
- fila de mensagens e tentativas;
- estados `pending`, `processing`, `sent`, `failed` e `cancelled`;
- idempotência por `eventId`;
- webhooks do WhatsApp;
- adapter estrutural para WhatsApp Cloud API;
- painel web local básico;
- configuração preparatória para Google Sheets via webhook;
- persistência local em arquivo JSON;
- teste smoke automatizado.

O backend ainda é experimental. A extensão continua dependendo de uma aba autenticada do WhatsApp Web para o fluxo local. O envio independente do Chrome exige uma conta WhatsApp Business/Cloud API configurada, token, número comercial, webhook e templates aprovados quando aplicável.

## Como instalar uma versão da extensão

A instalação é feita como extensão não empacotada no Chrome:

1. Clone ou baixe este repositório.
2. Abra o Chrome e acesse `chrome://extensions`.
3. Ative o **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione diretamente uma das pastas de versão, por exemplo `V7 Disparador`.
6. Abra `https://web.whatsapp.com/` em outra aba e faça login.
7. Fixe a extensão na barra do Chrome, clique no ícone e configure a lista, a mensagem e os delays.
8. Teste primeiro com poucos contatos autorizados.

Para trocar de versão, remova ou desative a extensão atual e carregue outra pasta. Evite carregar duas versões simultaneamente no mesmo perfil do Chrome, pois elas podem disputar a mesma aba e o mesmo armazenamento local.

## Formato das listas e mensagens

Nas versões que aceitam lista de contatos, o formato básico é:

```text
5511999999999;Maria
5511888888888;João
```

O número deve estar em formato internacional, com código do país e DDD, sem espaços ou caracteres extras. Dependendo da versão, também podem ser aceitas colunas adicionais, como:

```text
85999999999;João;Fortaleza;35
85888888888;Maria;Recife;42
```

A V9 documenta as variáveis `[NOME]`, `[CIDADE]`, `[IDADE]` e campos adicionais como `[CAMPO_1]`. Algumas versões também aceitam spintax:

```text
{Olá|Oi} [NOME], tudo bem?
```

Revise a pré-visualização e faça um teste antes de iniciar uma campanha maior.

## Como executar o backend da V9

Requer Node.js 18 ou superior:

```bash
cd "V9  Disparado/backend"
cp .env.example .env
npm install
npm test
npm start
```

Por padrão, o servidor usa a porta `3000` e grava os dados em `data/store.json`. As principais rotas incluem:

- `GET /health`;
- `GET/POST /api/campaigns`;
- `GET/POST /api/contacts`;
- `POST /api/opt-out`;
- `GET/POST /api/messages`;
- `POST /api/messages/process`;
- `GET /api/reports/summary`;
- `POST /webhooks/whatsapp`;
- rotas de status/configuração do Google Sheets.

Para configurar a WhatsApp Cloud API, preencha no `.env` apenas as variáveis necessárias:

```env
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_API_VERSION=v20.0
WHATSAPP_VERIFY_TOKEN=
```

Não coloque tokens reais em commits ou no código-fonte. O arquivo `.env.example` contém apenas campos vazios de exemplo.

## Limitações conhecidas

- As extensões interagem com a interface do WhatsApp Web, que pode mudar sem aviso.
- A aba do WhatsApp Web precisa estar autenticada e disponível para o fluxo local.
- O backend da V9 não substitui automaticamente a integração oficial da Meta.
- A integração completa com OAuth do Google Sheets ainda não está implementada.
- A persistência padrão do backend é um arquivo JSON local; para produção, considere banco de dados e autenticação.
- Antes de aumentar volume, valide consentimento, limites, horários e política de mensagens da sua operação.

## Documentação adicional da V9

- [`IMPLEMENTACAO.md`](V9%2020%20%20Disparado/IMPLEMENTACAO.md): recursos implementados e próximos passos;
- [`STATUS_IMPLEMENTACOES.md`](V9%2020%20%20Disparado/STATUS_IMPLEMENTACOES.md): status atual das integrações;
- [`LEIA-ME.txt`](V9%2020%20%20Disparado/LEIA-ME.txt): instruções resumidas;
- [`backend/README.md`](V9%2020%20%20Disparado/backend/README.md): API e execução do backend.

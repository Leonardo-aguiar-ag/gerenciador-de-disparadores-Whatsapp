# Gerenciador de Disparadores WhatsApp

Coleção de versões de uma extensão Chrome para organizar filas e executar disparos pelo WhatsApp Web. A versão recomendada e mantida é a **V10 Disparador**; as versões V1–V9 ficam no repositório como histórico e referência.

> **Uso responsável:** envie mensagens somente para contatos que autorizaram o recebimento. Respeite as políticas do WhatsApp, a legislação aplicável, os limites da conta e os horários de contato. A automação da interface não elimina o risco de bloqueio ou de mensagens consideradas spam.

## Estrutura do repositório

As versões estão organizadas diretamente na raiz, com nomes padronizados:

| Versão | Pasta | Status |
|---|---|---|
| V1 | [`V1 Disparador`](V1%20Disparador/) | Histórico: fluxo básico |
| V2 | [`V2 Disparador`](V2%20Disparador/) | Histórico: relatório e exportação |
| V3 | [`V3 Disparador`](V3%20Disparador/) | Histórico: planilhas e lotes |
| V4 | [`V4 Disparador`](V4%20Disparador/) | Histórico: CRM e campanhas |
| V5 | [`V5 Disparador`](V5%20Disparador/) | Histórico: importar/exportar scripts |
| V6 | [`V6 Disparador`](V6%20Disparador/) | Histórico: refinamento do disparo local |
| V7 | [`V7 Disparador`](V7%20Disparador/) | Histórico: campanhas avançadas e retomada |
| V8 | [`V8 Disparador`](V8%20Disparador/) | Histórico: filas em lotes |
| V9 | [`V9 Disparador`](V9%20Disparador/) | Histórico: extensão completa e backend experimental |
| V10 | [`V10 Disparador`](V10%20Disparador/) | **Atual: modular, persistente e testada** |

Cada pasta de extensão contém seu próprio `manifest.json`. A V10 usa a estrutura modular `popup/`, `background/`, `content/`, `shared/`, `assets/` e `backend/`.

## Instalar a versão recomendada (V10)

1. Baixe ou clone este repositório.
2. Abra `chrome://extensions` no Chrome.
3. Ative o **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione diretamente a pasta [`V10 Disparador`](V10%20Disparador/), onde o `manifest.json` está na raiz da pasta selecionada.
6. Abra `https://web.whatsapp.com/` em outra aba e autentique a sessão.
7. Fixe a extensão, abra o painel e use **Verificar conexão** antes de iniciar.
8. Teste com poucos contatos autorizados antes de qualquer envio maior.

Depois de alterar os arquivos, clique em **Recarregar** na página de extensões e reabra o popup. Não carregue várias versões simultaneamente no mesmo perfil do Chrome, pois elas podem disputar a mesma aba e o mesmo armazenamento.

A V10 mantém o disparo no service worker/content script quando o popup é fechado, persiste a fila em `chrome.storage.local` e `chrome.storage.session`, e permite retomar uma fila salva. A aba autenticada do WhatsApp Web precisa permanecer aberta.

## Contatos e scripts

O formato mais simples de contato é:

```text
5511999999999;Maria
5511888888888;João
```

Use o número internacional com código do país e DDD. Na V10, as mensagens podem ser salvas em até 20 variações; arquivos TXT usam blocos separados por uma linha contendo apenas `---`.

## Testar o backend opcional da V10

A V10 requer Node.js 22.5 ou superior por utilizar `node:sqlite`:

```bash
cd "V10 Disparador/backend"
cp .env.example .env
npm install
npm run build
npm test
npm start
```

O backend local usa a porta `3000` por padrão. Para o fluxo local da extensão, deixe `WHATSAPP_TOKEN` vazio. Para a Cloud API oficial, configure as credenciais e o webhook exigidos pela Meta. Nunca faça commit de um arquivo `.env` ou de tokens reais.

## Validação rápida

```bash
cd "V10 Disparador/backend"
npm test
```

Os testes cobrem o manifesto, a injeção única dos scripts, o parser de contatos/scripts, o início e os controles da fila, a persistência, o retry de mensagens e o backup.

## Downloads das versões

Os pacotes ZIP instaláveis de todas as versões estão disponíveis na [release Pacotes das versões V1–V10](https://github.com/Leonardo-aguiar-ag/gerenciador-de-disparadores-Whatsapp/releases/tag/v10.0.0-pacotes). A release contém um arquivo separado para cada pasta, de `V1-Disparador.zip` até `V10-Disparador.zip`.

## Limitações

- O WhatsApp Web pode alterar o DOM sem aviso; a V10 centraliza a detecção de sessão, mas ainda depende da interface do site.
- A aba do WhatsApp Web deve estar autenticada e aberta.
- O backend experimental não substitui automaticamente a integração oficial da Meta.
- Os pacotes ZIP de instalação não são versionados no GitHub; use a pasta V10 diretamente com **Carregar sem compactação**.

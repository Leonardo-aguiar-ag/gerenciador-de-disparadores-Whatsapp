# Implementação V8 Disparador

## Implementado nesta versão

- Fila persistente com retomada pelo índice do último contato.
- Identificador de campanha em filas e logs.
- Idempotência de eventos para evitar logs duplicados.
- Cadastro persistente de contatos em `chrome.storage.local`.
- Histórico básico de última mensagem, última resposta, status e campanha.
- Opt-out permanente, separado da limpeza do CRM.
- Opt-out manual pelo CRM.
- Opt-out automático quando a resposta contém termos como `sair`, `parar`, `cancelar` ou `não quero`.
- Contatos em opt-out são pulados antes do envio.
- Deduplicação de números dentro da lista importada.
- Campos personalizados por linha: `numero;nome;cidade;idade`.
- Variáveis de mensagem `[NOME]`, `[CIDADE]`, `[IDADE]` e campos adicionais como `[CAMPO_1]`.
- Importação de colunas adicionais de Excel/CSV.
- Validação contra números inválidos e números longos demais.
- Proteção contra scripts vazios.
- Limite de iterações no spintax.
- Normalização de delays e suporte a horário comercial atravessando a meia-noite.
- Relacionamento dos logs com campanhas normais, A/B, drip e lote.
- Detecção de resposta usando número identificado no DOM quando disponível, evitando registrar o nome como número.

## Ainda depende de uma etapa específica

O envio totalmente independente do WhatsApp Web não pode ser obtido somente com o `background.js` da extensão, porque o service worker do Chrome não acessa o DOM do WhatsApp. A extensão atual pode continuar executando com o popup fechado, mas precisa de uma aba autenticada do WhatsApp Web.

Para operar sem Chrome e sem abrir conversas, é necessário um backend com a WhatsApp Business Platform / Cloud API. Essa etapa exige configuração de uma conta Business, número comercial, token, webhook e definição de templates aprovados.

## Próxima etapa recomendada

1. Separar o código em módulos `shared`, `background`, `content` e `popup`.
2. Criar painel de campanhas com métricas por campanha, script e variante.
3. Criar fila com tentativas, estados de entrega e alertas de conexão.
4. Criar servidor para Cloud API e webhooks.
5. Migrar o CRM e o histórico para banco de dados quando houver múltiplos operadores ou alto volume.
6. Adicionar testes automatizados de importação, normalização, filas, agendamento, opt-out, A/B, drip e lotes.

## Formatos de campos personalizados

Exemplo de lista:

```text
85999999999;João;Fortaleza;35
85888888888;Maria;Recife;42
```

Mensagem:

```text
Olá [NOME], vimos que você está em [CIDADE] e tem [IDADE] anos.
```

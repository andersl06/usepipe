# Inventário de rotas e redirecionamentos (insumo da fase 01.1)

Levantado em 2026-09-27 no código de `limpeza`, com a fase 1 aplicada.

**Método, porque a primeira versão deste documento foi por amostragem e deixou
passar a ficha do contato:** as rotas da Blip vêm agora das **declarações de
rota dos próprios bundles** (`url:` nos arquivos de `referencias-blip`), 172
delas, não de busca por palavra. As nossas saem do roteador de cada front, 87.
Os dois conjuntos crus ficam ao lado deste arquivo, em `blip-routes-raw.txt` e
`pipe-routes-raw.txt`, para quem quiser conferir a conta. A API entra com os
207 endpoints que o `route-match` extrai.

## 1. A forma do endereço

```
<cliente>.blip.ai/application/detail/<shortName>/<módulo>
<cliente>.desk.blip.ai/<página>
```

O terceiro segmento é declarado na Blip como **`:shortName`**
(`/application/detail/:shortName`). Não é id técnico nem tipo de bot: é o nome
curto. A nossa tabela de fluxos já tem a coluna `short_name`, e o comentário
dela diz exatamente isso. Também não existe segmento de tipo: o mesmo caminho
serve chatbot e roteador.

## 2. Equivalência, nome a nome

Dos 172 nomes da Blip, 25 já se chamam igual no Pipe: `channels`, `growth`,
`contents`, `integrations`, `webhook`, `team`, `keys`, `monitoring`, `history`,
`reports`, `analytics`, `dashboard`, `overview`, `journey`, `dataDictionary`,
`clicktracker`, `activeMessages`, `log`, `attendance`, `basic`, `welcome`,
`persistentMenu`, `profile`, `login` e `dataExtractor`.

Outros 26 são a mesma tela com nome diferente. Cada linha é uma decisão de
manter o nosso nome ou adotar o da origem:

| Pipe | Blip | tela |
|---|---|---|
| `contacts`, `contacts/:contactId` | `users`, `users/:id?ticketId` | contatos e ficha |
| `agents/queues` | `queue-management` | filas |
| `agents/breaks` | `personalizedbreaks` | pausas |
| `agents/management` | `team` (atendentes) | atendentes |
| `rules/sla` | `sla-policy` | política de SLA |
| `rules/attendance` | `rules` | regras de atendimento |
| `rules/hours` | `attendance-hours` | horários |
| `communication/canned-responses` | `replies` | respostas prontas |
| `communication/templates` | `message-template` | modelos de mensagem |
| `reports/attendance` | `report` | relatório de atendimento |
| `reports/effort` | `effort` | relatório de esforço |
| `reports/satisfaction` | `survey-dashboard` | satisfação |
| `quality-review` | `quality-assurance` | monitoria |
| `settings/basic` | `configurations/basic` | configurações básicas |
| `api/keys` | `configurations/apikey`, `keys` | chaves de API |
| `tracked-links` | `clicktracker` | links rastreados |
| `ads` | `adsbuying` | anúncios |
| `payments` | `paymentsReport` | pagamentos |
| `report-manager` | `data-extractor` | gerenciador de relatórios |
| `builder` | `templates/builder` | construtor |
| `services` | `templates/pipeline` | serviços do roteador |
| `portal` | `application` | lista de bots |
| `contract`, `contract/members`, `contract/certificates` | `application/tenant/*` | contrato |
| `my-account` | `account`, `profile` | minha conta |
| `updates` | `application/product-updates` | novidades |
| `create/flow`, `create/router` | `application/create/name`, `application/create/router` | criar bot |

## 3. Só na Blip

**Telas de produto que o Pipe não tem:** `calls-dashboard` (voz),
`sales-dashboard`, `blip-copilot` e `ia-copilots/*` (IA no atendimento),
`general-settings`, `whatsapp-embedded` (já diferido, bloqueado por CNPJ),
`application/create/marketplace` e `marketplace/create` (loja de modelos),
`brain`, `knowledge-base`, `unknown-questions`, `audiences`, `campaigns`,
`funnel`, `smart-sales`, `blip-insights`, `blip-conversations-insights`,
`botanalytics`, `performance`, `builder-monitoring`, `builder-observability`,
`unit-test`, `icebreaker`, `scheduler`, `groups`, `application/historic`,
`application/move`, `application/intelligence-lite`, `metadata-management`.

**Integrações de terceiros como rota própria:** `salesforce`, `hubspot`,
`rdstation`, `mailgun`, `goodData`, `dashbot`, `telegram`, `messenger`,
`instagram`, `whatsapp`, `whatsapp-obo`, `applebusinesschat`, `businesschat`,
`googlercs`, `blipchat2.0`.

**Convite e criação de conta muito mais ramificados:**
`application/tenant/create`, `create-success`, `existing`,
`invitation-request-sent`, `inviteMember`, `not-found`, `permission-groups`,
`personal/creationError`, `activate/:email?token`, `register`, `terms`,
`initial-setup`.

Nada disso é escopo da fase 01.1, que trata de endereçamento. É material de
fase de produto, e vale virar ideia diferida em vez de ficar só na captura.

## 4. Só no Pipe

`deployment` (implantação, que a Blip não expõe como rota),
`switch-account/no-access`, `preferences/*` na Gestão, `quality-review/:id` e os
resíduos da seção 7. No Desk, `bulk-ticket` e `preferences` existem na origem
como página do host `desk`, não como rota do portal.

## 5. A ficha do contato

```
/application/detail/<bot>/users                             lista
/application/detail/<bot>/users/<contactId>?ticketId=<id>    ficha com conversa
```

O `<contactId>` é a identidade do contato no gateway, no formato
`<número>@wa.gw.msging.net`; o ticket tem identidade própria,
`<uuid>@tunnel.msging.net`, e aparece em `attendance/history/<ticketId>`. No
código da origem o estado é `auth.application.detail.users.user`, com a rota
`/users/:id?ticketId`.

No Pipe a ficha já lê `ticketId` na query
(`pages/flow/contacts/detalhe/detalhe.tsx:27`), igual à origem. No Desk, contato
e ticket ficam em estado, que é a paridade decidida na D-29 da fase 1. A
diferença é a forma do identificador: id interno aqui, identidade de canal lá.

Essa rota já quebrou uma vez: o parâmetro ficou em português depois do rename e
a ficha nunca abria, corrigido no plano 01-24.

## 6. Redirecionamentos

**No navegador:** `/` para `/portal`; `growth` para `active-messages`;
`settings` para `basic`; `attendance` para `monitoring`.

**No servidor**, 302: fim do login para a base ou para o destino do desafio;
falha de provedor para a tela de login com `?error=`; início de OAuth e SSO; e
`/l/:codigo`, o link rastreado público.

**Na borda (Traefik):** `/v1`, `/webhooks` e `/l/` para a API, `/desk` para o
Desk com remoção de prefixo, o resto para a Gestão.

## 7. Resíduos da fase 1

1. **Seis endpoints ficaram em português sem linha no mapa aprovado**, logo
   nunca foram propostos: `/v1/convites`, `/v1/convites/:token/aceitar`,
   `/v1/convites/:token/reenviar`, `/v1/etiquetas`, `/v1/eu` e
   `/v1/auth/sair`. A tela já é `/invite/:token` em inglês e a API responde em
   `/v1/convites`.
2. **Uma tradução ruim passou:** `/v1/gestao/fluxos/:id/equipe/eu` virou
   `/v1/management/flows/:id/team/i`; em inglês é `/me`.
3. **Quatro resíduos nos fronts:** `/bem-vindo`, o módulo `alerta`, o parâmetro
   `:passo` em dois assistentes, e `/activeMessage/send` em camelCase.

Endpoint é contrato, então cada um precisa de linha no mapa antes de mudar, na
varredura final da fase 1 (plano 01-31).

## 8. Decisões que a fase 01.1 precisa antes de executar

1. O caminho do bot passa a ser o `short_name`, como na origem? Se sim, ele
   vira único por cliente, com migração dos valores atuais e regra de colisão.
2. O tipo do bot sai da URL? Hoje temos `/flow/<id>` e `/router/<id>`; a Blip
   tem um caminho só e resolve pelo nome.
3. As URLs de hoje redirecionam ou morrem? A D-10 da própria fase já escolheu
   corte seco para os hosts antigos, e o mesmo critério serve aqui.
4. Adotamos os nomes da origem na tabela da seção 2, ou mantemos os nossos? São
   26 pares. Manter os nossos é defensável, porque vários são mais claros
   (`contacts` em vez de `users`, `agents/queues` em vez de `queue-management`),
   mas a decisão precisa ser explícita: hoje é mistura, 25 nomes iguais aos da
   origem e 26 diferentes, sem critério registrado.

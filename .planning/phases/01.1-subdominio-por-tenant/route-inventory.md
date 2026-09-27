# Inventário de rotas e redirecionamentos (insumo da fase 01.1)

Levantado em 2026-09-27, no código de `limpeza` (c30903b), já com a fase 1
aplicada. Três fontes: as rotas declaradas nos fronts, os 207 endpoints que o
`route-match` extrai da API, e as capturas da Blip em `referencias-blip/`.

## 1. O padrão da Blip, medido nas capturas

O caminho tem o **identificador do bot**, nunca um id técnico:

```
<tenant>.blip.ai/application/detail/<identificador-do-bot>/<módulo>
```

Identificadores vistos nas capturas: `pipeprincipal`, `auvpsegurosrouter`,
`auvpescolaprd`. Módulos, por frequência de captura: `home`,
`templates/builder`, `growth`, `configurations`, `channels`, `analytics`,
`integrations`, `users`, `team`, `contents`, `growth/messages/log`,
`attendance/desk/`, `template/master`.

Ou seja, a Blip não tem um segmento `flow` nem `router` na URL: o tipo do bot
não aparece, só o nome dele. Para o atendimento, o caminho é
`/application/detail/<bot>/attendance/desk/`.

## 2. O que o Pipe tem hoje

### Gestão (`apps/management-vite`)

| rota | observação |
|---|---|
| `/login`, `/invite/:token` | públicas |
| `/` | redireciona para `/portal` |
| `/portal` | lista de bots, equivalente à home da conta |
| `/contract`, `/contract/members`, `/contract/certificates` | contrato |
| `/my-account`, `/updates`, `/switch-account/no-access` | conta |
| `/bem-vindo` | **resíduo em português** |
| `/create/flow/:passo?`, `/create/router/:passo?` | **`:passo` em português** |
| `/deployment` | implantação |
| `/flow/:id/<módulo>` | **divergente da Blip**: tipo na URL e id técnico |
| `/router/:id/<módulo>` | idem |

Módulos sob o bot (54 rotas): `channels` e variantes por canal, `services`,
`attendance`, `monitoring`, `history`, `quality-review`, `reports/*`,
`agents/*`, `communication/*`, `rules/*`, `preferences/*`, `contacts`,
`integrations`, `growth/*`, `settings/*`, `api/keys`, `team`, `contents`,
`analytics/*`, `reports/*`. Um deles ainda é `alerta`, em português.

### Desk (`apps/desk-vite`)

`/login`, `/invite/:token`, `/` (atendimento na raiz, decisão D-42 da fase 1),
`/contacts`, `/analytics`, `/activeMessage/send` (**camelCase**, fora do padrão
kebab das outras), `/bulk-ticket`, `/preferences`.

### CRM (`apps/crm`)

`/login`, `/invite/[token]`, `/`, `/leads`, `/opportunities`, `/accounts`,
`/contacts` e `/settings/*`, cada um com sua página de detalhe `[id]`.

### API (207 endpoints)

| prefixo | endpoints |
|---|---:|
| `/v1/management` | 112 |
| `/v1/channels` | 18 |
| `/v1/contacts` | 11 |
| `/v1/conversations` | 11 |
| `/v1/desk` | 9 |
| `/v1/auth` | 8 |
| `/v1/convites` | 4 |
| `/webhooks/whatsapp` | 4 |
| outros | 30 |

## 3. Redirecionamentos existentes

**No navegador:** `/` para `/portal` na Gestão; e três redirecionamentos de
índice dentro de módulos (`growth` para `active-messages`, `settings` para
`basic`, `attendance` para `monitoring`).

**No servidor**, todos 302: fim do login bem-sucedido para a base ou para o
destino guardado no desafio; falha de provedor para a tela de login com
`?error=`; início do OAuth e do SSO para o provedor; e `/l/:codigo`, o
redirecionamento público de link rastreado.

**Na borda (Traefik, VPS):** `/v1` e `/webhooks` e `/l/` para a API, `/desk`
para o Desk com remoção do prefixo, e todo o resto para a Gestão.

## 4. Lacunas encontradas

1. **Quatro endpoints ficaram em português e não têm linha no mapa aprovado**,
   então não foram esquecidos na aplicação: nunca foram propostos.
   `/v1/convites`, `/v1/convites/:token/aceitar`, `/v1/convites/:token/reenviar`,
   `/v1/etiquetas`, `/v1/eu` e `/v1/auth/sair`. O incômodo é que o front já
   chama a tela de `/invite/:token`, em inglês, enquanto a API responde em
   `/v1/convites`.
2. **Uma tradução ruim foi aplicada:** `/v1/gestao/fluxos/:id/equipe/eu` virou
   `/v1/management/flows/:id/team/i`. Em inglês o certo é `/me`.
3. **Resíduos nos fronts:** `/bem-vindo`, o módulo `alerta`, o parâmetro
   `:passo` em dois assistentes, e `/activeMessage/send` em camelCase.
4. **A divergência de produto que motivou este inventário:** a Blip usa
   `/application/detail/<nome-do-bot>/<módulo>` e o Pipe usa
   `/flow/<id>/<módulo>` ou `/router/<id>/<módulo>`. A coluna para isso já
   existe no banco: `flow.short_name` (`packages/db/src/schema/automation.ts:48`),
   e o comentário dela diz literalmente que o valor aparece em
   `/application/detail/{shortName}`. Não há índice único nessa coluna; a
   unicidade é conferida hoje apenas no nome.

## 5. O que isso significa para a fase 01.1

A fase foi planejada com o host por cliente e o prefixo `/application`
(decisão D-02), mas **não** com o trecho `detail/<nome-do-bot>`. Fechar a
paridade com a Blip pede, além do que já está planejado:

- decidir se o caminho do bot usa `short_name` e, nesse caso, torná-lo único
  por cliente, com migração para preencher os valores existentes e uma regra
  de colisão;
- redirecionar `/flow/<id>` e `/router/<id>` para a forma nova, ou aceitar o
  corte seco, coerente com a decisão D-10 da própria fase;
- decidir se o tipo do bot sai mesmo da URL, como na Blip, o que significa
  resolver fluxo ou roteador pelo nome, não pelo caminho.

Os quatro endpoints em português e a tradução `team/i` são correções pequenas e
independentes: cabem na varredura final da fase 1 (plano 01-31), desde que
ganhem linha no mapa aprovado, porque mudar endpoint é mudar contrato.

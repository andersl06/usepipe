# Análise do contato — Dashboard, Mensagens ativas e Dicionário de dados

Medido na captura `supernova.blip.ai (6).zip` (tela `/application/detail/supernovaroteador/analytics/dashboard`),
extraída em `scratchpad/cap6s/`. A régua é o código; as conexões WebSocket da captura vieram vazias, então
nenhum número real da Blip foi visto — o formato dos dados sai do código.

## 1. Quem desenha

As três abas são o MESMO micro-frontend, o `portal-fragment-analytics` (`cap6s/portalmfe/analytics-main.js`,
4 MB, React 18.3.1 + styled-components + chart.js/react-chartjs-2 + chartjs-plugin-datalabels). O portal
(AngularJS) monta o web component pelo template 15322 do `portal.js`:

```html
<analytics-mfe
  ng-if="$ctrl.readyToRender"
  blipDomainUrl
  portalDomain
  blipWebsocketHostName
  blipWebsocketHostNameTenant
  settings
  language
  user
  authToken
  botIdentity
  class="w-100"
  featureFlags
  isAutomaticTrackingPublished
  isMasterApplication
  authEmail
  page
  params
></analytics-mfe>
```

- `customElements.define("analytics-mfe", pC)`; `pC.mount()` converte os atributos (`"true"`/`"false"`, número,
  JSON) e renderiza `uC`, que empilha os provedores (flags, `px` = conexão com os serviços, idioma, rotas) e
  `sC({ page, params })`:
  `dashboard` → `iN` · `activeMessages` → `Lx` · `dataDictionary` → `iC({ params })`.
- O script vem de `source + "/main.js?nocache=" + releaseVersion` (classe `c` do `portal.js` ~219270), com
  `settings.json` ao lado; o fallback é `microFrontendSource + mainScriptPath/settingsPath`. No
  `settings.json` do portal: `analytics.microFrontendSource =
https://portal-tenantcrm.azureedge.net/beagle/portal-fragment-analytics/portal-fragment-analytics-23.94.271`,
  `mainScriptPath = /main.js`, `settingsPath = /settings.json`. O `settings.json`
  PRÓPRIO do MFE não veio no zip, e o `main.js` não carrega chunk extra (tudo está no arquivo único).
- Estilo: `createGlobalStyle` zera margem/recheio/borda de tudo (`* { box-sizing: border-box }`); cada
  componente injeta um `<style>` com as cores em `var(--color-*, fallback)` e o resto é styled-components.
  O conteúdo roda dentro de `react-shadow` (`Ex.Ay.div`), por isso as regras são "globais" dentro da sombra.
- Dados: todo número é um comando LIME `GET` para `postmaster@analytics.msging.net` (`fx.sendCommand`), com
  `?startDate=AAAA-MM-DDT00:00:00.000Z&endDate=…` (`yx`/`ut`); com `messaging-hub-command-with-delegation`,
  vai com `pp` = nó local e `from` = identidade do bot.

## 2. Flags (LaunchDarkly, contexto multi com o roteador)

| Flag                                                                                                     | Valor | Efeito nestas abas                                   |
| -------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------- |
| `is-displaying-dashboard-fixed-period-chips`                                                             | true  | 2ª fileira de chips (semana/mês) nos dois filtros    |
| `is-displaying-recurrence-section`                                                                       | true  | seção Recorrência                                    |
| `is-displaying-conversational-flow-section`                                                              | true  | seção Fluxo conversacional                           |
| `is-displaying-block-listing-section`                                                                    | true  | listas de blocos (e "Lista de blocos" no Dicionário) |
| `is-displaying-dashboard-analytics-channel-section`                                                      | true  | seção Canais                                         |
| `is-displaying-channel-section-download-button`                                                          | false | sem CSV em Canais                                    |
| `is-displaying-dashboard-csv-download-buttons`                                                           | true  | CSV em Contatos, Recorrência, Mensagens              |
| `is-displaying-dashboard-csv-download-conversional-flow-button`                                          | false | sem CSV no Fluxo                                     |
| `is-displaying-analytics-dashboard-download-button`                                                      | false | sem "Download" (TIFF/PDF/CSV) no topo                |
| `is-displaying-list-contacts-button`                                                                     | true  | `external-file` que abre a barra lateral de contatos |
| `is-using-contacts-section-identity-quantity-route`                                                      | true  | totais de Contatos pelas rotas de quantidade         |
| `is-using-channel-section-identity-quantity-route`                                                       | true  | totais de Canais pelas rotas de quantidade           |
| `is-displaying-active-messages-template-autocomplete-filter`                                             | true  | autocomplete de Template                             |
| `is-displaying-active-messages-campaign-autocomplete-filter`                                             | false | sem autocomplete de Campanha                         |
| `general-dashboard-initial-period-one-day`, `active-messages-per-domain-table`                           | —     | só no `portal.js` antigo, não no MFE                 |
| `is-displaying-analytics-active-messages-tab`, `is-showing-data-dictionary`, `dashboard-fullscreen-mode` | true  | casca (abas), não o miolo                            |

## 3. Dashboard (`iN`, ~59539)

Ordem: filtro `ST` → cabeçalho (`nN`: "Dashboard" fs-32 bold + período `ET` fs-16; `aN`: "Atualizar"
secondary com `refresh`) → Contatos `I_` → Recorrência `BR` → Mensagens `xR` → Canais `OE` → Fluxo `Yw` →
Blocos `WT` → barra lateral `uw` quando aberta. Se TODAS as seções falham: ilustração `screen-report` +
"Ops! Houve um erro ao carregar os dados do seu chatbot" + "Tentar novamente" (`CT variant=page`).

Chamadas (todas com o período, e as `ft()` com o período anterior):
`/metrics/engaged-identity/D`, `/metrics/active-identity/D` (itens `{intervalStart, count}`),
`/metrics/engaged-identity-quantity`, `/metrics/active-identity-quantity` (`{count}`),
`/metrics/contacts-by-domain` (`{domain, engagedContacts, nonEngagedContacts, rejectionRate, engagementRate}`),
`/metrics/recurrence?…&take=10` (`recurrentIdentitiesRate`, `recurrentIdentitiesCount`,
`recurrentIdentitiesCountVariation`, `mostRecurrentIdentities[{identity, recurrence, contact{name, phoneNumber}}]`,
`recurrenceByDomain`), `/metrics/messages` (`sentMessages`, `receivedMessages`, `totalMessages`,
`averageReceivedMessagesByContact`, `averageSentMessagesByContact`, `dailyMetrics[{date, sentMessages,
receivedMessages}]`, `previousPeriodDiff{…Variation}`, `activeMessages`, `activeMessagesByDomain`),
`/flowmetrics` (`usersInAttendance`, `attendanceUsersRate`, `usersRetention`, `retentionUsersRate`,
`usersInException`, `exceptionUsersRate`, `flowMetricsPreviousPeriodDiff{Users…Variation}`),
`/blocks/fallback?take=10`, `/blocks/desk?take=10` (`items[{blockId, blockName, count}]`).
CSV: `/metrics/download-csv-informations/{ContactsSection|Messaging|ConversationalFlow|ContactsRejection}`,
`/metrics/recurrence/download-users-csv`, `/metrics/contacts/download-engaged` (resposta `{uri}`).
Barra lateral: `/metrics/contacts/engaged` e `/metrics/sidebar/ContactsRejection` com `&skip=&take=20`.

### Filtro `xT`

Faixa `bT` (largura cheia, `max-height 128`, sombra `0 10px 16px rgba(7,71,166,.12)`, cantos de baixo 8) com
`pT` (90% até 1366, `space-around`, 24px). Rótulo "Selecione o período" fs-20 bold + `info` sólido com a dica
"A análise será referente ao período selecionado…". Chips `bds-chip-clickable size=tall` (40px, raio 24):
Hoje · Ontem · Últimos 7/15/30 dias / Semana anterior · Mês anterior · Semana atual · Mês atual. Ativo =
`default` (fundo `system`), resto `outline`. "De"/"Até" (`aT`): dois `<input type=date>` dentro de caixa de
32px raio 10, mínimo hoje−90, sem teclado; "Aplicar" `tertiary`, travado sem as duas datas.

Intervalos (navegador): Hoje = hoje; Ontem = ontem; Últimos N = D−N a D−1; Semana anterior = domingo a
sábado passados (`ht`); Mês anterior (`mt`); Semana atual = domingo a hoje (`dt`); Mês atual (`pt`). Período
anterior `ft` = mesmo número de dias logo antes. Rótulo `IS`: "13 de setembro de 2026 - 00h às 23h59" (um
dia) ou "6 de … - 12 de …".

### Formatação `WS` e indicador `XS`

`WS(valor, locale, percentual=false, casas=2, padrão="-", sinal=false)`: absoluto < 100 arredonda em 2
casas, ≥ 100 inteiro; percentual multiplica a fração por 100 e zero vira o padrão; `+` só com `sinal`.
`XS`: `WS(variação, …, true, 0, "-", true)` com `arrow-up`/`arrow-down` (sem seta no "-"), caixa de 20px
raio 3 (`light` = surface-1, `dark` = surface-2, `transparent`). Dica: "Em comparação com a data …" (um
dia) / "Em comparação com o período de … a …" / "Não haverão resultados de comparação…" quando o anterior
passa de 90 dias (e o número vira "-"). Variação `BS(a, b) = (a − b) / b`.

### Seções

- **Contatos** `I_` (paper 16px, `F_` título `kE` fs-24 + dica, explicação fs-16, CSV `wS`): coluna 30% com
  `$E` "Total de contatos únicos" (surface-2, `padding 22px 16px`) e dois `c_` ("Contatos que não
  responderam", "Contatos com interação"); coluna 45% com o gráfico de linhas `n_` (ocean + cinza, legenda
  circular 7px); coluna 25% com dois `__` listrados ("Taxa de rejeição" fio `content-disable`, "Taxa de
  interação" fio ocean) com o `external-file` da lateral. Taxa de interação = com interação ÷ total.
- **Recorrência** `BR`: `AR` gap 16 → dois `DR` surface-3 ("Taxa de recorrência", "Contatos únicos
  recorrentes") e o `DT` "Contatos com mais recorrência" (Nome · Recorrência 120px · Telefone; posição "1º"
  num círculo de 32px `system`; `external-file` abre o contato; corpo rola em 150px). Vazio: relógio +
  "Inicie conversas para acompanhar a performance do seu chatbot!".
- **Mensagens** `xR`: `QT` 20% (duas barras deitadas "Enviadas"/"Recebidas", rótulo " N%" 24px), 25% (`__`
  "Total de mensagens trafegadas" com sombra + `iR` "Mensagens enviadas"/"Mensagens recebidas" em círculo de
  32px), 30% (`n_` com título "Volume de mensagens no período"), 25% ("Média de mensagens recebidas",
  "Média de mensagens enviadas"). Explicação em `#505F79`.
- **Canais** `OE`: tabela `aE` com colunas (sem título) · Contatos com interação · Taxa de interação ·
  Contatos que não responderam · Taxa de rejeição · Mensagens ativas enviadas · Taxa de recorrência; linhas
  ímpares surface-2, última ("Totais") em negrito, indicador transparente sem dica. Domínios traduzidos por
  `IE` (`wa.gw.msging.net` → "Whatsapp", `0mn.io` → "Blip Chat"…). Vazio: relógio + "Inicie conversas…".
- **Fluxo conversacional** `Yw`: três `Vw` (139px, fio 2px): "Contatos em transbordo" (pink), "Contatos em
  retenção" (yellow), "Contatos em exceção" (blue), cada um com taxa + total (+ indicador). Resposta nula →
  polegar + "Ops… Houve um erro…"; tudo zero → relógio + "Os dados do seu fluxo conversacional estão sendo
  processados...".
- **Blocos** `WT`: dois `DT` lado a lado, corpo 288px — "Blocos com mais exceção" e "Blocos com mais
  transbordo" (Nome do bloco · Total de eventos 120px). Texto muda no roteador (`isMasterApplication`), e
  "Clique aqui" abre `/analytics/dataDictionary?path=dashboard:listOfBlocks`. Vazio: polegar + "Não há dados
  disponíveis para este período.".
- **Barra lateral** `uw`: véu `rgba(235,235,235,.5)`, coluna de 416px — cabeçalho surface-4 "Número de
  Contatos" + fechar; faixa surface-3 com `channels` + título do cartão, "v1 (v2 contatos)" e "Exportar lista"
  (dica "Limitado aos 1000 contatos mais recentes"); lista de cartões de 52px.

## 4. Mensagens ativas (`Lx`, ~56300)

**Árvore.** `Lx` → `.active-messages-charts-container` (40px em cima; laterais 328/248/64/40px nas faixas
≤2560/≤1920/≤1366/≤1024) › `Ox`[`Ix`[título "Mensagens ativas" fs-32 bold · `Zx` gap 12 [`bds-button
icon=refresh secondary` "Atualizar"]] · `Wx`[`St`]] › `bds-grid gap=2 column`:

1. `bds-paper`[`Mt` (números) + `fc` (Funil de Conversão)]
2. `bds-grid gap=2`[`Dl` (Conversões) + `Wl` (taxas)]
3. `bds-grid gap=2 pb16`[`bds-paper`(`_c` Picos de resposta) + `bc` (Falhas no envio)]

**Filtro `St` (dicionário `gt`).** "Selecione o período": chips `standard` (32px, raio 16) Hoje, Ontem,
Últimos 7/15/30 dias / Semana anterior, Mês anterior, Semana atual, Mês atual. "Filtre por data":
`bds-datepicker type-of-date=period`, de hoje − 186 dias até hoje. "Filtre por campanha": autocomplete
"Template" (placeholder "Nome do template"); "Campanha" escondido pela flag. `bds-button size=large`
"Aplicar". Chip ou data só mudam o estado; a busca roda no Aplicar/Atualizar.

**Chamadas.** `K()` monta `&$take=200&$skip=0` [+ `&campaign=`] [+ `&template=`] e chama:

- `/active-messages/status` → `items[{ sendDateTime, sent, received, consumed, response, failed }]`
- `/active-messages/reply-hour` → `items[{ hour, count }]` (a tela preenche 24 posições)
- `/active-messages/failed-count` → `items[{ cloudApiErrorId, errorMessage, count }]`
- `/active-messages/template-names` e `/campaign-names`: sem termo `&$take=10&$skip=0`; termo com 3+
  caracteres `&filter=<termo>&$take=20&$skip=0`; 1–2 caracteres não busca; espera de 500 ms; `items[].value`.

**Contas.** `ne()` soma (`read` = consumed, `replied` = response). `D()` funil em %: enviadas 100, as outras
`round(x/sent*100)`, tudo 0 sem envio. `Wl`: `(resp/sent*100).toFixed(2)` com vírgula, "0%" sem envio.
`Dl`: início igual ao fim → barras (Enviadas/Respondidas/Falharam); senão linhas diárias `dd/mm`, cada série
na própria escala, só a de enviadas com eixo; o `Dl` não recebe o plugin de datalabels. `_c`: 24 barras, zero
desenhado como 0,5, raio só em cima, rótulos das horas pares, `suggestedMax` 50.

**Textos.** Cartões: Enviadas "Todas as mensagens enviadas à audiência"; Recebidas "…entregues com sucesso";
Lidas "…visualizadas pelos contatos"; Respondidas "…respondidas pelos contatos"; Falharam "…que falharam no
envio e não chegaram aos contatos". Funil: "Avalie a eficácia no envio de mensagens e interações geradas pela
audiência". Conversões: "Todas as mensagens enviadas e respondidas pelos contatos ou que tiveram falhas no
envio". Taxa de Conversão / Taxa de Falha. Picos de resposta: "Horários em que seus contatos mais respondem
às mensagens" (dica "Respostas"). Falhas no envio: "Erros que impediram a entrega de mensagens aos contatos." +
"Confira erros e soluções." (developers.facebook.com); colunas Código / Descrição do erro / Ocorrências; nulo
vira "N/A".

**Estados.** Carregando: `loading` girando em cada cartão. Vazio: zeros, "0%", funil em 0%, picos mínimos,
tabela só com cabeçalho. Preenchido: os mesmos componentes com números.

**No Pipe.** `fluxo/[id]/analise/mensagens-ativas/` (`page.tsx`, `filtro.tsx` cliente, `miolo.tsx`,
`mensagens-ativas.css`). `carregarMensagensAtivas` devolve vazio (o bot só responde dentro da janela e
template de campanha não é atribuído a fluxo). Estado na URL (`?periodo&de&ate&template`). Datepicker virou
`<input type="date">`, autocomplete virou `<input list>` + `datalist`.

## 5. Dicionário de dados (`iC`)

Moldura `iC`, menu `HV`, provedor `bV`. Não há dado: todo o conteúdo é texto fixo do bundle.

**Estado.** `bV` lê `params` como `secao:subsecao` (no Pipe, `?path=`). Sem `path`: "Sobre dados" (`mV`). O
Dashboard (`WT`) aponta para `?path=dashboard:listOfBlocks`. Item inativo abre o alerta "Ops! Este conteúdo
ainda não está disponivel." (bds-alert error + "Fechar").

| Seção                     | Chave            | Tipo                   | Subseções                                                                                                                                                                              |
| ------------------------- | ---------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sobre dados               | `aboutData`      | ZV ativo               | —                                                                                                                                                                                      |
| Dashboard                 | `dashboard`      | AV                     | `dateFilter`, `comparisonIndicator`, `contacts`, `recurrence`, `messages`, `channels` (inativo, "Canais (Em breve)"), `conversationalFlow`, `listOfBlocks`, `frequentlyAskedQuestions` |
| Visão Geral               | `overview`       | ZV inativo, "Em Breve" | —                                                                                                                                                                                      |
| Jornada dos Contatos      | `contactJourney` | ZV inativo             | —                                                                                                                                                                                      |
| Relatórios Personalizados | `customReport`   | ZV inativo             | —                                                                                                                                                                                      |
| Gerenciador de Relatórios | `reportManager`  | AV                     | `activeMessages`, `eventTracking`, `chatbotUserMetrics`, `statusAttendants`, `serviceMetrics`, `serviceHistory`                                                                        |

**Páginas.** `aboutData` `zN` · `dashboard` `vU` · `dateFilter` `SU` · `comparisonIndicator` `JN` · `contacts`
`lU` · `recurrence` `DU` · `messages` `VU` · `conversationalFlow` `gU` (dois PNGs 164×19 e 88×19 — capturas
do Builder, redesenhadas em CSS) · `listOfBlocks` `NU`/`wU` (seções tipadas `text`, `attentionText`, `chip`,
`orderedList`, `table`, `unorderedList`) · `frequentlyAskedQuestions` `_U` · `reportManager` `KU` ·
`activeMessages` `ZU` + `WU` + `AU` · `eventTracking` `XU` · `chatbotUserMetrics` `GU` + `QU` + `JU` + `PU` ·
`statusAttendants` `pV` + `uV` + `lV` + `iV` + `hV` · `serviceMetrics` `oV` · `serviceHistory` `tV`.

**Peças.** `lN` data fs-10 fantasma à direita · `UN` 20px embaixo · `VN` typo em bloco, 5px embaixo · `CN`
linha flex · `ON` destaque sem quebra · `iU` tabela (células 10px, 1ª coluna 20% bold, ímpares surface-2) ·
`sN` `bds-chip-tag` outline warning · `dU` círculo com ícone do Builder · `BN` fio a 50% · `ZN` título na
primária. Moldura: `nC` 60px em cima; `oC` 85% entre 1024 e 2560; `rC` paper com recheio 10; menu 350px com
fio à direita; `aC` 20px à esquerda, 560px iniciais e depois a altura do `rC` (ResizeObserver).

**Textos trocados.** "portal Blip"/"Portal Blip" → "portal Pipe"/"Portal Pipe"; "Blip Desk" → "Pipe Desk";
"Growth (Blip)" → "Growth (Pipe)"; "no/pelo Blip" → "no/pelo Pipe"; "plataforma do Blip" → "plataforma do
Pipe". Links `support.blip.ai`: texto mantido, sem destino.

## 6. O Pipe — Dashboard

`apps/gestao/src/app/fluxo/[id]/analise/dashboard/` (`page.tsx`, `tela.tsx`, `periodo-personalizado.tsx`,
`dashboard.css`) e `apps/gestao/src/lib/analise.ts`; regras travadas em `apps/gestao/tests/analise.test.ts`.

- Estado na URL: `?periodo=` com as chaves da origem, `de`/`ate`, `contatos=interacao|rejeicao`.
- Dados reais: a API grava `execucao_fluxo` por conversa atendida pelo bot, as mensagens do bot e o
  transbordo (`evento_atendimento` `enfileirada` com `dados.origem = 'fluxo'`). Contatos, mensagens,
  recorrência, Canais e transbordo/retenção saem daí. Sem equivalente: exceção e listas de blocos (o Pipe não
  tem bloco de exceção e não marca o bloco do transbordo), mensagens ativas (o bot só responde dentro da
  janela), CSVs, e a agregação do roteador sobre os fluxos que ele chama.
- Gráficos em SVG/CSS (sem dependência); o eixo x pula rótulos em vez de girar.

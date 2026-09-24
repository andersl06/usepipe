# Glossário de domínio — portão 1

Status: APPROVED 2026-09-24 (approver: owner via chat)

Contagem: tokens PT exatos de `old` no inventário real, separados conforme os escopos de 01-08. Zero significa que a forma exata não foi classificada como token PT; não significa ausência do conceito. Todas as linhas estão aprovadas. Termos Blip prevalecem quando nomeiam o mesmo conceito (D-01).

Decisões do dono aplicadas no portão 1 (2026-09-24): `atendimento` com três sentidos (attendance/ticket/conversation); `monitoria` → `qualityReview` (não monitoring); `sessão` → `session` em geral, `ticket` para a sessão humana; `estado` → `state` em geral, `status` para conjunto fechado de situações; `ações em massa` → `bulkActions` para identificadores, `bulk-ticket` só para rotas; `análise` → `analytics`; `painel` → `application` (módulo/rota) ou `panel` (componente de UI). Demais linhas aprovadas como propostas.

## Terms

| term_pt | term_en | blip_source | ambiguity | decision | approved |
|---|---|---|---|---|---|
| erro | error |  | none | Recomendado: error; alternativa: failure; evidência: 789 (256 backend + 533 front) | yes |
| fluxo | flow |  | none | Recomendado: flow; alternativa: workflow; evidência: 583 (346 backend + 237 front) | yes |
| canal | channel |  | none | Recomendado: channel; alternativa: medium; evidência: 550 (398 backend + 152 front) | yes |
| conversa | conversation |  | none | Recomendado: conversation; alternativa: chat; evidência: 507 (368 backend + 139 front) | yes |
| valor | value |  | none | Recomendado: value; alternativa: amount; evidência: 476 (115 backend + 361 front) | yes |
| fila | queue | referencias-blip/portal/INDICE.md | none | Recomendado: queue; alternativa: line; evidência: 464 (295 backend + 169 front) | yes |
| contato | contact |  | none | Recomendado: contact; alternativa: customer; evidência: 456 (261 backend + 195 front) | yes |
| cartão | card |  | none | Recomendado: card; alternativa: tile; evidência: 444 (3 backend + 441 front) | yes |
| bloco | block |  | none | Recomendado: block; alternativa: step; evidência: 441 (36 backend + 405 front) | yes |
| estado | state |  | AMBIGUOUS | Decisão do dono (2026-09-24): state em geral; status quando o valor é um conjunto fechado de situações (ex. open/closed); evidência: 414 (215 backend + 199 front) | yes |
| sessão | session |  | AMBIGUOUS | Decisão do dono (2026-09-24): session em geral; ticket quando o código significa a sessão humana de atendimento (ver "Ambiguous: atendimento"); evidência: 411 (346 backend + 65 front) | yes |
| mensagem | message |  | none | Recomendado: message; alternativa: communication; evidência: 375 (211 backend + 164 front) | yes |
| chave | key |  | AMBIGUOUS | Recomendado: key; alternativa: token; evidência: 369 (198 backend + 171 front) | yes |
| painel | application |  | AMBIGUOUS | Decisão do dono (2026-09-24): application quando é o módulo Portal/Gestão ou a tela/rota principal do portal (Blip usa `<tenant>.blip.ai/application`); panel para componentes de UI (painéis laterais, linhas de dashboard como `LinhaDoPainel`, helpers `painel.ts` do crm); alternativa: dashboard; evidência: 326 (10 backend + 316 front); ver seção "Ambiguous: painel" | yes |
| atendente | agent |  | none | Recomendado: agent; alternativa: attendant; evidência: 301 (205 backend + 96 front) | yes |
| usuário | user |  | none | Recomendado: user; alternativa: member; evidência: 299 (257 backend + 42 front) | yes |
| conta | account |  | AMBIGUOUS | Recomendado: account; alternativa: tenant; evidência: 288 (125 backend + 163 front) | yes |
| dados | data |  | none | Recomendado: data; alternativa: payload; evidência: 270 (109 backend + 161 front) | yes |
| gestão | management |  | none | Recomendado: management; alternativa: administration; evidência: 264 (187 backend + 77 front) | yes |
| página | page |  | none | Recomendado: page; alternativa: screen; evidência: 228 (44 backend + 184 front) | yes |
| requisição | request |  | none | Recomendado: request; alternativa: petition; evidência: 225 (222 backend + 3 front) | yes |
| papel | role |  | none | Recomendado: role; alternativa: permission; evidência: 219 (106 backend + 113 front) | yes |
| busca | search |  | none | Recomendado: search; alternativa: lookup; evidência: 208 (18 backend + 190 front) | yes |
| entrada | inbound |  | AMBIGUOUS | Recomendado: inbound; alternativa: input; evidência: 205 (82 backend + 123 front) | yes |
| ações | actions |  | none | Recomendado: actions; alternativa: operations; evidência: 189 (9 backend + 180 front) | yes |
| atendimento | attendance | referencias-blip/portal/INDICE.md | AMBIGUOUS | Decisão do dono (2026-09-24): três sentidos — módulo do Portal → attendance; sessão humana de atendimento → ticket; conversa no canal → conversation (ver seção "Ambiguous: atendimento"); evidência: 184 (56 backend + 128 front) | yes |
| roteador | router | referencias-blip/portal/INDICE.md | none | Recomendado: router; alternativa: routing bot; evidência: 146 (55 backend + 91 front) | yes |
| escopo | scope |  | none | Recomendado: scope; alternativa: permission; evidência: 145 (118 backend + 27 front) | yes |
| convite | invitation |  | none | Recomendado: invitation; alternativa: invite; evidência: 132 (69 backend + 63 front) | yes |
| entrar | login |  | none | Recomendado: login; alternativa: sign-in; evidência: 128 (15 backend + 113 front) | yes |
| contexto | context |  | none | Recomendado: context; alternativa: scope; evidência: 126 (48 backend + 78 front) | yes |
| coluna | column |  | none | Recomendado: column; alternativa: field; evidência: 121 (13 backend + 108 front) | yes |
| filtro | filter |  | none | Recomendado: filter; alternativa: predicate; evidência: 120 (24 backend + 96 front) | yes |
| modelo | template |  | AMBIGUOUS | Recomendado: template; alternativa: model; evidência: 120 (57 backend + 63 front) | yes |
| ordem | order |  | none | Recomendado: order; alternativa: sequence; evidência: 120 (47 backend + 73 front) | yes |
| descrição | description |  | none | Recomendado: description; alternativa: summary; evidência: 119 (38 backend + 81 front) | yes |
| destino | destination |  | none | Recomendado: destination; alternativa: target; evidência: 119 (63 backend + 56 front) | yes |
| condição | condition |  | none | Recomendado: condition; alternativa: rule; evidência: 112 (36 backend + 76 front) | yes |
| configurações | settings |  | none | Recomendado: settings; alternativa: configuration; evidência: 104 (19 backend + 85 front) | yes |
| arquivo | file |  | none | Recomendado: file; alternativa: attachment; evidência: 94 (42 backend + 52 front) | yes |
| janela | window |  | AMBIGUOUS | Recomendado: window; alternativa: timeframe; evidência: 93 (47 backend + 46 front) | yes |
| segredo | secret |  | none | Recomendado: secret; alternativa: credential; evidência: 93 (83 backend + 10 front) | yes |
| anexo | attachment |  | none | Recomendado: attachment; alternativa: media; evidência: 92 (68 backend + 24 front) | yes |
| domínio | domain |  | none | Recomendado: domain; alternativa: business-logic; evidência: 90 (81 backend + 9 front) | yes |
| leitura | read |  | none | Recomendado: read; alternativa: reading; evidência: 90 (10 backend + 80 front) | yes |
| prioridade | priority |  | none | Recomendado: priority; alternativa: rank; evidência: 90 (66 backend + 24 front) | yes |
| entrega | delivery |  | none | Recomendado: delivery; alternativa: dispatch; evidência: 87 (59 backend + 28 front) | yes |
| encerramento | closure |  | none | Recomendado: closure; alternativa: completion; evidência: 86 (21 backend + 65 front) | yes |
| seção | section |  | none | Recomendado: section; alternativa: area; evidência: 80 (1 backend + 79 front) | yes |
| banco | database |  | none | Recomendado: database; alternativa: bank; evidência: 78 (68 backend + 10 front) | yes |
| mídia | media |  | AMBIGUOUS | Recomendado: media; alternativa: asset; evidência: 78 (70 backend + 8 front) | yes |
| autenticação | authentication |  | none | Recomendado: authentication; alternativa: auth; evidência: 76 (56 backend + 20 front) | yes |
| seleção | selection |  | none | Recomendado: selection; alternativa: choice; evidência: 76 (3 backend + 73 front) | yes |
| permissão | permission |  | none | Recomendado: permission; alternativa: authorization; evidência: 69 (53 backend + 16 front) | yes |
| trilho | rail |  | none | Recomendado: rail; alternativa: sidebar; evidência: 64 (0 backend + 64 front) | yes |
| histórico | history | referencias-blip/portal/INDICE.md | none | Recomendado: history; alternativa: archive; evidência: 61 (23 backend + 38 front) | yes |
| esforço | effort |  | none | Recomendado: effort; alternativa: workload; evidência: 57 (16 backend + 41 front) | yes |
| análise | analytics | referencias-blip/portal/INDICE.md | AMBIGUOUS | Decisão do dono (2026-09-24): analytics (nomenclatura Blip: `application/detail/<tenant>/analytics/dashboard.html`); alternativa: analysis; evidência: 50 (11 backend + 39 front) | yes |
| casca | shell |  | none | Recomendado: shell; alternativa: layout; evidência: 50 (2 backend + 48 front) | yes |
| controlador | controller |  | none | Recomendado: controller; alternativa: handler; evidência: 50 (50 backend + 0 front) | yes |
| relatório | report | referencias-blip/portal/INDICE.md | AMBIGUOUS | Recomendado: report; alternativa: analytics; evidência: 48 (25 backend + 23 front) | yes |
| importação | import |  | none | Recomendado: import; alternativa: ingestion; evidência: 46 (31 backend + 15 front) | yes |
| monitoramento | monitoring | referencias-blip/portal/INDICE.md | none | Recomendado: monitoring; alternativa: tracking; evidência: 46 (21 backend + 25 front) | yes |
| membro | member |  | none | Recomendado: member; alternativa: user; evidência: 44 (28 backend + 16 front) | yes |
| contrato | contract |  | none | Recomendado: contract; alternativa: subscription; evidência: 43 (26 backend + 17 front) | yes |
| dicionário | dictionary |  | none | Recomendado: dictionary; alternativa: schema; evidência: 41 (32 backend + 9 front) | yes |
| monitoria | qualityReview |  | AMBIGUOUS | Decisão do dono (2026-09-24): qualityReview, não monitoring (evita colisão com monitoramento → monitoring); alternativa: audit; evidência: 37 (26 backend + 11 front) | yes |
| compositor | composer |  | none | Recomendado: composer; alternativa: editor; evidência: 21 (0 backend + 21 front) | yes |
| cadastro | registration |  | AMBIGUOUS | Recomendado: registration; alternativa: record; evidência: 20 (8 backend + 12 front) | yes |
| armazenamento | storage |  | none | Recomendado: storage; alternativa: store; evidência: 18 (15 backend + 3 front) | yes |
| espelho | mirror |  | AMBIGUOUS | Recomendado: mirror; alternativa: sync; evidência: 17 (17 backend + 0 front) | yes |
| ponte | bridge |  | none | Recomendado: bridge; alternativa: adapter; evidência: 16 (6 backend + 10 front) | yes |
| satisfação | satisfaction | referencias-blip/portal/INDICE.md | none | Recomendado: satisfaction; alternativa: survey; evidência: 14 (6 backend + 8 front) | yes |
| operação | operations |  | none | Recomendado: operations; alternativa: operation; evidência: 12 (8 backend + 4 front) | yes |
| varredura | sweep |  | none | Recomendado: sweep; alternativa: scan; evidência: 11 (10 backend + 1 front) | yes |
| agregação | aggregation |  | none | Recomendado: aggregation; alternativa: rollup; evidência: 9 (8 backend + 1 front) | yes |
| distribuição | distribution |  | none | Recomendado: distribution; alternativa: routing; evidência: 8 (2 backend + 6 front) | yes |
| mensagem ativa | activeMessage | referencias-blip/portal/INDICE.md | none | Recomendado: activeMessage; alternativa: outbound message; evidência: 7 (4 backend + 3 front) | yes |
| componente | component |  | none | Recomendado: component; alternativa: widget; evidência: 5 (4 backend + 1 front) | yes |
| novidades | updates |  | none | Recomendado: updates; alternativa: news; evidência: 5 (0 backend + 5 front) | yes |
| ações em massa | bulkActions | referencias-blip/portal/INDICE.md | AMBIGUOUS | Decisão do dono (2026-09-24): bulkActions para identificadores; bulk-ticket somente para segmentos de rota (caminho Blip `supernova.desk.blip.ai/bulk-ticket.html`); evidência: 3 (0 backend + 3 front) | yes |
| construtor | builder | referencias-blip/portal/INDICE.md | none | Recomendado: builder; alternativa: editor; evidência: 2 (2 backend + 0 front) | yes |
| métrica | metric |  | none | Recomendado: metric; alternativa: measure; evidência: 0 (0 backend + 0 front) | yes |
| tempo-real | realtime |  | none | Recomendado: realtime; alternativa: real-time; evidência: 0 (0 backend + 0 front) | yes |
| ticket | ticket | referencias-blip/portal/INDICE.md | none | Recomendado: ticket; alternativa: session; evidência: 0 (0 backend + 0 front) | yes |

## Ambiguous: atendimento

A palavra cobre três objetos distintos (D-02). A divergência das propostas diretas foi preservada: backend sugeriu `ticket`, front sugeriu `attendance`. **Decisão do dono (2026-09-24): APROVADO** exatamente como recomendado — os três sentidos abaixo.

| Sentido | Recomendação | Evidência | Alternativa |
|---|---|---|---|
| Módulo do Portal | `attendance` | `referencias-blip/portal/INDICE.md`: caminhos `/attendance/desk/*`; opções de fila, equipe, histórico e monitoramento agrupadas ali. | `service` |
| Sessão humana de atendimento | `ticket` | `apps/api/src/controladores/desk.ts`: `GET tickets/:id` abre atendimento antigo; `packages/db/src/schema/conversas.ts`: `conversa` tem fila, atendente, atribuição e encerramento; Blip usa ticket no histórico. | `session` |
| Conversa no canal | `conversation` | `apps/api/src/controladores/desk.ts`: `GET conversas/:id` abre conversa ativa; `packages/db/src/schema/conversas.ts`: `mensagem.conversaId` liga mensagens à conversa. | `chat` |

A linha geral `atendimento → attendance` aplica-se somente ao módulo. Mapeamentos de sessão e conversa devem usar `ticket` e `conversation`. O inventário registra 184 tokens exatos de `atendimento`, sem decidir automaticamente o sentido de cada ocorrência; o portão 2 aplica o sentido por ocorrência.

## Ambiguous: painel

**Decisão do dono (2026-09-24):** `painel` também cobre dois objetos distintos, resolvidos pelo dono no portão 1.

| Sentido | Recomendação | Evidência | Alternativa |
|---|---|---|---|
| Módulo Portal/Gestão ou tela/rota principal do portal | `application` | `referencias-blip/portal/INDICE.md`: Blip usa `<tenant>.blip.ai/application` e `<tenant>.blip.ai/application.html` (rota raiz do portal); painel do contrato em `application/tenant/panel.html`. | `service` |
| Componente de UI (painel lateral, linha de dashboard) | `panel` | `apps/api/src/dominio/mensagem-ativa.ts:309` (`LinhaDoPainel`); `apps/crm/src/lib/painel.ts` (helpers de painel). | `dashboard` |

A linha geral `painel → application` no `## Terms` aplica-se ao módulo/rota. Componentes de UI (`LinhaDoPainel`, `painel.ts` e afins) usam `panel`; o portão 2 aplica o sentido por ocorrência.

## Evidência de contagem zero

- `ticket`: já é termo inglês no código; `apps/api/src/controladores/desk.ts` declara `GET tickets/:id` e usa `TicketDoDesk`. Por isso `isPtToken` não o inclui na frequência PT.
- `métrica`: o uso real está em `packages/core/src/metricas/` e em `packages/db/src/schema/gestao.ts` (`metricaDiaria`). A forma exata não foi classificada pelo léxico PT do inventário; a forma plural aparece em caminhos.
- `tempo-real`: `packages/tempo-real/package.json` usa `@pipe/tempo-real`; o inventário separa o composto em `tempo` e `real`, sem uma linha de token composto.

Compostos como `ações em massa` e `mensagem ativa` foram contados como sequências exatas em `old`. `check-map` compara tokens unitários; o portão 2 deve revisar a correspondência dos compostos explicitamente.

## Other ambiguous terms

Decisão do dono (2026-09-24): **APROVADO** para todas as linhas abaixo, com os ajustes indicados.

- **estado** (414): **state em geral; status quando o valor é um conjunto fechado de situações** (ex. open/closed). Usos: `/v1/canais/whatsapp/estado` em `apps/api/src/controladores/canais.ts:57`; `conversa.estado_alterado` em `apps/crm/src/lib/configuracoes-comum.ts:187`.
- **sessão** (411): **session em geral; ticket quando o código significa a sessão humana de atendimento** (ver "Ambiguous: atendimento"). Usos: `envio-sessao.test.ts` em `apps/api/tests/envio-sessao.test.ts`; `pipe_sessao` em `apps/crm/src/lib/sessao.ts:48`.
- **chave** (369): key aprovado; alternativa token. Usos: `chave_de_fluxo` em `apps/api/src/autenticacao.ts:156`; `acaoCriarChave` em `apps/crm/src/app/configuracoes/acoes.ts:212`.
- **painel** (326): **application quando é o módulo Portal/Gestão ou a tela/rota principal do portal (`<tenant>.blip.ai/application`); panel para componentes de UI** (ver "Ambiguous: painel"). Usos: `LinhaDoPainel` em `apps/api/src/dominio/mensagem-ativa.ts:309`; `painel.ts` em `apps/crm/src/lib/painel.ts`.
- **conta** (288): account aprovado; alternativa tenant. Usos: `/v1/conta` em `apps/api/src/controladores/minha-conta.ts:179`; `conta` em `apps/crm/src/app/oportunidades/[id]/page.tsx:35`.
- **entrada** (205): inbound aprovado; alternativa input. Usos: `entrada-telefone.test.ts` em `apps/api/tests/entrada-telefone.test.ts`; `descobrirEntrada` em `apps/crm/src/lib/sessao.ts:118`.
- **modelo** (120): template aprovado; alternativa model. Usos: `modelo_invalido` em `apps/api/src/dominio/whatsapp/modelos.ts:109`; `modelo.recategorizado` em `apps/crm/src/lib/configuracoes-comum.ts:193`.
- **janela** (93): window aprovado; alternativa timeframe. Usos: `janela.ts` em `apps/api/src/dominio/gestao/janela.ts`; `Janela` em `apps/crm/src/lib/banco.ts:105`.
- **mídia** (78): media aprovado; alternativa asset. Usos: `midia-recebida.test.ts` em `apps/api/tests/midia-recebida.test.ts`; `cabecalhoTemMidia` em `apps/gestao-vite/src/lib/comunicacao.ts:51`.
- **análise** (50): **analytics** (decisão do dono, nomenclatura Blip: `application/detail/<tenant>/analytics/dashboard.html`), não analysis. Usos: `/v1/gestao/fluxos/:*/analise/dashboard` em `apps/api/src/controladores/gestao-analise.ts:107`; `apps/gestao-vite/src/paginas/fluxo/analise/dashboard`.
- **relatório** (48): report aprovado; alternativa analytics. Usos: `relatorio.ver` em `apps/api/tests/entrada.test.ts:58`; `dataDoRelatorio` em `apps/gestao-vite/src/paginas/fluxo/analise/relatorios/relatorios.tsx:100`.
- **monitoria** (37): **qualityReview** (decisão do dono, evita colisão com monitoramento → monitoring), não monitoring; alternativa: audit. Usos: `/v1/gestao/monitoria/:*` em `apps/api/src/controladores/gestao-operacao.ts:328`; `monitoria-ficha.tsx` em `apps/gestao-vite/src/paginas/operacao/monitoria-ficha.tsx`.
- **cadastro** (20): registration aprovado; alternativa record. Usos: `cadastro-embutido.ts` em `apps/api/src/dominio/whatsapp/cadastro-embutido.ts`; `cm-modal--cadastro` em `apps/gestao-vite/src/paginas/contrato/certificados/certificados.css:410`.
- **espelho** (17): mirror aprovado; alternativa sync. Usos: `espelho-crm.ts` em `apps/api/src/dominio/espelho-crm.ts`.
- **ações em massa** (3): **bulkActions para identificadores; bulk-ticket somente para segmentos de rota** (caminho Blip `supernova.desk.blip.ai/bulk-ticket.html`).

As decisões acima foram aprovadas pelo dono no portão 1 (D-03 gate 1). O portão 2 (D-03 gate 2) ainda aprova cada linha old→new do mapa antes de qualquer rename mecânico.

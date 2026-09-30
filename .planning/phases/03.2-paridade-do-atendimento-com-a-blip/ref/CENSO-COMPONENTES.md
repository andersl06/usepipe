# Censo de componentes do Atendimento: Blip x Pipe

**Levantado em:** 2026-09-30 (por `grep -rn` em `apps/management-vite/src`, `apps/desk-vite/src` e `packages/ui/src`; fichas em `referencias-blip/fichas/`, lidas por caminho absoluto).
**Escopo:** só leitura. Nenhum código foi alterado por este censo (D-07).
**Limite da evidência:** as fichas descrevem textos, ordem e `data-testid`; não trazem geometria do menu ⋮, do popover de filtro nem do cartão. Onde a ficha não cobre, está escrito "sem evidência nas fichas; captura pendente (ver CAPTURAS-PENDENTES.md)". Nada foi inferido.

Convenção: peça do Pipe sem equivalente na Blip = "fora da unificação (D-06), não alterar".

**Fato transversal:** `apps/desk-vite/src` não usa `Pagination` nem `tblwrap` (grep sem resultado). O CSS de paginação e de `tblwrap` só afeta `management-vite`. O CSS das três skins de paginação mora em `apps/management-vite/src/estilos/global.css`, não em `packages/ui`; `.tblwrap` tem definição base em `packages/ui/src/estilos/base.css:614` e sobrescrita em `global.css:1554`.

---

## Paginação

**Blip:** o rodapé aparece em `monitoring` (FICHA-monitoring §5: "Resultados por página" 5/10/15/25/50/100/250/500, contador "1-5 de 8", 4 botões primeira/anterior/próxima/última), `rules` (FICHA-rules §5, `data-testid` `pagination-and-search-results-select`, `first-page-test`, `decrement-page-test`, `increment-page-test`, `last-page-test`), `queue-management` (FICHA-queue-management §2.5/§5, "1-5 de 5"), `atendentes-filas-pausas` (FICHA-atendentes-filas-pausas: paginação igual à de filas, "1-5 de 6"; sem seletor de tamanho em `personalizedbreaks`; seções internas usam "Carregar mais", não paginação). No Portal/equipe, o `bds-pagination` (FICHA-equipe: "Itens por página", contador, navegação). Aparências distintas na Blip: 2 famílias (rodapé de lista do Atendimento com "Resultados por página"; `bds-pagination` do Portal com "Itens por página" e página atual em select). Dentro do Atendimento, o rodapé é o mesmo em todas as telas.

**Pipe:** um componente único, `packages/ui/src/components/pagination.tsx`, com `usePage` (matemática) e `Pagination` com 3 skins por `layout`.

| Variante | Arquivo:linha | Classes CSS | Onde o CSS mora | Telas que usam |
|---|---|---|---|---|
| `grade` | `packages/ui/src/components/pagination.tsx:173-208` | `.pg`, `.pg-per-page`, `.pg-direita`, `.pg-contador`, `.pg-nav`, `.pg-atual`, `.iconbtn` | `apps/management-vite/src/estilos/global.css:4690-4761`; sobrescrita `apps/management-vite/src/pages/operation/attendance.css:1595` (`.mon-detalhado .pg-per-page`) | `components/monitoring-detailed.tsx:336,392,434,475,507`; `pages/flow/team/tela.tsx:374,489` |
| `lista` | `packages/ui/src/components/pagination.tsx:147-171` | `.footer-pagination`, `.rp-tamanho`, `.rp-count`, `.rp-nav`, `.rp-atual` | `apps/management-vite/src/estilos/global.css:4890-4946` | `components/lista-regras.tsx:240` (com `ocultarTamanho`) |
| `portal` | `packages/ui/src/components/pagination.tsx:105-145` | `.pt-pagination*` | `apps/management-vite/src/estilos/global.css:4075-4154` | `pages/portal.tsx:128` |
| Telas sem `<Pagination>` | `pages/registrations/agents-breaks.tsx` (deliberado, ver FICHA), `pages/operation/reports-attendance.tsx`, `pages/registrations/agents-permissions.tsx`, `pages/registrations/settings-data.tsx`, `pages/operation/monitoring.tsx` | nenhuma | n/a | n/a |

**Pergunta do dono (D-07): "o seletor de resultados por página já foi alterado?"**
Resposta: o seletor existe e já foi unificado uma vez. `git log --oneline -S "PAGE_SIZES" -- packages/ui/src/components/pagination.tsx` retorna um único commit, `fe530e71 refactor(02-42): one set of global controls in @pipe/ui`, que introduziu `PAGE_SIZES` e o `Select` compartilhado. O comentário do componente (L4-20) diz que a matemática e o comportamento são compartilhados e que `layout` só escolhe a skin medida. As opções `[5, 10, 15, 25, 50, 100, 250, 500]` coincidem com as das fichas. O que não foi feito: medir a aparência do seletor contra a Blip (nenhuma medição existe; o método só nasceu na Onda 0).

**Pergunta do dono (D-07): "quantas formas existem hoje?"**
Resposta: 3 skins (`grade`, `lista`, `portal`) em 1 componente, com 2 famílias de markup no Atendimento (`grade` com `.pg*` e `lista` com `.footer-pagination`/`.rp-*`) para o mesmo visual na Blip; `portal` corresponde ao `bds-pagination` do Portal, que é outra família na Blip. Mais 5 telas sem paginação.

**Existe na Blip?**
- `grade`: sim (monitoring §5, equipe em grade de 5).
- `lista`: sim (rules, queue-management). Com `ocultarTamanho`: sim (`personalizedbreaks` sem seletor).
- `portal`: sim (`bds-pagination` do Portal, FICHA-equipe). Fora do Atendimento; não alterar nesta fase.
- Telas sem `<Pagination>`: `agents-breaks` deliberado; `reports-attendance`, `agents-permissions`, `settings-data`, `monitoring.tsx`: sem evidência nas fichas de que a Blip pagina essas telas; captura pendente antes de adotar.

**Proposta:** unificar `grade` e `lista` do Atendimento numa só skin SOMENTE se a medição (plano 03.2-07) mostrar que a Blip usa a mesma aparência nas duas (hipótese A4 da pesquisa, não confirmada). Componente continua em `packages/ui` (já usado em 3+ telas). Manter `portal` intacto. Telas a verificar contra regressão: `monitoring-detailed` (5 grades), `lista-regras`, `team/tela`, `portal`. Matemática coberta por teste (`apps/management-vite/tests/pagination.test.ts`, este plano). Plano que executa: 03.2-07.

---

## Tabela tblwrap

**Blip:** tabelas de `monitoring` detalhado (colunas e cabeçalhos literais, FICHA-monitoring §4), `history` (FICHA-history, estado vazio), `equipe` (FICHA-equipe: linhas alternadas, rolagem vertical). Aparências distintas: sem evidência de medição; o padrão de tabela parece uma só família, mas isso não foi medido.

**Pipe:** uso direto de `.tblwrap` em 5 telas, sem componente (o genérico `packages/ui/src/components/tabela.tsx` é usado em `pages/contract/members/*`, fora do Atendimento).

| Variante | Arquivo:linha | Classes CSS | Onde o CSS mora | Telas que usam |
|---|---|---|---|---|
| `tblwrap` + `mon-tabela` | `components/monitoring-detailed.tsx:623` (tabelas em L288-337) | `.tblwrap.mon-detalhado`, `.scroll`, `td.acts` | base `packages/ui/src/estilos/base.css:614`; app `global.css:1554-1772` (cartão `--g-*`, `th` 64px em L1628); Atendimento `attendance.css:553,609,619` | Monitoramento detalhado |
| `tblwrap` esqueleto | `pages/operation/monitoring.tsx:233` | `.tblwrap` com `aria-hidden` | idem | Monitoramento (carregando) |
| `tblwrap` em seções | `pages/operation/reports-attendance.tsx:435,464` | `.tblwrap` em `<section>`, `.rel-aba-cabecalho` | `global.css:1573-1576` | Relatório de atendimento |
| `tblwrap` | `pages/registrations/agents-permissions.tsx:92` | `.tblwrap` | `global.css` | Permissões |
| `tblwrap` | `pages/registrations/settings-data.tsx:35` | `.tblwrap` | `global.css` | Configurações de dados |

**Existe na Blip?** `monitoring-detailed`: sim. `monitoring` (esqueleto): não se aplica (estado de carregamento; fora da unificação, D-06). `reports-attendance`: sim (FICHA-relatorio-atendimento), sem medição. `agents-permissions`, `settings-data`: sem evidência nas fichas de medidas da tabela; captura pendente.

**Proposta:** unificar apenas a definição dupla do `.tblwrap` (base + sobrescrita) sem reordenar a cascata; não criar componente novo de tabela. Mover para `packages/ui` só o que for comum às 5 telas. Verificar regressão nas 5 telas e confirmar que `desk-vite` não usa. Plano que executa: 03.2-08.

---

## Barra de ações e detalhe do ticket

**Blip:** ícones de ação por linha na aba "Atribuído/Em andamento": "Perfil do contato", "Transferir", "Falar com atendente" (FICHA-monitoring §5). Tela de detalhe do ticket como painel: sem evidência nas fichas de geometria; captura pendente.

**Pipe:**

| Variante | Arquivo:linha | Classes CSS | Onde o CSS mora | Telas que usam |
|---|---|---|---|---|
| `TicketActions` (botões + menu) | `components/monitoring-detailed.tsx:107-152` | `td.acts`, `.iconbtn.mon-acao`, `.mon-actions` | `attendance.css:553-619` | Monitoramento detalhado |
| Barra do contato | `pages/flow/barra-of-contact.tsx:108` | ícone `reticencias` | `attendance.css` / `global.css` | Casca do contato |

**Existe na Blip?** Ações por linha: sim (3 ações). Barra do contato com reticências: sem evidência nas fichas; captura pendente (provável peça própria do Pipe: fora da unificação até confirmar).

**Proposta:** reescrever `TicketActions` guiado por medida, com fechar por Esc/clique fora e setas. Não há segunda tela na Blip que use a mesma barra: sem componente compartilhado (D-06). Telas a verificar: Monitoramento detalhado. Plano que executa: 03.2-09.

---

## Popover de filtro rápido

**Blip:** filtros em pílulas no cabeçalho e painel lateral "Filtros" com "Limpar tudo"/"Aplicar" (FICHA-monitoring §3/§5; FICHA-history). O estado aberto do popover por pílula não consta nas fichas: sem evidência; captura pendente (D-10).

**Pipe:**

| Variante | Arquivo:linha | Classes CSS | Onde o CSS mora | Telas que usam |
|---|---|---|---|---|
| Pílula gatilho com `aria-haspopup="dialog"` | `components/filters-quick.tsx:31,47` | `.pilula`, `.pilula.active`, `.at-filter-trigger`, `.pilula-rotulo` | `global.css:994-1043`; `attendance.css:179-199` | Monitoramento, Monitoramento detalhado |
| Pílula sem `aria-haspopup` | `pages/operation/history.tsx:265-285`; `pages/operation/reports-attendance.tsx:223-234` | `.pilula`, `.pilula.active` | `global.css` | Histórico, Relatório de atendimento |
| Painel lateral | `components/panel-filters.tsx` | sem popover identificado por grep | n/a | Filtros |
| `aria-haspopup="listbox"` | `select.tsx:116`, `closure-ticket.tsx:66`, builder, membros | outro padrão (Select) | n/a | fora do Atendimento; fora da unificação (D-06) |

**Existe na Blip?** Pílula gatilho: sim (pílulas de filtro). Popover aberto: sem evidência. Painel lateral "Filtros": sim. Variante com `listbox`: não é popover de filtro; não alterar.

**Proposta:** unificar só o que a captura do estado aberto confirmar. Hoje a pílula tem 2 formas (com e sem `at-filter-trigger`/`aria-haspopup`); padronizar o atributo de acessibilidade nas 3 telas. Plano que executa: 03.2-10.

---

## Menu de três pontos

**Blip:** sem evidência nas fichas de um menu ⋮ (nenhuma ficha o cita). Pode existir nas capturas de HTML; captura pendente. Até confirmar, não assumir uso em 2+ telas (D-06).

**Pipe:**

| Variante | Arquivo:linha | Classes CSS | Onde o CSS mora | Telas que usam |
|---|---|---|---|---|
| Menu de ações do ticket | `components/monitoring-detailed.tsx:146` (`role="menu"`, `role="menuitem"`, destrutivo com `perigo`) | `.mon-menu-actions`, `.mon-reticencias` | `attendance.css:567,629-703,1535` | Monitoramento detalhado |
| Reticências na barra do contato | `pages/flow/barra-of-contact.tsx:108` | ícone `reticencias` | n/a | Casca do contato |
| Menus do Builder | `pages/builder/canvas.tsx:398,421`; `panel-actions.tsx:370`; `panel-content.tsx:227` | `.bl-menu-actions` | Builder | Builder |

**Existe na Blip?** Menu do ticket: sem evidência; captura pendente. Reticências da barra do contato: sem evidência. Menus do Builder: fora do Atendimento; fora da unificação (D-06), não alterar.

**Proposta:** não criar componente único agora. Corrigir o menu inline em `TicketActions` (Esc, clique fora, setas) no plano 09; extrair para `packages/ui` só se a captura provar uso em 2+ telas. Plano que executa: 03.2-09.

---

## Cartão

**Blip:** cartões de métricas do Monitoramento (4 cartões com "Atualizar tela" e "Expandir tela", FICHA-monitoring §5); cartões-linha de fila e regra (FICHA-rules, FICHA-queue-management: rótulo sobre valor). Aparências distintas: no mínimo 2 (cartão de métrica, cartão-linha); sem medição.

**Pipe:**

| Variante | Arquivo:linha | Classes CSS | Onde o CSS mora | Telas que usam |
|---|---|---|---|---|
| `.card` + `.card-cabecalho` | `pages/operation/monitoring.tsx:83,176,329` | `.card`, `.card-cabecalho`, `.mon-error` | `global.css:1345-1370` | Monitoramento |
| `.metric` (`Metrica`) | `pages/operation/monitoring.tsx:368` e `MetricaCarregando` | `.metric`, `.v`, `.k` | `global.css:1419-1465` | Monitoramento, satisfação, relatório |
| `card-config` | `components/card-config.tsx` | definido no componente | n/a | `monitoring`, `reports-attendance`, `reports-satisfaction`, `settings-general`, `flow/cards`, `analytics` |
| Cartão-linha de regra/fila | `components/lista-regras.tsx` | classes próprias | n/a | Regras, Filas |

**Existe na Blip?** `.card`/`.metric`: sim (monitoring). `card-config`: sim em `settings-general` (FICHA-general-settings), sem medição. Cartões de `flow/cards`, `analytics`, `payments`: fora do Atendimento; fora da unificação (D-06).

**Proposta:** só unificar o que a medição mostrar igual; o núcleo `.card`/`.metric` já mora em `@pipe/ui`. Telas a verificar: Monitoramento, satisfação, relatório, configurações gerais. Plano que executa: 03.2-23.

---

## Pílula/etiqueta

**Blip:** pílulas de filtro no cabeçalho (FICHA-monitoring §3, FICHA-history) e etiquetas de ticket. Aparências: 2 (pílula de filtro com rótulo e valor; etiqueta/tag); sem medição.

**Pipe:**

| Variante | Arquivo:linha | Classes CSS | Onde o CSS mora | Telas que usam |
|---|---|---|---|---|
| Pílula de filtro | `components/filters-quick.tsx:31-52`; `pages/operation/history.tsx:265-285`; `pages/operation/reports-attendance.tsx:223-234` | `.pilula`, `.active`, `.pilula-rotulo`, `.pill-value` | `global.css:994-1043` | Monitoramento, Histórico, Relatório |
| Pílula esqueleto | `pages/operation/monitoring.tsx:213-228` | `.mon-esqueletico.pilula`, `.larga` | `attendance.css` | Monitoramento (carregando) |
| `.pill`/`.etiqueta` | sem uso identificado neste grep em telas do Atendimento | `.pill`, `.etiqueta` | `@pipe/ui` (citado em `global.css:5`) | a confirmar |

**Existe na Blip?** Pílula de filtro: sim. Esqueleto: não se aplica (estado de carregamento; fora da unificação, D-06). Etiqueta: sim em tickets (FICHA-encerrar-ticket/monitoring), sem medição.

**Proposta:** manter `.pilula` único (já é); nenhuma unificação nova sem medida. Plano que executa: 03.2-10 (junto ao popover).

---

## Modal e painel lateral

**Blip:** modais de Transferir, Finalizar ticket, criar/editar fila (FICHA-encerrar-ticket, FICHA-queue-management), adicionar membro de equipe (FICHA-equipe). Edição de fila abre outra página, não modal (FICHA-atendentes-filas-pausas: "a parte de edição de fila abre uma outra pagina"). Painel lateral direito "Filtros" (FICHA-monitoring §5). Aparências: modal e painel lateral, 2 famílias.

**Pipe:** casca única `packages/ui/src/components/modal.tsx` (`Modal`, `ConfirmModal`), importada em cerca de 25 arquivos (`grep "@pipe/ui/modal"`): Atendimento em `components/monitoring-detailed.tsx:16`, `pages/registrations/agents-breaks.tsx:9`, `agents-queues.tsx:12`, `agents-management.tsx:12`, `agents-queues-edit.tsx:17`, `regras-sla.tsx:8`, `rules-attendance.tsx:9`; Portal/Builder/Fluxo nos demais; Desk em `apps/desk-vite/src/pages/attendances/composer.tsx:5` e `conversation.tsx:19`. Painel lateral: `components/panel-filters.tsx`.

| Variante | Arquivo:linha | Classes CSS | Onde o CSS mora | Telas que usam |
|---|---|---|---|---|
| `Modal` | `packages/ui/src/components/modal.tsx` | `skin` por prop | `packages/ui` | Atendimento, Portal, Builder, Desk |
| `ConfirmModal` | idem | idem | idem | idem |
| Modais do ticket | `components/modal-finalizar-monitoring.tsx`; `ModalTransferMonitoring` em `monitoring-detailed.tsx:155` | herdam `Modal` | idem | Monitoramento detalhado |
| Painel lateral de filtros | `components/panel-filters.tsx` | próprias | `attendance.css` | Filtros |

**Existe na Blip?** Modais de Transferir/Finalizar: sim. `ConfirmModal` de remoção: sem evidência nas fichas lidas de que a Blip pede confirmação nessas telas; captura pendente. Painel "Filtros": sim. Modal usado no Desk: fora do escopo; não alterar (Desk usa o mesmo `Modal`, toda mudança em `modal.tsx` o afeta).

**Proposta:** não tocar em `modal.tsx` (compartilhado com o Desk). Modais novos (Exportar, Enviar por e-mail) reutilizam a casca, com o padrão de chamada/erro de `modal-finalizar-monitoring.tsx`. Verificação de regressão: abrir Transferir e Finalizar. Plano que executa: os de fluxo do ticket e Histórico (03.2-09 e seguintes); este censo não atribui plano de unificação.

---

## Resumo: o que unificar e o que não tocar

| Padrão | Unificar? | Plano |
|---|---|---|
| Paginação (`grade` + `lista`) | Só se a medição confirmar mesma aparência | 03.2-07 |
| `.tblwrap` (definição dupla) | Sim, sem reordenar cascata | 03.2-08 |
| Barra/ações do ticket | Reescrever guiado por medida; sem componente compartilhado | 03.2-09 |
| Menu ⋮ | Não criar componente único sem evidência de 2+ telas | 03.2-09 |
| Popover e pílula de filtro | Padronizar atributos; estado aberto exige captura | 03.2-10 |
| Cartão | Só o que a medição mostrar igual | 03.2-23 |
| Modal | Não tocar na casca | n/a |

Fora da unificação (D-06, não alterar): paginação `portal`, menus do Builder, esqueletos `mon-esqueletico`, `Select` com `listbox`, cartões de Fluxo/Crescimento/Analytics, `Modal` compartilhado com o Desk.

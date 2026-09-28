---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 44
subsystem: ui
tags: [react-router, management-vite, routing, navigation, blip-parity]

requires:
  - phase: 01-43
    provides: "short_name único por tenant entre fluxos vivos + GET /v1/management/flows/short-name/:shortName"
provides:
  - "Gestão inteira sob /application no formato D-52 (Blip): árvore única /application/detail/:shortName, criação em /application/create/*, telas de tenant em /application/*"
  - "Construtor de caminho único (lib/application-paths.ts): flowPath, createPath, createNamePath, tenantPath, legacyTarget, renameContactSubpath"
  - "Redirects client-side de toda URL pré-D-52 (pages/legacy-redirects.tsx), preservando path/query/hash"
  - "26 segmentos renomeados para o nome da Blip (D-54) onde há evidência; nosso nome preservado onde não há"
affects: ["01.1-subdominio-por-tenant", "01-45"]

tech-stack:
  added: []
  patterns:
    - "Um único módulo de construção de caminho (lib/application-paths.ts) consumido por toda a árvore de rotas, menus e redirects — nenhum componente monta caminho à mão"
    - "Tabela old→new como array de tuplas [prefixo, novoPrefixo] percorrida em ordem de especificidade (filho antes do pai) para renomear sub-caminhos herdados de links antigos"
    - "Passo de wizard como rota própria (D-31/D-52) em vez de :passo?/?passo=; passo de nome compartilhado entre os dois wizards (PageCreateName) porque a Blip usa o mesmo template para os dois"

key-files:
  created:
    - apps/management-vite/src/lib/application-paths.ts
    - apps/management-vite/src/pages/legacy-redirects.tsx
    - apps/management-vite/src/pages/create/name/page.tsx
    - apps/management-vite/tests/application-routes.test.ts
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/deferred-items.md
  modified:
    - apps/management-vite/src/App.tsx
    - apps/management-vite/src/pages/flow/contact.tsx
    - apps/management-vite/src/pages/flow/itens.ts
    - apps/management-vite/src/pages/flow/barra-of-contact.tsx
    - apps/management-vite/src/pages/create/flow/page.tsx
    - apps/management-vite/src/pages/create/flow/actions.ts
    - apps/management-vite/src/pages/create/router/page.tsx
    - apps/management-vite/src/pages/create/router/actions.ts
    - apps/management-vite/src/pages/create/casco.tsx
    - apps/management-vite/src/pages/create/gravar.ts
    - apps/management-vite/src/pages/operation/shell.tsx (attendanceBase por contact, não tipo/id)
    - apps/management-vite/src/lib/inbound.ts (DESTINATION_DEFAULT, caminhoInterno fecha T-01-44-01)
    - apps/management-vite/src/lib/shell.ts
    - apps/management-vite/src/lib/passos-of-deployment.ts (montarPassos recebe o shortName do fluxo principal)
    - apps/management-vite/src/components/exigir-session.tsx
    - apps/management-vite/src/components/barra-do-portal.tsx
    - apps/management-vite/src/pages/portal.tsx (FlowOfPortal.shortName)
    - apps/management-vite/src/pages/contract/catalogo.ts
    - apps/api/src/controllers/management-flow.ts (ResultOfContact +shortName)
    - apps/api/src/domain/management/cycle-of-lifetime-of-flow.ts (createFlow +shortName; FlowWritten.shortName não-nulo)
    - apps/api/src/domain/management-flow.ts (carregarGradeDoPortal +shortName)
    - packages/contracts/src/management-flow.ts (FlowOfPortal +shortName; ContactOfFlow/RouterService não-nulos)

key-decisions:
  - "D-52/D-54 aplicadas: árvore única /application/detail/:shortName (sem segmento de tipo), criação em /application/create/{marketplace,test,router,name/:template}, telas de tenant em /application/{tenant,product-updates,deployment,switch-account}"
  - "welcome e my-account ficam na raiz (evidência: blip-routes-raw.txt não prefixa nenhum dos dois com /application, ao contrário de vizinhos como /application/product-updates e /application/tenant/permission-groups, ambos com prefixo)"
  - "auth.application.create.test não tem url: próprio na Blip (ausente das 172 rotas extraídas); mantido nosso nome 'test' (fallback do plano)"
  - "growth/tracked-links mantém nosso nome em vez do 'clicktracker' da tabela route-inventory.md §2 — Blip's clicktracker já nomeia growth/clicktracker (mesma tela, Click-to-WhatsApp); adotar a tabela ao pé da letra colidiria duas telas no mesmo endereço"

requirements-completed: [STD-05, STD-12]

duration: ~5h (com uma interrupção do ambiente, ver Issues Encountered)
completed: 2026-09-28
---

# Fase 1 Plano 44: Rotas da Gestão no formato /application (D-52) Summary

**Gestão migrada de duas árvores (`/flow/:id`, `/router/:id`) e `/portal`/`/create/*` soltos para uma árvore só sob `/application`, no formato de URL da Blip, com 26 segmentos renomeados (D-54) e redirect client-side de toda URL antiga.**

## Performance

- **Duração:** ~5h (uma falha do ambiente — cygwin/bash travou por um período — interrompeu a sequência de verificação no meio do Task 2; retomada assim que o shell voltou a responder)
- **Concluído:** 2026-09-28
- **Tarefas:** 2/2 concluídas
- **Arquivos modificados:** ~70 (management-vite) + 4 (api/contracts)

## Accomplishments

- `apps/management-vite/src/lib/application-paths.ts`: construtor de caminho único — `flowPath(shortName, ...rest)`, `createPath('marketplace'|'test'|'router')`, `createNamePath(template)`, `tenantPath(segment)`, `legacyTarget(pathname, search, hash)` (tabela old→new completa) e `renameContactSubpath(rest)` (26 pares D-54, prefixo mais específico primeiro).
- `App.tsx` reestruturado: a árvore de filhos do contato (`contactRoutes`) monta UMA vez em `/application/detail/:shortName`; `ContactRoute` (`pages/flow/contact.tsx`) resolve o contato por `GET /v1/management/flows/short-name/:shortName` (API do plano 01-43), sem mais redirecionar por prefixo de tipo — não existe mais segmento de tipo para errar.
- Criação: três rotas (`/application/create/marketplace`, `/application/create/test`, `/application/create/router`) mais uma rota de passo de nome compartilhada (`/application/create/name/:template`, `pages/create/name/page.tsx`) que decide fluxo vs. roteador pelo valor de `:template` (`master` = roteador; `blip_deskCustomerService` = veio do modelo pronto; `builder` = do zero; qualquer outro valor redireciona para o marketplace). `?passo=`/`:passo?` não existem mais em lugar nenhum do código (conferido).
- `pages/legacy-redirects.tsx`: `LegacyRedirect` cobre `/portal`, `/create/*`, `/updates`, `/contract/*`, `/deployment`, `/switch-account/*` via `legacyTarget`; `LegacyContactRedirect` cobre `/flow/:id/*` e `/router/:id/*`, resolvendo o `id` pela API e reaplicando `renameContactSubpath` ao resto do caminho antes de montar o `flowPath` novo. Os dois preservam query e hash com `replace`.
- Os 26 pares de `route-inventory.md` §2 aplicados aos segmentos sob `/application/detail/:shortName/*` (contacts→users, services→templates/pipeline, builder→templates/builder, settings→configurations, analytics/report-manager→data-extractor, growth/ads→adsbuying, growth/payments→paymentsReport, e toda a árvore de atendimento: agents/queues→queue-management, agents/management→team[/create|/edit|/permission], agents/breaks→personalizedbreaks, communication/templates→message-template, communication/canned-responses→replies, rules/attendance→rules, rules/sla→sla-policy, rules/hours→attendance-hours, reports/attendance→report, reports/effort→effort, reports/satisfaction→survey-dashboard, quality-review→quality-assurance), com UMA exceção documentada (`growth/tracked-links`, ver Decisions).
- Toda a cadeia de consumidores do antigo `contactBase(tipo, id)`/`contactPrefix` (menus, cards, breadcrumbs, formulários, ~35 arquivos) passou a usar `contactPath(contact)`/`flowPath(shortName, ...)`/`attendanceBase(contact)`, todos delegando ao construtor único.
- `apps/api`: `createFlow` (criação de fluxo/roteador) agora devolve `shortName` — necessário para `create/flow/actions.ts` e `create/router/actions.ts` navegarem direto para `flowPath(shortName)` do contato recém-criado, em vez do antigo `/flow/${id}`/`/router/${id}`. `FlowOfPortal` (grade do portal) ganhou `shortName`, usado pelo cartão de cada fluxo na lista (`portal.tsx`) para linkar com o novo formato.
- `lib/inbound.ts`: fechada uma lacuna de open redirect no `caminhoInterno` (T-01-44-01 do modelo de ameaça deste plano) — `/\evil` passava no filtro antigo (`startsWith('/') && !startsWith('//')`) porque um navegador trata `\` como `/`; agora também é recusado.
- `lib/passos-of-deployment.ts`: `/canais` e `/atendentes/filas` (que nunca foram rotas válidas) viraram `flowPath(shortName, 'channels')` e `flowPath(shortName, 'attendance/queue-management')` do fluxo mais recente do tenant (lido pela tela via a mesma grade do portal); sem fluxo nenhum, caem em `/application`.

## Task Commits

1. **Task 1: Árvore /application, rota de detalhe por shortName, criação e redirects** - `05f4328e` (feat)
2. **Task 2: Todos os links, menus e destinos da Gestão pelo construtor único** - _(a seguir, ver commit final desta SUMMARY)_

**Plan metadata:** commit deste SUMMARY (a seguir)

## Files Created/Modified

Ver `key-files` no frontmatter. Lista completa nos dois commits de task (`git show --stat 05f4328e` e o commit seguinte).

## Decisions Made

- **welcome/my-account na raiz:** as três linhas "confirmar" da tabela do plano foram checadas contra `blip-routes-raw.txt` (extração das 172 rotas declaradas nos bundles da Blip, `.planning/phases/01.1-subdominio-por-tenant/`): `/welcome` e `/welcome?tenant-invitation` (linhas 168-169) e `/account?activeTab` (linha 5) aparecem SEM prefixo `/application`, ao contrário de vizinhos igualmente extraídos da mesma lista como `/application/product-updates` (linha 28) e `/application/tenant/permission-groups` (linha 35). Mantidas na raiz (`/welcome`, `/my-account`), sem mudança de código nesse ponto.
- **`test` sem URL própria na Blip:** a mesma extração de 172 rotas não lista `/application/create/test`; só existe um handler `$stateChangeStart` citando `auth.application.create.test` pelo nome (`referencias-blip/atendimento/analytics-dashboard/supernova.blip.ai/portal.js:25285`), sem `url:`. Mantido nosso nome `test` (fallback previsto no próprio plano).
- **`growth/tracked-links` foge da tabela:** `route-inventory.md` §2 lista `tracked-links → clicktracker`, mas o `clicktracker` da Blip já nomeia a tela `growth/clicktracker` (Click-to-WhatsApp), que já bate o nome. Links rastreados é feature só do Pipe (comentário já existente em `growth/navigation.tsx`: "does NOT exist in the origin"). Aplicar a tabela ao pé da letra colidiria as duas telas no mesmo endereço; mantido `tracked-links`, com comentário no código e neste SUMMARY.
- **`shortName` deixou de ser nulável** em `ContactOfFlow`, `RouterService`, `FlowWritten` e `FlowOfPortal` (contratos) — a coluna é `NOT NULL` desde a migração 0051 (plano 01-43), então os tipos `string | null` já estavam desatualizados; isso também elimina checagens de nulo espalhadas por ~15 arquivos que agora dependem de `shortName` para montar caminho.
- **Segmento "team" existe em dois níveis** sem colidir: `/application/detail/:shortName/team` (equipe do contato, já igual à Blip) e `/application/detail/:shortName/attendance/team` (atendentes do módulo de atendimento, renomeado de `agents/management`) — endereços completos diferentes, mesmo nome de folha, sem ambiguidade de roteamento.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Segurança] `caminhoInterno` (open redirect) não recusava `/\evil`**
- **Found during:** Task 2, ao atualizar `lib/inbound.ts` (ação 2 do plano, que já pedia reforçar essa validação)
- **Issue:** O filtro `destination.startsWith('/') && !destination.startsWith('//')` deixava passar `/\evil`, que um navegador normaliza para `//evil` (redirect externo) — exatamente o caso de teste que o próprio `threat_model` deste plano (T-01-44-01) pede para cobrir.
- **Fix:** `caminhoInterno` agora também recusa `destination.startsWith('/\\')`.
- **Files modified:** apps/management-vite/src/lib/inbound.ts
- **Verification:** `pnpm --filter @pipe/management-vite typecheck` limpo; comportamento coberto por leitura de código (não há teste de unidade dedicado a `caminhoInterno` no pacote; deixei o `deferred-items.md` registrando o par server-side ainda aberto, ver abaixo).
- **Committed in:** commit de Task 2 (a seguir)

**2. [Rule 1 - Bug] `pages/deployment/page.tsx`'s `PageMonitoring`'s form action apontava para `/monitoramento` (PT), rota inexistente**
- **Found during:** Task 2, ao trocar `attendanceBase(contact.tipo, contact.id)` por `attendanceBase(contact)` em `operation/monitoring.tsx`
- **Issue:** `const base = \`${attendanceBase(contact)}/monitoramento\`` — a rota real é `attendance/monitoring` (inglês); o `<form action={base}>` de fallback sem JS sempre apontaria para um 404.
- **Fix:** Trocado o sufixo para `/monitoring`.
- **Files modified:** apps/management-vite/src/pages/operation/monitoring.tsx
- **Verification:** `pnpm --filter @pipe/management-vite typecheck` e `test` limpos.
- **Committed in:** commit de Task 2 (a seguir)

**3. [Rule 1 - Bug] Quatro `href="/builder"` (nunca foi rota top-level válida) e um placeholder desatualizado no catálogo de menu**
- **Found during:** Task 2, varredura final por `"/builder"`/`'/builder'`
- **Issue:** `pages/portal.tsx` (botão "Criar meu primeiro fluxo" do estado vazio), `pages/flow/analytics/data-dictionary/pages.tsx` e `pages/flow/analytics/dashboard/tela.tsx` (dois links "Builder" dentro de conteúdo do Dicionário de Dados/Dashboard) apontavam para `/builder`, que nunca existiu como rota de topo — sempre foi `/flow/:id/builder`, e antes deste plano não havia como corrigir sem inventar contexto. `itens.ts`'s `CATALOGO` também tinha `href: '/builder'` como valor nunca usado (sempre sobrescrito pelo `.map()`).
- **Fix:** `portal.tsx` aponta para `createPath('marketplace')` (mesmo destino do botão "Criar fluxo" da barra clara); os dois links dentro do contato usam `contactPath(contact)`/`p.base` + `/templates/builder` (novo endereço do Builder, D-54); o placeholder do catálogo virou `/templates/builder`.
- **Files modified:** apps/management-vite/src/pages/portal.tsx, apps/management-vite/src/pages/flow/analytics/data-dictionary/pages.tsx, apps/management-vite/src/pages/flow/analytics/dashboard/tela.tsx, apps/management-vite/src/pages/flow/itens.ts
- **Verification:** `pnpm --filter @pipe/management-vite typecheck`, `test` e `build` limpos.
- **Committed in:** commit de Task 2 (a seguir)

---

**Total deviations:** 4 auto-corrigidos (Rule 1 × 3, Rule 2 × 1)
**Impact on plan:** Todos diretamente relacionados à varredura de links que o próprio plano pede (ação 2 e critério de aceite da Task 2); nenhum é mudança de arquitetura ou escopo além de terminar de apontar cada link para um destino real.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: open-redirect (mesma classe do T-01-44-01, ainda aberto) | apps/api/src/controllers/login.ts:91 | O par server-side do `caminhoInterno` corrigido no front (`destination.startsWith('/') && !destination.startsWith('//')`) tem a MESMA lacuna (`/\evil`), e é a fronteira de segurança real (o front é só UX). Fora do escopo deste plano (`apps/api/**` não está em `files_modified`); registrado em `deferred-items.md` para um plano que toque `apps/api/src/controllers/login.ts`. |

## Issues Encountered

- **Falha do ambiente (bash/cygwin):** no meio da varredura da Task 2, todo o Bash tool (Git Bash) passou a falhar com `*** fatal error - add_item (...) failed, errno 1` em QUALQUER comando, incluindo `echo`, por um período — provavelmente exaustão de processos/handles depois de muitas chamadas consecutivas do tool. Continuei o trabalho só com leitura/edição de arquivo (sem rodar comando nenhum) até o shell voltar a responder sozinho; depois disso rodei toda a bateria de verificação (typecheck, teste, build, runtime-contracts) normalmente, sem perder nenhuma mudança. Nenhum código foi declarado "funcionando" nesse intervalo sem verificação real depois.
- `node tools/std/runtime-contracts.ts --map STD/map --out STD/reports/runtime-contracts-01-44.csv --allow STD/runtime-contracts-allow.csv` — exit 0, "Runtime contracts: clean." (diferente do plano 01-43, que teve débito pré-existente; aqui não achou nada).
- Testes de API (`apps/api/tests/flow-short-name.test.ts` e a suíte completa) NÃO foram rodados por este executor: seguindo a nota do orquestrador para este plano ("API tests from a worktree conflict with the running containers"), as mudanças em `apps/api` (retorno de `shortName` em `createFlow`, seleção em `carregarGradeDoPortal`) foram só typecheckadas (`pnpm --filter @pipe/api typecheck`, limpo) e revisadas por leitura — nenhum teste de API rodou contra banco real neste worktree. Fica para o orquestrador rodar `pnpm --filter @pipe/api test` após o merge.

## User Setup Required

None - nenhuma configuração externa necessária.

## Next Phase Readiness

- A Gestão inteira está sob `/application` no formato D-52; a Phase 01.1 (subdomínio por tenant) pode assumir essa base para o próximo corte de endereçamento.
- `apps/api/src/controllers/login.ts:91` tem o mesmo bug de open redirect que foi corrigido no front deste plano — ver Threat Flags e `deferred-items.md`.
- O plano 01-45 (smoke do dono) ainda não rodou; esta execução termina antes dele, como o plano previa.

---
*Phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o*
*Completed: 2026-09-28*

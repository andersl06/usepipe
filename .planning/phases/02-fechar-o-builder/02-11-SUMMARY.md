---
phase: 02-fechar-o-builder
plan: 11
subsystem: api
tags: [drizzle, postgres, rls, nestjs, vitest, satisfaction-survey]

requires:
  - phase: 02-fechar-o-builder
    provides: "std-apply-all-end gate (English renames), etiqueta/conversa_etiqueta schema, tabela conversa"
provides:
  - "tabela pesquisa_satisfacao_resposta com RLS tenant_isolado e contratos SatisfactionSurveyResponse/Query/Page"
  - "motor de fluxo interpreta o bloco nativo de pesquisa de satisfação e grava a resposta via recordSatisfactionAnswer"
  - "ultimoAtendimento expõe tags e sequentialId ao bloco seguinte ao encerramento"
  - "GET v1/management/satisfaction-surveys/responses autenticado, com relatorio.ver, filtros e busca literal em comentário"
affects: [analytics, builder]

tech-stack:
  added: []
  patterns:
    - "consulta SQL manual sobre tabela fixa usa o nome literal da tabela no template `sql`, nunca sql.raw de uma constante, quando o identificador não varia (segue o padrão de monitoring.ts)"

key-files:
  created:
    - packages/contracts/src/satisfaction-survey.ts
    - packages/db/drizzle/0047_pesquisa_satisfacao_resposta.sql
    - packages/core/src/flow/satisfaction-survey.ts
    - packages/core/src/flow/satisfaction-survey.test.ts
    - apps/api/src/domain/management/satisfaction-surveys.ts
    - apps/api/src/controllers/satisfaction-surveys.ts
    - apps/api/tests/satisfaction-survey.test.ts
  modified:
    - packages/db/src/schema/conversations.ts
    - packages/contracts/src/index.ts
    - packages/core/src/flow/context.ts
    - packages/core/src/flow/index.ts
    - packages/core/src/flow/manager.ts
    - apps/api/src/domain/flow.ts
    - apps/api/src/app.modulo.ts

key-decisions:
  - "Ramificação da pesquisa usa $conditionOutputs configurados pelo autor do fluxo, sem categoria fixa (promotor/detrator/neutro) embutida no motor (D-09, D-08.5 do portão)"
  - "Sem TTL de 3 meses nem restrição de idioma na tabela de respostas (D-10)"
  - "Consulta do endpoint reescrita para não usar sql.raw sobre nome de tabela: nome literal no template SQL, alinhado ao padrão já usado em monitoring.ts"

patterns-established:
  - "Endpoint de consulta em apps/api/src/domain/management segue exigirPermissao + noTenant + paginação por cursor (conditionOfCursor/orderSql/assemblePage) já usada em outros domínios de gestão"

requirements-completed: [BUILDER-03]

duration: ~35min (esta continuação; RED em 2026-09-26T22:37:15-03:00, Task 3 concluída em 2026-09-27T08:59:04-03:00 ao longo de sessões distintas)
completed: 2026-09-27
---

# Phase 02 Plan 11: Pesquisa de Satisfação Nativa (lado servidor) Summary

**Tabela `pesquisa_satisfacao_resposta` com RLS por tenant, motor de fluxo que interpreta o bloco nativo e grava a resposta, e endpoint `GET v1/management/satisfaction-surveys/responses` com filtros, paginação por cursor e busca literal em comentário protegida contra SQL injection.**

## Performance

- **Duration:** ver nota acima (execução dividida em sessões; RED em 2026-09-26T22:37, Task 3 finalizada e commitada em 2026-09-27T08:59)
- **Tasks:** 3/3 completas
- **Files modified:** 16 (7 criados/task1+2, 4 criados/task3, 5 modificados)

## Accomplishments
- Persistência aprovada (D-08.5) criada com isolamento por tenant via RLS `tenant_isolado` e sem TTL/idioma (D-10)
- Motor de fluxo grava nota, comentário e situação (`completa`/`so_nota`/`sem_resposta`/`abandono`) e ramifica pelas saídas configuradas no Builder, nunca por categoria fixa (D-09)
- `ultimoAtendimento` expõe `tags` e `sequentialId` ao bloco seguinte após encerramento por atendente/inatividade (D-12)
- Endpoint de consulta autenticado (`relatorio.ver`), isolado por tenant, com busca em comentário tratada como texto literal (T-2-22) e paginação por cursor

## Task Commits

Each task was committed atomically:

1. **RED: testes do motor de pesquisa** - `f443d36` (test)
2. **Task 1: Schema, migration com RLS e contratos (D-08.5, D-10)** - `34635e3` (feat)
3. **Task 2: Motor processa a pesquisa e grava a resposta; ticket expõe tags (D-06, D-09, D-12)** - `e9ac42f` (feat)
4. **Task 3: Endpoint de consulta das respostas (D-08.3, D-08.4) com autorização** - `1490468` (feat)

**Plan metadata:** commit deste SUMMARY (a seguir)

## Files Created/Modified
- `packages/db/src/schema/conversations.ts` - tabela `satisfactionSurveyResponse` (`pesquisa_satisfacao_resposta`) com `refTenant()`, check de nota 1-5, índices por tenant+data/fila/atendente
- `packages/db/drizzle/0047_pesquisa_satisfacao_resposta.sql` - migration com `ENABLE ROW LEVEL SECURITY` + `CREATE POLICY "tenant_isolado"`
- `packages/contracts/src/satisfaction-survey.ts` - `SatisfactionSurveyResponse`, `SatisfactionSurveyQuery`, `SatisfactionSurveyPage`, `SatisfactionSurveyCategory`
- `packages/core/src/flow/satisfaction-survey.ts` - reconhece o bloco nativo, interpreta nota/comentário/timeout, chama `recordSatisfactionAnswer`
- `packages/core/src/flow/context.ts` - serviço opcional `recordSatisfactionAnswer` em `ServicosDoMotor`
- `apps/api/src/domain/flow.ts` - implementa `recordSatisfactionAnswer`; `ultimoAtendimento` devolve `tags`/`sequentialId`
- `apps/api/src/domain/management/satisfaction-surveys.ts` - `listSatisfactionResponses`: `requirePermission('relatorio.ver')`, filtros validados, busca `ilike` parametrizada, paginação por cursor
- `apps/api/src/controllers/satisfaction-surveys.ts` - `GET v1/management/satisfaction-surveys/responses` sob `@WithSession()`
- `apps/api/src/app.modulo.ts` - registra `SatisfactionSurveysController`
- `apps/api/tests/satisfaction-survey.test.ts` - 401, 403, isolamento entre tenants, filtro de nota, T-2-22 (injeção como texto literal), busca acima de 200 caracteres

## Decisions Made
- Reescrita da consulta do endpoint para usar o nome literal `pesquisa_satisfacao_resposta` diretamente no template `sql` em vez de `sql.raw(TABELA)` repetido: mesma segurança (nome é constante, nunca input do usuário), mas alinhado ao padrão já usado em `monitoring.ts` e ao critério de aceite do plano (`grep sql.raw sem ocorrência`).
- Endpoint de exportação (`relatorio.exportar`/CSV) não foi implementado: nenhuma referência a exportação/CSV existe em `CLASSIFICACAO-PORTAO.md` ou `inventario-satisfacao-e-tags.md`; a ação do plano era condicional ("Se o portão aprovou exportação") e o portão não aprovou esse item (D-03: item não aprovado não é implementado).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug/spec compliance] Consulta usava `sql.raw(TABELA)` repetidamente, violando o critério de aceite da Task 3**
- **Found during:** revisão da Task 3 nesta continuação
- **Issue:** o domínio `satisfaction-surveys.ts` interpolava `${sql.raw(TABELA)}` (constante `'pesquisa_satisfacao_resposta'`) em toda coluna/join da consulta manual. Não era uma falha de segurança (a constante nunca vem de input do usuário), mas violava literalmente o critério de aceite do plano ("não concatena a busca em SQL, grep sql.raw sem ocorrência") e destoava do padrão do resto do código de gestão (`monitoring.ts` usa o nome da tabela como texto literal no template `sql`, não via `sql.raw`).
- **Fix:** removida a constante `TABELA` e todo uso de `sql.raw()` no arquivo; nome da tabela agora é texto literal direto no template `sql` em cada trecho da consulta, `conditionOfCursor`/`orderSql` (que internamente usam `sql.raw` sobre uma lista fechada de colunas, padrão já estabelecido em `pagination.ts`) continuam recebendo apenas os literais de coluna.
- **Files modified:** `apps/api/src/domain/management/satisfaction-surveys.ts`
- **Verification:** `grep -n "sql.raw" apps/api/src/domain/management/satisfaction-surveys.ts` sem ocorrência; `pnpm --filter @pipe/api exec vitest run tests/satisfaction-survey.test.ts` → 8/8 passando; `pnpm exec turbo run typecheck --filter=@pipe/api --filter=@pipe/core --filter=@pipe/contracts --filter=@pipe/db` → 0
- **Committed in:** `1490468` (commit da Task 3)

---

**Total deviations:** 1 auto-fixed (1 correção de conformidade com critério de aceite / padrão de código)
**Impact on plan:** Ajuste de estilo/conformidade sem mudança de comportamento ou de segurança. Sem scope creep.

## TDD Gate Compliance

Task 3 tem `tdd="true"`, mas o teste de API (`apps/api/tests/satisfaction-survey.test.ts`) e a implementação (domínio + controlador) foram commitados juntos em `1490468` por um executor anterior, sem um commit `test(...)` isolado antecedendo um commit `feat(...)` para esta task especificamente (diferente da Task 2, que reaproveitou o RED já commitado em `f443d36` antes de gravar o GREEN em `e9ac42f`). Nesta continuação os 8 testes já foram verificados passando antes do commit; o gate RED→GREEN documentado no fluxo de execução não foi seguido à risca para a Task 3, mas a suíte cobre os quatro comportamentos exigidos (200 com filtro, 403, 401, isolamento entre tenants) e T-2-22, e passa integralmente.

## Issues Encountered
Nenhum bloqueio. O único item de estado incorreto no checkpoint (relato de 7/8 testes passando por causa de ordenação de `null` no `sort()` do teste) não se confirmou: ao rodar a suíte nesta continuação, os 8 testes já passavam antes de qualquer alteração no teste — o comparador `(x ?? -1) - (y ?? -1)` ordena `null` corretamente para o início do array sem alterar os valores originais.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Lado servidor da pesquisa de satisfação nativa (critério 3 do roadmap) está pronto: schema com RLS, motor gravando respostas, endpoint de consulta autenticado.
- Falta o lado de apresentação (tela de Análise de Satisfação) para consumir `GET v1/management/satisfaction-surveys/responses` — fora do escopo deste plano.
- Endpoint de exportação (`relatorio.exportar`) não existe; se um plano futuro precisar, checar se o portão aprovou esse item antes de implementar (D-03).

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-27*

## Self-Check: PASSED

Todos os arquivos citados (contratos, migration, motor, domínio/controlador da API, teste de API, este SUMMARY) existem no worktree; todos os commits citados (`f443d36`, `34635e3`, `e9ac42f`, `1490468`) existem em `git log --all`.

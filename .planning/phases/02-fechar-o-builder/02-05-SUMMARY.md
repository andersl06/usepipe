---
phase: 02-fechar-o-builder
plan: 05
subsystem: api
tags: [bullmq, process-http, flow-engine, regression-tests, postgres]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder
    provides: 02-CONTEXT.md (D-25, D-26, D-27, D-28 — wave técnica do motor), .planning/debug/process-http-auto-resume.md (diagnóstico do duplicate-key), std/map aplicado (tag std-apply-all-end)
provides:
  - "packages/core/src/flow/manager.ts: retomada de ProcessHttp correta em $enteringCustomActions (não só em $leavingCustomActions), com regressão em manager.test.ts"
  - "apps/api/src/domain/flow.ts: recoverStuckProcessHttp(limiteMs) — varredura que recupera process_http_execucao presa em 'chamando' com resposta sintética de timeout e alerta estruturado"
  - "apps/api/src/queues.ts: fila/scheduler/worker BullMQ dedicados ('process-http-sweep') para a varredura em produção, além do modo memória já existente"
  - "apps/api/tests/process-http-retomada.test.ts: regressão explícita do duplicate-key (D-27) e dois testes novos da varredura (D-26, positivo e negativo)"
affects: [02-09 (validação com fluxos reais, motor precisa estar correto), qualquer plano futuro do Builder que exponha ProcessHttp em ações de entrada sem restrição]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Segunda metade de um ProcessHttp (claim → resposta → retomada → catch-up de mensagens pendentes → estado 'retomada') extraída para uma função privada compartilhada (resumeCallOfProcessHttp), reaproveitada tanto pelo caminho normal (resposta HTTP real) quanto pela varredura de recuperação (resposta sintética de timeout)."
    - "Varredura cross-tenant: SELECT via databaseOwner() (bypassa RLS, não conhece o tenant a priori) seguido de trabalho por linha dentro de noTenant(tenantId, tx) — mesmo padrão de midiasPendentes/conversationsForCheckSla."

key-files:
  created: []
  modified:
    - packages/core/src/flow/manager.ts
    - packages/core/src/flow/manager.test.ts
    - apps/api/src/domain/flow.ts
    - apps/api/src/queues.ts
    - apps/api/src/servidor.ts
    - apps/api/tests/process-http-retomada.test.ts
    - .planning/todos/completed/process-http-entering-actions.md
    - .planning/todos/completed/process-http-bullmq-sweep.md

key-decisions:
  - "D-25 corrigido no ponto comum: ações de entrada de um estado só rodavam uma vez, logo após a transição; numa retomada o motor restaurava o estado e caía direto nas ações de conteúdo, pulando o resto das ações de entrada. Fix: antes do loop principal, se o cursor pendente aponta para a lista 'entrada' do próprio estado restaurado, termina essas ações primeiro."
  - "D-26 implementado com fila BullMQ dedicada ('pipe-process-http-sweep', scheduler 'process-http-sweep') em vez de reaproveitar a fila principal do ProcessHttp, como o plano pediu explicitamente ('fila própria') — evita misturar o scheduler periódico com o jobId por processoId/attempts:1 da fila principal."
  - "recoverStuckProcessHttp retorna {tenantId, processoId}[] em vez de string[] puro: uma única varredura pode recuperar linhas de tenants diferentes, e o reenfileiramento via enfileirarProcessHttp precisa do tenantId correto por id (desvio da assinatura literal do plano, documentado abaixo como Rule 2)."
  - "D-27 já estava corrigido no código antes desta plan (commit 8dac98b, idProvedorUsado = Boolean(retomada)); o trabalho aqui foi só reforçar a regressão com uma asserção explícita de contagem e provar por mutação manual (revertida) que a proteção realmente segura o bug."

requirements-completed: [BUILDER-01]

# Metrics
duration: ~40min
completed: 2026-09-26
---

# Phase 2 Plan 05: Wave técnica do motor — ProcessHttp (retomada em ações de entrada e varredura BullMQ) Summary

**ProcessHttp agora retoma corretamente quando suspende em `$enteringCustomActions` de qualquer estado (não só em `$leavingCustomActions`), e uma varredura BullMQ dedicada recupera em produção qualquer `process_http_execucao` presa em `'chamando'`, com resposta sintética de timeout e alerta estruturado — fechando os dois todos dobrados e reforçando a regressão do duplicate-key já corrigida.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-09-26T23:50:00Z (aprox., baseado no primeiro commit da plan)
- **Completed:** 2026-09-27T00:09:54Z
- **Tasks:** 3/3 completed
- **Files modified:** 8

## Accomplishments

- Reproduziu por teste (antes do fix) o bug real do D-25: um `ProcessHttp` na lista de entrada de um estado (`$enteringCustomActions`) suspendia normalmente, mas na retomada o motor restaurava o estado e processava direto as `outputActions`, pulando silenciosamente as ações de entrada seguintes (ex.: `SendMessage "depois"` nunca era enviado).
- Corrigiu no ponto único e comum de `processInbound` (não por lista/caminho especial): antes do laço principal, se existe um cursor pendente de retomada apontando para a lista `'entrada'` do próprio estado já restaurado, o motor termina essas ações primeiro.
- Confirmou que o caso de fluxo-nível (`fluxo.inputActions` global, `estadoId: null`) já funcionava corretamente antes do fix — só o caso por-estado estava quebrado; os dois cenários (A e B do plano) e a regressão do caso que já funcionava (C, teste pré-existente) seguem verdes.
- Extraiu a segunda metade de `executarProcessHttp` (claim → resposta → retomada → catch-up de mensagens pendentes → `estado = 'retomada'`) para `resumeCallOfProcessHttp`, reaproveitada por `recoverStuckProcessHttp` — sem duplicar a lógica de retomada.
- Implementou `recoverStuckProcessHttp(limiteMs)`: varre `process_http_execucao` presa em `'chamando'` além do limite (`for update skip locked`, lote ≤100, cross-tenant via `databaseOwner()`), grava uma resposta sintética `{status: 408, corpo: ''}` no mesmo formato que a resposta HTTP real, emite `console.error('[alert] process_http_stuck', {tenantId, processoId, desde})` e devolve os novos `ProcessHttp` que a retomada tenha produzido.
- Ligou a varredura ao modo BullMQ em `apps/api/src/queues.ts`: fila dedicada `pipe-process-http-sweep`, `upsertJobScheduler('process-http-sweep', ...)` e um `Worker` de concorrência 1, chamados no bootstrap (`servidor.ts`) independentemente do modo — o ramo memória existente continua intacto.
- Reforçou a regressão do D-27 (duplicate-key) com uma asserção explícita (`contagemDeMensagensComId(msgAna) === 1`) e provou por mutação manual (`idProvedorUsado = false`, revertida) que o teste realmente falha com `duplicate key value violates unique constraint "execucao_passo_entrada_uk"` sem a guarda.
- Fechou os dois todos dobrados (`process-http-entering-actions.md`, `process-http-bullmq-sweep.md`) com rastreio de commit.

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 0: Pre-flight Gate** - sem commit (só verificação; tag `std-apply-all-end` presente, plano liberado)
2. **Task 1: Retomada de ProcessHttp em `$enteringCustomActions`** - `e096ec0` (fix)
3. **Task 2: Varredura BullMQ + reforço da regressão D-27** - `34165ac` (feat)
4. **Task 3: Fechar os todos dobrados** - `a21f2de` (docs), corrigido em `0d146ed` (fix — ver Deviations #3)

**Plan metadata:** `eafc300` (SUMMARY.md)

## Files Created/Modified

- `packages/core/src/flow/manager.ts` - Termina as ações de entrada do estado restaurado antes do laço principal, quando o cursor pendente aponta para elas (D-25).
- `packages/core/src/flow/manager.test.ts` - Dois testes novos: ProcessHttp em ações de entrada globais (já funcionava) e por-estado (estava quebrado; prova o fix).
- `apps/api/src/domain/flow.ts` - `resumeCallOfProcessHttp` (extraída, compartilhada) e `recoverStuckProcessHttp(limiteMs)` (nova, exportada) para a varredura de recuperação (D-26).
- `apps/api/src/queues.ts` - Fila/scheduler/worker BullMQ dedicados para a varredura (`scheduleSweepProcessHttp` ganhou o ramo BullMQ; `consumeSweepProcessHttp` novo).
- `apps/api/src/servidor.ts` - Chama `consumeSweepProcessHttp()` no bootstrap, ao lado dos demais consumidores.
- `apps/api/tests/process-http-retomada.test.ts` - Reforço da asserção D-27 e dois testes novos de `recoverStuckProcessHttp` (positivo e negativo); helpers (`falar`, `doBot`, `processoDoContato`) parametrizados por contato para isolar os cenários.
- `.planning/todos/completed/process-http-entering-actions.md`, `.planning/todos/completed/process-http-bullmq-sweep.md` - Movidos de `pending/`, com linha `Resolved:`.

## Decisions Made

- D-25: o fix vive em um único ponto de `processInbound` (antes do laço principal), não em um caminho especial por `lista` — qualquer chamador que restaure um estado com cursor pendente de entrada passa por ele.
- D-26: fila BullMQ **dedicada** para a varredura (`pipe-process-http-sweep`), em vez de reaproveitar a fila principal do ProcessHttp — o plano pediu explicitamente "fila própria"; evita misturar o scheduler periódico com o `jobId`/`attempts: 1` por processo da fila de execução.
- `recoverStuckProcessHttp` retorna `{tenantId, processoId}[]` em vez do `string[]` que o texto do plano sugeria — ver Deviations.
- D-27: nenhuma mudança de código necessária (já corrigido no commit 8dac98b antes desta plan); o trabalho foi só reforçar a prova de regressão.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `recoverStuckProcessHttp` retorna `{tenantId, processoId}[]`, não `string[]`**
- **Found during:** Task 2 (varredura BullMQ)
- **Issue:** O texto do plano sugere `recoverStuckProcessHttp(limiteMs: number): Promise<string[]>` e "devolve os ids para reenfileirar via `enfileirarProcessHttp`". Mas `enfileirarProcessHttp` exige `{tenantId, processoId}` (tipo `JobProcessHttp`), e uma única varredura pode recuperar linhas de **tenants diferentes** na mesma rodada — um `string[]` puro perde a associação de qual tenant cada novo `ProcessHttp` pertence, o que levaria a um reenfileiramento com `tenantId` errado ou vazio (o worker de `consumirProcessHttp` funciona hoje porque reaproveita o `tenantId` do job que o disparou, algo que não existe numa varredura cross-tenant).
- **Fix:** `recoverStuckProcessHttp` devolve `NewProcessHttp[]` (`{tenantId, processoId}`), preenchido a partir do `tenant_id` da própria linha presa que originou cada novo processo. O worker da varredura em `queues.ts` usa esses pares diretamente.
- **Files modified:** `apps/api/src/domain/flow.ts`, `apps/api/src/queues.ts`
- **Verification:** `pnpm --filter @pipe/api typecheck` (0), `pnpm --filter @pipe/api exec vitest run tests/process-http-retomada.test.ts` (3/3 verdes)
- **Committed in:** `34165ac` (Task 2 commit)

**2. [Rule 3 - Blocking] Comando do plano `pnpm banco:subir` não existe mais**
- **Found during:** Task 2 (verify)
- **Issue:** A Phase 1 renomeou os scripts do `package.json` raiz de português para inglês; o script atual é `db:up` (`docker compose up -d postgres redis`), não `banco:subir`.
- **Fix:** Usado `pnpm db:up` (na prática, Postgres/Redis já estavam de pé nesta máquina, confirmado por `docker ps`); o comando de verify do plano foi executado com o nome atual do script.
- **Files modified:** nenhum (só o comando usado, não o `package.json`)
- **Verification:** `docker ps` mostrou `pipe-postgres`/`pipe-redis` saudáveis; suíte rodou normalmente.
- **Committed in:** n/a (não é uma mudança de código)

---

**3. [Rule 1 - Bug] Commit de fechamento dos todos (Task 3) não capturou as linhas `Resolved:`**
- **Found during:** Pós-execução, ao preparar o commit final de tracking (STATE.md/ROADMAP.md)
- **Issue:** O comando de stage da Task 3 passou pathspecs dos caminhos antigos em `pending/` (já removidos pelo `git mv`) junto dos novos em `completed/`; `git add` com um pathspec inválido falha por completo e não estagia nenhum dos caminhos válidos. O commit `a21f2de` (Task 3) capturou só o `git mv`, sem as duas linhas `Resolved: phase 02, plan 02-05 (...)` adicionadas depois via Edit — o `git status --porcelain` só foi conferido depois do commit, então passou despercebido até a checagem de auto-fixes desta seção.
- **Fix:** Novo commit (`0d146ed`) adicionando as duas linhas `Resolved:` que já estavam corretas no disco (a verificação `grep -l "Resolved: phase 02"` do plano passou porque lia o working tree, não o commit).
- **Files modified:** `.planning/todos/completed/process-http-entering-actions.md`, `.planning/todos/completed/process-http-bullmq-sweep.md`
- **Verification:** `git show HEAD:.planning/todos/completed/process-http-bullmq-sweep.md` confirma a linha `Resolved:` presente no commit.
- **Committed in:** `0d146ed`

---

**Total deviations:** 3 auto-fixed (1 missing critical/correção de tipo, 1 blocking/nome de script desatualizado, 1 bug de sequenciamento de commit do próprio executor)
**Impact on plan:** Nenhum afeta o comportamento descrito pelo plano; o primeiro evita um bug real de multi-tenant no reenfileiramento, o segundo é só uma correção de nome de comando por causa do rename da Phase 1, o terceiro corrige um lapso do próprio processo de commit desta execução (conteúdo já estava certo no disco, só não tinha sido gravado no git).

## Issues Encountered

- Nenhum bloqueio. A suíte `apps/api/tests/process-http-retomada.test.ts` precisa de Postgres/Redis reais (integração ponta a ponta via webhook simulado); ambos já estavam no ar nesta máquina.

### Falha observada antes do fix (Task 1, D-25)

Antes do fix em `manager.ts`, `pnpm --filter @pipe/core exec vitest run src/flow/manager.test.ts` reportou:

```
× FlowManager.ProcessInputAsync > ProcessHttp in a state's entering actions ($enteringCustomActions): resumes and sends the action after it exactly once
  → expected [ 'antes' ] to deeply equal [ 'antes', 'depois' ]
```

O teste do cenário de fluxo-nível (ações de entrada globais, `estadoId: null`) já passava antes do fix — confirmando que o bug do D-25 era específico das ações de entrada **por estado**, não do mecanismo de retomada como um todo.

### Falha observada com a mutação manual do D-27 (Task 2)

Com `let idProvedorUsado = Boolean(retomada);` mutado para `let idProvedorUsado = false;` em `apps/api/src/domain/flow.ts` (linha 460), revertida logo em seguida:

```
FAIL tests/process-http-retomada.test.ts > retomada de ProcessHttp > suspende, retoma sem duplicate key, ...
Caused by: error: duplicate key value violates unique constraint "execucao_passo_entrada_uk"

FAIL tests/process-http-retomada.test.ts > varredura de process_http_execucao presa (D-26) > recupera uma linha presa em chamando além do limite e destrava a conversa
AssertionError: expected 'chamando' to be 'retomada'
```

2 de 3 testes falharam com exatamente o erro do bug diagnosticado em `.planning/debug/process-http-auto-resume.md` (`execucao_passo_entrada_uk`), confirmando que a guarda `idProvedorUsado` é o que realmente impede a regressão. A mutação foi revertida antes de qualquer commit (`git diff` confirmado sem a linha mutada).

## User Setup Required

None - nenhuma configuração de serviço externo é necessária. Duas variáveis de ambiente novas têm default embutido e são opcionais: `PIPE_PROCESS_HTTP_VARREDURA_MS` (intervalo do scheduler, default 60000ms) e `PIPE_PROCESS_HTTP_TIMEOUT_MS` (limite para considerar uma linha presa, default 120000ms).

## Next Phase Readiness

- O motor de conversa agora suporta `ProcessHttp` em ações de entrada sem restrição — o Builder não precisa (e não deve) proibir essa combinação, conforme o princípio da fase (D-01 do 02-CONTEXT.md).
- Em produção (modo BullMQ), uma execução presa em `'chamando'` por falha de rede/reinício do worker se recupera sozinha em até `PIPE_PROCESS_HTTP_VARREDURA_MS + PIPE_PROCESS_HTTP_TIMEOUT_MS` (defaults: até ~3min), com alerta estruturado no log — fecha a lacuna de observabilidade que existia antes (nenhum sweep em BullMQ).
- Nenhum bloqueio para os próximos planos da fase; esta wave técnica do motor (D-28) era independente das waves de UI e não altera contratos públicos do Builder.

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-26*

## Self-Check: PASSED

- FOUND: `packages/core/src/flow/manager.ts`
- FOUND: `packages/core/src/flow/manager.test.ts`
- FOUND: `apps/api/src/domain/flow.ts`
- FOUND: `apps/api/src/queues.ts`
- FOUND: `apps/api/src/servidor.ts`
- FOUND: `apps/api/tests/process-http-retomada.test.ts`
- FOUND: `.planning/todos/completed/process-http-entering-actions.md`
- FOUND: `.planning/todos/completed/process-http-bullmq-sweep.md`
- FOUND commit: `e096ec0` (Task 1)
- FOUND commit: `34165ac` (Task 2)
- FOUND commit: `a21f2de` (Task 3)
- FOUND commit: `0d146ed` (Deviation #3 fix)

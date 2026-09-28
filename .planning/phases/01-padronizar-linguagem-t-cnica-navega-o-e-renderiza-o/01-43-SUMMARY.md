---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 43
subsystem: database
tags: [postgres, drizzle, migration, nestjs, flow, short-name]

requires:
  - phase: 01-42
    provides: contrato e testes de API para fluxo (contact/conversationId)
provides:
  - "short_name único por tenant entre fluxos vivos (migração 0051 + índice parcial)"
  - "GET /v1/management/flows/short-name/:shortName"
affects: ["01-44", "01.1-subdominio-por-tenant"]

tech-stack:
  added: []
  patterns:
    - "Migração de backfill em DO $$ ... $$ com row_number() partition/order para desempate determinístico"
    - "Teste de migração usando banco descartável (CREATE DATABASE por teste) para provar comportamento pré/pós migração que o banco compartilhado não consegue mais oferecer"

key-files:
  created:
    - packages/db/drizzle/0051_flow_short_name_unique.sql
    - packages/db/tests/flow-short-name-migration.test.ts
    - packages/db/tests/flow-short-name-migration-helpers.ts
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/d52-db-proof.md
  modified:
    - packages/db/drizzle/meta/_journal.json
    - packages/db/src/schema/automation.ts
    - apps/bridge/src/builder.ts
    - apps/api/package.json
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/ddl-before.sql

key-decisions:
  - "D-52 (dono): colisão de nome passa a ser por nomeCurto(nome) entre fluxos vivos do tenant, não mais por nome exato"
  - "D-54 (dono): nome curto único por conta; colisões existentes ganham sufixo -2, -3"

requirements-completed: [STD-05, STD-12]

duration: TBD
completed: TBD
---

# Fase 01 Plano 43: short_name único por tenant Summary

**Migração 0051 faz backfill + desempate determinístico + NOT NULL + índice único parcial em `fluxo.short_name`, com prova de banco e teste isolado em banco descartável.**

## Performance

- **Tarefas:** Task 1/2 concluída (migração + schema); Task 2 (API) em andamento.
- **Arquivos modificados até aqui:** 9

## Accomplishments (parcial — Task 1)

- Migração `0051_flow_short_name_unique.sql`: backfill de `short_name` nulo com `nomeCurto(nome)` reproduzido em SQL puro (mesmo charset e ordem de operações da função TypeScript), desempate por `row_number() over (partition by tenant_id, short_name order by criado_em, id)` restrito a fluxos vivos, `ALTER COLUMN short_name SET NOT NULL`, e `CREATE UNIQUE INDEX fluxo_short_name_vivo_uk ... WHERE estado <> 'arquivado'`.
- Teste `packages/db/tests/flow-short-name-migration.test.ts`: cria um banco Postgres descartável (`CREATE DATABASE`), migra até (sem incluir) 0051, insere fixtures sujas (nulos, duplicados vivos, um arquivado segurando o mesmo nome), aplica 0051 manualmente e prova os 4 casos do `<behavior>` do plano. O banco compartilhado de dev não serve mais para provar o desempate porque 0051 já rodou nele.
- Prova de banco real (`pnpm db:migrate && pnpm db:seed` no Postgres compartilhado): 0 nulos, 0 duplicados vivos, índice presente com a cláusula parcial esperada — registrada em `std/reports/d52-db-proof.md`.
- `tools/std/ddl-snapshot.sh save` rodado; a fatia do diff relacionada a `short_name` é exatamente a NOT NULL + o índice novo (o resto do diff é de migrações 0043–0050 já mescladas antes deste plano, nunca antes capturadas num `save`).

## Task Commits

1. **Task 1: Migração 0051 (backfill, desempate, NOT NULL, índice único parcial) e schema** - `b4848fc8` (feat)
2. **Task 2: API — colisão por nomeCurto e resolução GET short-name/:shortName** - _pendente_

**Plan metadata:** _pendente_

## Files Created/Modified (Task 1)
- `packages/db/drizzle/0051_flow_short_name_unique.sql` - migração de backfill/desempate/NOT NULL/índice
- `packages/db/drizzle/meta/_journal.json` - entrada idx 51
- `packages/db/src/schema/automation.ts` - `shortName` NOT NULL + `uniqueIndex('fluxo_short_name_vivo_uk')`
- `packages/db/tests/flow-short-name-migration.test.ts` / `-helpers.ts` - prova isolada em banco descartável
- `apps/bridge/src/builder.ts` - insert do fluxo padrão da ponte passa a gravar `short_name`
- `apps/api/package.json` - novo subpath de export `./domain/management/name-rules`
- `.planning/phases/.../std/reports/d52-db-proof.md` - prova de banco
- `.planning/phases/.../std/ddl-before.sql` - novo baseline de DDL

## Decisions Made

- D-52/D-54 do dono aplicadas como especificado no plano; nenhuma decisão nova de arquitetura foi necessária.

## Deviations from Plan (parcial)

### Auto-fixed Issues

**1. [Rule 1/3 - Bug/Blocking] `apps/bridge/src/builder.ts` criava fluxo sem `short_name`**
- **Found during:** Task 1, ao levantar todo ponto que insere `fluxo` (ação 5 do plano)
- **Issue:** O insert do fluxo padrão da ponte (`insert into fluxo (tenant_id, nome, tipo) values (...)`) nunca preenchia `short_name`. Com a migração 0051 tornando a coluna NOT NULL, esse insert passaria a falhar sempre que a ponte precisasse criar o fluxo padrão pela primeira vez.
- **Fix:** Adicionado subpath de export `./domain/management/name-rules` em `apps/api/package.json` (mesmo padrão já usado por `./domain/management/flow-builder`), e a ponte agora importa `nomeCurto` de lá e grava `short_name: nomeCurto(NAME_OF_FLOW)` no insert.
- **Files modified:** apps/bridge/src/builder.ts, apps/api/package.json
- **Verification:** `pnpm --filter @pipe/api build && pnpm --filter @pipe/bridge typecheck` — ambos limpos.
- **Committed in:** b4848fc8 (Task 1 commit)

---

**Total deviations até aqui:** 1 auto-corrigido (Rule 1/3)
**Impact on plan:** Correção necessária para a migração não quebrar um caminho de escrita já existente; sem mudança de escopo.

## Issues Encountered

- `packages/db/src/migrate.ts` (`migrate()`) sempre aponta para a pasta real `packages/db/drizzle`, então não dava para reaproveitá-lo direto para aplicar "tudo menos 0051" num banco descartável. O helper de teste chama `drizzle-orm/node-postgres/migrator` diretamente com uma pasta temporária filtrada, espelhando a lógica de `migrate()` sem o caminho fixo.

## User Setup Required

None - nenhuma configuração externa necessária.

## Next Phase Readiness

Task 2 (API: colisão por `nomeCurto`, rota `GET short-name/:shortName`) em andamento nesta mesma sessão. Este SUMMARY será atualizado ao final com os detalhes completos de Task 2, self-check e conclusão.

---
*Phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o*
*Status: em andamento*

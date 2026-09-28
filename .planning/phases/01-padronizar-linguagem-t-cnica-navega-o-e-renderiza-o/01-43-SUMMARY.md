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
    - "Tradução de violação de índice único (23505) para o mesmo PipeError.conflito do pré-check, fechando a corrida sem duplicar a mensagem"

key-files:
  created:
    - packages/db/drizzle/0051_flow_short_name_unique.sql
    - packages/db/tests/flow-short-name-migration.test.ts
    - packages/db/tests/flow-short-name-migration-helpers.ts
    - apps/api/tests/flow-short-name.test.ts
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/d52-db-proof.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/runtime-contracts-01-43.csv
  modified:
    - packages/db/drizzle/meta/_journal.json
    - packages/db/src/schema/automation.ts
    - apps/bridge/src/builder.ts
    - apps/api/package.json
    - apps/api/src/controllers/management-flow.ts
    - apps/api/src/domain/management-flow.ts
    - apps/api/src/domain/management/cycle-of-lifetime-of-flow.ts
    - apps/api/src/domain/management/regras-de-nome.ts
    - apps/api/src/domain/flow.ts
    - apps/api/tests/analytics.test.ts
    - apps/api/tests/channel-of-flow.test.ts
    - apps/api/tests/configuration-of-flow.test.ts
    - apps/api/tests/gerar-fixtures-jsonb.helper.ts
    - apps/api/tests/growth.test.ts
    - apps/api/tests/integrations.test.ts
    - apps/api/tests/jsonb-compat.test.ts
    - apps/api/tests/key-of-flow.test.ts
    - apps/api/tests/router.test.ts
    - apps/api/tests/team-of-flow.test.ts
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/ddl-before.sql

key-decisions:
  - "D-52 (dono): colisão de nome passa a ser por nomeCurto(nome) entre fluxos vivos do tenant, não mais por nome exato"
  - "D-54 (dono): nome curto único por conta; colisões existentes ganham sufixo -2, -3"

requirements-completed: [STD-05, STD-12]

duration: ~70min
completed: 2026-09-28
---

# Fase 01 Plano 43: short_name único por tenant Summary

**Migração 0051 (backfill + desempate + NOT NULL + índice único parcial) em `fluxo.short_name`, colisão de nome na API redefinida por `nomeCurto`, e nova rota `GET /v1/management/flows/short-name/:shortName`, com prova de banco e testes isolados em banco descartável.**

## Performance

- **Duração:** ~70 min (estimado; hora de início exata não foi registrada no primeiro passo)
- **Concluído:** 2026-09-28
- **Tarefas:** 2/2 concluídas
- **Arquivos modificados:** 26

## Accomplishments

- Migração `0051_flow_short_name_unique.sql`: backfill de `short_name` nulo com `nomeCurto(nome)` reproduzido em SQL puro (mesmo charset e ordem de operações da função TypeScript, confirmado byte a byte contra casos com acento, colchete, parênteses e underscore), desempate por `row_number() over (partition by tenant_id, short_name order by criado_em, id)` restrito a fluxos vivos, `ALTER COLUMN short_name SET NOT NULL`, e `CREATE UNIQUE INDEX fluxo_short_name_vivo_uk ... WHERE estado <> 'arquivado'`.
- Teste `packages/db/tests/flow-short-name-migration.test.ts`: cria um banco Postgres descartável (`CREATE DATABASE`), migra até (sem incluir) 0051 usando o migrador do drizzle direto contra uma pasta filtrada, insere fixtures sujas (nulos, duplicados vivos, um arquivado segurando o mesmo nome), aplica 0051 manualmente e prova os 4 casos do `<behavior>` do plano — incluindo que arquivar libera o nome para um novo fluxo vivo. O banco compartilhado de dev não serve mais para provar o desempate porque 0051 já rodou nele.
- Prova de banco real (`pnpm db:migrate && pnpm db:seed` no Postgres compartilhado): 0 nulos, 0 duplicados vivos, índice presente com a cláusula parcial esperada, coluna NOT NULL confirmada em `information_schema` — registrada em `std/reports/d52-db-proof.md`.
- `tools/std/ddl-snapshot.sh save` rodado; a fatia do diff relacionada a `short_name` é exatamente a NOT NULL + o índice novo (o resto do diff, bem maior, é de migrações 0043–0050 já mescladas antes deste plano e nunca antes capturadas num `save`).
- `nomeEmUso` (colisão de nome na criação/edição) passou a comparar `flow.shortName` contra `nomeCurto(nome)`, em vez de `flow.nome` exato — "Meu Bot" e "meu-bot" agora colidem como fluxos vivos, igual ao índice do banco já força.
- `createFlow`/`editFlow` traduzem uma violação de `fluxo_short_name_vivo_uk` (corrida entre o pré-check e o commit) para o mesmo `PipeError` `name_in_use` que o pré-check produz, em vez de vazar um 500.
- Nova rota `GET /v1/management/flows/short-name/:shortName`, registrada antes de `:id` no controller. Reaproveita o mesmo `select` de `:id` via um helper compartilhado (`loadContactWhere`) e o mesmo guard (`@WithSession()`); exclui fluxos arquivados, já que o short_name de um arquivado pode já pertencer a um fluxo vivo.
- Comentários que descreviam a regra pré-D-52 (schema `automation.ts` e `regras-de-nome.ts:63`) reescritos para descrever a regra atual.

## Task Commits

1. **Task 1: Migração 0051 (backfill, desempate, NOT NULL, índice único parcial) e schema** - `b4848fc8` (feat)
2. **Task 2: API — colisão por nomeCurto e resolução GET short-name/:shortName** - `6a3acb18` (feat)

**Plan metadata:** commit deste SUMMARY (a seguir)

_Nota: o draft deste SUMMARY foi commitado cedo (`89d573ce`, entre as duas tasks) para não perder o trabalho da Task 1 caso a execução parasse; este arquivo substitui aquele draft._

## Files Created/Modified

- `packages/db/drizzle/0051_flow_short_name_unique.sql` - migração de backfill/desempate/NOT NULL/índice
- `packages/db/drizzle/meta/_journal.json` - entrada idx 51
- `packages/db/src/schema/automation.ts` - `shortName` NOT NULL + `uniqueIndex('fluxo_short_name_vivo_uk')`
- `packages/db/tests/flow-short-name-migration.test.ts` / `-helpers.ts` - prova isolada em banco descartável (backfill, dedup, NOT NULL, índice)
- `apps/bridge/src/builder.ts` - insert do fluxo padrão da ponte passa a gravar `short_name` via `nomeCurto`
- `apps/api/package.json` - novo subpath de export `./domain/management/name-rules` (expõe `nomeCurto` fora do pacote, mesmo padrão de `./domain/management/flow-builder`)
- `apps/api/src/domain/management/cycle-of-lifetime-of-flow.ts` - `nomeEmUso` compara por `nomeCurto`; `createFlow`/`editFlow` traduzem 23505 de `fluxo_short_name_vivo_uk`
- `apps/api/src/domain/management/regras-de-nome.ts` - comentário do `nomeCurto` reescrito para D-52
- `apps/api/src/domain/management-flow.ts` - `loadContactWhere` compartilhado; nova `loadContactByShortName` (exclui arquivados)
- `apps/api/src/controllers/management-flow.ts` - rota `GET short-name/:shortName`, antes de `:id`
- `apps/api/src/domain/flow.ts` - `importFlowOfBlip` (importador de fluxo Blip) agora grava `short_name` via `nomeCurto`
- `apps/api/tests/flow-short-name.test.ts` - 9 casos cobrindo colisão por `nomeCurto` e a rota nova
- 9 arquivos de teste (`analytics`, `channel-of-flow`, `configuration-of-flow`, `gerar-fixtures-jsonb.helper`, `growth`, `integrations`, `jsonb-compat`, `key-of-flow`, `router`, `team-of-flow`) - `insert into fluxo` crus passam a gravar `short_name`
- `.planning/phases/.../std/reports/d52-db-proof.md` - prova de banco
- `.planning/phases/.../std/reports/runtime-contracts-01-43.csv` - saída do verificador de runtime (ver "Issues Encountered")
- `.planning/phases/.../std/ddl-before.sql` - novo baseline de DDL

## Decisions Made

- D-52/D-54 do dono aplicadas exatamente como especificado no plano; nenhuma decisão nova de arquitetura foi necessária durante a execução.
- Validação de formato de `shortName` na rota nova feita por regex simples (charset de `nomeCurto`, 1–40 caracteres) em vez de reusar `nomeCurto` como checagem de idempotência — um `shortName` no formato de UUID passa pela regex mas nunca bate no banco (nenhum fluxo real tem short_name parecido com UUID), então o requisito "short-name/<uuid> → 404" sai de graça da própria consulta, sem checagem especial.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1/3 - Bug/Blocking] `apps/bridge/src/builder.ts` criava fluxo sem `short_name`**
- **Found during:** Task 1, ao levantar todo ponto que insere `fluxo` (ação 5 do plano)
- **Issue:** O insert do fluxo padrão da ponte (`insert into fluxo (tenant_id, nome, tipo) values (...)`) nunca preenchia `short_name`. Com a migração 0051 tornando a coluna NOT NULL, esse insert passaria a falhar sempre que a ponte precisasse criar o fluxo padrão pela primeira vez.
- **Fix:** Adicionado subpath de export `./domain/management/name-rules` em `apps/api/package.json` (mesmo padrão já usado por `./domain/management/flow-builder`), e a ponte agora importa `nomeCurto` de lá e grava `short_name: nomeCurto(NAME_OF_FLOW)` no insert.
- **Files modified:** apps/bridge/src/builder.ts, apps/api/package.json
- **Verification:** `pnpm --filter @pipe/api build && pnpm --filter @pipe/bridge typecheck` — ambos limpos; `pnpm --filter @pipe/bridge test` — 17/17.
- **Committed in:** b4848fc8 (Task 1)

**2. [Rule 1/3 - Bug/Blocking] `importFlowOfBlip` (importador de fluxo Blip) criava fluxo sem `short_name`**
- **Found during:** Task 1, mesma varredura acima
- **Issue:** `apps/api/src/domain/flow.ts` insere `fluxo` diretamente ao importar um export do Blip; também nunca preenchia `short_name`, mesmo problema do item 1.
- **Fix:** Import de `nomeCurto` de `./management/regras-de-nome.js` (mesmo pacote, caminho relativo); `short_name: nomeCurto(pedido.name)` no insert.
- **Files modified:** apps/api/src/domain/flow.ts
- **Verification:** `pnpm --filter @pipe/api build` limpo; suíte completa da API (abaixo) verde.
- **Committed in:** 6a3acb18 (Task 2 — descoberto durante a varredura de Task 1, mas só ficou pronto para commit junto da Task 2 porque o fix mora no mesmo arquivo/área que outras mudanças de Task 2)

**3. [Rule 1 - Bug] 9 arquivos de teste da API inseriam `fluxo` sem `short_name`**
- **Found during:** Task 2, ao rodar a suíte de testes afetada pela migração (não fazia parte do plano original, mas a migração 0051 é a causa direta)
- **Issue:** `apps/api/tests/{analytics,channel-of-flow,configuration-of-flow,gerar-fixtures-jsonb.helper,growth,integrations,jsonb-compat,key-of-flow,router,team-of-flow}.test.ts` inseriam `fluxo` cru via SQL sem `short_name`. Com a coluna NOT NULL, TODOS esses testes passariam a falhar — não é um problema pré-existente, é uma quebra causada diretamente por esta migração.
- **Fix:** Cada insert passou a gravar um `short_name` derivado do próprio `nome` já usado no teste (a maioria já randomiza o nome com `randomUUID().slice(0,8)`, o que também garante `short_name` único). Um caso (`jsonb-compat.test.ts`) usava o mesmo `nome`/`short_name` literal em duas chamadas da mesma função auxiliar para o mesmo tenant; passou a derivar o `short_name` do `fluxoId` (já único) em vez do `nome` fixo.
- **Files modified:** os 9 arquivos de teste listados acima
- **Verification:** `pnpm --filter @pipe/api test` — 55 arquivos, 749 testes, todos verdes.
- **Committed in:** 6a3acb18 (Task 2)

---

**Total deviations:** 3 auto-corrigidos (Rule 1/3 × 2, Rule 1 × 1)
**Impact on plan:** Todos os três são consequência direta e necessária de tornar `short_name` NOT NULL + único; sem eles a migração quebraria a ponte, o importador de fluxo Blip e 9 arquivos de teste existentes. Nenhuma mudança de escopo além do necessário para a migração não regredir código/teste já existente.

## Issues Encountered

- `packages/db/src/migrate.ts` (`migrate()`) sempre aponta para a pasta real `packages/db/drizzle`, então não dava para reaproveitá-lo direto para aplicar "tudo menos 0051" num banco descartável. O helper de teste chama `drizzle-orm/node-postgres/migrator` diretamente com uma pasta temporária filtrada (só o journal e os `.sql` até 0050), espelhando a lógica de `migrate()` sem o caminho fixo.
- `node tools/std/runtime-contracts.ts --map STD/map --out STD/reports/runtime-contracts-01-43.csv --allow STD/runtime-contracts-allow.csv` (critério de aceite da Task 2) saiu com exit 1, não exit 0. Rodei o comando e confirmei: todos os achados impressos são de linhas que este plano NÃO tocou (ex.: `packages/db/src/schema/identity.ts`, `packages/db/src/schema/quality-review.ts`, `packages/ai/*`, `tools/std/*.test.ts`), e as únicas linhas que aparecem em arquivos deste plano (`management-flow.ts:159/188/190`, `flow.ts:213/242/927-1148`, `cycle-of-lifetime-of-flow.test.ts:393/397/401`) já existiam antes desta plano e não foram alteradas por ela. Isso é o débito STD-11 já registrado como item aberto em STATE.md ("classificação STD-11: 25.741 achados sem classificação") — pré-existente ao plano 01-43, não causado por ele. Reportando o exit code real em vez de declarar sucesso.

## User Setup Required

None - nenhuma configuração externa necessária.

## Next Phase Readiness

- `short_name` é agora um identificador de URL confiável por tenant: não nulo, único entre fluxos vivos, resolvível por `GET short-name/:shortName`. O plano 01-44 (rotas `/application/detail/{shortName}/...`) pode se apoiar nisso.
- A prova de banco e o teste de migração isolado ficam como referência para qualquer plano futuro que precise reproduzir `nomeCurto` em SQL ou testar uma migração com backfill contra dado sujo.
- Pendência fora do escopo deste plano: o gate `tools/std/ddl-snapshot.sh check` só volta a reportar "SQL unchanged" depois do merge deste branch em `limpeza` (comparação `MIGRATIONS CHANGED` é contra `limpeza`); o orquestrador roda a checagem lá após o merge, como o próprio plano já previa.

## Self-Check: PASSED

Arquivos criados (existência confirmada):
- FOUND: packages/db/drizzle/0051_flow_short_name_unique.sql
- FOUND: packages/db/tests/flow-short-name-migration.test.ts
- FOUND: packages/db/tests/flow-short-name-migration-helpers.ts
- FOUND: apps/api/tests/flow-short-name.test.ts
- FOUND: .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/d52-db-proof.md
- FOUND: .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/runtime-contracts-01-43.csv

Commits (existência confirmada no log do branch):
- FOUND: b4848fc8 (Task 1)
- FOUND: 89d573ce (draft do SUMMARY)
- FOUND: 6a3acb18 (Task 2)

Verificações rodadas e observadas (não apenas inspecionadas):
- `pnpm --filter @pipe/db test` — 5 arquivos, 38 testes, todos verdes (inclui a suíte nova de migração).
- `pnpm --filter @pipe/db typecheck` — limpo.
- `pnpm --filter @pipe/api typecheck` — limpo.
- `pnpm --filter @pipe/api exec vitest run tests/flow-short-name.test.ts tests/cycle-of-lifetime-of-flow.test.ts` — 25/25 verdes.
- `pnpm --filter @pipe/api test` (suíte completa) — 55 arquivos, 749 testes, todos verdes.
- `pnpm --filter @pipe/bridge test` — 17/17 verdes.
- `rg -n "short-name/:shortName" apps/api/src/controllers/management-flow.ts` aparece na linha 234, antes de `@Get(':id')` na linha 251.
- `rg -n "eq\(flow\.nome, nome\)" apps/api/src/domain/management/cycle-of-lifetime-of-flow.ts` não encontra nada.
- `node tools/std/runtime-contracts.ts ...` rodado — exit 1, documentado em "Issues Encountered" com a análise de que é débito pré-existente (STD-11), não causado por este plano.
- Prova de banco (`d52-db-proof.md`) gerada a partir de consultas reais rodadas contra o Postgres compartilhado, não simuladas.

STATE.md, ROADMAP.md e REQUIREMENTS.md não foram tocados, conforme instrução do orquestrador para este plano.

---
*Phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o*
*Completed: 2026-09-28*

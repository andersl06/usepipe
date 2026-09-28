# D-52 — Prova de banco (migração 0051)

Plano 01-43. Migração aplicada com `pnpm --filter @pipe/db migrate` contra o Postgres local
compartilhado (`pipe-postgres`, banco `pipe`), seguida de `pnpm --filter @pipe/db seed`.

## 1. Nenhum `short_name` nulo

```
select count(*) as nulos from fluxo where short_name is null;

 nulos
-------
     0
(1 row)
```

## 2. Nenhum `short_name` duplicado entre fluxos vivos

```
select tenant_id, short_name, count(*) from fluxo where estado <> 'arquivado' group by 1,2 having count(*) > 1;

 tenant_id | short_name | count
-----------+------------+-------
(0 rows)
```

## 3. Índice único parcial presente

```
select indexdef from pg_indexes where indexname='fluxo_short_name_vivo_uk';

                                                               indexdef
----------------------------------------------------------------------------------------------------------------------------------
 CREATE UNIQUE INDEX fluxo_short_name_vivo_uk ON public.fluxo USING btree (tenant_id, short_name) WHERE (estado <> 'arquivado'::text)
(1 row)
```

## 4. Coluna NOT NULL

```
select column_name, is_nullable from information_schema.columns where table_name='fluxo' and column_name='short_name';

 column_name | is_nullable
-------------+-------------
 short_name  | NO
(1 row)
```

## Contexto do dataset

Este banco compartilhado (dev/demo) tinha 2 linhas em `fluxo` no momento da migração, nenhuma
delas nula nem colidente — condizente com D-43 (sem dado de produção real, sem nome duplicado
observado). A migração não renomeou nada aqui; o passo de desempate (sufixo `-2`, `-3`, ...) foi
exercitado e provado separadamente pelo teste de banco isolado
(`packages/db/tests/flow-short-name-migration.test.ts`), que monta um banco descartável com
fluxos duplicados e nulos antes de aplicar a migração 0051 — cenário que este banco compartilhado
não consegue mais oferecer, porque 0051 já rodou aqui.

## Diff de DDL (`tools/std/ddl-snapshot.sh`)

`git diff limpeza -- packages/db/drizzle` antes do `save`: só `0051_flow_short_name_unique.sql`
(novo) e a entrada `idx 51` em `meta/_journal.json` — nenhum outro arquivo de migração mudou.

O diff completo de `drizzle-kit export` contra o `ddl-before.sql` anterior mostra crescimento em
muitas tabelas não relacionadas a este plano (colunas de migrações 0043–0050, já mescladas antes
deste plano, nunca capturadas num `save` anterior do baseline). A fatia relevante a este plano —
tudo que menciona `short_name` — é exatamente esta:

```diff
-	"short_name" text,
+	"short_name" text NOT NULL,
...
+CREATE UNIQUE INDEX "fluxo_short_name_vivo_uk" ON "fluxo" USING btree ("tenant_id","short_name") WHERE estado <> 'arquivado';
```

`grep -c "short_name" STD/ddl-before.sql`: 1 antes do `save` deste plano, 2 depois (a definição da
coluna e a definição do índice nomeado). `tools/std/ddl-snapshot.sh save` já foi rodado para
registrar o novo baseline; `tools/std/ddl-snapshot.sh check` só volta a reportar "SQL unchanged"
depois do merge deste branch em `limpeza` (a checagem `MIGRATIONS CHANGED` compara
`packages/db/drizzle` com `limpeza`, e esta migração ainda não está lá).

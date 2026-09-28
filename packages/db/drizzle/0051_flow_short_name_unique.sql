-- D-52: `short_name` becomes a reliable URL key per tenant, for `/application/detail/{shortName}/...`.
--
-- Migration 0020 added this column nullable, with uniqueness checked only against `nome` in the
-- application layer (`nomeEmUso`). Two flows could then collide in the URL ("Meu Bot" and
-- "meu-bot" would both resolve to `/application/detail/meu-bot`), and an old row could have no
-- short name at all.
--
-- This migration, in order:
--   1. Fills every NULL `short_name` with `nomeCurto(nome)` (`regras-de-nome.ts`), reproduced
--      here in SQL: strip characters outside `[a-zA-ZÀ-ÿ0-9[]() _-]`, trim, lowercase, then
--      collapse whitespace runs into a single hyphen.
--   2. Breaks ties among LIVE flows (`estado <> 'arquivado'`) that ended up sharing a
--      `(tenant_id, short_name)` pair, keeping the oldest (`criado_em`, then `id`) unchanged and
--      appending `-2`, `-3`, ... to the rest until each is unique. An archived flow never counts
--      toward a collision and never receives a suffix: its name is already free, the same
--      exception `nomeEmUso` already makes for renames.
--   3. Makes the column NOT NULL: every flow now has a short name.
--   4. Adds a unique index on `(tenant_id, short_name)`, partial to live flows only, so archiving
--      a flow releases its short name for reuse the same way it already releases `nome`.
--
-- The demo dataset (D-43) has no real duplicate names, so this migration is not expected to
-- rename anything on it; the dedup step exists so a database that DOES have duplicates does not
-- fail here.

-- 1) Backfill NULL short names with nomeCurto(nome).
UPDATE "fluxo"
   SET "short_name" = regexp_replace(
         lower(trim(regexp_replace("nome", '[^a-zA-ZÀ-ÿ0-9\[\]() _-]', '', 'g'))),
         '\s+', '-', 'g'
       )
 WHERE "short_name" IS NULL;
--> statement-breakpoint

-- 2) Break ties among live flows sharing a short name, oldest first; archived flows are excluded
--    from both the partition and the collision check.
DO $$
DECLARE
  duplicada RECORD;
  proposto text;
  sufixo int;
BEGIN
  FOR duplicada IN
    SELECT id, tenant_id, short_name
      FROM (
        SELECT id, tenant_id, short_name,
               row_number() OVER (
                 PARTITION BY tenant_id, short_name
                 ORDER BY criado_em, id
               ) AS posicao
          FROM "fluxo"
         WHERE estado <> 'arquivado'
      ) ordenado
     WHERE posicao > 1
     ORDER BY tenant_id, short_name, posicao
  LOOP
    sufixo := 2;
    LOOP
      proposto := duplicada.short_name || '-' || sufixo;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "fluxo"
         WHERE tenant_id = duplicada.tenant_id
           AND short_name = proposto
           AND estado <> 'arquivado'
      );
      sufixo := sufixo + 1;
    END LOOP;
    UPDATE "fluxo" SET short_name = proposto WHERE id = duplicada.id;
  END LOOP;
END $$;
--> statement-breakpoint

-- 3) Every flow now has a short name.
ALTER TABLE "fluxo" ALTER COLUMN "short_name" SET NOT NULL;
--> statement-breakpoint

-- 4) One short name per tenant among live flows; archiving releases it.
CREATE UNIQUE INDEX IF NOT EXISTS "fluxo_short_name_vivo_uk" ON "fluxo" ("tenant_id", "short_name") WHERE estado <> 'arquivado';

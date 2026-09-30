-- P10 / D-57: the function library belongs to the account (tenant), like Blip's contract-wide
-- library: one function serves every flow and flows reference it by UUID (`ExecuteBlipFunction`
-- `settings.source`). Until now a row could be scoped to one flow (`fluxo_id`, `escopo = 'flow'`).
-- Every existing row is kept: flow-scoped functions become tenant functions with the same id, so
-- actions that point at them keep working.
--
-- Name clashes (two rows of one tenant with the same `nome` once the flow scope is gone) are
-- resolved deterministically: a function that was already tenant-wide keeps its name; otherwise the
-- oldest (`criado_em`, then `id`) keeps it. Every other row gets the first free `<nome>_<n>`
-- (n = 2, 3, ...), a note in `descricao` saying where it came from, and a NOTICE in the migration
-- log. Scripts that called a renamed function by name now reach the surviving one; actions that
-- reference it by id are unaffected.
DO $$
DECLARE
  r record;
  n integer;
  candidate text;
BEGIN
  FOR r IN
    SELECT f.id, f.tenant_id, f.nome, fl.nome AS fluxo_nome
      FROM funcao_do_fluxo f
      LEFT JOIN fluxo fl ON fl.id = f.fluxo_id
     WHERE f.fluxo_id IS NOT NULL
       AND (
         EXISTS (SELECT 1 FROM funcao_do_fluxo t
                  WHERE t.tenant_id = f.tenant_id AND t.nome = f.nome AND t.fluxo_id IS NULL)
         OR EXISTS (SELECT 1 FROM funcao_do_fluxo o
                     WHERE o.tenant_id = f.tenant_id AND o.nome = f.nome AND o.fluxo_id IS NOT NULL
                       AND (o.criado_em, o.id) < (f.criado_em, f.id))
       )
     ORDER BY f.tenant_id, f.nome, f.criado_em, f.id
  LOOP
    n := 2;
    LOOP
      candidate := r.nome || '_' || n;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM funcao_do_fluxo WHERE tenant_id = r.tenant_id AND nome = candidate);
      n := n + 1;
    END LOOP;
    UPDATE funcao_do_fluxo
       SET nome = candidate,
           descricao = concat_ws(' ', nullif(descricao, ''),
             format('(Renomeada de "%s" ao passar para a biblioteca da conta; vinha do fluxo "%s".)',
                    r.nome, coalesce(r.fluxo_nome, '?'))),
           atualizado_em = now()
     WHERE id = r.id;
    RAISE NOTICE '0054 funcao_do_fluxo: tenant % renamed function % "%" to "%" (flow "%")',
      r.tenant_id, r.id, r.nome, candidate, coalesce(r.fluxo_nome, '?');
  END LOOP;
END;
$$;--> statement-breakpoint
UPDATE "funcao_do_fluxo" SET "fluxo_id" = NULL, "escopo" = 'tenant' WHERE "fluxo_id" IS NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "funcao_do_fluxo_fluxo_nome_uk";--> statement-breakpoint
DROP INDEX IF EXISTS "funcao_do_fluxo_fluxo_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "funcao_do_fluxo_tenant_nome_uk";--> statement-breakpoint
DROP INDEX IF EXISTS "funcao_do_fluxo_tenant_idx";--> statement-breakpoint
ALTER TABLE "funcao_do_fluxo" DROP CONSTRAINT IF EXISTS "funcao_do_fluxo_escopo_ck";--> statement-breakpoint
ALTER TABLE "funcao_do_fluxo" DROP COLUMN IF EXISTS "fluxo_id";--> statement-breakpoint
ALTER TABLE "funcao_do_fluxo" DROP COLUMN IF EXISTS "escopo";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "funcao_do_fluxo_tenant_nome_uk"
  ON "funcao_do_fluxo" ("tenant_id", "nome");

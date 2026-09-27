-- Native satisfaction survey answer (BAH 3.0) — server side of BUILDER-03.
--
-- Source: `ref/inventario-satisfacao-e-tags.md` §5 and the owner's gate approval
-- (`ref/CLASSIFICACAO-PORTAO.md`, D-08.5/D-09/D-10). One row per delivered
-- survey, covering all four documented outcomes (`completa`, `so_nota`,
-- `sem_resposta`, `abandono`) — unlike the reference, which never persists a
-- row for `sem_resposta` (it is only a subtraction on the report). The rating
-- is always the RAW 1-5 value (D-06); the promoter/neutral/detractor-style
-- category is computed at query time, never stored (D-09: no fixed
-- categorization is built into the block or this table).
--
-- No retention/TTL column and no language restriction, unlike the reference
-- (D-10 — those are limitations of the source product, not a feature to copy).
--
-- `conversa_atendimento_id` is the closed human attendance the survey is
-- evaluating (nullable: a survey reachable without a prior attendance would
-- have none). `fluxo_bloco_id` is the `survey:` block id in the flow's own
-- vocabulary, not a foreign key (blocks live inside a versioned JSON document,
-- not a table).
--
-- ## Como desfazer
--
-- DROP TABLE "pesquisa_satisfacao_resposta";

CREATE TABLE IF NOT EXISTS "pesquisa_satisfacao_resposta" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "conversa_id" uuid NOT NULL REFERENCES "conversa"("id") ON DELETE RESTRICT,
  "conversa_atendimento_id" uuid REFERENCES "conversa"("id") ON DELETE SET NULL,
  "fluxo_bloco_id" text,
  "fila_id" uuid REFERENCES "fila"("id") ON DELETE SET NULL,
  "atendente_id" uuid REFERENCES "usuario"("id") ON DELETE SET NULL,
  "contato_id" uuid NOT NULL REFERENCES "contato"("id") ON DELETE RESTRICT,
  "nota" smallint,
  "comentario" text,
  "estado" text NOT NULL,
  "criada_em" timestamptz DEFAULT now() NOT NULL,
  "respondida_em" timestamptz,
  CONSTRAINT "pesquisa_satisfacao_resposta_estado_ck"
    CHECK ("estado" IN ('completa', 'so_nota', 'sem_resposta', 'abandono')),
  CONSTRAINT "pesquisa_satisfacao_resposta_nota_ck"
    CHECK ("nota" IS NULL OR ("nota" >= 1 AND "nota" <= 5))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pesquisa_satisfacao_resposta_fila_idx"
  ON "pesquisa_satisfacao_resposta" ("tenant_id", "fila_id", "criada_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pesquisa_satisfacao_resposta_atendente_idx"
  ON "pesquisa_satisfacao_resposta" ("tenant_id", "atendente_id", "criada_em");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pesquisa_satisfacao_resposta_periodo_idx"
  ON "pesquisa_satisfacao_resposta" ("tenant_id", "criada_em");--> statement-breakpoint

-- Tabela nova entra na RLS como todas as outras (`rls.test.ts` varre o catálogo).
ALTER TABLE "pesquisa_satisfacao_resposta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "pesquisa_satisfacao_resposta";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "pesquisa_satisfacao_resposta"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON pesquisa_satisfacao_resposta TO pipe_app';
  END IF;
END;
$$;

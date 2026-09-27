-- Conversation-engine function library (D-22). Deliberately not `funcao` from the workflow engine.
-- C-27 is still pending, so `versao` is the current active version; historical immutable rows
-- will be added only after the reference lifecycle is captured.
CREATE TABLE IF NOT EXISTS "funcao_do_fluxo" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "fluxo_id" uuid REFERENCES "fluxo"("id") ON DELETE CASCADE,
  "nome" text NOT NULL,
  "descricao" text,
  "parametros" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "codigo" text NOT NULL,
  "versao" integer NOT NULL DEFAULT 1,
  "escopo" text NOT NULL DEFAULT 'tenant',
  "criado_em" timestamptz NOT NULL DEFAULT now(),
  "atualizado_em" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "funcao_do_fluxo_codigo_ck" CHECK (length("codigo") <= 65536),
  CONSTRAINT "funcao_do_fluxo_escopo_ck" CHECK ("escopo" IN ('tenant', 'flow')),
  CONSTRAINT "funcao_do_fluxo_parametros_ck" CHECK (jsonb_typeof("parametros") = 'array')
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "funcao_do_fluxo_tenant_nome_uk"
  ON "funcao_do_fluxo" ("tenant_id", "nome") WHERE "fluxo_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "funcao_do_fluxo_fluxo_nome_uk"
  ON "funcao_do_fluxo" ("tenant_id", "fluxo_id", "nome") WHERE "fluxo_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funcao_do_fluxo_tenant_idx"
  ON "funcao_do_fluxo" ("tenant_id", "nome");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "funcao_do_fluxo_fluxo_idx"
  ON "funcao_do_fluxo" ("tenant_id", "fluxo_id", "nome");--> statement-breakpoint
ALTER TABLE "funcao_do_fluxo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "funcao_do_fluxo";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "funcao_do_fluxo"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON funcao_do_fluxo TO pipe_app';
  END IF;
END;
$$;

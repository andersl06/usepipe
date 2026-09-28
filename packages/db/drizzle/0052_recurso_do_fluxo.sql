-- Per-flow key/value resources (Blip "Recursos", permission key `resources`): source
-- `/resources/{key}` LIME commands (`portal.js`'s `ResourceService`, `getResource`/`setResource`/
-- `deleteResource`/`getResources`), each row a `key` + MIME `type` + text-or-JSON `content`. Pipe
-- scopes the store per flow (`fluxo_id`), not per bot account, since a Pipe tenant can hold many
-- flows. The engine's `resource` variable source (`@pipe/core/flow/context.ts`) reads this table
-- through the `api`, the same way `config` reads `fluxo.configuracao`.
CREATE TABLE IF NOT EXISTS "recurso_do_fluxo" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "fluxo_id" uuid NOT NULL REFERENCES "fluxo"("id") ON DELETE CASCADE,
  "nome" text NOT NULL,
  "tipo" text NOT NULL DEFAULT 'text/plain',
  "valor" text NOT NULL,
  "criado_em" timestamptz NOT NULL DEFAULT now(),
  "atualizado_em" timestamptz,
  CONSTRAINT "recurso_do_fluxo_valor_ck" CHECK (length("valor") <= 65536),
  CONSTRAINT "recurso_do_fluxo_nome_ck" CHECK (length("nome") between 1 and 190)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recurso_do_fluxo_fluxo_nome_uk"
  ON "recurso_do_fluxo" ("tenant_id", "fluxo_id", "nome");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recurso_do_fluxo_fluxo_idx"
  ON "recurso_do_fluxo" ("tenant_id", "fluxo_id");--> statement-breakpoint
ALTER TABLE "recurso_do_fluxo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "recurso_do_fluxo";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "recurso_do_fluxo"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON recurso_do_fluxo TO pipe_app';
  END IF;
END;
$$;

-- Expand-only migration: keep fluxo.canal_id as the first/legacy link and store only
-- additional inbound channels of routers here. No existing row is moved or deleted.
-- Rollback requires detaching extra router channels first; do not drop this table
-- while it contains links, because older versions cannot represent them.
CREATE TABLE IF NOT EXISTS "roteador_canal" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "roteador_id" uuid NOT NULL REFERENCES "fluxo"("id") ON DELETE CASCADE,
  "canal_id" uuid NOT NULL REFERENCES "canal"("id") ON DELETE CASCADE,
  "criado_em" timestamptz NOT NULL DEFAULT now(),
  "atualizado_em" timestamptz
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roteador_canal_roteador_canal_uk"
  ON "roteador_canal" ("roteador_id", "canal_id");--> statement-breakpoint
-- Do not make canal_id globally unique: archived routers release their channels.
-- The live-owner check serializes on the canal row before assigning it.
ALTER TABLE "roteador_canal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "roteador_canal";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "roteador_canal"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON roteador_canal TO pipe_app';
  END IF;
END;
$$;

-- Per-flow secret variables (Blip Builder > Configurações > "Variáveis sensíveis", read as
-- `{{secret.<nome>}}` and only inside HTTP actions). Scoped per flow like `recurso_do_fluxo`
-- (0052): in Blip the section lives in the bot's Builder configuration, and a Blip bot is a Pipe
-- flow. `valor_cifrado` is a `packages/db/src/secret.ts` envelope (AES-256-GCM, key id inside,
-- keys from `PIPE_CHAVES_SEGREDO`); the plaintext never touches the database, and the API never
-- returns it after save (write-only, like Blip's "Valores suprimidos").
CREATE TABLE IF NOT EXISTS "variavel_secreta_do_fluxo" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "fluxo_id" uuid NOT NULL REFERENCES "fluxo"("id") ON DELETE CASCADE,
  "nome" text NOT NULL,
  "valor_cifrado" text NOT NULL,
  "criado_em" timestamptz NOT NULL DEFAULT now(),
  "atualizado_em" timestamptz,
  CONSTRAINT "variavel_secreta_do_fluxo_nome_ck" CHECK (length("nome") between 1 and 190),
  CONSTRAINT "variavel_secreta_do_fluxo_cifrado_ck" CHECK ("valor_cifrado" LIKE 'pipev1.%')
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "variavel_secreta_do_fluxo_fluxo_nome_uk"
  ON "variavel_secreta_do_fluxo" ("tenant_id", "fluxo_id", "nome");--> statement-breakpoint
ALTER TABLE "variavel_secreta_do_fluxo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "variavel_secreta_do_fluxo";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "variavel_secreta_do_fluxo"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON variavel_secreta_do_fluxo TO pipe_app';
  END IF;
END;
$$;

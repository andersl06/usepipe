-- Native storage for the platform actions approved by D-20.
CREATE TABLE IF NOT EXISTS "lista_distribuicao" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "nome" text NOT NULL,
  "criado_em" timestamptz NOT NULL DEFAULT now(),
  "atualizado_em" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "lista_distribuicao_tenant_nome_uk" ON "lista_distribuicao" ("tenant_id", "nome");
CREATE TABLE IF NOT EXISTS "lista_distribuicao_contato" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "lista_id" uuid NOT NULL REFERENCES "lista_distribuicao"("id") ON DELETE CASCADE,
  "contato_id" uuid NOT NULL REFERENCES "contato"("id") ON DELETE CASCADE,
  "criado_em" timestamptz NOT NULL DEFAULT now(),
  "atualizado_em" timestamptz,
  CONSTRAINT "lista_distribuicao_contato_uk" UNIQUE ("tenant_id", "lista_id", "contato_id")
);
CREATE INDEX IF NOT EXISTS "lista_distribuicao_contato_contato_idx" ON "lista_distribuicao_contato" ("tenant_id", "contato_id");
CREATE TABLE IF NOT EXISTS "gravar_memoria" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "contato_id" uuid REFERENCES "contato"("id") ON DELETE CASCADE,
  "escopo" text NOT NULL DEFAULT 'contact' CHECK ("escopo" IN ('contact', 'global')),
  "chave" text NOT NULL,
  "valor" jsonb NOT NULL DEFAULT 'null'::jsonb CHECK (pg_column_size("valor") <= 65536),
  "expira_em" timestamptz,
  "criado_em" timestamptz NOT NULL DEFAULT now(),
  "atualizado_em" timestamptz,
  CONSTRAINT "gravar_memoria_contato_ck" CHECK (("escopo" = 'global' AND "contato_id" IS NULL) OR ("escopo" = 'contact' AND "contato_id" IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "gravar_memoria_contato_chave_uk" ON "gravar_memoria" ("tenant_id", "contato_id", "chave") WHERE "escopo" = 'contact';
CREATE UNIQUE INDEX IF NOT EXISTS "gravar_memoria_global_chave_uk" ON "gravar_memoria" ("tenant_id", "chave") WHERE "escopo" = 'global';
CREATE INDEX IF NOT EXISTS "gravar_memoria_tenant_idx" ON "gravar_memoria" ("tenant_id", "contato_id", "chave");
--> statement-breakpoint
ALTER TABLE "lista_distribuicao" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolado" ON "lista_distribuicao" USING (tenant_id = current_setting('pipe.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);
ALTER TABLE "lista_distribuicao_contato" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolado" ON "lista_distribuicao_contato" USING (tenant_id = current_setting('pipe.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);
ALTER TABLE "gravar_memoria" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolado" ON "gravar_memoria" USING (tenant_id = current_setting('pipe.tenant_id')::uuid) WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON lista_distribuicao, lista_distribuicao_contato, gravar_memoria TO pipe_app';
  END IF;
END;
$$;

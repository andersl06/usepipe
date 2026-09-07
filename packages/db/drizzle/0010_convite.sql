-- Convite: a única porta de entrada para quem não tem domínio verificado.
--
-- Ver `apps/api/src/dominio/convites.ts`. O banco guarda o HASH do token, nunca o
-- token — mesma regra da sessão e da chave de API. Prazo curto e uso único.

CREATE TABLE IF NOT EXISTS "convite" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "email" text NOT NULL,
  "papel_id" uuid NOT NULL REFERENCES "papel"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expira_em" timestamptz NOT NULL,
  "criado_por" uuid REFERENCES "usuario"("id") ON DELETE SET NULL,
  "aceito_em" timestamptz,
  "usuario_id" uuid REFERENCES "usuario"("id") ON DELETE SET NULL,
  "criado_em" timestamptz DEFAULT now() NOT NULL,
  "atualizado_em" timestamptz
);--> statement-breakpoint

-- Único e global no hash: é por ele que o convite é achado antes de haver tenant
-- em vigor, igual à sessão. Dois convites com o mesmo hash seria a mesma dúvida
-- que a sessão não pode ter.
CREATE UNIQUE INDEX IF NOT EXISTS "convite_token_hash_uk" ON "convite" ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "convite_tenant_email_idx"
  ON "convite" ("tenant_id", "email", "expira_em");--> statement-breakpoint

-- Tabela nova entra na RLS como todas as outras. Há um teste que varre o catálogo
-- e falha nomeando quem ficou de fora.
ALTER TABLE "convite" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "convite";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "convite"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON convite TO pipe_app';
  END IF;
END;
$$;

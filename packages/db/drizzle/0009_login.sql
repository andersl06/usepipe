-- Login com provedor externo, e os planos como lista fechada.
--
-- Ver `docs/specs/2026-09-07-preco.md` (planos) e
-- `referencias-blip/pesquisa/sso-multi-tenant.md` (identidade externa).

-- 1. Plano vira lista fechada. Era texto livre com 'padrao' de padrão, e franquia
--    não tem onde morar em texto livre.
UPDATE "tenant" SET "plano" = 'essencial' WHERE "plano" NOT IN ('essencial', 'operacao', 'escala');--> statement-breakpoint
ALTER TABLE "tenant" ALTER COLUMN "plano" SET DEFAULT 'essencial';--> statement-breakpoint
ALTER TABLE "tenant" DROP CONSTRAINT IF EXISTS "tenant_plano_ck";--> statement-breakpoint
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_plano_ck"
  CHECK ("plano" IN ('essencial', 'operacao', 'escala'));--> statement-breakpoint

-- 2. Por onde a pessoa entrou. Auditoria pede, e a revogação por IdP depende.
ALTER TABLE "sessao" ADD COLUMN IF NOT EXISTS "origem" text NOT NULL DEFAULT 'senha';--> statement-breakpoint
ALTER TABLE "sessao" DROP CONSTRAINT IF EXISTS "sessao_origem_ck";--> statement-breakpoint
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_origem_ck"
  CHECK ("origem" IN ('senha', 'google', 'sso'));--> statement-breakpoint

-- 3. A conta da pessoa no provedor externo.
--
-- A chave NUNCA é o e-mail: é o par (emissor, sujeito). E-mail muda de dono
-- dentro de uma empresa, e quem herdasse o endereço de quem saiu herdaria a
-- conta junto. O `sub` do provedor é estável e não é o endereço.
CREATE TABLE IF NOT EXISTS "identidade_externa" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "usuario_id" uuid NOT NULL REFERENCES "usuario"("id") ON DELETE CASCADE,
  "emissor" text NOT NULL,
  "sujeito" text NOT NULL,
  "email_no_provedor" text,
  "ultimo_acesso_em" timestamptz,
  "criado_em" timestamptz DEFAULT now() NOT NULL,
  "atualizado_em" timestamptz
);--> statement-breakpoint

-- Único e GLOBAL: uma conta do provedor pertence a um usuário, e usuário
-- pertence a um tenant. Duas linhas para o mesmo par seria a mesma pessoa
-- entrando em dois clientes, e a escolha ficaria com quem consultasse primeiro.
CREATE UNIQUE INDEX IF NOT EXISTS "identidade_externa_emissor_sujeito_uk"
  ON "identidade_externa" ("emissor", "sujeito");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identidade_externa_usuario_idx"
  ON "identidade_externa" ("tenant_id", "usuario_id");--> statement-breakpoint

-- 4. Domínio de e-mail que pertence a um tenant: é como se descobre o cliente a
--    partir do login, já que o tenant não vem do subdomínio. Só vale depois de
--    verificado por TXT no DNS.
CREATE TABLE IF NOT EXISTS "dominio_tenant" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "dominio" text NOT NULL,
  "verificado_em" timestamptz,
  "token_verificacao" text,
  "criado_em" timestamptz DEFAULT now() NOT NULL,
  "atualizado_em" timestamptz
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "dominio_tenant_dominio_uk"
  ON "dominio_tenant" ("dominio");--> statement-breakpoint

-- 5. As duas tabelas novas entram na RLS como todas as outras.
ALTER TABLE "identidade_externa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "identidade_externa";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "identidade_externa"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

ALTER TABLE "dominio_tenant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "dominio_tenant";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "dominio_tenant"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON identidade_externa, dominio_tenant TO pipe_app';
  END IF;
END;
$$;

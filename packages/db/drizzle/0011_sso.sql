-- A conexão de SSO do tenant: qual IdP, em que estado, e se a senha ainda vale.
--
-- Ver `referencias-blip/pesquisa/sso-multi-tenant.md` §3 e §6. Duas decisões estão gravadas
-- na forma da tabela:
--
-- 1. **Uma conexão por tenant** (o único em `tenant_id`). A empresa entra por um
--    diretório; várias conexões tornariam a descoberta por domínio ambígua
--    justo quando ninguém está logado para desempatar.
-- 2. **`estado` e `politica` são campos separados.** Ligar o SSO e exigir o SSO
--    são dois botões e dois registros de auditoria. Todo incidente de "o cliente
--    inteiro ficou de fora" nasce de serem o mesmo botão.
--
-- O `client_secret` NÃO tem coluna: ele vive dentro de `config`, cifrado por
-- `cifrarConfig` (`src/segredo.ts`), que já trata `clientSecret` como campo
-- secreto. O que um `pg_dump` entrega é envelope, não credencial.

CREATE TABLE IF NOT EXISTS "conexao_sso" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "tipo" text NOT NULL DEFAULT 'oidc',
  "provedor" text NOT NULL DEFAULT 'generico',
  "emissor" text NOT NULL,
  "cliente_id" text NOT NULL,
  "config" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "estado" text NOT NULL DEFAULT 'rascunho',
  "politica" text NOT NULL DEFAULT 'desligado',
  "testada_em" timestamptz,
  "ativada_em" timestamptz,
  "criado_em" timestamptz DEFAULT now() NOT NULL,
  "atualizado_em" timestamptz
);--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "conexao_sso_tenant_uk" ON "conexao_sso" ("tenant_id");--> statement-breakpoint

ALTER TABLE "conexao_sso" DROP CONSTRAINT IF EXISTS "conexao_sso_tipo_ck";--> statement-breakpoint
ALTER TABLE "conexao_sso" ADD CONSTRAINT "conexao_sso_tipo_ck"
  CHECK ("tipo" IN ('oidc'));--> statement-breakpoint
ALTER TABLE "conexao_sso" DROP CONSTRAINT IF EXISTS "conexao_sso_provedor_ck";--> statement-breakpoint
ALTER TABLE "conexao_sso" ADD CONSTRAINT "conexao_sso_provedor_ck"
  CHECK ("provedor" IN ('generico', 'entra', 'google_workspace', 'okta'));--> statement-breakpoint
ALTER TABLE "conexao_sso" DROP CONSTRAINT IF EXISTS "conexao_sso_estado_ck";--> statement-breakpoint
ALTER TABLE "conexao_sso" ADD CONSTRAINT "conexao_sso_estado_ck"
  CHECK ("estado" IN ('rascunho', 'testada', 'ativa'));--> statement-breakpoint
ALTER TABLE "conexao_sso" DROP CONSTRAINT IF EXISTS "conexao_sso_politica_ck";--> statement-breakpoint
ALTER TABLE "conexao_sso" ADD CONSTRAINT "conexao_sso_politica_ck"
  CHECK ("politica" IN ('desligado', 'opcional', 'obrigatorio'));--> statement-breakpoint

-- Tabela nova entra na RLS como todas as outras. Há um teste que varre o catálogo
-- e falha nomeando quem ficou de fora.
ALTER TABLE "conexao_sso" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "conexao_sso";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "conexao_sso"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON conexao_sso TO pipe_app';
  END IF;
END;
$$;

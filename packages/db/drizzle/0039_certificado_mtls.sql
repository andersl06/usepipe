-- Certificados de autenticação (mTLS) do contrato — `referencias-blip/pesquisa/blip-certificados-mtls.md`.
--
-- **Nunca guardamos o .pfx nem a senha dele.** A origem sobe o arquivo para o
-- serviço deles, que extrai o que precisa para autenticar SAÍDA (mTLS de
-- verdade, num proxy). O Pipe não tem esse proxy — implementar o cadastro sem
-- fingir o resto (ver a tarefa) significa guardar só o que É público de um
-- certificado: descrição, hosts, validade e impressão digital. Nenhuma coluna
-- aqui pede cifra (`packages/db/src/segredo.ts`) porque nenhuma guarda chave.
--
-- Raw SQL, como `mensagem-ativa.ts`/`rastreador-de-cliques.ts` (migration
-- 0038): as tabelas não entram no schema Drizzle para não competir com quem
-- mexe em `identidade`/`automacao` ao mesmo tempo.
--
-- ## Como desfazer
--
-- DROP TABLE "certificado_mtls_host";
-- DROP TABLE "certificado_mtls";

CREATE TABLE IF NOT EXISTS "certificado_mtls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "descricao" text NOT NULL,
  "expira_em" date NOT NULL,
  "impressao_digital" text NOT NULL,
  "criado_por" uuid REFERENCES "usuario"("id") ON DELETE SET NULL,
  "criado_em" timestamptz DEFAULT now() NOT NULL,
  "atualizado_em" timestamptz
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "certificado_mtls_tenant_idx" ON "certificado_mtls" ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "certificado_mtls_host" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "certificado_id" uuid NOT NULL REFERENCES "certificado_mtls"("id") ON DELETE CASCADE,
  "host" text NOT NULL,
  "criado_em" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "certificado_mtls_host_certificado_idx" ON "certificado_mtls_host" ("certificado_id");--> statement-breakpoint

ALTER TABLE "certificado_mtls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "certificado_mtls";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "certificado_mtls"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

ALTER TABLE "certificado_mtls_host" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "certificado_mtls_host";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "certificado_mtls_host"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON certificado_mtls, certificado_mtls_host TO pipe_app';
  END IF;
END;
$$;

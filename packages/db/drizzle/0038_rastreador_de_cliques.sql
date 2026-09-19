-- Rastreador de cliques (Growth › Click Tracker): link curto por fluxo, e o
-- clique público que ele registra.
--
-- Duas tabelas, no mesmo formato de `roteador_servico`/`posicao_no_roteador`
-- (migration 0024): raw SQL aqui e em `dominio/rastreador-de-cliques.ts`, sem
-- entrar no schema Drizzle (`packages/db/src/schema`) — o mesmo caminho que
-- `mensagem-ativa.ts` já usa para não competir com quem mexe nos módulos
-- `identidade`/`automacao` ao mesmo tempo.
--
-- `link_rastreado.codigo` é o único índice SEM `tenant_id`: a rota pública de
-- redirecionamento (`GET /l/:codigo`) resolve o link ANTES de saber o tenant —
-- o mesmo problema que `resolverCanal` (webhook da Meta) já resolve lendo pelo
-- papel dono (`bancoDono()`), sem RLS. O clique em si é gravado com
-- `noTenant(tenantId, ...)`, já com o tenant que a resolução acima achou.
--
-- `clique_link.tenant_id` é redundante com `clique_link.link_id ->
-- link_rastreado.tenant_id`, mas sem ela a política `tenant_isolado` não tem o
-- que comparar — é o mesmo desenho de toda tabela filha do modelo de dados.
--
-- ## Como desfazer
--
-- DROP TABLE "clique_link";
-- DROP TABLE "link_rastreado";

CREATE TABLE IF NOT EXISTS "link_rastreado" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "fluxo_id" uuid NOT NULL REFERENCES "fluxo"("id") ON DELETE CASCADE,
  "nome" text NOT NULL,
  "destino_url" text NOT NULL,
  "codigo" text NOT NULL,
  "criado_em" timestamptz DEFAULT now() NOT NULL,
  "atualizado_em" timestamptz
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "link_rastreado_codigo_uk" ON "link_rastreado" ("codigo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "link_rastreado_fluxo_idx" ON "link_rastreado" ("tenant_id", "fluxo_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "clique_link" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "link_id" uuid NOT NULL REFERENCES "link_rastreado"("id") ON DELETE CASCADE,
  "agente_usuario" text,
  "origem" text,
  "criado_em" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clique_link_link_idx" ON "clique_link" ("link_id", "criado_em");--> statement-breakpoint

ALTER TABLE "link_rastreado" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "link_rastreado";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "link_rastreado"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

ALTER TABLE "clique_link" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "clique_link";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "clique_link"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON link_rastreado, clique_link TO pipe_app';
  END IF;
END;
$$;

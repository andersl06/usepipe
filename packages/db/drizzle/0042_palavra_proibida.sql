-- Palavras proibidas — a lista que barra o envio do atendente.
--
-- Fonte: `referencias-blip/pesquisa/blip-desk-regras-tecnicas.md` §3.4 ("Palavras proibidas").
-- Na origem a lista mora num bucket POR CONTA (`lime://<owner>/buckets/blip:desk:
-- forbidden-words`), não por fila nem por atendente; aqui é uma linha por termo,
-- por tenant. Quem usa: `apps/api/src/dominio/gestao/palavras-proibidas.ts` (o
-- cadastro e a conferência) e `apps/api/src/dominio/envio.ts` (a recusa).
--
-- `termo` fica como o gestor digitou (é o que a recusa mostra entre aspas); a
-- comparação sem acento e sem caixa é regra do domínio, aplicada nos dois lados na
-- hora de conferir. Termo com espaço é FRASE (substring do texto inteiro); sem
-- espaço é palavra solta (comparada token a token) — as duas passadas de
-- `checkForbiddenWords` da origem.
--
-- `ativo` é o "hasForbiddenWords" por termo: desligar não apaga, e um termo
-- desligado não bloqueia. O único é por (tenant, lower(termo)) para a mesma palavra
-- não entrar duas vezes só por causa de maiúscula — o domínio ainda confere sem
-- acento antes de gravar, e é ele que responde 409 com o motivo.
--
-- O índice parcial atende à ÚNICA leitura quente: "todos os termos ativos deste
-- tenant", feita uma vez por tenant e guardada em memória por 5 min
-- (`CONFIGURATION_EXPIRATION_FORBIDDEN_WORDS_TIME` da origem, `blip-desk-regras.md`).
--
-- ## Como desfazer
--
-- DROP TABLE "palavra_proibida";

CREATE TABLE IF NOT EXISTS "palavra_proibida" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "termo" text NOT NULL,
  "ativo" boolean DEFAULT true NOT NULL,
  "criado_em" timestamptz DEFAULT now() NOT NULL,
  "atualizado_em" timestamptz,
  CONSTRAINT "palavra_proibida_termo_ck" CHECK (length(btrim("termo")) > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "palavra_proibida_termo_uk"
  ON "palavra_proibida" ("tenant_id", lower("termo"));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "palavra_proibida_ativa_idx"
  ON "palavra_proibida" ("tenant_id") WHERE "ativo";--> statement-breakpoint

-- Tabela nova entra na RLS como todas as outras (`rls.test.ts` varre o catálogo).
ALTER TABLE "palavra_proibida" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "palavra_proibida";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "palavra_proibida"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON palavra_proibida TO pipe_app';
  END IF;
END;
$$;

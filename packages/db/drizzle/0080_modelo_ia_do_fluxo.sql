-- P16: the flow's AI model. Blip keeps the NLP model (intents with questions and answers, entities
-- with values and synonyms), the content assistant (contents whose intent/entity combinations map
-- to a result) and the AI Answers assistants per bot, outside the flow document. Pipe keeps them
-- per flow, one row per flow, as JSON lists the API validates. The engine reads it through
-- `ServicosDoMotor.analyzeInput`/`matchContent`/`processAnswers`; provider keys are never stored
-- here (`configuracao.apiKeySecret` only names a flow secret, 0055).
CREATE TABLE IF NOT EXISTS "modelo_ia_do_fluxo" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "fluxo_id" uuid NOT NULL REFERENCES "fluxo"("id") ON DELETE CASCADE,
  "configuracao" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "intencoes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "entidades" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "conteudos" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "assistentes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "criado_em" timestamptz NOT NULL DEFAULT now(),
  "atualizado_em" timestamptz,
  CONSTRAINT "modelo_ia_do_fluxo_tamanho_ck" CHECK (
    octet_length("configuracao"::text) + octet_length("intencoes"::text) + octet_length("entidades"::text)
      + octet_length("conteudos"::text) + octet_length("assistentes"::text) <= 2097152
  )
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "modelo_ia_do_fluxo_fluxo_uk"
  ON "modelo_ia_do_fluxo" ("tenant_id", "fluxo_id");--> statement-breakpoint
ALTER TABLE "modelo_ia_do_fluxo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "modelo_ia_do_fluxo";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "modelo_ia_do_fluxo"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON modelo_ia_do_fluxo TO pipe_app';
  END IF;
END;
$$;

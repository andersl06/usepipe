-- Codigo (stateId do Builder) do bloco nas mensagens do bot e na execucao: o id da linha `bloco` muda a cada publicacao, o codigo nao. Historico de mudancas de status do atendente. Aditiva e idempotente.
ALTER TABLE "mensagem" ADD COLUMN IF NOT EXISTS "bloco_atual_codigo" text;--> statement-breakpoint
ALTER TABLE "mensagem" ADD COLUMN IF NOT EXISTS "bloco_anterior_codigo" text;--> statement-breakpoint
ALTER TABLE "execucao_fluxo" ADD COLUMN IF NOT EXISTS "bloco_anterior_codigo" text;--> statement-breakpoint
-- Backfill pelo id do bloco ainda existente; linhas cujo bloco sumiu ficam sem codigo (o nome continua la).
UPDATE "mensagem" m SET "bloco_atual_codigo" = b."codigo"
  FROM "bloco" b
 WHERE b."id" = m."bloco_atual_id" AND m."bloco_atual_codigo" IS NULL;--> statement-breakpoint
UPDATE "mensagem" m SET "bloco_anterior_codigo" = b."codigo"
  FROM "bloco" b
 WHERE b."id" = m."bloco_anterior_id" AND m."bloco_anterior_codigo" IS NULL;--> statement-breakpoint
UPDATE "execucao_fluxo" x SET "bloco_anterior_codigo" = b."codigo"
  FROM "bloco" b
 WHERE b."id" = x."bloco_anterior_id" AND x."bloco_anterior_codigo" IS NULL;--> statement-breakpoint
-- Historico de status do atendente: uma linha por troca efetiva (de -> para), gravada na mesma transacao da troca.
CREATE TABLE IF NOT EXISTS "status_atendente_historico" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "usuario_id" uuid NOT NULL REFERENCES "usuario"("id") ON DELETE CASCADE,
  "de" text NOT NULL,
  "para" text NOT NULL,
  "motivo" text,
  "em" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "status_atendente_historico_de_ck" CHECK ("de" in ('Online', 'Pause', 'Invisible', 'Offline')),
  CONSTRAINT "status_atendente_historico_para_ck" CHECK ("para" in ('Online', 'Pause', 'Invisible', 'Offline'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "status_atendente_historico_usuario_idx"
  ON "status_atendente_historico" ("tenant_id", "usuario_id", "em");--> statement-breakpoint
ALTER TABLE "status_atendente_historico" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "status_atendente_historico";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "status_atendente_historico"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON status_atendente_historico TO pipe_app';
  END IF;
END;
$$;

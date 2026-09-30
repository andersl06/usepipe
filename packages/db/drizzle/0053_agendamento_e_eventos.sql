-- P7 (plan 02-46): Blip's `postmaster@scheduler.msging.net` `/schedules` and
-- `postmaster@analytics.msging.net` `set /event-track`, run natively.
--
-- `agendamento_mensagem`: one scheduled message per Blip message id (`/schedules/{id}`). The row is
-- authoritative; a delayed job fires it at `quando` and a sweep picks up any job that was lost.
-- `destino` is the LIME `to`: a contact identity or a distribution list (`{lista}@broadcast.msging.net`).
-- `resultado` keeps the per-recipient outcome of the send.
CREATE TABLE IF NOT EXISTS "agendamento_mensagem" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "fluxo_id" uuid REFERENCES "fluxo"("id") ON DELETE SET NULL,
  "contato_id" uuid REFERENCES "contato"("id") ON DELETE SET NULL,
  "mensagem_id" text NOT NULL,
  "nome" text,
  "destino" text NOT NULL,
  "tipo" text NOT NULL,
  "conteudo" jsonb NOT NULL DEFAULT 'null'::jsonb,
  "quando" timestamptz NOT NULL,
  "estado" text NOT NULL DEFAULT 'agendada',
  "resultado" jsonb,
  "executado_em" timestamptz,
  "criado_em" timestamptz NOT NULL DEFAULT now(),
  "atualizado_em" timestamptz,
  CONSTRAINT "agendamento_mensagem_estado_ck" CHECK ("estado" IN ('agendada', 'executada', 'cancelada', 'falhou')),
  CONSTRAINT "agendamento_mensagem_conteudo_ck" CHECK (pg_column_size("conteudo") <= 65536),
  CONSTRAINT "agendamento_mensagem_id_ck" CHECK (length("mensagem_id") between 1 and 200)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agendamento_mensagem_tenant_mensagem_uk"
  ON "agendamento_mensagem" ("tenant_id", "mensagem_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agendamento_mensagem_pendente_idx"
  ON "agendamento_mensagem" ("quando") WHERE "estado" = 'agendada';--> statement-breakpoint
-- `evento_rastreado`: the events a bot records with `set /event-track` (category → action), read
-- back by `get /event-track/{category}` as daily counts.
CREATE TABLE IF NOT EXISTS "evento_rastreado" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "fluxo_id" uuid REFERENCES "fluxo"("id") ON DELETE SET NULL,
  "contato_id" uuid REFERENCES "contato"("id") ON DELETE SET NULL,
  "categoria" text NOT NULL,
  "acao" text NOT NULL,
  "extras" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "em" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "evento_rastreado_categoria_ck" CHECK (length("categoria") between 1 and 200),
  CONSTRAINT "evento_rastreado_acao_ck" CHECK (length("acao") between 1 and 200),
  CONSTRAINT "evento_rastreado_extras_ck" CHECK (pg_column_size("extras") <= 16384)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evento_rastreado_categoria_idx"
  ON "evento_rastreado" ("tenant_id", "categoria", "em");--> statement-breakpoint
ALTER TABLE "agendamento_mensagem" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "agendamento_mensagem";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "agendamento_mensagem"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint
ALTER TABLE "evento_rastreado" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "evento_rastreado";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "evento_rastreado"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON agendamento_mensagem, evento_rastreado TO pipe_app';
  END IF;
END;
$$;

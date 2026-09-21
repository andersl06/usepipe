-- Cursor durável da chamada externa: a espera não pode carregar a transação da mensagem.

CREATE TABLE IF NOT EXISTS "process_http_execucao" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "execucao_id" uuid NOT NULL REFERENCES "execucao_fluxo"("id") ON DELETE CASCADE,
  "chave" text NOT NULL,
  "bloco_id" uuid REFERENCES "bloco"("id") ON DELETE SET NULL,
  "bloco_codigo" text NOT NULL,
  "lista" text NOT NULL,
  "indice" integer NOT NULL,
  "entrada" jsonb NOT NULL,
  "contexto" jsonb NOT NULL,
  "pedido" jsonb NOT NULL,
  "estado" text NOT NULL DEFAULT 'pendente',
  "resposta" jsonb,
  "criado_em" timestamptz DEFAULT now() NOT NULL,
  "atualizado_em" timestamptz,
  CONSTRAINT "process_http_execucao_estado_ck" CHECK ("estado" in ('pendente', 'chamando', 'respondida', 'retomada'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "process_http_execucao_chave_uk"
  ON "process_http_execucao" ("execucao_id", "chave");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "process_http_execucao_pendente_idx"
  ON "process_http_execucao" ("tenant_id", "estado");--> statement-breakpoint
ALTER TABLE "process_http_execucao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "process_http_execucao"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON process_http_execucao TO pipe_app';
  END IF;
END;
$$;

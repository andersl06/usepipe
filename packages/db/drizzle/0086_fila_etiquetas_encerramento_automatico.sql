-- Tags da fila e configuracao de encerramento automatico por inatividade (RLS da tabela fila cobre as colunas).
ALTER TABLE "fila" ADD COLUMN IF NOT EXISTS "etiquetas" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fila" ADD COLUMN IF NOT EXISTS "encerramento_automatico" jsonb;--> statement-breakpoint
ALTER TABLE "fila" ADD CONSTRAINT "fila_etiquetas_array_ck" CHECK (jsonb_typeof("etiquetas") = 'array');--> statement-breakpoint
ALTER TABLE "fila" ADD CONSTRAINT "fila_encerramento_objeto_ck" CHECK ("encerramento_automatico" IS NULL OR jsonb_typeof("encerramento_automatico") = 'object');

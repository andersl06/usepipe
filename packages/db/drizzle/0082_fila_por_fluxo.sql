-- Expand de D-04: fila, regra de prioridade e fila padrao passam a pertencer a um fluxo.
-- Somente aditiva (colunas nullable e indices); o contract (apagar legado + NOT NULL)
-- vem em migration posterior. RLS tenant_isolado das tres tabelas permanece valendo.
ALTER TABLE "fila" ADD COLUMN IF NOT EXISTS "fluxo_id" uuid REFERENCES "fluxo"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fila_tenant_fluxo_idx" ON "fila" ("tenant_id", "fluxo_id");--> statement-breakpoint
ALTER TABLE "fluxo" ADD COLUMN IF NOT EXISTS "fila_padrao_id" uuid REFERENCES "fila"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "regra_prioridade" ADD COLUMN IF NOT EXISTS "fluxo_id" uuid REFERENCES "fluxo"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "regra_prioridade_tenant_fluxo_idx" ON "regra_prioridade" ("tenant_id", "fluxo_id");

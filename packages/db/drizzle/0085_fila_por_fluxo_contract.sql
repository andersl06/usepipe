-- Contract de D-04: fila e regra de prioridade passam a exigir fluxo.
-- D-05: o legado (sem fluxo) e excluido sem migracao de dados, confirmado pelo dono em 03.1-DECISOES.md.
-- A exclusao da fila cascata em regra_fila e fila_atendente; conversa, inbox, fluxo e demais referencias ficam SET NULL.
DELETE FROM "regra_prioridade" WHERE "fluxo_id" IS NULL;--> statement-breakpoint
DELETE FROM "fila" WHERE "fluxo_id" IS NULL;--> statement-breakpoint
ALTER TABLE "fila" ALTER COLUMN "fluxo_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "regra_prioridade" ALTER COLUMN "fluxo_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "fila_tenant_nome_uk";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fila_tenant_fluxo_nome_uk" ON "fila" USING btree ("tenant_id","fluxo_id","nome");

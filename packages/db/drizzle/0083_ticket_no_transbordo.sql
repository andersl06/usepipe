-- D-15: o ticket nasce no transbordo; a conversa do bot vive em execucao_fluxo. Aditiva; os dados legados e o estado antigo do bot sao tratados na 0084.
ALTER TABLE "execucao_fluxo" ADD COLUMN IF NOT EXISTS "inbox_id" uuid REFERENCES "inbox"("id") ON DELETE CASCADE;--> statement-breakpoint
UPDATE "execucao_fluxo" e SET "inbox_id" = c."inbox_id" FROM "conversa" c WHERE c."id" = e."conversa_id" AND e."inbox_id" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "execucao_fluxo_contato_inbox_idx" ON "execucao_fluxo" ("tenant_id", "contato_id", "inbox_id");--> statement-breakpoint
ALTER TABLE "mensagem" ADD COLUMN IF NOT EXISTS "execucao_id" uuid REFERENCES "execucao_fluxo"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "mensagem" ALTER COLUMN "conversa_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mensagem" DROP CONSTRAINT IF EXISTS "mensagem_conversa_ou_execucao_ck";--> statement-breakpoint
ALTER TABLE "mensagem" ADD CONSTRAINT "mensagem_conversa_ou_execucao_ck" CHECK ("conversa_id" IS NOT NULL OR "execucao_id" IS NOT NULL);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mensagem_execucao_idx" ON "mensagem" ("tenant_id", "execucao_id", "criada_em");

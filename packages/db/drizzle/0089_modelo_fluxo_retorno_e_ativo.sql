-- Modelo de mensagem aponta para o bloco do Builder onde a conversa continua quando o cliente responde, e ganha o interruptor "ativo" (se o modelo pode ser usado no envio). Aditiva e idempotente; o bloco removido do Builder zera o vinculo (on delete set null). A RLS da tabela cobre as colunas.
ALTER TABLE "template_mensagem" ADD COLUMN IF NOT EXISTS "fluxo_retorno_bloco_id" uuid;--> statement-breakpoint
ALTER TABLE "template_mensagem" ADD COLUMN IF NOT EXISTS "ativo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "template_mensagem" ADD CONSTRAINT "template_mensagem_fluxo_retorno_bloco_id_bloco_id_fk" FOREIGN KEY ("fluxo_retorno_bloco_id") REFERENCES "public"."bloco"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "template_mensagem_fluxo_retorno_idx" ON "template_mensagem" USING btree ("fluxo_retorno_bloco_id") WHERE "fluxo_retorno_bloco_id" IS NOT NULL;

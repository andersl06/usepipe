-- Horario de atendimento com descricao e marca de "horario regular" (no maximo um por tenant), e periodo sem atendimento com inicio e fim em data e hora. A RLS das tabelas cobre as colunas. Aditiva e idempotente: as colunas antigas (data, inicio, fim) continuam valendo para a excecao de dia.
ALTER TABLE "horario_atendimento" ADD COLUMN IF NOT EXISTS "descricao" text;--> statement-breakpoint
ALTER TABLE "horario_atendimento" ADD COLUMN IF NOT EXISTS "regular" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "horario_atendimento" DROP CONSTRAINT IF EXISTS "horario_atendimento_descricao_ck";--> statement-breakpoint
ALTER TABLE "horario_atendimento" ADD CONSTRAINT "horario_atendimento_descricao_ck" CHECK ("descricao" IS NULL OR char_length("descricao") <= 300);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "horario_atendimento_regular_uk" ON "horario_atendimento" USING btree ("tenant_id") WHERE "regular";--> statement-breakpoint
ALTER TABLE "horario_excecao" ADD COLUMN IF NOT EXISTS "inicio_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "horario_excecao" ADD COLUMN IF NOT EXISTS "fim_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "horario_excecao" ADD COLUMN IF NOT EXISTS "dia_completo" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "horario_excecao" DROP CONSTRAINT IF EXISTS "horario_excecao_periodo_ck";--> statement-breakpoint
ALTER TABLE "horario_excecao" ADD CONSTRAINT "horario_excecao_periodo_ck" CHECK (("inicio_em" IS NULL AND "fim_em" IS NULL) OR ("inicio_em" IS NOT NULL AND "fim_em" IS NOT NULL AND "fim_em" > "inicio_em"));--> statement-breakpoint
UPDATE "horario_excecao" e SET "inicio_em" = (e."data"::timestamp) AT TIME ZONE h."fuso", "fim_em" = ((e."data" + 1)::timestamp) AT TIME ZONE h."fuso", "dia_completo" = true FROM "horario_atendimento" h WHERE h."id" = e."horario_id" AND e."fechado" AND e."inicio_em" IS NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "horario_excecao_uk";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "horario_excecao_dia_uk" ON "horario_excecao" USING btree ("horario_id","data") WHERE "inicio_em" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "horario_excecao_horario_idx" ON "horario_excecao" USING btree ("horario_id","data");

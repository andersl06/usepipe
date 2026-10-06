-- Nomear versao (Builder > Configuracao > Versoes). Na Blip cada versao publicada tem titulo (ate 50 caracteres) e descricao (ate 200). Aditiva e idempotente: duas colunas opcionais, sem tocar em dado existente. A CHECK vai junto da coluna, entao so e criada quando a coluna e criada.
ALTER TABLE "fluxo_versao" ADD COLUMN IF NOT EXISTS "titulo" text CONSTRAINT "fluxo_versao_titulo_ck" CHECK (char_length("titulo") <= 50);--> statement-breakpoint
ALTER TABLE "fluxo_versao" ADD COLUMN IF NOT EXISTS "descricao" text CONSTRAINT "fluxo_versao_descricao_ck" CHECK (char_length("descricao") <= 200);

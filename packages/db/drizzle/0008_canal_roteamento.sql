-- As duas chaves de roteamento do webhook do WhatsApp.
--
-- Os eventos de TEMPLATE e de CONTA da Meta não aceitam URL por cliente: eles
-- caem todos na URL do aplicativo, misturando os clientes num endereço só. Nessa
-- rota o tenant tem de sair do payload — `entry[].id` é o WABA e
-- `metadata.phone_number_id` é o número — e resolver por payload é consulta.
-- Consulta em `config` jsonb sem índice é varredura de tabela a cada evento.
--
-- Ver `docs/specs/2026-09-07-webhook-por-cliente.md`.

ALTER TABLE "canal" ADD COLUMN IF NOT EXISTS "waba_id" text;--> statement-breakpoint
ALTER TABLE "canal" ADD COLUMN IF NOT EXISTS "numero_id" text;--> statement-breakpoint

-- Único e GLOBAL, não por tenant. Dois clientes com o mesmo `numero_id` é estado
-- impossível: seriam dois donos para o mesmo número de WhatsApp. O banco recusa
-- antes de a aplicação ter de escolher, e escolher errado aqui é entregar a
-- mensagem de um cliente a outro.
CREATE UNIQUE INDEX IF NOT EXISTS "canal_numero_id_uk"
  ON "canal" ("numero_id") WHERE "numero_id" IS NOT NULL;--> statement-breakpoint

-- O WABA não é único: um cliente pode ter vários números no mesmo WABA, e cada
-- número vira um canal.
CREATE INDEX IF NOT EXISTS "canal_waba_id_idx"
  ON "canal" ("waba_id") WHERE "waba_id" IS NOT NULL;

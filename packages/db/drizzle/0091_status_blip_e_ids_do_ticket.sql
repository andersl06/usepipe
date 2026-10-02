-- D-01..D-06: status do ticket e do atendente com a grafia da Blip, numero sequencial e ticket pai, carimbo de bloco nas mensagens do bot. Idempotente.
ALTER TABLE "conversa" DROP CONSTRAINT IF EXISTS "conversa_estado_ck";--> statement-breakpoint
ALTER TABLE "conversa" DROP CONSTRAINT IF EXISTS "conversa_standby_ck";--> statement-breakpoint
-- D-02/D-03: conversas abertas; "em espera" vira Open e mantem em_espera_desde.
UPDATE "conversa" SET "estado" = 'Waiting' WHERE "estado" = 'na_fila';--> statement-breakpoint
UPDATE "conversa" SET "estado" = 'Assigned' WHERE "estado" = 'atribuida';--> statement-breakpoint
UPDATE "conversa" SET "estado" = 'Open' WHERE "estado" IN ('em_atendimento', 'em_espera');--> statement-breakpoint
-- D-02: encerradas, primeiro pelo ultimo evento 'encerrada' da conversa.
UPDATE "conversa" c SET "estado" = CASE u."por"
    WHEN 'atendente' THEN 'ClosedAttendant'
    WHEN 'cliente' THEN 'ClosedClient'
    WHEN 'inatividade' THEN 'ClosedClientInactivity'
    WHEN 'transferencia' THEN 'Transferred'
  END
  FROM (
    SELECT DISTINCT ON (e."conversa_id") e."conversa_id", e."dados"->>'encerrada_por' AS "por"
      FROM "evento_atendimento" e
     WHERE e."tipo" = 'encerrada'
     ORDER BY e."conversa_id", e."em" DESC
  ) u
 WHERE c."id" = u."conversa_id"
   AND c."estado" = 'encerrada'
   AND u."por" IN ('atendente', 'cliente', 'inatividade', 'transferencia');--> statement-breakpoint
-- A2: heuristica de legado; confirmar com o dono antes de aplicar em homologacao/producao.
UPDATE "conversa" SET "estado" = CASE
    WHEN "motivo_encerramento" = 'Transferida' OR "motivo_encerramento" ILIKE '%transfer%' THEN 'Transferred'
    WHEN "motivo_encerramento" ILIKE '%encerramento_automatico%' OR "motivo_encerramento" ILIKE '%inativ%' THEN 'ClosedClientInactivity'
    WHEN "encerrada_por" IS NOT NULL THEN 'ClosedAttendant'
    ELSE 'ClosedClient'
  END
 WHERE "estado" = 'encerrada';--> statement-breakpoint
UPDATE "conversa" SET "em_espera_desde" = NULL WHERE "em_espera_desde" IS NOT NULL AND "estado" <> 'Open';--> statement-breakpoint
ALTER TABLE "conversa" ALTER COLUMN "estado" SET DEFAULT 'Waiting';--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_estado_ck"
  CHECK ("estado" in ('Waiting', 'Assigned', 'Open', 'ClosedAttendant', 'ClosedClient', 'ClosedClientInactivity', 'Transferred'));--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_standby_ck"
  CHECK ("em_espera_desde" IS NULL OR "estado" = 'Open');--> statement-breakpoint
-- D-04: status do atendente.
ALTER TABLE "status_atendente" DROP CONSTRAINT IF EXISTS "status_atendente_estado_ck";--> statement-breakpoint
UPDATE "status_atendente" SET "estado" = CASE "estado"
    WHEN 'online' THEN 'Online'
    WHEN 'pausa' THEN 'Pause'
    WHEN 'invisivel' THEN 'Invisible'
    WHEN 'offline' THEN 'Offline'
    ELSE "estado"
  END;--> statement-breakpoint
ALTER TABLE "status_atendente" ALTER COLUMN "estado" SET DEFAULT 'Offline';--> statement-breakpoint
ALTER TABLE "status_atendente" ADD CONSTRAINT "status_atendente_estado_ck"
  CHECK ("estado" in ('Online', 'Pause', 'Invisible', 'Offline'));--> statement-breakpoint
-- D-05: numero sequencial por tenant e ticket pai.
ALTER TABLE "conversa" ADD COLUMN IF NOT EXISTS "numero_sequencial" bigint;--> statement-breakpoint
ALTER TABLE "conversa" ADD COLUMN IF NOT EXISTS "conversa_pai_id" uuid REFERENCES "conversa"("id") ON DELETE SET NULL;--> statement-breakpoint
UPDATE "conversa" c SET "numero_sequencial" = n."seq"
  FROM (
    SELECT x."id",
           row_number() OVER (PARTITION BY x."tenant_id" ORDER BY x."criada_em", x."id")
           + coalesce((SELECT max(m."numero_sequencial") FROM "conversa" m WHERE m."tenant_id" = x."tenant_id"), 0) AS "seq"
      FROM "conversa" x
     WHERE x."numero_sequencial" IS NULL
  ) n
 WHERE c."id" = n."id";--> statement-breakpoint
ALTER TABLE "conversa" ALTER COLUMN "numero_sequencial" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "conversa_tenant_numero_uk" ON "conversa" ("tenant_id", "numero_sequencial");--> statement-breakpoint
CREATE OR REPLACE FUNCTION conversa_numero_sequencial() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $fn$
BEGIN
  IF NEW."numero_sequencial" IS NULL THEN
    -- ponytail: trava por tenant serializa a criacao de tickets do tenant; trocar por tabela contadora se houver contencao.
    PERFORM pg_advisory_xact_lock(hashtext('conversa_numero:' || NEW."tenant_id"::text));
    NEW."numero_sequencial" := coalesce((SELECT max("numero_sequencial") FROM "conversa" WHERE "tenant_id" = NEW."tenant_id"), 0) + 1;
  END IF;
  RETURN NEW;
END
$fn$;--> statement-breakpoint
DROP TRIGGER IF EXISTS "conversa_numero_sequencial_trg" ON "conversa";--> statement-breakpoint
CREATE TRIGGER "conversa_numero_sequencial_trg" BEFORE INSERT ON "conversa"
  FOR EACH ROW EXECUTE FUNCTION conversa_numero_sequencial();--> statement-breakpoint
-- D-06: carimbo de bloco nas mensagens do bot e bloco anterior na execucao.
ALTER TABLE "execucao_fluxo" ADD COLUMN IF NOT EXISTS "bloco_anterior_id" uuid REFERENCES "bloco"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "mensagem" ADD COLUMN IF NOT EXISTS "bloco_atual_id" uuid;--> statement-breakpoint
ALTER TABLE "mensagem" ADD COLUMN IF NOT EXISTS "bloco_atual_nome" text;--> statement-breakpoint
ALTER TABLE "mensagem" ADD COLUMN IF NOT EXISTS "bloco_anterior_id" uuid;--> statement-breakpoint
ALTER TABLE "mensagem" ADD COLUMN IF NOT EXISTS "bloco_anterior_nome" text;

-- D-15: o ticket nasce no transbordo; desfaz a 0081 da pipe-40, removida do repositorio; idempotente para bancos que a aplicaram ou nao.
-- Conversas que eram so do bot (sem fila, sem atendente, com execucao, sem evento de entrada em fila) deixam de ser conversa e passam a viver na execucao.
CREATE TEMP TABLE "bot_only" AS
SELECT c."id", c."inbox_id",
       (SELECT e."id" FROM "execucao_fluxo" e WHERE e."conversa_id" = c."id" ORDER BY e."iniciada_em" DESC LIMIT 1) AS "execucao_id"
  FROM "conversa" c
 WHERE c."estado" IN ('na_fila', 'com_bot')
   AND c."fila_id" IS NULL
   AND c."atendente_id" IS NULL
   AND c."encerrada_em" IS NULL
   AND EXISTS (SELECT 1 FROM "execucao_fluxo" e WHERE e."conversa_id" = c."id")
   AND NOT EXISTS (
     SELECT 1 FROM "evento_atendimento" ev
      WHERE ev."conversa_id" = c."id" AND ev."tipo" IN ('criada', 'enfileirada')
   );--> statement-breakpoint
UPDATE "mensagem" m SET "execucao_id" = b."execucao_id", "conversa_id" = NULL
  FROM "bot_only" b WHERE m."conversa_id" = b."id" AND m."execucao_id" IS NULL;--> statement-breakpoint
UPDATE "mensagem" m SET "conversa_id" = NULL
  FROM "bot_only" b WHERE m."conversa_id" = b."id" AND m."execucao_id" IS NOT NULL;--> statement-breakpoint
UPDATE "execucao_fluxo" e SET "inbox_id" = b."inbox_id", "conversa_id" = NULL
  FROM "bot_only" b WHERE e."conversa_id" = b."id";--> statement-breakpoint
DELETE FROM "pesquisa_satisfacao_resposta" WHERE "conversa_id" IN (SELECT "id" FROM "bot_only");--> statement-breakpoint
DELETE FROM "conversa" WHERE "id" IN (SELECT "id" FROM "bot_only");--> statement-breakpoint
-- Qualquer conversa restante em com_bot (nao casou o predicado) volta para a fila.
UPDATE "conversa" SET "estado" = 'na_fila', "atualizado_em" = now() WHERE "estado" = 'com_bot';--> statement-breakpoint
ALTER TABLE "conversa" DROP CONSTRAINT IF EXISTS "conversa_estado_ck";--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_estado_ck"
  CHECK ("estado" in ('na_fila', 'atribuida', 'em_atendimento', 'em_espera', 'encerrada'));
--> statement-breakpoint
DROP TABLE "bot_only";

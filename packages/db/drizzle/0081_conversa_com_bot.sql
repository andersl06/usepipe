-- A conversation talking only to the channel's flow is with the bot, not waiting for an agent.
-- Until now every inbound conversation was born `na_fila`, so a contact that never left the bot
-- showed up in the Desk "Clientes aguardando" count, in "Atender", in monitoring "Na fila" and as
-- a Blip `Waiting` ticket. In Blip the ticket only exists after the flow forwards to human
-- attendance; before that there is no ticket. `com_bot` is that state (`@pipe/core` `maquina.ts`):
-- it leaves only through the queue entry (`enterQueue` → `na_fila`) or by closing.
ALTER TABLE "conversa" DROP CONSTRAINT IF EXISTS "conversa_estado_ck";--> statement-breakpoint
ALTER TABLE "conversa" ADD CONSTRAINT "conversa_estado_ck"
  CHECK ("estado" in ('com_bot', 'na_fila', 'atribuida', 'em_atendimento', 'em_espera', 'encerrada'));--> statement-breakpoint
-- Data: the open conversations the bot owns today. The rule mirrors `runFlowInInbound`: a
-- conversation without a queue and without an agent that has a flow execution is answered by the
-- bot on the next message (any execution state, as the engine resumes a concluded or failed one
-- too); the queue entry sets `fila_id` exactly once (`enterQueue`), and it never ran if no
-- `criada`/`enfileirada` event exists. A queueless `na_fila` conversation without an execution was
-- opened with no flow on the channel (an inbox without a default queue) and stays waiting.
UPDATE "conversa" c
   SET "estado" = 'com_bot', "atualizado_em" = now()
 WHERE c."estado" = 'na_fila'
   AND c."fila_id" IS NULL
   AND c."atendente_id" IS NULL
   AND c."encerrada_em" IS NULL
   AND EXISTS (SELECT 1 FROM "execucao_fluxo" e WHERE e."conversa_id" = c."id")
   AND NOT EXISTS (
     SELECT 1 FROM "evento_atendimento" ev
      WHERE ev."conversa_id" = c."id" AND ev."tipo" IN ('criada', 'enfileirada')
   );

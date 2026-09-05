-- Duas chaves estrangeiras que cruzam módulos em círculo e por isso não cabem no
-- schema TypeScript: `fila` (Conversas) aponta para `horario_atendimento` (Gestão),
-- e `contato` (Conversas) aponta para `conta` (CRM), enquanto os módulos de destino
-- apontam de volta. Declarar as duas em Drizzle criaria ciclo de import entre os
-- arquivos de schema; declarar aqui mantém a integridade referencial sem o ciclo.
--
-- Quem alterar o schema depois precisa lembrar de manter esta migration: um
-- `drizzle-kit generate` futuro não conhece estas constraints e proporia removê-las.

ALTER TABLE "fila"
  ADD CONSTRAINT "fila_horario_id_horario_atendimento_id_fk"
  FOREIGN KEY ("horario_id") REFERENCES "public"."horario_atendimento"("id")
  ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "contato"
  ADD CONSTRAINT "contato_conta_id_conta_id_fk"
  FOREIGN KEY ("conta_id") REFERENCES "public"."conta"("id")
  ON DELETE SET NULL;

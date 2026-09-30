-- P8 (plan 02-49): Blip's input expiration (`input.expiration`, the block's inactivity time).
--
-- After an input leaves the contact in a block that waits for input and has an expiration, the
-- execution row records WHEN that block expires and WHICH block it is. A delayed job wakes the
-- `api` at that moment and the engine runs the block's expiration input; a sweep fires anything
-- overdue (a lost job). The row is authoritative: every later input of the conversation rewrites
-- or clears both columns, so a job for an answered or left block finds nothing to claim.
-- RLS: `execucao_fluxo` already has `tenant_isolado`; only columns are added.
ALTER TABLE "execucao_fluxo" ADD COLUMN IF NOT EXISTS "entrada_expira_em" timestamptz;--> statement-breakpoint
ALTER TABLE "execucao_fluxo" ADD COLUMN IF NOT EXISTS "entrada_expira_bloco" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "execucao_fluxo_entrada_expira_idx"
  ON "execucao_fluxo" ("entrada_expira_em") WHERE "entrada_expira_em" IS NOT NULL;

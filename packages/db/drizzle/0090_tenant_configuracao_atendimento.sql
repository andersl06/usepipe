-- Preferencias globais de Configuracoes gerais (distribuicao, transferencia, midia, alertas, mensagens ativas, historico, calls, Modo de Espera) e encerramento automatico global, num documento por tenant validado na API. A RLS do tenant cobre a coluna. Aditiva e idempotente.
ALTER TABLE "tenant" ADD COLUMN IF NOT EXISTS "configuracao_atendimento" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant" DROP CONSTRAINT IF EXISTS "tenant_configuracao_atendimento_ck";--> statement-breakpoint
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_configuracao_atendimento_ck" CHECK (jsonb_typeof("configuracao_atendimento") = 'object');

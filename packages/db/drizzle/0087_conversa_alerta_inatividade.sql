-- Marca do alerta de inatividade ja enviado na conversa (no maximo um alerta por ciclo de inatividade). A RLS da tabela conversa cobre a coluna.
ALTER TABLE "conversa" ADD COLUMN IF NOT EXISTS "alerta_inatividade_em" timestamp with time zone;

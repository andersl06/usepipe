-- Duas defesas que a análise de arquitetura multi-tenant pediu, e que são
-- baratas agora e caras depois. Ver `docs/pesquisa/arquitetura-multi-tenant.md`.

-- 1. Onde o tenant está hospedado.
--
-- Todo mundo nasce em `compartilhada`. O campo existe para o dia em que o
-- primeiro cliente sair para instância própria: sem ele, saber a quem
-- perguntar vira consulta a planilha, e isso acontece justamente na véspera da
-- migração, quando ninguém tem tempo.
ALTER TABLE "tenant"
  ADD COLUMN IF NOT EXISTS "implantacao" text NOT NULL DEFAULT 'compartilhada';--> statement-breakpoint

ALTER TABLE "tenant"
  DROP CONSTRAINT IF EXISTS "tenant_implantacao_ck";--> statement-breakpoint

ALTER TABLE "tenant"
  ADD CONSTRAINT "tenant_implantacao_ck"
  CHECK ("implantacao" IN ('compartilhada', 'dedicada'));--> statement-breakpoint

-- 2. Os dois tempos-limite que contêm o vizinho barulhento.
--
-- `statement_timeout` corta a consulta que passou do ponto. Sem ele, um
-- relatório mal filtrado de um cliente segura conexão e trava os outros.
-- 30 segundos é o teto da Gestão, que é quem tem as consultas mais pesadas.
--
-- `idle_in_transaction_session_timeout` é o mais importante dos dois, e o mais
-- esquecido: transação aberta e parada segura o horizonte do autovacuum, e é
-- assim que o inchaço de tabela começa. Nenhuma transação nossa passa de
-- segundos; 15 é folga larga.
--
-- Ficam no PAPEL, não no servidor: migration roda com o papel dono, que precisa
-- de tempo livre para criar índice e partição.
--
-- ponytail: um teto para toda a aplicação. Papel por app (desk 5s, gestão 30s,
-- worker 120s) é o passo seguinte, quando cada um tiver credencial própria.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'ALTER ROLE pipe_app SET statement_timeout = ''30s''';
    EXECUTE 'ALTER ROLE pipe_app SET idle_in_transaction_session_timeout = ''15s''';
  END IF;
END;
$$;

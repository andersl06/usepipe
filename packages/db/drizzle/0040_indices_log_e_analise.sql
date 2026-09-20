-- Índices que faltavam para ler sem varredura — tarefa "fechar as telas do
-- contato" (Análise/Log). Nenhuma tabela nova: as duas já têm política de RLS
-- e GRANT de antes, então este arquivo não repete esse bloco.
--
-- 1. `conversa` não tinha índice por `inbox_id`. O Log de mensagens do fluxo
--    (`GET /v1/gestao/fluxos/:id/analise/log`, `carregarLogDeMensagens`) acha
--    primeiro as conversas do canal do bot — sem este índice, a busca varria
--    `conversa` inteira a cada consulta.
-- 2. `execucao_fluxo` não tinha índice por `fluxo_versao_id`. Dashboard, Visão
--    Geral, Jornada e agora o Log filtram por `fluxo_versao.fluxo_id`, e o
--    join desce até `execucao_fluxo` por essa coluna — sem índice, essa perna
--    também varria a tabela inteira.
--
-- ## Como desfazer
--
-- DROP INDEX "conversa_inbox_idx";
-- DROP INDEX "execucao_fluxo_versao_idx";

CREATE INDEX IF NOT EXISTS "conversa_inbox_idx" ON "conversa" ("tenant_id", "inbox_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "execucao_fluxo_versao_idx" ON "execucao_fluxo" ("tenant_id", "fluxo_versao_id");

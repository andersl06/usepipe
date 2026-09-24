-- Fixar conversa e marcar como não lida — o menu "⋮" do cartão do Desk.
--
-- Fonte: `referencias-blip/pesquisa/blip-desk-funcoes.md` §3 ("o próprio atendente pode fixar
-- manualmente até 50 tickets no topo da sua lista, e também marcar/desmarcar
-- qualquer ticket como 'não lido'") e `blip-desk-regras-tecnicas.md` §1.8
-- (`TicketMenuOptions`: PIN/UNPIN, UNREAD/READ). Quem usa:
-- `apps/api/src/dominio/desk/marcacoes.ts` e a lista em `desk/consultas.ts`.
--
-- É POR ATENDENTE, não por conversa: fixar é organização da lista de quem
-- fixou (a mesma conversa, transferida, chega limpa no colega), e "não lida"
-- é lembrete pessoal, não estado da conversa. Por isso não é coluna em
-- `conversa` — é uma tabela de marcação com chave (atendente, conversa) e um
-- carimbo por gesto: `fixada_em` nulo é "não fixada", `nao_lida_em` nulo é
-- "lida". A linha some quando os dois são nulos (o domínio apaga), para a
-- tabela não guardar marcação nenhuma.
--
-- O teto de 50 fixadas é regra do domínio, conferida na transação que fixa
-- (não cabe num CHECK, que só vê a linha).
--
-- ## Como desfazer
--
-- DROP TABLE "marcacao_conversa";

CREATE TABLE IF NOT EXISTS "marcacao_conversa" (
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "usuario_id" uuid NOT NULL REFERENCES "usuario"("id") ON DELETE CASCADE,
  "conversa_id" uuid NOT NULL REFERENCES "conversa"("id") ON DELETE CASCADE,
  "fixada_em" timestamptz,
  "nao_lida_em" timestamptz,
  CONSTRAINT "marcacao_conversa_pk" PRIMARY KEY ("usuario_id", "conversa_id"),
  CONSTRAINT "marcacao_conversa_alguma_ck"
    CHECK ("fixada_em" IS NOT NULL OR "nao_lida_em" IS NOT NULL)
);--> statement-breakpoint
-- A lista do Desk lê "as marcações deste atendente" e conta "quantas fixadas ele tem".
CREATE INDEX IF NOT EXISTS "marcacao_conversa_usuario_idx"
  ON "marcacao_conversa" ("tenant_id", "usuario_id");--> statement-breakpoint

-- Tabela nova entra na RLS como todas as outras (`rls.test.ts` varre o catálogo).
ALTER TABLE "marcacao_conversa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "marcacao_conversa";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "marcacao_conversa"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON marcacao_conversa TO pipe_app';
  END IF;
END;
$$;

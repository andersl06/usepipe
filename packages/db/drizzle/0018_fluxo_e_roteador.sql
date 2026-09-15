-- Fluxo e roteador: o mesmo contato inteligente em dois papéis.
--
-- Na plataforma de origem o cartão do portal traz uma etiqueta que sai do
-- `template` do bot: `builder` mostra "Fluxo" e `master` mostra "Roteador".
-- São a mesma entidade — o roteador é um bot SEM conteúdo próprio, que só
-- referencia outros (os subbots) e decide para qual deles cada conversa vai.
-- Por isso aqui é uma COLUNA em `fluxo`, e não uma tabela nova: separar criaria
-- duas listas, dois editores e duas telas para a mesma coisa.
--
-- Regra de negócio que vem junto (help.blip.ai, "Hierarquia de bots e subbots"):
-- roteador exige pelo menos um serviço, o serviço principal atende a primeira
-- interação, e o redirecionamento expira por inatividade. Nada disso é forçado
-- por esta migração — ela só abre o lugar onde o tipo vive.

ALTER TABLE "fluxo"
  ADD COLUMN IF NOT EXISTS "tipo" text NOT NULL DEFAULT 'fluxo';

DO $$
BEGIN
  ALTER TABLE "fluxo" ADD CONSTRAINT "fluxo_tipo_ck" CHECK ("tipo" IN ('fluxo', 'roteador'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

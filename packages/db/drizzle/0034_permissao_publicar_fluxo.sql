-- Publicar fluxo passa a ser um gesto de verdade — e quem "cria e edita
-- chatbots" precisa poder dá-lo.
--
-- `automacao.fluxo.publicar` está no catálogo desde a fundação ("Publicar
-- versão de fluxo"), mas nenhuma rota a conferia e nenhum papel da CONTA a
-- carregava: só `administrador` e `gestor` do atendimento a ganhavam, por
-- receberem tudo. Com `POST /v1/gestao/fluxos/:id/builder/publicar`
-- (`apps/api/src/dominio/gestao/builder-do-fluxo.ts`) ela vira porta trancada,
-- e a pessoa convidada como `member` ("Cria e edita chatbots, mas não gerencia
-- os membros do contrato", migração 0021) ficaria com o botão de publicar
-- respondendo 403 — na origem, quem edita o bot publica o bot; o botão
-- "Publicar fluxo" do Builder não tem permissão à parte.
--
-- Mesmo padrão de `0023_permissao_excluir_fluxo.sql`: garante o catálogo e
-- concede aos papéis de SISTEMA que carregam `automacao.fluxo.editar` —
-- `admin` e `member` da conta, `administrador` e `gestor` do atendimento (estes
-- dois já a têm em tenant novo pela semente; aqui é para tenant já implantado).
-- Papel que o cliente desenhou não é tocado. `guest` não ganha: só visualiza.
--
-- ## Como desfazer
--
-- DELETE FROM "papel_permissao" WHERE "permissao_codigo" = 'automacao.fluxo.publicar'
-- (a permissão em si fica no catálogo, como sempre esteve).

INSERT INTO "permissao" ("codigo", "grupo", "descricao") VALUES
  ('automacao.fluxo.publicar', 'automacao', 'Publicar versão de fluxo')
ON CONFLICT ("codigo") DO NOTHING;--> statement-breakpoint

INSERT INTO "papel_permissao" ("tenant_id", "papel_id", "permissao_codigo")
SELECT p."tenant_id", p."id", 'automacao.fluxo.publicar'
  FROM "papel" p
 WHERE p."de_sistema"
   AND ((p."escopo" = 'conta' AND p."nome" IN ('admin', 'member'))
     OR (p."escopo" = 'atendimento' AND p."nome" IN ('administrador', 'gestor')))
ON CONFLICT DO NOTHING;

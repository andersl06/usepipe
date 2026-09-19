-- Excluir fluxo é permissão própria — e só do admin.
--
-- Na origem, o botão "Excluir fluxo" de "Editar Fluxo" nasce desligado para
-- quem não pode (`ng-disabled="!$ctrl.canDeleteBot"`), e a frase que explica
-- está no pacote de traduções (`modules.application.detail.edit.
-- deleteChatbotPermissionDenied`): "Somente um admin pode deletar o chatbot".
-- Criar e editar são de quem tem `automacao.fluxo.editar` — o `member` deles,
-- "Cria e edita chatbots" (migração 0021). Excluir NÃO: é o único gesto do
-- ciclo de vida que o `member` não faz.
--
-- Até aqui o catálogo tinha `automacao.fluxo.editar` e `automacao.fluxo.publicar`
-- e nada para excluir. Sem esta linha, a `api` teria de perguntar "é admin?"
-- pelo NOME do papel, e a regra do Pipe é a outra: permissão é a união dos
-- papéis (`GET /v1/eu`, `exigirPermissao`), e o nome do papel não decide nada.
--
-- Quem recebe, no backfill: o `admin` da conta (o admin deles) e o
-- `administrador` do atendimento ("acesso total"). `member`, `guest`, `gestor`,
-- `supervisor`, `atendente` e `avaliador` ficam sem — e papel que o cliente
-- desenhou não é tocado, como nas migrações 0019 e 0021.
--
-- ## Como desfazer
--
-- DELETE FROM "permissao" WHERE "codigo" = 'automacao.fluxo.excluir' — a FK de
-- `papel_permissao` é `ON DELETE CASCADE` e leva as concessões junto.

INSERT INTO "permissao" ("codigo", "grupo", "descricao") VALUES
  ('automacao.fluxo.excluir', 'automacao', 'Excluir fluxo de conversa')
ON CONFLICT ("codigo") DO NOTHING;--> statement-breakpoint

INSERT INTO "papel_permissao" ("tenant_id", "papel_id", "permissao_codigo")
SELECT p."tenant_id", p."id", 'automacao.fluxo.excluir'
  FROM "papel" p
 WHERE p."de_sistema"
   AND ((p."escopo" = 'conta' AND p."nome" = 'admin')
     OR (p."escopo" = 'atendimento' AND p."nome" = 'administrador'))
ON CONFLICT DO NOTHING;

-- Chaves de acesso por fluxo, e a permissão que faltava para integração
-- (webhook de saída e conexão HTTP do fluxo).
--
-- ## chave_api.fluxo_id
--
-- `chave_api` sempre foi da CONTA (o escopo que `chave_api.gerenciar` já
-- cobre). A tela "Chaves de acesso" do fluxo (`configuracoes/keys`) pede uma
-- chave por FLUXO, e a tabela não tinha como amarrar as duas coisas — daí a
-- coluna nova, opcional: `null` continua sendo chave de conta, preenchida é
-- chave de um fluxo só.
--
-- A FK para `fluxo` não está no schema TypeScript (`identidade.ts`): ela
-- cruzaria `identidade` (módulo 1, sem dependências) com `automacao` (que já
-- importa de `identidade`), o mesmo ciclo que `0003_chaves_cruzadas.sql`
-- resolveu do mesmo jeito — coluna simples no Drizzle, constraint aqui.
-- `ON DELETE CASCADE`: hoje excluir fluxo ARQUIVA (nunca chega a apagar a
-- linha, `ciclo-de-vida-do-fluxo.ts`), mas se um fluxo for apagado de
-- verdade um dia, a chave dele não serve mais para nada.
--
-- ## automacao.integracao.gerenciar
--
-- Nem "Informações de conexão" nem "Webhook" (Integrações) tinham permissão
-- própria. `chave_api.gerenciar` cobre a emissão de chave; isto aqui cobre
-- gravar URL de webhook e de conexão HTTP — capacidade diferente, mesmo
-- padrão de `0023_permissao_excluir_fluxo.sql` e `0030_...sql`: entra no
-- catálogo e é concedida de volta a quem já edita fluxo
-- (`automacao.fluxo.editar`) — `administrador`/`gestor` no escopo
-- atendimento, `admin`/`member` no escopo conta.
--
-- ## Como desfazer
--
-- ALTER TABLE "chave_api" DROP CONSTRAINT "chave_api_fluxo_id_fluxo_id_fk";
-- DROP INDEX "chave_api_fluxo_idx";
-- ALTER TABLE "chave_api" DROP COLUMN "fluxo_id";
-- DELETE FROM "permissao" WHERE "codigo" = 'automacao.integracao.gerenciar'
-- — a FK de `papel_permissao` é `ON DELETE CASCADE` e leva as concessões junto.

ALTER TABLE "chave_api" ADD COLUMN "fluxo_id" uuid;
--> statement-breakpoint
CREATE INDEX "chave_api_fluxo_idx" ON "chave_api" ("tenant_id","fluxo_id");
--> statement-breakpoint
ALTER TABLE "chave_api"
  ADD CONSTRAINT "chave_api_fluxo_id_fluxo_id_fk"
  FOREIGN KEY ("fluxo_id") REFERENCES "public"."fluxo"("id")
  ON DELETE CASCADE;
--> statement-breakpoint

INSERT INTO "permissao" ("codigo", "grupo", "descricao") VALUES
  ('automacao.integracao.gerenciar', 'automacao', 'Gerenciar webhook de saída e conexão HTTP do fluxo')
ON CONFLICT ("codigo") DO NOTHING;
--> statement-breakpoint

INSERT INTO "papel_permissao" ("tenant_id", "papel_id", "permissao_codigo")
SELECT p."tenant_id", p."id", 'automacao.integracao.gerenciar'
  FROM "papel" p
 WHERE p."de_sistema"
   AND ((p."escopo" = 'atendimento' AND p."nome" IN ('administrador', 'gestor'))
     OR (p."escopo" = 'conta' AND p."nome" IN ('admin', 'member')))
ON CONFLICT DO NOTHING;

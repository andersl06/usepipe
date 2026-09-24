-- Webhook de saída: autenticação e cabeçalhos customizados.
--
-- A tela `integracoes/webhook` (`referencias-blip/pesquisa/blip-integracoes-webhook.md`)
-- foi entregue com só URL + eventos por linha porque o banco não tinha onde
-- guardar o resto do formulário da origem: "Configurações de autenticação"
-- (switch + OAuth 2.0 `client_credentials`) e "Cabeçalhos customizados"
-- (Chave/Valor). Esta migration acrescenta as duas em `webhook_saida` — sem
-- tabela filha: são poucos campos, de UM webhook cada, sem histórico próprio
-- (o mesmo raciocínio de `fluxo.configuracao`, migration 0031).
--
-- A tarefa também pede autenticação Básica, que a origem não mostra — não há
-- captura para copiar, então o formato (`autenticacao_usuario` +
-- `autenticacao_senha`) é o óbvio de HTTP Basic.
--
-- `autenticacao_senha` e `oauth2_client_secret` são gravados CIFRADOS por
-- `@pipe/db/segredo` (`cifrar`/`decifrar`, envelope `pipev1.<chave>...`),
-- como os tokens de canal — não entraram em `CAMPOS_SECRETOS_DE_CANAL`
-- porque essa lista é de `canal.config`, não de `webhook_saida`; o domínio
-- (`dominio/gestao/integracoes.ts`) cifra/decifra estes dois campos direto.
--
-- `tipo_autenticacao` é `text` com `check` (não `enum` nativo), pela mesma
-- regra de `listaCheck` (`schema/comum.ts`): acrescentar valor a um enum do
-- Postgres trava a migration em produção.
--
-- RLS e GRANT não mudam: a política de `webhook_saida` (migration 0001) é
-- por linha (`tenant_id`), e o `GRANT` do papel da aplicação já é por
-- tabela — as duas alcançam colunas novas sem statement adicional.
--
-- ## Como desfazer
--
-- ALTER TABLE "webhook_saida" DROP CONSTRAINT "webhook_saida_tipo_autenticacao_ck";
-- ALTER TABLE "webhook_saida" DROP COLUMN "cabecalhos";
-- ALTER TABLE "webhook_saida" DROP COLUMN "oauth2_client_secret";
-- ALTER TABLE "webhook_saida" DROP COLUMN "oauth2_client_id";
-- ALTER TABLE "webhook_saida" DROP COLUMN "oauth2_url_autorizacao";
-- ALTER TABLE "webhook_saida" DROP COLUMN "autenticacao_senha";
-- ALTER TABLE "webhook_saida" DROP COLUMN "autenticacao_usuario";
-- ALTER TABLE "webhook_saida" DROP COLUMN "tipo_autenticacao";

ALTER TABLE "webhook_saida" ADD COLUMN "tipo_autenticacao" text DEFAULT 'nenhuma' NOT NULL;
--> statement-breakpoint
ALTER TABLE "webhook_saida" ADD COLUMN "autenticacao_usuario" text;
--> statement-breakpoint
ALTER TABLE "webhook_saida" ADD COLUMN "autenticacao_senha" text;
--> statement-breakpoint
ALTER TABLE "webhook_saida" ADD COLUMN "oauth2_url_autorizacao" text;
--> statement-breakpoint
ALTER TABLE "webhook_saida" ADD COLUMN "oauth2_client_id" text;
--> statement-breakpoint
ALTER TABLE "webhook_saida" ADD COLUMN "oauth2_client_secret" text;
--> statement-breakpoint
ALTER TABLE "webhook_saida" ADD COLUMN "cabecalhos" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "webhook_saida"
  ADD CONSTRAINT "webhook_saida_tipo_autenticacao_ck"
  CHECK ("tipo_autenticacao" in ('nenhuma', 'basica', 'oauth2_client_credentials'));

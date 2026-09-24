-- A descrição do contato inteligente.
--
-- A tela "Editar Fluxo" (`/configurations/basic`) tem DOIS campos de texto, e
-- a tabela só tinha lugar para um. O DOM capturado
-- (`referencias-blip/portal/dom/application-detail-pipeprincipal-configurations-basic.html`)
-- diz exatamente o que o segundo é:
--
--   <textarea name="description" ng-model="$ctrl.editingApplication.description"
--             ng-minlength="2" ng-maxlength="160">
--   <span counter-for="$ctrl.applicationForm.description" ng-maxlength="160">
--
-- Sem `required` — ao contrário do `name`, que tem. Ou seja: descrição é
-- OPCIONAL, e quando existe tem entre 2 e 160 caracteres.
--
-- O teto vai como `check` porque é o limite que o banco consegue guardar
-- sozinho, e a linha nunca deveria ter mais do que a tela mostra. O mínimo
-- fica com a `api`: `check (char_length >= 2)` recusaria a string vazia que o
-- formulário manda quando a pessoa apaga tudo, e vazio aqui vira NULL antes de
-- chegar ao banco.
--
-- Nasce nula, e fica nula nas linhas que já existem: nenhum contato precisa
-- de descrição para funcionar — a origem também deixa o campo em branco.

ALTER TABLE "fluxo" ADD COLUMN IF NOT EXISTS "descricao" text;--> statement-breakpoint

DO $$
BEGIN
  ALTER TABLE "fluxo" ADD CONSTRAINT "fluxo_descricao_ck" CHECK (char_length("descricao") <= 160);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

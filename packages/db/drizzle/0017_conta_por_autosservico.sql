-- Conta criada pela própria pessoa, no modelo da plataforma de origem.
--
-- Lá o caminho é: entra com o provedor -> se o e-mail não pertence a portal
-- nenhum, a conta é criada na hora e a tela de boas-vindas avisa -> "minha
-- conta" pede os dados da empresa -> ao salvar, a conta passa a valer e o
-- portal abre. Nada disso depende de convite nem de domínio verificado.
--
-- Duas mudanças sustentam isso.

-- 1) A MESMA conta do provedor pode administrar VÁRIAS contas do Pipe.
--
-- O índice antigo era global em (emissor, sujeito): uma conta do Google só
-- podia existir uma vez no sistema inteiro, e a segunda empresa da mesma
-- pessoa esbarrava nele. Na origem, o seletor do canto superior esquerdo troca
-- entre as contas daquele e-mail — é o caso comum de agência e de quem
-- administra mais de uma empresa.
--
-- O par continua único DENTRO do tenant, que é o que impede a mesma conta do
-- provedor virar dois usuários na mesma empresa.
DROP INDEX IF EXISTS "identidade_externa_emissor_sujeito_uk";

CREATE UNIQUE INDEX IF NOT EXISTS "identidade_externa_tenant_emissor_sujeito_uk"
  ON "identidade_externa" ("tenant_id", "emissor", "sujeito");

-- 2) Os campos que o formulário de "minha conta" preenche.
--
-- Todos anuláveis de propósito: a conta NASCE sem eles (é o que a tela de
-- boas-vindas anuncia) e só depois a pessoa completa. Exigi-los na criação
-- devolveria o formulário para antes do login, que é exatamente o que o
-- autosserviço evita.
--
-- `funcionarios` é texto porque na origem é faixa ("1 a 10", "11 a 50"), e
-- faixa em número vira conversão perdida na primeira mudança de escala.
ALTER TABLE "tenant"
  ADD COLUMN IF NOT EXISTS "site" text,
  ADD COLUMN IF NOT EXISTS "funcionarios" text,
  ADD COLUMN IF NOT EXISTS "cidade" text,
  ADD COLUMN IF NOT EXISTS "estado" text,
  ADD COLUMN IF NOT EXISTS "pais" text,
  ADD COLUMN IF NOT EXISTS "telefone" text,
  -- O aceite de contato por WhatsApp, que na origem é caixa do mesmo formulário.
  ADD COLUMN IF NOT EXISTS "optin_whatsapp" boolean NOT NULL DEFAULT false,
  -- Marca o fim do onboarding. Enquanto for nulo, a Gestão manda a pessoa para
  -- "minha conta" em vez de abrir o portal — é o que faz o passo ser cumprido
  -- sem precisar de uma coluna de "etapa" que ninguém mantém em dia.
  ADD COLUMN IF NOT EXISTS "onboarding_concluido_em" timestamptz;

-- As permissões da CONTA — o que o Painel do contrato (`/contrato`) lê.
--
-- A matriz é a do painel deles, descrita em
-- `docs/pesquisa/blip-painel-do-contrato.md` §"A matriz de papéis": seis chaves
-- (`tenant-summary`, `tenant-members`, `tenant-workspace`, `tenant-dashboard`,
-- `tenant-billing`, `tenant-permissions-group`) por dois verbos (`read`,
-- `write`), chumbadas no front deles em três papéis fixos — `admin`, `member`,
-- `guest`.
--
-- Aqui cada par chave+verbo é UMA linha do catálogo de permissões, e quem
-- distribui é o papel do banco. Mesma matriz, sem papel chumbado no código: o
-- cliente que quiser um "pode ver membros mas não trocar papel" faz um papel
-- novo em vez de pedir release.
--
-- Faturamento entra só com LEITURA porque na matriz deles ninguém tem write em
-- `tenant-billing` — nem o `admin`.
--
-- A segunda metade do arquivo é o backfill: sem ele, toda conta que já existe
-- ficaria com o painel do contrato VAZIO até alguém reeditar papel a papel.
-- Casa pelo NOME do papel do dia 1 (`packages/db/src/semente.ts`), e papel
-- criado pelo cliente não é tocado — permissão nova em papel que o cliente
-- desenhou é decisão dele, não da migração.

INSERT INTO "permissao" ("codigo", "grupo", "descricao") VALUES
  ('conta.resumo.ler',             'conta', 'Ver o resumo do contrato'),
  ('conta.resumo.escrever',        'conta', 'Editar o nome e a foto do contrato'),
  ('conta.membros.ler',            'conta', 'Ver quem tem acesso ao contrato'),
  ('conta.membros.escrever',       'conta', 'Convidar, trocar o papel e remover membro do contrato'),
  ('conta.workspace.ler',          'conta', 'Ver as configurações do espaço de trabalho'),
  ('conta.workspace.escrever',     'conta', 'Editar as configurações do espaço de trabalho'),
  ('conta.painel.ler',             'conta', 'Ver o painel do contrato'),
  ('conta.painel.escrever',        'conta', 'Editar o painel do contrato'),
  ('conta.faturamento.ler',        'conta', 'Ver o plano, o consumo e o faturamento do contrato'),
  ('conta.grupos_acesso.ler',      'conta', 'Ver os grupos de acesso ao contrato'),
  ('conta.grupos_acesso.escrever', 'conta', 'Criar, editar e remover grupo de acesso')
ON CONFLICT ("codigo") DO NOTHING;
--> statement-breakpoint

-- O `admin` deles: a matriz inteira.
INSERT INTO "papel_permissao" ("tenant_id", "papel_id", "permissao_codigo")
SELECT p."tenant_id", p."id", c."codigo"
  FROM "papel" p
 CROSS JOIN (VALUES
   ('conta.resumo.ler'), ('conta.resumo.escrever'),
   ('conta.membros.ler'), ('conta.membros.escrever'),
   ('conta.workspace.ler'), ('conta.workspace.escrever'),
   ('conta.painel.ler'), ('conta.painel.escrever'),
   ('conta.faturamento.ler'),
   ('conta.grupos_acesso.ler'), ('conta.grupos_acesso.escrever')
 ) AS c("codigo")
 WHERE p."nome" = 'administrador' AND p."de_sistema"
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Gestor: tudo menos escrever grupo de acesso, que anda junto de `papel.gerenciar`.
INSERT INTO "papel_permissao" ("tenant_id", "papel_id", "permissao_codigo")
SELECT p."tenant_id", p."id", c."codigo"
  FROM "papel" p
 CROSS JOIN (VALUES
   ('conta.resumo.ler'), ('conta.resumo.escrever'),
   ('conta.membros.ler'), ('conta.membros.escrever'),
   ('conta.workspace.ler'), ('conta.workspace.escrever'),
   ('conta.painel.ler'), ('conta.painel.escrever'),
   ('conta.faturamento.ler'),
   ('conta.grupos_acesso.ler')
 ) AS c("codigo")
 WHERE p."nome" = 'gestor' AND p."de_sistema"
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Supervisor: o `member` deles, o "Pode editar" — mexe no espaço de trabalho,
-- não gerencia os membros do contrato.
INSERT INTO "papel_permissao" ("tenant_id", "papel_id", "permissao_codigo")
SELECT p."tenant_id", p."id", c."codigo"
  FROM "papel" p
 CROSS JOIN (VALUES
   ('conta.resumo.ler'), ('conta.workspace.ler'), ('conta.workspace.escrever')
 ) AS c("codigo")
 WHERE p."nome" = 'supervisor' AND p."de_sistema"
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Atendente e avaliador: o `guest` deles — "Apenas visualiza informações do
-- contrato". Sem isto, quem atende abre `/contrato` e vê tela vazia.
INSERT INTO "papel_permissao" ("tenant_id", "papel_id", "permissao_codigo")
SELECT p."tenant_id", p."id", c."codigo"
  FROM "papel" p
 CROSS JOIN (VALUES ('conta.resumo.ler'), ('conta.workspace.ler')) AS c("codigo")
 WHERE p."nome" IN ('atendente', 'avaliador') AND p."de_sistema"
ON CONFLICT DO NOTHING;

-- O papel da CONTA separado dos papéis de ATENDIMENTO.
--
-- Na origem são duas coisas: o papel no contrato (`admin`, `member`, `guest` —
-- "Admin", "Pode editar", "Pode visualizar", `docs/pesquisa/blip-painel-do-contrato.md`)
-- e o que a pessoa faz no atendimento, dado por chatbot (equipe do bot + Desk,
-- `blip-gestao-regras-tecnicas.md` §8.1). Até aqui o Pipe misturava as duas nos
-- cinco papéis do dia 1, e a tela de Membros mostrava `gestor` e `atendente` crus.
--
-- O modelo: `papel.escopo` ('conta' | 'atendimento'). A pessoa tem EXATAMENTE um
-- papel de conta e zero ou mais de atendimento; as permissões continuam sendo a
-- UNIÃO de todos (nada em `GET /v1/eu` nem em `exigirPermissao` muda).
--
-- Quem garante "no máximo um" é o banco: `usuario_papel.escopo` é cópia do
-- escopo do papel, amarrada por FK composta `(papel_id, escopo)`, e um índice
-- único parcial em `usuario_id WHERE escopo = 'conta'`. "Pelo menos um" fica com
-- os caminhos que criam usuário (convite, provisionamento) e com esta migração.
-- O convite só aponta para papel de conta — também por FK composta.
--
-- Descartado: `usuario.papel_conta_id NOT NULL`. Daria "exatamente um" direto,
-- mas a permissão passaria a vir de duas fontes e todo INSERT de usuário
-- (entrada por domínio, testes, sementes) teria de conhecer o papel de conta.
--
-- ## Como desfazer
--
-- 1. DROP das FKs compostas (`usuario_papel_papel_escopo_fk`, `convite_papel_escopo_fk`),
--    dos índices `usuario_papel_um_da_conta_uk` e `papel_id_escopo_uk`, do CHECK
--    `convite_escopo_ck` e das colunas `escopo`;
-- 2. devolver cada convite ao papel antigo, lendo `antes->>'papelId'` em
--    `log_auditoria WHERE objeto_tipo = 'convite' AND depois->>'migracao' = '0021'`
--    — a troca fica registrada lá justamente para isto;
-- 3. re-rodar o backfill da 0019 (devolve `conta.*` aos papéis antigos);
-- 4. DELETE FROM papel WHERE nome IN ('admin','member','guest') AND de_sistema,
--    que leva o `usuario_papel` em cascata.
--
-- A ordem importa: apagar os papéis antes do passo 2 apagaria os convites (FK cascade).

ALTER TABLE "papel" ADD COLUMN "escopo" text NOT NULL DEFAULT 'atendimento';--> statement-breakpoint
ALTER TABLE "papel" ADD CONSTRAINT "papel_escopo_ck" CHECK ("escopo" IN ('conta', 'atendimento'));--> statement-breakpoint
CREATE UNIQUE INDEX "papel_id_escopo_uk" ON "papel" ("id", "escopo");--> statement-breakpoint
ALTER TABLE "usuario_papel" ADD COLUMN "escopo" text NOT NULL DEFAULT 'atendimento';--> statement-breakpoint
ALTER TABLE "usuario_papel" ADD CONSTRAINT "usuario_papel_papel_escopo_fk"
  FOREIGN KEY ("papel_id", "escopo") REFERENCES "papel" ("id", "escopo")
  ON DELETE CASCADE ON UPDATE CASCADE;--> statement-breakpoint

-- Os três papéis por tenant, com o `roleId` da origem como nome. O rótulo da
-- tela ("Admin", "Pode editar", "Pode visualizar") mora no código, não aqui.
-- Sem ON CONFLICT: se um cliente já tiver um papel chamado 'admin', a migração
-- falha alto em vez de sequestrar o papel dele.
INSERT INTO "papel" ("tenant_id", "nome", "descricao", "de_sistema", "escopo")
SELECT t."id", r.nome, r.descricao, true, 'conta'
  FROM "tenant" t
 CROSS JOIN (VALUES
   ('admin',  'Edita todos os dados do contrato, gerencia membros, cria e edita chatbots.'),
   ('member', 'Cria e edita chatbots, mas não gerencia os membros do contrato.'),
   ('guest',  'Apenas visualiza informações do contrato.')
 ) AS r(nome, descricao);--> statement-breakpoint

-- A matriz deles: `admin` tudo; `member` = `tenant-summary` read +
-- `tenant-workspace` read/write; `guest` = só leitura. "Cria e edita chatbots"
-- é `automacao.fluxo.editar`, a permissão que o portal confere para criar.
INSERT INTO "papel_permissao" ("tenant_id", "papel_id", "permissao_codigo")
SELECT p."tenant_id", p."id", m.codigo
  FROM "papel" p
  JOIN (VALUES
    ('admin', 'conta.resumo.ler'), ('admin', 'conta.resumo.escrever'),
    ('admin', 'conta.membros.ler'), ('admin', 'conta.membros.escrever'),
    ('admin', 'conta.workspace.ler'), ('admin', 'conta.workspace.escrever'),
    ('admin', 'conta.painel.ler'), ('admin', 'conta.painel.escrever'),
    ('admin', 'conta.faturamento.ler'),
    ('admin', 'conta.grupos_acesso.ler'), ('admin', 'conta.grupos_acesso.escrever'),
    ('admin', 'automacao.fluxo.editar'),
    ('member', 'conta.resumo.ler'), ('member', 'conta.workspace.ler'),
    ('member', 'conta.workspace.escrever'), ('member', 'automacao.fluxo.editar'),
    ('guest', 'conta.resumo.ler'), ('guest', 'conta.workspace.ler')
  ) AS m(nome, codigo) ON m.nome = p."nome"
 WHERE p."escopo" = 'conta';--> statement-breakpoint

-- Todo papel que já existia virou `atendimento` pelo default do ADD COLUMN.

-- Cada usuário ganha o papel de conta, calculado ANTES de tirar `conta.*` dos
-- papéis antigos. `bool_or` sobre nenhuma linha é NULL e cai no `guest`.
-- `member` também para quem escrevia o espaço de trabalho (o supervisor), para
-- ninguém perder o que tinha.
INSERT INTO "usuario_papel" ("tenant_id", "usuario_id", "papel_id", "escopo")
SELECT u."tenant_id", u."id", c."id", 'conta'
  FROM "usuario" u
 CROSS JOIN LATERAL (
   SELECT CASE
            WHEN bool_or(p."nome" = 'administrador' AND p."de_sistema")
              OR bool_or(pp."permissao_codigo" = 'conta.membros.escrever') THEN 'admin'
            WHEN bool_or(pp."permissao_codigo" IN ('automacao.fluxo.editar', 'conta.workspace.escrever'))
              THEN 'member'
            ELSE 'guest'
          END AS alvo
     FROM "usuario_papel" up
     JOIN "papel" p ON p."id" = up."papel_id"
     LEFT JOIN "papel_permissao" pp ON pp."papel_id" = p."id"
    WHERE up."usuario_id" = u."id"
 ) f
  JOIN "papel" c ON c."tenant_id" = u."tenant_id" AND c."escopo" = 'conta' AND c."nome" = f.alvo;--> statement-breakpoint

-- Convites: a mesma regra, e o papel antigo fica no log — é o que torna o
-- passo 2 do "como desfazer" possível. `log_auditoria` não é particionada.
WITH alvo AS (
  SELECT cv."id", cv."tenant_id", cv."papel_id" AS antes, c."id" AS depois
    FROM "convite" cv
    JOIN "papel" antigo ON antigo."id" = cv."papel_id"
   CROSS JOIN LATERAL (
     SELECT CASE
              WHEN antigo."nome" = 'administrador'
                OR bool_or(pp."permissao_codigo" = 'conta.membros.escrever') THEN 'admin'
              WHEN bool_or(pp."permissao_codigo" IN ('automacao.fluxo.editar', 'conta.workspace.escrever'))
                THEN 'member'
              ELSE 'guest'
            END AS alvo
       FROM "papel_permissao" pp
      WHERE pp."papel_id" = antigo."id"
   ) f
    JOIN "papel" c ON c."tenant_id" = cv."tenant_id" AND c."escopo" = 'conta' AND c."nome" = f.alvo
), trocado AS (
  UPDATE "convite" cv
     SET "papel_id" = alvo.depois, "atualizado_em" = now()
    FROM alvo
   WHERE cv."id" = alvo."id"
  RETURNING cv."id"
)
INSERT INTO "log_auditoria" ("tenant_id", "ator_tipo", "acao", "objeto_tipo", "objeto_id", "antes", "depois")
SELECT alvo.tenant_id, 'sistema', 'alterou', 'convite', alvo.id,
       jsonb_build_object('papelId', alvo.antes),
       jsonb_build_object('papelId', alvo.depois, 'migracao', '0021')
  FROM alvo
  JOIN trocado ON trocado.id = alvo.id;--> statement-breakpoint

-- As permissões da conta passam a vir SÓ do papel da conta.
DELETE FROM "papel_permissao" pp
 USING "papel" p
 WHERE p."id" = pp."papel_id"
   AND p."escopo" = 'atendimento'
   AND pp."permissao_codigo" LIKE 'conta.%';--> statement-breakpoint

CREATE UNIQUE INDEX "usuario_papel_um_da_conta_uk" ON "usuario_papel" ("usuario_id") WHERE "escopo" = 'conta';--> statement-breakpoint
ALTER TABLE "convite" ADD COLUMN "escopo" text NOT NULL DEFAULT 'conta';--> statement-breakpoint
ALTER TABLE "convite" ADD CONSTRAINT "convite_escopo_ck" CHECK ("escopo" = 'conta');--> statement-breakpoint
ALTER TABLE "convite" ADD CONSTRAINT "convite_papel_escopo_fk"
  FOREIGN KEY ("papel_id", "escopo") REFERENCES "papel" ("id", "escopo")
  ON DELETE CASCADE ON UPDATE CASCADE;

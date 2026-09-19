-- Duas permissões novas para as rotas de gravação do módulo Atendimento
-- (cadastros): pausa personalizada e resposta pronta. Nenhuma das duas tinha
-- equivalente no catálogo — `fila.gerenciar`, `regra.gerenciar` e
-- `horario.gerenciar` já existiam e cobrem fila, regra de entrada/prioridade/
-- SLA e horário; motivo de pausa e resposta pronta ficavam sem nenhuma.
--
-- Mesmo padrão de `0023_permissao_excluir_fluxo.sql`: insere no catálogo e
-- concede de volta aos papéis de SISTEMA que já carregam as outras permissões
-- de cadastro de atendimento — `administrador` (tudo) e `gestor` (configura o
-- atendimento) — porque `packages/db/src/semente.ts` só semeia papel novo em
-- tenant novo; um tenant já implantado não ganha a permissão sozinho.
--
-- ## Como desfazer
--
-- DELETE FROM "permissao" WHERE "codigo" IN ('pausa.gerenciar', 'resposta_pronta.gerenciar')
-- — a FK de `papel_permissao` é `ON DELETE CASCADE` e leva as concessões junto.

INSERT INTO "permissao" ("codigo", "grupo", "descricao") VALUES
  ('pausa.gerenciar', 'gestao', 'Criar, editar e desativar motivo de pausa'),
  ('resposta_pronta.gerenciar', 'gestao', 'Criar, editar e excluir resposta pronta da empresa')
ON CONFLICT ("codigo") DO NOTHING;--> statement-breakpoint

INSERT INTO "papel_permissao" ("tenant_id", "papel_id", "permissao_codigo")
SELECT p."tenant_id", p."id", perm."codigo"
  FROM "papel" p
  CROSS JOIN (VALUES ('pausa.gerenciar'), ('resposta_pronta.gerenciar')) AS perm("codigo")
 WHERE p."de_sistema"
   AND p."escopo" = 'atendimento'
   AND p."nome" IN ('administrador', 'gestor')
ON CONFLICT DO NOTHING;

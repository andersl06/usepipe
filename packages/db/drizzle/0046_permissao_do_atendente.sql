-- Permissão POR ATENDENTE — o que a página "Permissões" da origem edita.
--
-- Fonte: `referencias-blip/fichas/FICHA-atendentes-filas-pausas.md` §a.4. Na
-- origem, `attendance.desk.team.permission` é uma PÁGINA com uma tabela de duas
-- colunas ("Tipo de permissão" / "Status") e um botão "Salvar alterações": a
-- pessoa liga e desliga capacidade a capacidade, para um atendente ou para
-- vários de uma vez.
--
-- No Pipe, permissão sempre veio do PAPEL (`usuario_papel` + `papel_permissao`),
-- e papel é conjunto: não havia como dizer "este atendente, e só ele, não
-- transfere ticket" sem inventar um papel de uma pessoa só. Esta tabela é a
-- EXCEÇÃO nomeada, e ela é override, não substituição:
--
--   permissão efetiva = COALESCE(override desta pessoa, união dos papéis dela)
--
-- `concedida = true` liga o que o papel não dá; `concedida = false` desliga o
-- que o papel dá. Linha ausente = o papel manda, que é o caso de quase todo
-- mundo — por isso a tabela nasce vazia e continua pequena: só guarda a
-- exceção, nunca o padrão. Quem grava (`dominio/gestao/permissoes-do-atendente.ts`)
-- APAGA a linha quando a escolha volta a coincidir com o papel, e é isso que
-- impede a tabela de virar uma cópia desatualizada do RBAC.
--
-- Quem lê: `apps/api/src/sessao.ts` (`exigirPermissao`, a recusa de cada rota) e
-- `apps/api/src/controladores/entrar.ts` (`GET /v1/eu`, o que a tela acende).
--
-- A chave primária é (usuario_id, permissao_codigo) e não inclui o tenant: o
-- usuário já pertence a um tenant só, e a RLS abaixo faz o resto. Mesma forma de
-- `usuario_papel`.
--
-- ## Como desfazer
--
-- DROP TABLE "usuario_permissao";
-- (e reverter as duas consultas de permissão efetiva para só o `exists` dos papéis)

CREATE TABLE IF NOT EXISTS "usuario_permissao" (
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "usuario_id" uuid NOT NULL REFERENCES "usuario"("id") ON DELETE CASCADE,
  "permissao_codigo" text NOT NULL REFERENCES "permissao"("codigo") ON DELETE CASCADE,
  "concedida" boolean NOT NULL,
  "criado_em" timestamptz DEFAULT now() NOT NULL,
  "atualizado_em" timestamptz,
  CONSTRAINT "usuario_permissao_pk" PRIMARY KEY ("usuario_id", "permissao_codigo")
);--> statement-breakpoint

-- A leitura quente é "os overrides desta pessoa", feita uma vez por rota
-- protegida; a chave primária já a atende. Este índice é para a OUTRA leitura, a
-- da tela: "os overrides de todo mundo deste tenant".
CREATE INDEX IF NOT EXISTS "usuario_permissao_tenant_idx"
  ON "usuario_permissao" ("tenant_id");--> statement-breakpoint

-- Tabela nova entra na RLS como todas as outras (`rls.test.ts` varre o catálogo).
ALTER TABLE "usuario_permissao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "usuario_permissao";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "usuario_permissao"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON usuario_permissao TO pipe_app';
  END IF;
END;
$$;

-- A equipe DO CONTATO: quem tem acesso a este fluxo/roteador e com que permissão.
--
-- Até aqui o RBAC do Pipe era só por CONTA (0019 o catálogo, 0021 os três papéis
-- `guest`/`member`/`admin`): quem entrava na conta enxergava todos os fluxos dela. A origem
-- decide o contrário, e `docs/pesquisa/blip-identidade-tenant-permissao.md` §3 mede isso no
-- objeto real: "a permissão não é do tenant, é do bot" — o mesmo usuário é quase admin num
-- bot e quase nada em outro, dentro da mesma empresa. `apps/gestao-vite/src/paginas/fluxo/
-- itens.ts` já registrava a dívida ("até existir RBAC por fluxo"); esta tabela é ela paga.
--
-- ## `papel_no_fluxo` — o traço de "Permissão" dos dois modais
--
-- São as QUATRO paradas do `rzslider` da origem, com as chaves do pacote de tradução
-- (`team.addUserModal.slider`): `visualize` · `custom` · `edit` · `admin`. Em pt-BR o modal
-- de adicionar escreve "Visualizar · Customizado · Visualizar e editar · Admin" e o de
-- editar "Visualizar · Personalizado · Ver e editar · Admin" (FICHA-equipe-editar.md §4) —
-- é o mesmo nível com duas palavras, então o banco guarda um valor só.
--
-- ## `permissoes` — o `PermissionsList.html` da rota `/team/team/edit`
--
-- Uma linha por RECURSO e três rádios por linha: `none` (0), `read` (1) e `readWrite` (3),
-- rotulados "Sem permissão" / "Visualizar" / "Ver e editar". Os recursos são os do template
-- da origem, na ordem dele (`payments`, `channels`, `desk`, `users`, `basicConfigurations`,
-- `connectionInformations`, `resources`, `growth`, `logMessages`, `builder`, `analysis`,
-- `team`), com os títulos do pacote pt-BR. O nível de cima MARCA os rádios:
-- "Visualizar" põe tudo em `read`, "Ver e editar" e "Admin" põem tudo em `readWrite`, e
-- "Personalizado" (`checkStatus()`) libera cada linha para a mão.
--
-- jsonb e não tabela filha: o mapa inteiro é lido e gravado junto, sempre — a tela manda as
-- doze linhas de uma vez e ninguém consulta "quem pode escrever em `growth`" por recurso.
-- Uma tabela filha custaria doze linhas por membro e um `delete`+`insert` a cada Salvar.
-- ponytail: jsonb até alguém precisar consultar POR recurso; aí vira `fluxo_membro_permissao`.
--
-- ## O duplo portão continua valendo
--
-- §4.3 da mesma pesquisa: "a empresa contrata o recurso, o administrador distribui entre as
-- pessoas". Aqui a conta continua sendo o primeiro portão (`automacao.fluxo.editar` e
-- companhia, em `papel_permissao`) e esta tabela é o segundo — `exigirPermissaoNoFluxo`
-- (`apps/api/src/dominio/gestao/equipe-do-fluxo.ts`) aceita quem passa por UM dos dois,
-- porque tirar de quem já editava fluxo pela conta quebraria todo tenant que nunca abriu
-- esta tela.

CREATE TABLE IF NOT EXISTS "fluxo_membro" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "fluxo_id" uuid NOT NULL REFERENCES "fluxo"("id") ON DELETE CASCADE,
  "usuario_id" uuid NOT NULL REFERENCES "usuario"("id") ON DELETE CASCADE,
  "papel_no_fluxo" text NOT NULL DEFAULT 'visualizar',
  "permissoes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  -- Quem pôs a pessoa aqui. `set null` porque o registro sobrevive a quem convidou.
  "convidado_por" uuid REFERENCES "usuario"("id") ON DELETE SET NULL,
  "criado_em" timestamptz DEFAULT now() NOT NULL,
  "atualizado_em" timestamptz,
  CONSTRAINT "fluxo_membro_papel_ck"
    CHECK ("papel_no_fluxo" IN ('visualizar', 'personalizado', 'editar', 'admin'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "fluxo_membro_uk"
  ON "fluxo_membro" ("fluxo_id", "usuario_id");--> statement-breakpoint
-- "de quais fluxos eu faço parte?" é a pergunta do menu do contato, uma vez por tela.
CREATE INDEX IF NOT EXISTS "fluxo_membro_usuario_ix"
  ON "fluxo_membro" ("usuario_id");--> statement-breakpoint

ALTER TABLE "fluxo_membro" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "fluxo_membro";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "fluxo_membro"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON fluxo_membro TO pipe_app';
  END IF;
END;
$$;

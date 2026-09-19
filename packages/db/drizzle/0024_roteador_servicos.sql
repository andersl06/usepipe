-- O roteador de verdade: os serviços dele, onde cada contato está e o contexto do roteador.
--
-- Fontes: `docs/pesquisa/blip-servicos-do-roteador.md` (o formulário de Serviços) e
-- `docs/pesquisa/blip-api-schemas.md` §5.3–5.5 (Master-State, Redirect,
-- "Utilizar o contexto do Roteador"). Quem usa: `apps/api/src/dominio/roteador.ts`
-- (a entrada) e `apps/api/src/dominio/gestao/servicos-do-roteador.ts` (a tela).
--
-- 1. `roteador_servico` — o `master.services` da Blip. Cada linha é um serviço: um NOME
--    (é por ele que o `Redirect` endereça, `content.address`) e o fluxo que atende.
--    - `principal`: "É o meu chatbot principal" — atende a primeira interação e é para onde
--      o contato volta quando o redirecionamento expira. No máximo um por roteador.
--    - `persistente`: "Não redirecionar automaticamente para o principal" — sem expiração.
--    - `expiracao_min`: "Expiração do redirecionamento", contada da última mensagem do
--      cliente. Principal esconde persistência e expiração; persistente esconde expiração —
--      e o banco guarda a mesma regra, para nenhuma linha contradizer a tela.
--    Um fluxo entra uma vez só em cada roteador (além do nome único): a posição do contato
--    guarda o FLUXO, e o mesmo fluxo com dois nomes deixaria a expiração ambígua.
--
-- 2. `posicao_no_roteador` — o Master-State: em que serviço o contato está, desde quando e
--    até quando. `contexto` é o contexto do ROTEADOR, o dos serviços com
--    `usa_contexto_do_roteador`; `reiniciar`/`bloco_inicial` são o Change-User-State que
--    vem depois do Master-State (§5.3, regra 4), aplicado na próxima mensagem.
--
-- 3. `fluxo.usa_contexto_do_roteador` — o `builder:useTunnelOwnerContext` ("Utilizar o
--    contexto do Roteador"): ligado, as variáveis do serviço são as do par
--    (roteador, contato), divididas entre todos os serviços que também o ligaram.
--
-- ## Não há túnel
--
-- Na Blip o roteador fala com o serviço pela extensão tunnel, e o serviço vê o cliente como
-- `<uuid>@tunnel.msging.net`: o `customerIdentity` do ticket é o UUID do túnel, e cruzar
-- por telefone dá zero (`docs/pesquisa/apis.md` §1.7). No Pipe o contato é ÚNICO por
-- tenant (`contato` + `contato_identidade`), o roteador e os serviços leem o mesmo
-- `contato_id`, e o "túnel" é só a chave (roteador_id, contato_id) desta tabela. A conversa
-- (o ticket) guarda o contato real. Não se cria UUID de túnel — e a armadilha não existe.

CREATE TABLE IF NOT EXISTS "roteador_servico" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "roteador_id" uuid NOT NULL REFERENCES "fluxo"("id") ON DELETE CASCADE,
  "servico_id" uuid NOT NULL REFERENCES "fluxo"("id") ON DELETE RESTRICT,
  "nome" text NOT NULL,
  "principal" boolean DEFAULT false NOT NULL,
  "persistente" boolean DEFAULT false NOT NULL,
  "expiracao_min" integer,
  "criado_em" timestamptz DEFAULT now() NOT NULL,
  "atualizado_em" timestamptz,
  CONSTRAINT "roteador_servico_distintos_ck" CHECK ("roteador_id" <> "servico_id"),
  CONSTRAINT "roteador_servico_expiracao_ck" CHECK ("expiracao_min" IS NULL OR "expiracao_min" > 0),
  CONSTRAINT "roteador_servico_principal_ck"
    CHECK (NOT "principal" OR (NOT "persistente" AND "expiracao_min" IS NULL)),
  CONSTRAINT "roteador_servico_persistente_ck"
    CHECK (NOT "persistente" OR "expiracao_min" IS NULL),
  CONSTRAINT "roteador_servico_redirecionamento_ck"
    CHECK ("principal" OR "persistente" OR "expiracao_min" IS NOT NULL)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roteador_servico_nome_uk"
  ON "roteador_servico" ("roteador_id", "nome");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roteador_servico_servico_uk"
  ON "roteador_servico" ("roteador_id", "servico_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "roteador_servico_principal_uk"
  ON "roteador_servico" ("roteador_id") WHERE "principal";--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "posicao_no_roteador" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "roteador_id" uuid NOT NULL REFERENCES "fluxo"("id") ON DELETE CASCADE,
  "contato_id" uuid NOT NULL REFERENCES "contato"("id") ON DELETE CASCADE,
  "servico_id" uuid NOT NULL REFERENCES "fluxo"("id") ON DELETE CASCADE,
  "desde" timestamptz DEFAULT now() NOT NULL,
  "expira_em" timestamptz,
  "contexto" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "reiniciar" boolean DEFAULT false NOT NULL,
  "bloco_inicial" text
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "posicao_no_roteador_uk"
  ON "posicao_no_roteador" ("roteador_id", "contato_id");--> statement-breakpoint

ALTER TABLE "fluxo"
  ADD COLUMN IF NOT EXISTS "usa_contexto_do_roteador" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- Tabela nova entra na RLS como todas as outras (`rls.test.ts` varre o catálogo).
ALTER TABLE "roteador_servico" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "roteador_servico";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "roteador_servico"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint
ALTER TABLE "posicao_no_roteador" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "posicao_no_roteador";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "posicao_no_roteador"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON roteador_servico, posicao_no_roteador TO pipe_app';
  END IF;
END;
$$;

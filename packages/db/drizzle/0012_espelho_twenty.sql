-- O espelho do contato e da conta no CRM (Twenty), e por onde falar com ele.
--
-- Ver `docs/specs/2026-09-07-integracao-twenty.md`. Três decisões estão na forma
-- destas colunas:
--
-- 1. **A instância do CRM é por cliente** (§5, decisão do dono em 07/09). Por isso a
--    URL e a chave moram em `tenant`, e não em variável de ambiente: ambiente serve a
--    instalação de um cliente só, e aqui cada tenant aponta para uma instância própria.
--    NULO significa "este cliente não tem CRM" e a integração inteira não acontece.
--    Não existe instância padrão — fallback silencioso é como o dado de um cliente vai
--    parar no CRM de outro.
--
-- 2. **A chave é cifrada em repouso**, pelo mesmo chaveiro do token da Meta
--    (`PIPE_CHAVES_SEGREDO`, `src/segredo.ts`). Diferente do token da Meta, esta também
--    LÊ: um dump sem cifra entrega a base de clientes de todos os tenants de uma vez.
--
-- 3. **O `id` do registro no Twenty fica do nosso lado.** É ele que permite o link do
--    Desk cair na FICHA do cliente em vez da home. Enquanto for nulo, o Desk não mostra
--    link nenhum — falha fechada, sem link que leva a lugar nenhum.
--
-- `text` e não `uuid` de propósito: o id é opaco para nós. Ele é gerado por outro
-- sistema, e o dia em que o Twenty mudar o formato dele, uma coluna `uuid` vira uma
-- migração de emergência para não ganhar nada.

alter table "tenant" add column "twenty_url" text;--> statement-breakpoint
alter table "tenant" add column "twenty_chave" text;--> statement-breakpoint

alter table "contato" add column "twenty_pessoa_id" text;--> statement-breakpoint
alter table "conta" add column "twenty_empresa_id" text;--> statement-breakpoint

-- A varredura de segurança do espelho procura exatamente esta condição a cada 5
-- minutos. Índice parcial porque o conjunto interessante é pequeno e encolhe: contato
-- já espelhado nunca mais volta para cá.
create index "contato_espelho_pendente_idx" on "contato" ("tenant_id","atualizado_em")
  where twenty_pessoa_id is null and excluido_em is null;

-- Motor de fluxo: o que o modelo da Blip precisa e o schema de 0000 não comportava.
-- O motor é o porte do `Take.Blip.Builder` e lê o fluxo da Blip sem tradução; aqui o
-- banco se ajusta à Blip, não o contrário. Ver `packages/core/src/fluxo/`.
--
-- 1. `fluxo_versao.global`: as ações globais do fluxo (de entrada, de saída e de "depois
--    de trocar de estado") e a `configuration`. Na Blip elas são do `Flow`, não de um
--    estado, e não havia onde guardá-las.
--
-- 2. `transicao.para_variavel`: a saída da Blip pode apontar para `{{variável}}`, e o
--    destino só se sabe na hora (`FlowManager.ProcessOutputsAsync`). `para_bloco_id`
--    passa a ser opcional, e exatamente um dos dois é obrigatório.
--
-- 3. A mesma mensagem da Meta (`id_provedor`) só vira passo de fluxo uma vez. A guarda de
--    `mensagem` é uma consulta, porque a tabela é particionada e não tem índice único em
--    `id_provedor`; aqui a guarda é o banco. Com duas entregas simultâneas do mesmo
--    evento, a segunda bate neste índice, a transação inteira volta — inclusive a
--    mensagem repetida — e a reentrega cai na guarda de `mensagem`. Sem isto o cliente
--    receberia a resposta do bot duas vezes.

alter table "fluxo_versao" add column "global" jsonb default '{}'::jsonb not null;--> statement-breakpoint
alter table "transicao" alter column "para_bloco_id" drop not null;--> statement-breakpoint
alter table "transicao" add column "para_variavel" text;--> statement-breakpoint
alter table "transicao" add constraint "transicao_destino_ck"
  check (("para_bloco_id" is null) <> ("para_variavel" is null));--> statement-breakpoint
create unique index "execucao_passo_entrada_uk" on "execucao_passo"
  using btree ("tenant_id", ("entrada" ->> 'id_provedor'))
  where "entrada" ? 'id_provedor';

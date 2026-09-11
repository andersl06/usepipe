-- Entrada do cliente: o arquivo da importação de contatos.
--
-- É o `has_one_attached :import_file` e o `has_one_attached :failed_records` do
-- `DataImport` do Chatwoot (app/models/data_import.rb), portado para a importação
-- de contatos do Pipe. A linha da importação em si é a `importacao` que já existe
-- no CRM (origem `csv`, estado e contadores); aqui mora só o conteúdo.
--
-- Em tabela, e não no storage de objetos, porque o storage ainda não está ligado
-- em produção (`2026-09-07-implantacao.md` §9, item 3) e a API precisa entregar o
-- arquivo ao worker sem depender dele. O teto de tamanho é do parser de corpo da
-- rota (`PIPE_LIMITE_IMPORTACAO`, 20 MB).
--
-- Separada da `importacao` para a listagem de importações não arrastar o arquivo.

CREATE TABLE IF NOT EXISTS "importacao_arquivo" (
  "importacao_id" uuid PRIMARY KEY NOT NULL REFERENCES "importacao"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenant"("id") ON DELETE CASCADE,
  "conteudo" text NOT NULL,
  -- O CSV das linhas rejeitadas, com a coluna `erros` no fim. Nulo quando nada foi rejeitado.
  "falhas_csv" text,
  "criado_em" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Tabela nova entra na RLS como todas as outras. Há um teste que varre o catálogo
-- e falha nomeando quem ficou de fora.
ALTER TABLE "importacao_arquivo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "importacao_arquivo";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "importacao_arquivo"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON importacao_arquivo TO pipe_app';
  END IF;
END;
$$;

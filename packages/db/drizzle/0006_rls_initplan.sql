-- Otimização das políticas de isolamento: `current_setting` uma vez por
-- consulta, não uma vez por linha.
--
-- A política escrita como `tenant_id = current_setting('pipe.tenant_id')::uuid`
-- é reavaliada em CADA linha examinada. Embrulhada em subconsulta escalar, o
-- planejador a promove a InitPlan e avalia UMA vez, reusando o resultado. O
-- filtro é idêntico e a garantia é a mesma — muda só quantas vezes a função
-- roda, e numa varredura de `mensagem` isso é a diferença entre milhões de
-- chamadas e uma.
--
-- Vale para `USING` e para `WITH CHECK`. Continua falhando fechada: sem a
-- variável de sessão, `current_setting` lança dentro do InitPlan e a consulta
-- não retorna linha.
--
-- Aplica-se a todas as políticas existentes, inclusive às das partições já
-- criadas, e a função `pipe_criar_particao_mes` passa a nascer com a forma
-- nova para as partições futuras.

DO $$
DECLARE
  r record;
  v_coluna text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
      FROM pg_policies
     WHERE policyname = 'tenant_isolado'
       AND schemaname = 'public'
  LOOP
    -- `tenant` isola pela própria chave; as demais, por `tenant_id`.
    v_coluna := CASE WHEN r.tablename = 'tenant' THEN 'id' ELSE 'tenant_id' END;
    EXECUTE format(
      'ALTER POLICY tenant_isolado ON %I.%I
         USING (%I = (SELECT current_setting(''pipe.tenant_id'')::uuid))
         WITH CHECK (%I = (SELECT current_setting(''pipe.tenant_id'')::uuid))',
      r.schemaname, r.tablename, v_coluna, v_coluna
    );
  END LOOP;
END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION pipe_criar_particao_mes(p_tabela text, p_mes date)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_inicio date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_nome text := format('%s_%s', p_tabela, to_char(v_inicio, 'YYYY_MM'));
BEGIN
  IF p_tabela NOT IN ('mensagem', 'evento_atendimento') THEN
    RAISE EXCEPTION 'tabela % não é particionada no Pipe', p_tabela;
  END IF;

  IF to_regclass(format('public.%I', v_nome)) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
      v_nome, p_tabela, v_inicio, v_fim
    );
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', v_nome);
    -- Subconsulta escalar de propósito: ver o cabeçalho desta migration.
    EXECUTE format(
      'CREATE POLICY tenant_isolado ON %I
         USING (tenant_id = (SELECT current_setting(''pipe.tenant_id'')::uuid))
         WITH CHECK (tenant_id = (SELECT current_setting(''pipe.tenant_id'')::uuid))',
      v_nome
    );
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO pipe_app', v_nome);
    END IF;
  END IF;

  RETURN v_nome;
END;
$$;

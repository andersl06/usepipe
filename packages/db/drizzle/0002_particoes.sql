-- Particionamento mensal de `mensagem` e `evento_atendimento` (§1 do modelo de dados).
--
-- As duas crescem sem limite e são sempre consultadas por período. As tabelas já
-- nascem `PARTITION BY RANGE` na 0000; aqui entra a função que cria a partição de um
-- mês, para o job mensal chamar com antecedência. Partição que falta vira erro de
-- insert de madrugada — por isso a rotina cria o mês corrente e os seguintes.
--
-- A partição herda a política do pai quando a consulta passa pelo pai, mas ganha a
-- sua própria aqui também: acesso direto a `mensagem_2026_09` não pode ser a porta
-- dos fundos do isolamento.

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
    EXECUTE format(
      'CREATE POLICY tenant_isolado ON %I
         USING (tenant_id = current_setting(''pipe.tenant_id'')::uuid)
         WITH CHECK (tenant_id = current_setting(''pipe.tenant_id'')::uuid)',
      v_nome
    );
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO pipe_app', v_nome);
    END IF;
  END IF;

  RETURN v_nome;
END;
$$;
--> statement-breakpoint
-- Mês corrente e os três seguintes, para o banco recém-criado já aceitar escrita.
SELECT pipe_criar_particao_mes('mensagem', (date_trunc('month', now()) + (n || ' month')::interval)::date)
FROM generate_series(0, 3) AS n;
--> statement-breakpoint
SELECT pipe_criar_particao_mes('evento_atendimento', (date_trunc('month', now()) + (n || ' month')::interval)::date)
FROM generate_series(0, 3) AS n;

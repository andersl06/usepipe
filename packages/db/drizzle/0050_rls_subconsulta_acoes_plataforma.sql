-- As políticas de 0049 chamavam current_setting por linha; na forma (SELECT ...) o planner
-- avalia uma vez por consulta (InitPlan), como em todas as outras tabelas com tenant_isolado.
DROP POLICY IF EXISTS "tenant_isolado" ON "lista_distribuicao";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "lista_distribuicao"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "lista_distribuicao_contato";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "lista_distribuicao_contato"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));--> statement-breakpoint
DROP POLICY IF EXISTS "tenant_isolado" ON "gravar_memoria";--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "gravar_memoria"
  USING (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid))
  WITH CHECK (tenant_id = (SELECT current_setting('pipe.tenant_id')::uuid));

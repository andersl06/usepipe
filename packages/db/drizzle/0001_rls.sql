-- Isolamento por tenant (§1 do modelo de dados).
--
-- A `api` abre a transação com `set local pipe.tenant_id = '<uuid>'` (o helper
-- `comTenant` faz isso) e toda tabela de negócio carrega a mesma política. Sem a
-- variável de sessão, `current_setting` lança e a consulta não retorna nada: falha
-- fechada, não falha aberta.
--
-- O papel da aplicação (`pipe_app`) NÃO é dono das tabelas e NÃO tem `bypassrls` —
-- é isso que faz a política valer. As migrations rodam com o papel dono, que a ignora
-- de propósito, porque precisa criar partição e semear o catálogo.
--
-- `permissao` fica de fora: é catálogo global do produto, igual para todo tenant.
-- `tenant` entra com a política escrita sobre `id`, porque é a própria linha do tenant.
-- Consequência a resolver na fase da `api`: descobrir o tenant pelo slug antes de haver
-- tenant em vigor não passa por este papel — a resolução do login precisa de caminho próprio.

ALTER TABLE "tenant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "tenant"
  USING (id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "acao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "acao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "agendamento_consulta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "agendamento_consulta"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "anexo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "anexo"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "atividade" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "atividade"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "atribuicao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "atribuicao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "avaliacao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "avaliacao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "base_conhecimento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "base_conhecimento"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "bloco" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "bloco"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "calibracao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "calibracao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "calibracao_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "calibracao_item"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "campo_customizado" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "campo_customizado"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "canal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "canal"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "chave_api" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "chave_api"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "classificacao_conversa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "classificacao_conversa"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "consulta_salva" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "consulta_salva"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "consumo_ia" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "consumo_ia"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "conta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "conta"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "contato" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "contato"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "contato_etiqueta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "contato_etiqueta"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "contato_identidade" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "contato_identidade"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "contestacao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "contestacao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "conversa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "conversa"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "conversa_etiqueta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "conversa_etiqueta"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "criterio" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "criterio"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "dicionario_campo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "dicionario_campo"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "dicionario_objeto" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "dicionario_objeto"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "documento_conhecimento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "documento_conhecimento"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "entrega_webhook" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "entrega_webhook"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "equipe" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "equipe"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "esforco_atendente_dia" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "esforco_atendente_dia"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "esforco_conversa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "esforco_conversa"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "etiqueta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "etiqueta"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "evento_atendimento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "evento_atendimento"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "execucao_acao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "execucao_acao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "execucao_fluxo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "execucao_fluxo"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "execucao_passo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "execucao_passo"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "execucao_workflow" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "execucao_workflow"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "faixa_score" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "faixa_score"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "feedback"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "fila" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "fila"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "fila_atendente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "fila_atendente"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "fluxo" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "fluxo"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "fluxo_versao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "fluxo_versao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "formulario" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "formulario"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "formulario_avaliacao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "formulario_avaliacao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "formulario_pergunta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "formulario_pergunta"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "formulario_versao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "formulario_versao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "gatilho" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "gatilho"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "grupo_criterio" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "grupo_criterio"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "horario_atendimento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "horario_atendimento"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "horario_excecao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "horario_excecao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "horario_faixa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "horario_faixa"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "importacao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "importacao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "inbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "inbox"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "insight" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "insight"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "lead" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "lead"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "log_auditoria" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "log_auditoria"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "membro_equipe" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "membro_equipe"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "mensagem" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "mensagem"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "metrica_diaria" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "metrica_diaria"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "motivo_pausa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "motivo_pausa"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "nota_interna" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "nota_interna"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "oportunidade" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "oportunidade"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "outbox_mensagem" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "outbox_mensagem"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "papel" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "papel"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "papel_permissao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "papel_permissao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "pausa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "pausa"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "pesquisa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "pesquisa"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "plano_coach" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "plano_coach"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "regra_fila" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "regra_fila"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "regra_fila_condicao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "regra_fila_condicao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "regra_prioridade" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "regra_prioridade"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "regra_score" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "regra_score"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "regra_sla" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "regra_sla"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "resposta_avaliacao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "resposta_avaliacao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "resposta_formulario" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "resposta_formulario"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "resposta_pesquisa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "resposta_pesquisa"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "resposta_pronta" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "resposta_pronta"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "score_lead" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "score_lead"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "sessao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "sessao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "sla_conversa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "sla_conversa"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "status_atendente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "status_atendente"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "template_mensagem" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "template_mensagem"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "transicao" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "transicao"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "trecho_conhecimento" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "trecho_conhecimento"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "usuario" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "usuario"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "usuario_papel" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "usuario_papel"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "webhook_saida" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "webhook_saida"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint
ALTER TABLE "workflow" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolado" ON "workflow"
  USING (tenant_id = current_setting('pipe.tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('pipe.tenant_id')::uuid);--> statement-breakpoint

-- Privilégios do papel da aplicação, quando ele existir neste cluster.
-- Em desenvolvimento o papel nasce no init do container; em produção ele é criado
-- fora da migration, com senha vinda do cofre.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pipe_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA public TO pipe_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pipe_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pipe_app';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pipe_app';
  END IF;
END
$$;

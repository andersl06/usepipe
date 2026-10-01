# Dependências da 03.1 / Fase 3 (D-14)

Lista única das funções cuja regra de negócio depende de trabalho fora da 03.2. Na 03.2 a tela fica visualmente igual à Blip; onde a regra falta, o estado mostrado é o texto do UI-SPEC.

| Função | Tela | Regra que falta (03.1/Fase 3) | Entregue na 03.2 | Estado mostrado |
|---|---|---|---|---|
| Falar com atendente | Monitoramento (barra do ticket) | Presença e sessão do atendente no desk | visual igual à Blip; campo desabilitado na aba do painel (`PreviaConversa`, `apps/management-vite/src/components/monitoring-detailed.tsx`); não grava nota nem mensagem | Este recurso será liberado em breve para este fluxo. |
| Filtro Status do atendente: Invisível | Monitoramento | Presença (Invisível não tem equivalente hoje) | visual igual à Blip; opção e aviso em `apps/management-vite/src/pages/operation/monitoring.tsx` (`PanelFilters`) | Este recurso será liberado em breve para este fluxo. |
| Fila por fluxo | Filas e Regras | Isolamento de filas por fluxo | visual igual à Blip | Este recurso será liberado em breve para este fluxo. |
| Distribuição automática | Filas e Regras | Motor de distribuição automática de tickets | visual igual à Blip | Este recurso será liberado em breve para este fluxo. |
| Identidade roteador/subbot | Casca e Canais | Identidade do roteador e dos subbots por contato | visual igual à Blip | Este recurso será liberado em breve para este fluxo. |
| SLA como regra | SLA (sla-policy) | Conferir que os indicadores de SLA em Relatórios e em Monitoramento leem as políticas gravadas (o relógio `sla-motor` já usa `regra_sla`); alerta e ação de estouro por regra; política como entidade própria (hoje várias linhas com o mesmo nome) | tela `regras-sla` grava e lê a política de verdade (`POST/PUT/DELETE settings/rules/policy`, metas TME, TMR1, TMA, filas, padrão); nada fica desabilitado | A tela funciona; o efeito nos indicadores não foi conferido nesta fase. |
| Valor em chips e conector por condição | Regras de atendimento (rules) e regras da fila | Motor de regras aceitar vários valores por condição e conector por grupo (hoje um valor e um combinador por regra) | formulário igual à Blip no restante; um valor e um conector por regra | A tela mostra um valor por condição (sem controle falso). |
| Dashboards de ligações e vendas (calls-dashboard, sales-dashboard) | Dashboards | Dado de ligação e de venda (o Pipe não tem) | tela não entregue (decisão do dono Q6, 2026-09-30); a rota depende da tensão T-01 em `DECISOES-DONO.md` | Este recurso será liberado em breve para este fluxo. |
| Tags da fila | Gestão da fila (queue-management) | Vínculo entre etiqueta e fila no domínio (hoje a etiqueta é por tenant) | visual igual à Blip; campo desabilitado em `apps/management-vite/src/pages/registrations/agents-queues-edit.tsx` (`SectionPendente`) | Este recurso será liberado em breve para este fluxo. |
| Encerramento automático de tickets por inatividade | Gestão da fila (queue-management) | Regra de inatividade por fila no motor de atendimento | visual igual à Blip; interruptor desabilitado em `agents-queues-edit.tsx` | Este recurso será liberado em breve para este fluxo. |

# Decisões do dono (portão da Onda 0)

Respostas literais do dono, dadas no chat em 2026-09-30. O Claude não decidiu nenhum item (D-04). Fonte das perguntas: `QUESTOES-DONO.md` e `CONFLITOS-ROTA.md`.

| ID | Pergunta | Resposta do dono | Data | Planos afetados |
|---|---|---|---|---|
| Q1 | Tolerância de medida | 1px (tolerância 1px, como na Fase 2). Gravada em `METODO.md` | 2026-09-30 | todos os planos de tela (07 a 24) |
| Q2 | Paginação no servidor para o Histórico | Sim, paginação no servidor (usar `apps/api/src/pagination.ts`) | 2026-09-30 | 03.2-07, 03.2-11 (muda contrato de API e testes) |
| Q3 | Skins de paginação `grade` e `lista` | Colapsar as skins grade e lista em uma só (evidência: `ref/verificacao/paginacao.md`, §Conclusão para Q3); `portal` fica à parte | 2026-09-30 | 03.2-07 |
| Q4 | Exportar PDF do Histórico | Biblioteca no servidor para o PDF; o PDF também vai por e-mail. Anotação: o plano 03.2-12 executa o checkpoint de legitimidade do pacote antes de instalar | 2026-09-30 | 03.2-12, 03.2-13 |
| Q5 | Fonte do Atendimento | Manter IBM Plex Sans (lacuna aprovada; registrada em `LACUNAS-APROVADAS.md`) | 2026-09-30 | todos os planos de tela |
| Q6 | Dashboards de ligações e vendas | Dependência: não entregar as telas de dashboards calls/sales agora (registrada em `DEPENDENCIAS-03.1.md`) | 2026-09-30 | 03.2-24 |
| R-01 | `preferences/*` x `general-settings` | Adotar Blip (`general-settings`), com redirecionamento do antigo | 2026-09-30 | 03.2-06, 03.2-21 |
| R-02 | `queue-management/:queueId/edit` | Adiado | 2026-09-30 | nenhum (fica como hoje no Pipe; volta no portão seguinte) |
| R-03 | `team/create`, `team/edit`, `team/permission` sem `:id` | Adotar Blip (`team/create|edit|permission` sem `:id`) | 2026-09-30 | 03.2-06 |
| R-04 | `calls-dashboard` e `sales-dashboard` sem rota | Adotar Blip (criar rotas `calls-dashboard` e `sales-dashboard`). Ver tensão T-01 abaixo | 2026-09-30 | 03.2-06, 03.2-24 |
| R-05 | `personalizedbreaks` e `survey-dashboard` | Adotar Blip (manter os segmentos `personalizedbreaks` e `survey-dashboard`) | 2026-09-30 | 03.2-06 |
| R-06 | Dois `channels` | Manter os dois channels como na Blip | 2026-09-30 | nenhum |
| R-07 | Segmentos sem rota (`attendants`, `sla`, `blip-copilot`) | Adiado | 2026-09-30 | nenhum (volta no portão seguinte) |
| R-08 | Detalhe do ticket do Histórico | Adotar Blip: rota e nova aba `attendance/history/{id}@tunnel.msging.net?ticketId=...` | 2026-09-30 | 03.2-06, 03.2-11 |

## Tensão em aberto (resolver com o dono nos planos 03.2-06 e 03.2-24)

**T-01. R-04 x Q6.** R-04 manda criar as rotas `calls-dashboard` e `sales-dashboard`, mas Q6 manda não entregar as telas. Resultado: rota sem tela entregue. Os planos 03.2-06 (rotas) e 03.2-24 (dashboards) devem decidir com o dono: (a) criar a rota com um placeholder (texto de dependência do UI-SPEC) ou (b) postergar a criação da rota até a tela existir. Não decidido aqui.

## Anotações de execução

- Q4: o pacote de PDF no servidor só é instalado depois do checkpoint de legitimidade do pacote, executado no plano 03.2-12.
- Q2: o contrato de API do Histórico passa a paginar no servidor; testes de `apps/api` mudam junto.

## Decisões adicionais (2026-10-01)

| ID | Pergunta | Resposta do dono | Data | Planos afetados |
|---|---|---|---|---|
| D-C11 | Seleção múltipla nos filtros Atendentes e Tags do Histórico (e filtro por Fila) | Seguir o mesmo visual de seleção do filtro de Atendentes do Monitoramento (resposta literal: "esse pode seguir o mesmo visual de seleção da parte de atendentes do monitoramento, até mesmo o filtro por fila no plano c-11") | 2026-10-01 | 03.2-16 (portão do Histórico), correção pendente da multisseleção em history.md |
| D-C02 | Filtro de Atendentes do Monitoramento (C-02) | Não precisa mudar visualmente; o estado atual do Pipe está bom | 2026-10-01 | 03.2-10 (nada a corrigir) |
| E-01 | Evidência enviada pelo dono: trecho do contêiner `sidebar` da Blip (`type_over`, `position_right`, fundo `surface-1`, `is_open`, largura 420px, cabeçalho com botão fechar, corpo rolável, rodapé). Arquivo guardado fora do Git em `referencias-blip/atendimento/03.2-capturas/2026-10-01-sidebar-type_over-position_right.html.txt`. Não diz se é o painel de filtros ou o de detalhe do ticket; o 03.2-09 usou 444px no painel de detalhe, então conferir a largura | — | 2026-10-01 | 03.2-09 (largura do painel), 03.2-10, 03.2-11 |
| Q4-pkg | Legitimidade do pacote de PDF no servidor (checkpoint do 03.2-12) | "aprovado pdfkit@0.20.2" (MIT, github.com/foliojs/pdfkit, ~11M downloads/semana, última publicação 2026-09-07). Instalado com versão exata; `@types/pdfkit` entra só como devDependency de tipos (pdfkit não traz tipos) | 2026-10-01 | 03.2-12, 03.2-13 |
| D-C16 | Seletor de Filas na tela Adicionar atendentes | É o filtro de filas global (mesmo componente de seleção múltipla do Monitoramento e do Histórico); resposta literal: "o filtro de filas é aquele global.." | 2026-10-01 | 03.2-15 (Atendentes) |
| D-T01 | Teste do portão da Onda 1 (2026-10-01): lista de correções pedidas pelo dono | (a) Monitoramento: fundo dos filtros transparente, como na tela de Atendentes; (b) filtro de Contato renderiza como a Blip (autocompletar no servidor, opção "Nome - identificador", busca enquanto digita); (c) filtro de Período limitado a intervalo de 90 dias e o seletor de datas só aparece ao escolher "Personalizado", que é a última opção (início e fim com data limite de 5 anos atrás até hoje, hora e minuto, Redefinir e Concluir); (d) Histórico, "Enviar por e-mail": remover "Baixar planilha (.csv)"; manter só o histórico de conversas (PDF, apenas dos tickets selecionados) e a lista de tickets (resposta à pergunta 3); (e) Adicionar atendentes: seta de voltar sem fundo branco e o texto da Blip "Usar configuração padrão (200 tickets simultâneos)"; (f) Permissões: exatamente as 10 da Blip (Editar dados do contato; Enviar mensagem ativa; Criar links de pagamento; Criar pastas e etapas do Kanban para organizar os tickets; Transferir tickets; Transferir múltiplos tickets ao mesmo tempo; Receber ligações de voz; Realizar ligações de voz; Acesso ao Histórico dos contatos no Blip Desk; Criar respostas prontas) e conferir que o gerenciamento de acesso está correto (resposta à pergunta 7); (g) Filas: remover a opção de definir fila padrão; URL de edição como a da Blip (`attendance/queue-management`, sem `/:id/edit`), o que decide R-02; página de editar fila muito diferente da Blip (faltam Preferências, Comunicação e Regras); (h) Monitoramento: a tabela `mon-tabela-atribuidas` continua totalmente diferente da Blip | 2026-10-01 | correções da Onda 1 antes do portão do plano 16 |

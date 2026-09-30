# Auditoria Blip × Pipe — Atendimento, Desk e Roteador

Status: parcial, baseada nas regras oficiais de Atendimento/Desk consultadas em 2026-09-30 e no código local. **Não é uma certificação de paridade de toda a plataforma Blip.** Não publicar o recorte de monitoramento por fluxo como correção completa enquanto filas e regras de entrada ainda forem globais.

## Regra de propriedade confirmada

Na Blip, o operador escolhe **um chatbot** antes de entrar em Atendimento > Atendentes > Filas e criar a fila. O artigo também coloca regras de atendimento, priorização e tags da fila nesse contexto. Atendentes são contas de usuário e podem participar de N filas. Fontes: [gerenciamento de filas e regras](https://help.blip.ai/hc/pt-br/articles/4474425334423-Como-gerenciar-filas-e-regras-de-atendimento-no-Blip), [visão geral do Desk](https://help.blip.ai/hc/pt-br/articles/4474416681495-Vis%C3%A3o-geral-do-Blip-Desk), [monitoramento por bot](https://help.blip.ai/hc/pt-br/articles/14932635417879-Monitoramento-de-atendimento).

| Regra | Pipe hoje | Veredito |
| --- | --- | --- |
| Filas criadas/listadas no bot selecionado | `fila` tem `tenant_id`, mas nenhum `fluxo_id`; `loadQueues` e `GET /management/agents/queues` leem todas do tenant. O painel de filas do Builder usa a mesma API. | **Lacuna confirmada** |
| Escrita e uso da fila limitados ao bot | CRUD valida tenant; `chooseQueue` aceita ID explícito, regras e nome em `contact.extras.teams` sem validar fluxo. | **Lacuna funcional e de autorização entre fluxos** |
| Regras de encaminhamento do bot | `regra_fila` tem apenas `tenant_id`; `loadActiveQueueRules` carrega todas as regras do tenant. | **Lacuna confirmada; pode encaminhar conversa do fluxo B à fila do A** |
| Priorização no contexto da fila/bot | `regra_prioridade` tem escopos tenant/fila, mas não há propriedade do fluxo para a fila. | **Parcial; herda a mistura de filas** |
| Tags específicas da fila | A página de edição declara que o vínculo fila–etiqueta não foi implementado. | **Lacuna confirmada** |
| Usuário em várias filas | Existe `fila_atendente` N:N. | **Presente**, mas a fila atualmente não pertence a um fluxo |
| Monitoramento e histórico do bot | O patch local filtra conversas por `execucao_fluxo → fluxo_versao` quando a UI passa `flowId`. | **Parcial**: catálogos de filas/agentes e algumas ações/detalhes seguem globais; sem deploy |
| Distribuição automática por bot | O Pipe exige fila, Online e vaga, e tem teto sem primeira resposta; porém `chooseForQueue` usa um único algoritmo de carga e `PIPE_TETO_SEM_PRIMEIRA_RESPOSTA` é variável do processo. Não há seleção, por bot, entre os dois modos documentados pela Blip. | **Parcial**: elegibilidade presente; configuração por bot ausente |
| Atalho de respostas prontas no compositor | Há painel de respostas e a lista mostra `/{atalho}`, mas `onChange` só muda texto e o painel só abre pelo botão; digitar `/` não o abre. | **Bug/ausência confirmada na UI Pipe**; o gatilho exato da Blip requer reconciliação das fontes |
| Emoji e gravação de áudio no Desk | Os dois botões existem no compositor, mas estão `disabled`. | **Ausente na UI Pipe** |
| Presença ao entrar/sair do Desk | O Pipe conserva o status gravado em `status_atendente` no reload, fechamento da aba e logout; a preferência “Continuar online” fica em `localStorage`, mas não governa presença. O distribuidor considera o status salvo. | **Bug operacional confirmado no código Pipe**; a regra Blip para F5 especificamente requer teste, mas fechar/reabrir está documentado |

Evidência no Pipe: `packages/db/src/schema/conversations.ts` (fila e associação), `packages/db/src/schema/management.ts` (regras), `apps/api/src/domain/management/registrations.ts` (CRUD e leituras), `apps/api/src/domain/queue-entry.ts` (seleção em produção), `apps/management-vite/src/pages/builder/panel-queues.tsx` e `apps/management-vite/src/pages/registrations/agents-queues-edit.tsx`.

Na [distribuição automática da Blip](https://help.blip.ai/hc/pt-br/articles/18694892640791-Como-funciona-a-distribui%C3%A7%C3%A3o-autom%C3%A1tica-de-tickets-no-Blip-Desk), os três requisitos são fila, Online e slot livre; o bot pode escolher entre menor carga e maior tempo sem ticket, e configurar limite individual, puxada manual e teto sem primeira resposta. No Pipe, a elegibilidade está em `packages/core/src/distribution/carga.ts`; a escolha fixa e o teto global estão em `apps/api/src/domain/distribution.ts`. **Ainda não concluído**: verificar a paridade de cada controle de preferências e seu efeito no Desk; não inferir ausência de uma busca textual isolada.

Sobre o atalho: o [artigo oficial de acessibilidade da Blip](https://help.blip.ai/hc/pt-br/articles/34953352607511-Acessibilidade-no-Blip-Desk) documenta `#` para respostas prontas, enquanto o usuário observou `/` na instalação Blip que usa; o Pipe mostra `/` na lista. A regra exata da referência deve ser conferida na versão/conta do usuário. Independentemente disso, o `onChange` em `apps/desk-vite/src/pages/attendances/composer.tsx` não abre o painel para nenhum dos dois caracteres. A Blip documenta [gravação de áudio](https://help.blip.ai/hc/pt-br/articles/4474433306647-Grava%C3%A7%C3%A3o-e-envio-de-%C3%A1udio) e [emoji](https://help.blip.ai/hc/pt-br/articles/4474425565719-Como-habilitar-o-uso-de-emoji-para-o-Desk), ambos botões desabilitados no Pipe.

Há também uma contradição **interna**: `docs/specs/2026-09-05-desk-requisitos.md` reserva `#` para respostas prontas e `/` para comandos da conversa, enquanto a UI atual apresenta `/{atalho}` nas respostas prontas. A observação do usuário é evidência de comportamento em sua Blip, não autorização para apagar a decisão anterior sem reconciliá-la.

Sobre presença: [Status dos atendentes (Blip)](https://help.blip.ai/hc/pt-br/articles/18046361712919-Status-dos-atendentes) documenta retorno `Invisível` após fechar e reabrir o Desk por padrão e a exceção “Continuar online”. Não descreve F5 separadamente; a observação de F5 do usuário deve ser testada no ambiente de referência. O fluxo de reload do Pipe apenas consulta a sessão e o status (`apps/desk-vite/src/context/session.tsx`, `apps/api/src/domain/desk/consultas.ts`); logout revoga sessão sem alterar `status_atendente` (`apps/api/src/controllers/login.ts`). Isso deixa alguém elegível para a distribuição mesmo após desconectar, pois `apps/api/src/domain/distribution.ts` consome a linha persistida. A preferência “Continuar online” é guardada apenas no browser e não controla essa transição. A especificação local `docs/specs/2026-09-05-desk-requisitos.md` já exige entrada Invisível e Offline automático na saída.

## Identidade e contexto do Roteador

Os dois IDs vistos na Blip podem ser a identidade original no roteador e a identidade de **túnel** no subbot; isso não prova dois clientes físicos. A [documentação de variáveis](https://help.blip.ai/hc/pt-br/articles/4474417686039-Vari%C3%A1veis-do-Builder) distingue `contact.identity`, `tunnel.identity` e `tunnel.originator`. No Pipe, `contato.id` e `contato_identidade` são do tenant, sem dimensão de bot (`packages/db/src/schema/conversations.ts`), e o mesmo UUID percorre roteador e serviço. A simplificação é explícita em `packages/core/src/flow/context.ts`; não deve ser revertida para “duplicar contatos” sem decidir a semântica de CRM e privacidade.

| Regra | Pipe hoje | Veredito |
| --- | --- | --- |
| Identidade original do canal versus identidade de túnel no subbot | `contact.identity`, `tunnel.identity` e `tunnel.originator` tendem a expor o UUID interno do contato. A ponte Desk pode expor identificador WhatsApp, criando formatos diferentes. | **Incompatibilidade de contrato** para fluxos/API importados da Blip; não é duplicação acidental de pessoa |
| Contatos com contexto do roteador desligado | A Blip exige passar dados no redirecionamento; no Pipe, `saveContact`/`loadContact` usam o mesmo cadastro do tenant, independentemente do modo. | **Diferença de isolamento**: atributos podem atravessar subbots sem contexto |
| Contatos do subbot nas telas | A lista do Pipe filtra pelo canal ligado ao fluxo, não pelas execuções do serviço; um subbot atendido só via roteador pode aparecer sem contatos. | **Bug de recorte de leitura** |
| Redirecionar com mensagem de contexto | O Pipe troca o serviço, mas não injeta a mensagem de contexto como primeira entrada do destino. | **Lacuna de runtime**; pode esperar uma mensagem nova quando a Blip prosseguiria imediatamente |
| Retorno e métricas do roteador | O Pipe guarda posição e execuções por serviço, mas o patch de Atendimento filtra pela execução; o roteador sem execução própria pode não apresentar os números consolidados. | **Parcial; requer teste de jornada** |

Fontes: [contatos e contexto no subbot](https://help.blip.ai/hc/pt-br/articles/4474407959191-Como-recuperar-informa%C3%A7%C3%B5es-de-contatos-em-um-SubBot), [redirecionamento entre subbots](https://help.blip.ai/hc/pt-br/articles/5426507201303-Como-funciona-o-redirecionamento-entre-subbots), [identidades nas variáveis](https://help.blip.ai/hc/pt-br/articles/4474417686039-Vari%C3%A1veis-do-Builder). Evidências Pipe: `apps/api/src/domain/inbound.ts`, `apps/api/src/domain/router.ts`, `apps/api/src/domain/flow.ts`, `apps/api/src/domain/management-flow.ts`, `apps/bridge/src/translation.ts`, `packages/core/src/flow/context.ts`.

## Outras funções de Desk verificadas nesta rodada

| Regra documentada na Blip | Evidência Pipe | Veredito |
| --- | --- | --- |
| [Relacionar manualmente tickets](https://help.blip.ai/hc/pt-br/articles/31264004565399-V%C3%ADnculo-Entre-Tickets), inclusive de contatos/status diferentes, navegando em ambos os sentidos | Não há relação de tickets no esquema de conversas nem ação correspondente nas telas de histórico/Desk; busca direcionada no código não encontrou implementação. | **Lacuna de funcionalidade**, com base no código local; requer teste de UI para fechar a verificação operacional |
| [Responder uma mensagem específica e registrar reações](https://help.blip.ai/hc/pt-br/articles/19265475937687-Intera%C3%A7%C3%B5es-de-mensagens-do-tipo-Reply-e-Reactions-no-Blip-Desk) | `apps/desk-vite/src/pages/attendances/thread.tsx` renderiza bolhas, mas não oferece seleção/resposta/reação; modelos de mensagem e envio não guardam referência a outra mensagem. O processamento de inbound trata respostas interativas a botões, que não são o mesmo recurso. | **Lacuna confirmada no Desk**; reação recebida/por canal merece teste separado |
| [Chat gestor–atendente vinculado ao ticket](https://help.blip.ai/hc/pt-br/articles/31236188161431-Chat-Gestor-Atendente), com avisos para os dois lados | `apps/desk-vite/src/pages/attendances/panel.tsx` registra explicitamente `Falar com gestor` como ausente; notas internas em `apps/api/src/domain/desk/actions.ts` não são chat bidirecional com notificação. | **Lacuna confirmada** |
| Marcar ticket como não lido e fixá-lo | Há suporte em esquema, ações de tag e cartão do Desk. | **Presente; não listar como gap** |

Estas funções não são necessariamente prioridade de implementação antes do isolamento de fluxo e presença; a tabela mede **paridade**, não decide roadmap. A página de Reply/Reactions contém trecho histórico sobre lançamento futuro de reações, portanto a disponibilidade real de envio na conta do usuário ainda precisa ser observada.

## O que precisa entrar na correção, não apenas na tela

1. Definir propriedade da fila por fluxo/bot, preservando o vínculo N:N dos atendentes. Reavaliar unicidade do nome dentro do fluxo.
2. Aplicar o escopo em lista, detalhe, criação, edição, remoção, vínculo de atendentes, regras, prioridade, fila padrão e painel do Builder.
3. Validar no servidor que destino explícito, regra e `contact.extras.teams` nunca escolham fila de outro fluxo; cobrir também transferência manual, Desk e distribuição.
4. Migrar filas existentes sem atribuí-las arbitrariamente: há regras, inboxes, conversas e atendentes vinculados. A política de legado exige decisão do dono antes de alterar dados.
5. Testar dois fluxos no mesmo tenant (inclusive subbots sob roteador), nomes iguais, usuário compartilhado, regras conflitantes, fila padrão, transferência e dados históricos.

## Ordem sugerida após decisão de produto

1. **P0 — segurança operacional:** impedir que filas/regras de outro fluxo decidam o destino do atendimento; corrigir presença ao sair/voltar ao Desk para que atendente ausente não receba novos tickets. Antes, fechar a política para filas legadas e a semântica de F5 versus fechamento, testada na Blip usada pelo dono.
2. **P1 — identidade e navegação:** preservar semântica de `contact`/`tunnel` para fluxos importados, recortar contatos do subbot por execução, entregar a mensagem de contexto no redirect e validar retorno ao bloco anterior.
3. **P2 — operação do Desk:** tornar o atalho de respostas prontas funcional, reconciliar `/` e `#` na referência efetiva; completar emoji e gravação de áudio, hoje apresentados porém desabilitados.
4. **P3 — paridade de configuração:** modos de distribuição e limites por bot, tags por fila, horários, preferências e monitoria/detalhes, com testes de duas operações no mesmo tenant.

## Limite desta auditoria

Ainda não foi validada a paridade de toda a Blip (Builder, canais, cobrança, CRM, integrações, analytics e cada opção de Desk). O próprio Pipe documenta divergências deliberadas em `docs/specs/2026-09-05-desk-requisitos.md`; uma lacuna só deve virar mudança após separar ausência de decisão de produto. As próximas frentes do inventário de Atendimento são distribuição automática, elegibilidade/capacidade, permissões, preferências e horários, tags, ticket/transferência, SLA, relatórios e ações do Desk.

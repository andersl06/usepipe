# Insumo: revisão do estado `com_bot` (origem: sessão pipe-40, pedido do dono)

**Fonte:** mensagem da sessão pipe-40. Modelo da Blip vem da skill blip-onboarding (`referencias/contato-travado.md`), **não validado ao vivo na API** → classificar `não verificado` até ensaio.

## Situação no Pipe
- pipe-40 corrigiu "conversas de bot aparecendo como na fila" criando `com_bot` em `conversa.estado` (commits `71beee0e` + merge `a1622e07` em `limpeza`).
- Migration `packages/db/drizzle/0081_conversa_com_bot.sql`, ainda **não aplicada em nenhum banco**.
- O dono achou o modelo torto.

## Como a Blip faz
- Posição no fluxo fica no **contexto do contato** (`GET /contexts/{identity}`): `current-flow-id`, `stateid@<flow-id>`, `previous-stateid@<flow-id>`. Não é estado de ticket.
- O ticket (Desk) só nasce quando o fluxo encaminha ao atendimento humano. Status próprio: Waiting/Assigned/Open/closed.

## Problema
`com_bot` mistura "está com o bot" (contexto/fluxo) na máquina de estados do atendimento. O Pipe já tem `execucao_fluxo` com o nó atual por conversa.

## Proposta (o dono decide entre 1+2 e 3)
1. Desfazer `com_bot`: máquina só com `na_fila, atribuida, em_atendimento, em_espera, encerrada`; remover migration 0081 e o estado em `maquina.ts`, `schema/comum.ts`, `contracts/desk.ts`, `situation.ts` do Desk.
2. "Com o bot" derivado: sem fila, sem atendente, sem `encerrada_em` e com `execucao_fluxo` ativa. Uma função única "conversa visível como ticket" usada no Desk (contagem/Atender), monitoramento (`monitoring.ts`) e API de tickets (`desk-commands.ts` `selectTickets`).
3. (Opcional, mais fiel à Blip) criar o ticket só no transbordo — mudança maior.

Manter filtros e testes de regressão já feitos, trocando só o critério.

## Conflito a tratar no plano
- O número de migration `0081` já está tomado pela pipe-40. A migration de filas por fluxo da 03.1 (research sugeria `0081`) deve usar o próximo número livre **após** conferir `git worktree list`/journal, e se a 0081 `com_bot` for removida, não reaproveitar o número sem alinhar.

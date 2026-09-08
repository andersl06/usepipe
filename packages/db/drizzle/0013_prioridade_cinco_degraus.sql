-- A régua de prioridade ganha os dois degraus que faltavam: `maxima` no topo e
-- `sem_prioridade` no pé.
--
-- Ver `docs/pesquisa/blip-gestao-medidas.md` §8.5 e `NIVEIS_PRIORIDADE` em
-- `src/schema/comum.ts`, onde a ORDEM da lista é o peso de ordenação.
--
-- Três decisões estão na forma deste arquivo:
--
-- 1. **A ausência é um VALOR, não `NULL`.** `sem_prioridade` existe porque a regra
--    de fila depende dela: um ticket de prioridade `baixa` fura a frente de um que
--    não tem prioridade nenhuma. Com coluna anulável, `prioridade` viraria
--    `string | null` em três aplicações ao mesmo tempo; com valor nomeado, a
--    restrição continua sendo uma lista simples e a tela mostra "Sem prioridade",
--    que é o rótulo, não um vazio.
--
-- 2. **O padrão deixa de ser `media`.** Era ele que fazia todo ticket nascer com
--    prioridade que ninguém escolheu — e ordenar a fila por prioridade seria
--    ordenar por dado inventado, que é por que a fila de espera saía só por data
--    de criação.
--
-- 3. **Regra de priorização não pode atribuir a ausência.** `regra_prioridade`
--    ganha `maxima` mas NÃO ganha `sem_prioridade`: uma regra que atribui "sem
--    prioridade" não é uma regra, é a falta dela, e teria o efeito de rebaixar o
--    ticket para o fim da fila sem ninguém ter pedido.
--
-- NÃO HÁ CORREÇÃO DE DADOS, e isso é deliberado. As duas restrições só ALARGAM
-- sobre as atuais — `baixa`, `media` e `alta` seguem válidos nas duas —, então
-- nenhuma linha existente viola.
--
-- E as linhas antigas que gravaram `media` FICAM COMO ESTÃO. Sob o padrão antigo
-- não dá para distinguir "alguém escolheu média" de "ninguém escolheu nada":
-- os dois casos produziram a mesma linha. Reescrevê-las para `sem_prioridade`
-- inventaria um fato que se perdeu no dia em que a coluna nasceu com padrão.
-- O padrão novo conserta daqui para a frente, e só. Quem vier depois com vontade
-- de "arrumar essas linhas": não há o que arrumar, há dado que não existe.

alter table "conversa" drop constraint "conversa_prioridade_ck";--> statement-breakpoint
alter table "conversa" add constraint "conversa_prioridade_ck"
  check ("prioridade" in ('maxima', 'alta', 'media', 'baixa', 'sem_prioridade'));--> statement-breakpoint
alter table "conversa" alter column "prioridade" set default 'sem_prioridade';--> statement-breakpoint

alter table "regra_prioridade" drop constraint "regra_prioridade_nivel_ck";--> statement-breakpoint
alter table "regra_prioridade" add constraint "regra_prioridade_nivel_ck"
  check ("nivel" in ('maxima', 'alta', 'media', 'baixa'));

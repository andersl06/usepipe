# Adicionar atendentes (tela de criação) — o que a Blip mostra

**Fonte:** HTML renderizado enviado pelo dono em 2026-10-01 (`create-edit-attendant-page`), guardado fora do Git em `referencias-blip/atendimento/03.2-capturas/2026-10-01-atendentes-adicionar-atendente.html.txt`. Fecha a captura C-16 "Adicionar atendentes (criar)". O HTML traz nomes reais de filas e o rodapé do Portal; nada disso foi copiado.

## Estrutura (de cima para baixo)
1. Botão voltar (`back-button`) e título "Adicionar atendentes".
2. **E-mail** (`email-select`, campo de chips): placeholder "Insira os e-mails dos atendentes"; título "Adicione um ou mais atendentes"; ajuda "Para adicionar mais de um atendente, separe os e-mails apertando Enter".
3. **Filas** (`select-chips-custom-queues`, seleção múltipla com chips): placeholder "Selecione as filas de atendimento"; ajuda "Indique as filas nas quais este atendente irá operar". A lista traz todas as filas do bot em ordem alfabética.
4. **Tickets simultâneos** (`agent-slot-settings-default-test`): ajuda "Defina a quantidade de tickets que podem ser distribuídos para este atendente no Blip Desk"; interruptor "Usar configuração padrão (200 tickets simultâneos)".
5. Rodapé da página: **Cancelar** (`cancel-button`) e **Salvar** (`save-button`).

Componentes da Blip usados: paper, grid, input-chips, select-chips, select-option, switch, button, button-icon, badge, card, checkbox, tooltip.

## Decisão do dono (2026-10-01)
- O seletor de **Filas** é o filtro de filas global (o mesmo seletor múltiplo do Monitoramento e do Histórico): um único componente de seleção múltipla com chips, reutilizado aqui. Não criar um seletor novo para esta tela.

## Não sabemos ainda (não inventar)
- Medidas (larguras, espaçamentos, altura do campo de chips, posição do rodapé).
- Validação do e-mail (quando o chip vira inválido), mensagem de erro e comportamento do Salvar sem fila.
- Quando o interruptor está desligado: aparece um campo numérico? (a captura mostra só o estado "padrão").
- Mensagem ao salvar e destino depois de salvar.

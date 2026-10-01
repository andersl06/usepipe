# SLA (regras de SLA) na Blip: captura ao vivo

**Fonte:** bot dev `auvpcapitaldev1`, aba logada, **só leitura**, 2026-10-01, janela 1920x863. Arquivos brutos fora do Git em `referencias-blip/atendimento/03.2-capturas/2026-10-01-sla-*`. Sem nomes, e-mails ou telefones. `[M]` = medido ao vivo; `[B]` = texto lido do bundle do desk, não visto na tela; `[A]` = estimado.

## URLs [M]
- Lista: `.../attendance/desk/sla-policy`.
- "Criar regra" **não muda a URL**: o formulário (`create-edit-sla-policy-page`) troca o conteúdo na mesma rota; a seta de voltar devolve a lista sem confirmação.
- Menu: SLA é o **segundo** item do grupo "Regras" (Atendimento, **SLA**, Horários).

## Lista de regras de SLA: estado vazio [M]
O bot dev **não tem nenhuma regra de SLA**, então só o estado vazio foi visto.
- Título "Regras de SLA", 24px, peso 400, cor `rgb(40,40,40)`, altura 32px (x=383).
- Botão azul **"+ Criar regra"** à direita do título: 132 x 40px, fundo `rgb(30,107,241)`, raio 8px, padding 0 16px.
- Linha fina separadora sob o cabeçalho.
- Ilustração do bot de atendimento (`bds-illustration`, tipo `blip-solid`, nome `agent`), 160 x 166px, centralizada (arte da Blip, **não copiar**; o Pipe desenha a sua).
- Título do vazio **"Você ainda não possui nenhuma regra de SLA"**, 16px em negrito [A: o texto na tela é negrito], centralizado.
- Descrição **"Defina as regras de SLA para determinar os prazos e condições de atendimento dos tickets."**, 16px/24px, cor `rgb(40,40,40)`, centralizada.
- O bloco do vazio ocupa 1421,7 x 264px.

## Lista com regras [B] (não vista)
Textos do bundle: busca "Buscar regras de SLA"; edição "Editar regra de SLA"; exclusão com texto "Ao excluir, novos tickets das filas que seguiam essa regra não serão mais considerados nos indicadores de SLA em Relatórios e em Monitoramento" e pergunta de confirmação equivalente a "Deseja realmente excluir a regra de SLA?"; mensagens de sucesso "A regra de SLA foi criada com sucesso", "...foi editada com sucesso" e "...foi excluída com sucesso"; erros "Erro ao salvar regra!", "Ocorreu um erro ao excluir a regra de SLA". Há também a chave de paginação "DeskSLAPolicyPageSize" (a lista pagina). **Aviso do bundle: "Atrasos de SLA não são exibidos em períodos maiores que 90 dias."** (relacionado ao limite de 90 dias que o dono pediu para o Histórico).

## Formulário "Nova regra de SLA" [M]
- Cabeçalho: seta de voltar (40x40, transparente, ícone `arrow-left` 24px) e o título **"Nova regra de SLA"** (24px). (Na edição o bundle usa "Editar regra de SLA".)
- Cartão (`bds-paper`): 1401,9 x 689px, fundo `rgb(246,246,246)`, raio 16px, sombra `0 2px 8px -2px rgba(0,0,0,.16)`. Duas colunas por linha: rótulo e ajuda à esquerda, controle à direita (x=1082, largura 670,9px).
- **Nome da regra** (rótulo 16px, peso 700, linha de 32px; ajuda 14px/21px cor `rgb(89,89,89)`: "Escolha um nome para identificar a regra de SLA"): campo `bds-input` com rótulo flutuante "Nome da regra", placeholder **"SLA Padrão"**, 670,9 x 59px, máximo 100 caracteres, erro "Informe um nome para a regra".
- **Filas aplicáveis à regra** (ajuda "Defina em quais filas a regra será aplicada"): à direita um interruptor **"Utilizar regra como padrão"** (rótulo 14px/21px, interruptor 32 x 18px, desligado) e um campo **seleção com chips** de filas (rótulo "Filas aplicáveis à regra", 670,9 x 56px, mensagem "Nenhuma fila encontrada", não permite criar novos itens; 18 opções no dev, as filas do bot).
- **"Metas de SLA"** (16px/700): faixa de aviso azul-clara (`bds-banner`, variante `system`, fundo `rgb(178,223,253)`, padding 8px 16px, 14px/700, 1341,9 x 56px, ícone de informação): **"Configure pelo menos uma meta de SLA para acompanhamento"**.
- Três metas, cada uma com **título + interruptor** (desligado por padrão) + ajuda à esquerda e, à direita, **tempo** (campo numérico `type=number`, `min=0`, 510,7 x 59px, desabilitado até ligar, erro "Campo obrigatório") e **"Unidade"** (select 155,3 x 59px, valor inicial Segundos):
  1. **"Tempo de espera (TME)"**, ajuda "Meta de tempo de espera do cliente após o transbordo"; campo "Tempo máximo de espera".
  2. **"Tempo de primeira resposta (TMR1)"**, ajuda "Meta de tempo que um cliente pode esperar para receber a primeira resposta de um atendente"; campo "Tempo máximo de primeira resposta".
  3. **"Tempo de atendimento (TMA)"**, ajuda "Meta de tempo para a conclusão de um atendimento"; campo "Tempo máximo para atendimento".
- Unidades (as três): **Segundos, Minutos, Horas, Dias**.
- Rodapé, à direita: **Cancelar** (90,8 x 40px, secundário) e **Salvar** (75,2 x 40px, azul `rgb(30,107,241)`, raio 8px). **Salvar** vem com o atributo `disabled` em regra nova.

## Não medido e por quê
- **Lista com regras:** o bot dev não tem regras de SLA e criar uma exigiria salvar (proibido nesta captura); só texto do bundle [B].
- **Formulário de editar regra:** idem.
- **Estados com meta ligada:** o interruptor de meta não foi clicado (interruptores gravam na Blip e uma captura anterior travou a sessão); portanto a aparência do campo de tempo habilitado e as mensagens de validação não foram vistas.
- **Excluir (modal):** só texto do bundle [B].
- **Regra padrão ("Utilizar regra como padrão") ligada:** não clicada.
- **Tipografia dos rótulos das metas e larguras em outras janelas:** só 1920x863; rótulos das metas e do cartão medidos como 16px/700/32px.

## Alterações no bot dev
Nenhuma. Foi aberto o formulário "Nova regra de SLA" (nada digitado, nenhum interruptor clicado) e fechado com a seta de voltar.

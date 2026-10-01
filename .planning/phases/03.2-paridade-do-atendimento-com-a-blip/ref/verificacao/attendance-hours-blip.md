# Horários de atendimento (`attendance/desk/attendance-hours`) — Blip ao vivo

**Base:** captura ao vivo em 2026-10-01 no bot dev `auvpcapitaldev1`, somente leitura (nada salvo, criado, excluído nem ativado). Janela do navegador 1920x863 (medidas [M] nessa largura). Dados pessoais não registrados aqui. Arquivos brutos (fora do Git): `referencias-blip/atendimento/03.2-capturas/2026-10-01-horarios-*`.

Legenda: [M] medido ao vivo; [A] estimado do screenshot.

## Menu lateral (grupos e ordem) [M]
Monitoramento · Histórico · **Relatórios** (Atendimento, Satisfação, Calls, Vendas) · **Comunicação** (Respostas prontas, Modelos de mensagens) · **Regras** (Atendimento, SLA, Horários) · **Atendentes** (Gestão de atendentes, Filas de atendimento, Pausas personalizadas) · **Preferências** (Configurações gerais, Canais de atendimento). "Preferências", "Comunicação" e "Regras" são grupos do menu, não seções de uma tela.

## Comportamento geral [M]
- Criar, editar e voltar acontecem **na mesma URL** (`.../attendance/desk/attendance-hours`); o conteúdo troca dentro da página. Seta de voltar (`arrow-left`, 40x40) e "Cancelar" devolvem à lista **sem confirmação**.
- "Criar horário" fica desabilitado (esmaecido) enquanto o formulário está aberto.

## Lista [M]
- Título "Regras de horários", 24px, peso 400, cor `#282828`, Nunito Sans; botão "+ Criar horário" à direita (144x40, azul sólido).
- Cartão por horário (`bds-paper`): 1422x92, fundo `#f6f6f6`, raio 16, sombra `0 2px 8px -2px rgba(0,0,0,.16)`, padding interno 20.
- Conteúdo do cartão: nome em negrito ("Horário Regular"), chip ciano "Horário regular" (24 de altura), descrição 16px `#595959` ("Horário de atendimento padrão"), lápis e lixeira (ícones 24x24, `#282828`, em botões 40x40, com tooltips "Editar" e "Excluir" ao pairar).
- Sem interruptor, sem busca e sem paginação visíveis (um só horário no dev).
- Estado vazio e estado de erro: **não vistos** (o dev tem 1 horário).
- Havia um indicador de carregando (spinner) abaixo da lista nas primeiras leituras; some sozinho.

## Formulário criar/editar [M]
Cartão único `bds-paper` de 1402 de largura (fundo `#f6f6f6`, raio 16, mesma sombra), seções separadas por linha, **título/ajuda à esquerda e controles à direita** (coluna de controles começa em x=1082):
1. **Nome e descrição** — ajuda: "Qual o nome e a descrição deste horário de atendimento?". Dois campos de texto de 663 de largura: placeholders "Insira o nome do horário (Ex: Horário de vendas)" e "Insira uma breve descrição sobre este horário".
2. **Filas** — ajuda: "Quais filas irão operar neste horário de atendimento?".
   - Interruptor "Definir como horário regular da operação" com ícone de ajuda; texto da ajuda: "Horário regular é aquele que se aplica para toda a sua operação. Filas sem horários específicos definidos, irão funcionar no horário regular."
   - Seletor múltiplo de filas, placeholder "Selecione as filas de atendimento", com busca ("Pesquisar...") e lista alfabética de todas as filas do bot; contador "0 de 17 filas selecionadas" (ícone de informação). **Quando o interruptor "regular" está ligado, o seletor de filas e o contador não aparecem** (visto na edição do horário regular).
3. **Programação** — ajuda: "Em quais dias e horários seus atendentes estarão disponíveis?". Uma linha por dia (Segunda a Domingo, nessa ordem). Dia sem faixa mostra "Sem atendentes disponíveis" e um botão "+" (ícone `add`). Ao clicar no "+": aparece uma faixa com campos **De** e **Até** (hora, nativos `time`, padrão **08:00** e **18:00**, cada um com ícone de relógio), lixeira para remover a faixa e "+" para acrescentar outra faixa no mesmo dia. O horário regular existente tem Segunda a Sexta 08:00–18:00 e Sábado/Domingo sem atendimento.
4. **Períodos sem atendimento** — ajuda: "Caso sua equipe de atendimento não esteja disponível em períodos específicos (ex: feriados ou recessos), você pode configurá-los aqui."
   - Botão "+ Cadastrar período" (179x32, contorno) e contador "0 períodos cadastrados" / "1 periodo cadastrado" (sem acento, como na tela).
   - Cada período: título editável "Insira um título" com lápis; interruptor **"Dia completo"** (ligado por padrão; com ele ligado a hora fica desabilitada em 00:00 e 23:59); **De** e **Até** com data ("Definir a data", padrão = hoje, ex.: 01/10/2026) e hora ("Definir a hora"); lixeira à direita para remover.
5. Rodapé do cartão: **Cancelar** (botão de texto) e **Salvar alterações** (146x40, azul sólido). Na edição existe também **Excluir** (78x40, à esquerda do rodapé).

Tipografia [M]: Nunito Sans; títulos de seção 16px (negrito [A]); campos 14px; rótulos "De/Até" 16px peso 700; "Definir a data" 13,5px.

## Excluir (confirmação) [M]
Modal de alerta pequeno (424 de largura): cabeçalho vermelho com ícone de lixeira e título **"Tem certeza que deseja excluir este horário?"**; corpo: "Automaticamente, as filas que estão vinculadas a ele passarão a operar no Horário regular, mas elas podem ser vinculadas a outro horário posteriormente."; botões **Cancelar** e **Excluir**. Aberto e cancelado; o horário permaneceu.

## Não medido e por quê
- Estados vazio e erro da lista (o dev tem 1 horário; esvaziar exigiria excluir).
- Validações do formulário (nome obrigatório, faixa com fim antes do início, períodos sobrepostos): não observadas sem tentar salvar.
- Comportamento ao salvar e mensagem de sucesso/erro: não executado (somente leitura).
- Edição de um horário que não seja o regular (com seleção de filas preenchida) e a lista com vários horários: o dev só tem o regular.
- Calendário flutuante e seletor de hora dos períodos: a tela usa campos nativos `date`/`time`; o desenho do calendário aberto não foi capturado.
- Tipografia exata dos títulos de seção (peso real do texto interno) ficou [A].

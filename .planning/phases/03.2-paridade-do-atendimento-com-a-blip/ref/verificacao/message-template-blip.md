# Modelos de mensagens (attendance/desk/message-template): captura ao vivo da Blip

**Fonte:** bot dev `auvpcapitaldev1`, 2026-10-01, só leitura. Janela de 1920 px. Brutos em `referencias-blip/atendimento/03.2-capturas/2026-10-01-templates-*` (fora do Git). [M] medido, [A] estimado.

## URL e navegação
- `.../attendance/desk/message-template`, menu Comunicação > Modelos de mensagens. A URL não muda ao abrir o modal.
- Os modelos NÃO são criados nesta tela. O requisito da própria Blip (em Configurações gerais) manda "adicionar ao menos 1 modelo de mensagem para WhatsApp na aba de Conteúdos" e "configurar ao menos 1 modelo na aba de Atendimento": aqui só se **ativa** e se escolhe o **fluxo de retorno**.

## Estrutura
- Título da página "Modelos de mensagens" e um único cartão [M] 1401,9 de largura, `#f6f6f6`, raio 16, padding 20, com o título "Modelos de mensagens" dentro.
- Linha de filtros: rótulo "Filtrar por:", dois seletores ("Fluxo de retorno" e "Status") e busca com placeholder "Pesquise pelo nome do modelo de mensagem" (868,7 x 42 [M]).
- Tabela, colunas: **Nome** | **Idioma** (ex.: `pt_BR`) | **Mensagem** (prévia truncada com reticências e o link "abrir") | **Fluxo de retorno** | **Status** (interruptor 42 x 19 [M]).
- **Sem paginação e sem virtualização:** todos os modelos são desenhados de uma vez. Neste bot são cerca de 1.490 linhas, o cartão chega a 77.047 px de altura e a página fica pesada (o salvamento do HTML bruto passou de 7 MB). O Pipe deve paginar ou virtualizar.
- Estados vazio, carregando e erro: não capturados.

## Modal "abrir"
- Título `Modelo "{nome}"`, corpo com o texto completo do modelo (quebras de linha preservadas; variáveis `{{1}}`, `{{2}}` destacadas em azul), botão X; Esc fecha. Só leitura.

## Fluxo de retorno (integração com o Builder)
- A lista de opções do filtro "Fluxo de retorno" (169 opções neste bot) são **os blocos do fluxo do Builder**: "Início", "Exceções" e os identificadores dos blocos (ex.: `in100_inicio`, `t100_transbordo`). Ou seja, o modelo de mensagem aponta para um **bloco do Builder** onde a conversa continua quando o cliente responde.
- Isso é um ponto de integração Desk x Builder que o Pipe precisa respeitar: o seletor de fluxo de retorno deve listar os blocos do fluxo publicado, validar que o bloco existe e avisar quando um bloco usado por um modelo for removido do Builder.

## Não medido e por quê
- Opções do seletor "Status" (a leitura devolveu a mesma lista de blocos; não confirmado) e o significado exato do interruptor de Status (não cliquei: grava).
- Altura de linha e tipografia do cabeçalho da tabela (a tabela tem 1.490 linhas; medi só o cartão e os controles) [A].
- Edição do fluxo de retorno por linha, criação/aprovação de modelos e mensagens de erro.

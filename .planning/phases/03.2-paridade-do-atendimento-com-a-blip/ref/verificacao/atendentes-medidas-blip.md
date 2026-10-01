# Medidas ao vivo das telas de Equipe/Atendentes na Blip (lado Blip)

**Como foi medido [M]:** em 2026-10-01, no bot dev (`auvpcapitaldev1`), só leitura (nada salvo, excluído ou confirmado), com leitura de `getBoundingClientRect` e estilo computado percorrendo os shadow roots dos componentes `bds-*`. Janela de 1707x767 CSS px, `devicePixelRatio` 1,125. Todas as medidas abaixo são em CSS px e [M]. Os arquivos brutos e os screenshots ficam fora do Git em `referencias-blip/atendimento/03.2-capturas/2026-10-01-medidas-team-*.{json,jpg}` e podem ter dados pessoais; aqui não há nomes, e-mails ou telefones.

Cores da Blip que viram token do Pipe (D-05): azul `rgb(30,107,241)` (botão Salvar e interruptor ligado) vira o verde do Pipe; neutros `#282828` (texto), `#f6f6f6` (cartão), `#ededed` (linha alternada). Fonte: Nunito Sans (Q5: Pipe mantém IBM Plex Sans, lacuna L-05 já aprovada).

## Estrutura comum às telas de criar, editar e permissões
| Elemento | Medida [M] |
|---|---|
| Área de conteúdo | x=290,8; largura 1366,9 (1386,6 na tela de editar, antes de a rolagem aparecer) |
| Cabeçalho da página | altura 56,9 + margem inferior 16 (bloco total 72,9); padding-bottom 16 |
| Botão voltar | ícone-botão 40x40, raio 8, padding 8, ícone 24x24, cor `#282828`, margem direita 5 |
| Título da página | 24px, peso 400, cor `#282828`, altura 32,9, começa em x=335,8 (a 5px do botão) |
| Cartão (bds-paper) | fundo `#f6f6f6`, raio 16, padding 40, margem superior 20, sem borda |
| Coluna de rótulos | começa em x=330,8 (cartão + 40 de padding) |
| Coluna de campos | começa em x=974,3, largura 643,5 |

## Adicionar atendentes (`create-edit-attendant-page`)
| Elemento | Medida [M] |
|---|---|
| Cartão | 1366,9x402,8 a partir de y=260,9 |
| Campo E-mail (chips) | 643,5x42,8; borda 0,89px `rgba(0,0,0,.2)`; raio 8; padding 8 4 9 12; texto digitado 14/21 `#282828` |
| Ajuda do campo E-mail | ícone 16x16 + texto 12/18 `#282828`; bloco 638,5x20 logo abaixo do campo (a ~4px) |
| Seletor Filas (chips) | 643,5x39,8; borda e raio iguais ao campo; padding 8 4 8 12; gap 8; seta 20x20 cor `#8c8c8c` |
| Lista de opções do seletor | fundo branco, raio 8, altura máxima visível 200; cada opção 37 de altura, padding 8 8 8 12, texto com linha de 21 |
| Interruptor "padrão" | 32x18 (tamanho short); ligado `rgb(30,107,241)`; raio 34 |
| Botão Cancelar | 90,6x40; transparente; raio 8; padding 0 16; texto 14/14 peso 700 `#282828`; margem direita 5 |
| Botão Salvar | 74,9x40; fundo azul; raio 8; padding 0 16; texto 14/14 peso 700 branco; em x=1542,8, y=583,7 |
| Rótulo de linha | 16/24 peso 700 `#282828`; ajuda de linha 14/21 peso 400 `#282828` (valores lidos na tela de editar, mesmo componente) |

## Editar atendente
| Elemento | Medida [M] |
|---|---|
| Título | "Editar atendente" (mesmo cabeçalho) |
| Avatar | 56x56, raio 40, fundo `rgb(178,223,253)`, em (290,8; 240,9); iniciais em texto 28x21 |
| Subtítulo "Editar atendente {nome}" | 20/20 peso 400 `#282828`, largura total, em y=306,9 |
| Cartão | 1366,9x337,8 a partir de y=348,9 (sem campo de e-mail) |
| Linha Filas | rótulo em (330,8; 388,9) 16/24 peso 700; ajuda 14/21 logo abaixo; seletor 643,5x39,8 em (974,3; 388,9) |
| Linha Tickets simultâneos | rótulo em y=474,8; interruptor 32x21,3 em x=974,3, texto "padrão" em x=1011,3 (14/21); com o interruptor desligado aparece campo numérico: 643,5x(67,2 com ajuda) em y=498,6; texto interno 14/22; ajuda 12/18 em y=542,1 |
| Botões | Cancelar e Salvar na altura y=606,7; Salvar desabilitado (esmaecido) até haver mudança |

## Permissões do atendente (`attendant-permissions-page`)
| Elemento | Medida [M] |
|---|---|
| Título | "Permissões" (mesmo cabeçalho) |
| Avatar | 56x56, raio 40, fundo `rgb(178,223,253)`, em (290,8; 240,9) |
| Subtítulo "Configure as permissões de {nome}" | 1366,9x20 em y=306,9 |
| Cartão | 1366,9x664 a partir de y=348,9; fundo `#f6f6f6`; raio 16; padding 40 40 20 |
| Cabeçalho da seção | "Gerais" 47,3x24 em (330,8; 388,9); coluna "Status" 46,2x24 em x=1571,6 à direita; bloco do cabeçalho 1286,9x44 com padding-bottom 20 |
| Linhas | 1286,9x56 cada, a partir de (330,8; 432,9), passo de 56; padding 16; fundo alternado `#f6f6f6` e `#ededed` (começa em `#f6f6f6`); texto em 24 de altura a x=346,8 |
| Interruptor da linha | 32x24, alinhado à direita (x=1569,8) |
| Ordem das permissões (testids) | edit-contact, send-active-message, create-payment-link, create-folders, permission-attendant-transfer, multiple-transfer, permission-attendant-calls-voiceInbound, permission-attendant-calls-voiceOutbound, can-access-history, create-and-edit-custom-replies |

## Não medido e por quê
- **Lista "Gestão de atendentes":** a lista ficou em estado de carregamento (spinner) em três tentativas, então as linhas, o avatar, os ícones de editar/permissões/excluir, a busca, o filtro e a paginação saíram com tamanho 0. Pelo screenshot (`...-team-lista.jpg`), cada linha é um cartão arredondado com checkbox, avatar de iniciais, quatro colunas (Atendente, E-mail, Filas, Tickets simultâneos) e três ícones à direita; sem medidas. Refazer a medição da lista com a lista carregada.
- **Tipografia interna da lista e do filtro** (`bds-typo`): só se leu o elemento hospedeiro.
- **Linhas separadoras entre as linhas do cartão** de criar/editar (a captura mostra um filete); não foi medido.
- **Estados de validação** do campo E-mail (chip inválido, erro de fila), foco, passar o mouse, e o estado com interruptor desligado na tela de adicionar.
- **Permissões abaixo da sexta linha** (a página rola) e as seções além de "Gerais".
- **Sombra dos cartões** das linhas da lista (`box-shadow`): não lida porque a lista não carregou.
- Janela única de 1707 px; sem teste em outras larguras.

Alterações feitas no bot dev: nenhuma (só abrir, medir e voltar/cancelar).

Base: e77f6246d0cadb7869b11312391f5846685c22d3
Tema: claro (cartão cinza-claro sobre fundo claro nas capturas; o HTML não traz `data-theme`; D-12).

# Verificação: Atendentes (team) Blip x Pipe

**Fontes Blip.** Medidas ao vivo [M] de 2026-10-01 em `ref/verificacao/atendentes-medidas-blip.md` (Adicionar, Editar, Permissões; janela 1707x767, `getBoundingClientRect` e estilo computado); estrutura e textos em `ref/verificacao/atendentes-adicionar.md` e nas capturas `2026-09-30-atendentes-*` (fora do Git, com dados pessoais; nada foi copiado). A **lista** não foi medida (spinner em três tentativas): tudo da lista é NEEDS VALIDATION, medida de pixel nenhuma. Fonte Blip é Nunito Sans; o Pipe mantém IBM Plex Sans (Q5, L-05). Azul da Blip vira o verde do Pipe (D-05).

**Fonte Pipe.** Leitura do código e execução de typecheck, lint e testes; sem render no navegador neste plano. Nenhuma linha está VISUALLY VERIFIED.

## Estado: lista

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título e botão | "Gestão de atendentes" e "Adicionar atendentes" [M estrutura] | igual | NEEDS VALIDATION |
| Busca e filtro | "Buscar por nome ou e-mail"; "Filtrar por: Filas" | igual (filtro por nomes de fila, painel com Aplicar) | NEEDS VALIDATION |
| Linha | cartão com caixa, avatar de iniciais, Atendente, E-mail, Filas, Tickets simultâneos e três ícones (editar, permissões, excluir) | igual | NEEDS VALIDATION |
| Medidas da lista (linha, avatar, ícones, sombra, paginação) | não medidas (spinner) | tokens existentes de lista de regras | NEEDS VALIDATION |
| Seleção em lote | caixa por linha e "Selecionar todos" | igual; com seleção aparecem "Editar" e "Permissões" em lote (`?agents=`) | NEEDS VALIDATION |

## Estado: vazio
Blip: "Nenhum atendente cadastrado" (UI-SPEC) com o apoio "Adicione um atendente para começar a atender." Pipe: as duas frases juntas no estado vazio da lista. NEEDS VALIDATION (sem captura do vazio).

## Estado: carregando
Lista: o Pipe não mostra nada até a leitura chegar (`return null`); a Blip mostra spinner. Lacuna: spinner igual não implementado. Permissões: `TabelaCarregando`. NEEDS VALIDATION.

## Estado: erro
Lista: sem estado de erro próprio (o `useRead` mantém o dado anterior). Permissões: `TabelaErro` com "tentar de novo". Gravação: o motivo vem da API em etiqueta de erro, com a tela mantida. Lacuna: a Blip não foi capturada em erro.

## Estado: gestão do atendente aberta
Na Blip o lápis abre a página `team/edit` (R-03, sem `:id`), o ícone de permissões abre `team/permission`; no Pipe os mesmos destinos, com `?agents=`.

| Elemento | Blip [M] | Pipe depois deste plano | Status |
|---|---|---|---|
| Cabeçalho | voltar 40x40 (raio 8, ícone 24), título 24px peso 400; bloco 56,9 + margem 16 | `.atend-cab` igual | NEEDS VALIDATION |
| Avatar | 56x56, raio 40, iniciais | `--p-atend-equipe-avatar` 56px, raio 40px | NEEDS VALIDATION |
| Subtítulo | "Editar atendente {nome}" 20/20 peso 400 | igual (`--p-t-titulo`) | NEEDS VALIDATION |
| Cartão | raio 16, padding 40, margem superior 20, sem borda, 1366,9x337,8 | tokens `--p-atend-equipe-cartao-*`; borda de 1px do Pipe mantida (lacuna) | NEEDS VALIDATION |
| Linha Filas | rótulo 16/24 peso 700, ajuda 14/21, seletor 643,5x39,8 à direita | `LinhaConfig` com `ChipsInput` (o seletor global, D-C16); coluna `--p-atend-equipe-campo-largura` | NEEDS VALIDATION |
| Linha Tickets simultâneos | interruptor 32x21,3 com "padrão" ao lado; desligado mostra campo numérico | `TicketsSimultaneos` igual | NEEDS VALIDATION |
| Botões | Cancelar e Salvar à direita, Salvar desabilitado até mudar | igual; Salvar só habilita com mudança | NEEDS VALIDATION |
| Edição em lote | só a Blip por atendente | título "Editar N atendentes"; acrescenta as filas a todos | lacuna do Pipe (a Blip não foi capturada em lote) |

| Configuração da Blip | Existe no Pipe? | Depende da 03.1? |
|---|---|---|
| Filas do atendente | sim (`fila_atendente`, gravada por `POST/DELETE agents/queues/:id/agents`) | não |
| Tickets simultâneos (padrão ou número) | sim (`capacidade_override`; "padrão" apaga o override) | gravar não; a distribuição que consome o teto sim (já em DEPENDENCIAS-03.1, Distribuição automática) |
| Presença/status do atendente | só leitura no Monitoramento | sim |

## Estado: adicionar atendente

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título | "Adicionar atendentes" | igual | NEEDS VALIDATION |
| E-mail | chips, placeholder "Insira os e-mails dos atendentes", título "Adicione um ou mais atendentes", ajuda "Para adicionar mais de um atendente, separe os e-mails apertando Enter"; campo 643,5x42,8, borda 0,89 `rgba(0,0,0,.2)`, raio 8 [M] | igual, com o `ChipsInput` livre; medidas do campo vêm do componente (não conferidas) | NEEDS VALIDATION |
| Filas | seleção múltipla com chips, "Selecione as filas de atendimento"; todas as filas em ordem alfabética | o MESMO `ChipsInput` do filtro de filas do Monitoramento (D-C16), sem seletor novo | NEEDS VALIDATION |
| Tickets simultâneos | ajuda cita "Blip Desk"; interruptor "Usar configuração padrão (200 tickets simultâneos)" | ajuda sem o nome Blip; interruptor "padrão" (o 200 é da Blip, a fila define o padrão no Pipe) | lacuna: copy |
| Rodapé | Cancelar 90,6x40 e Salvar 74,9x40, raio 8, texto 14 peso 700 | `Botao` do Pipe | NEEDS VALIDATION |
| Validação do e-mail, Salvar sem fila, mensagem e destino após salvar | NÃO medido | Salvar fica desabilitado sem e-mail ou sem fila; destino: lista | lacuna |

Diferença de função (sem decisão do Claude): o Pipe não cria conta nesta tela. E-mail de pessoa sem conta no tenant é recusado: "Sem cadastro neste Pipe: {e-mails}. Convide a pessoa em Contrato antes de adicionar." Pendente do dono.

## Estado: permissões em lote

| Elemento | Blip [M] | Pipe | Status |
|---|---|---|---|
| Título e subtítulo | "Permissões"; "Configure as permissões de {nome}" | título igual; subtítulo `permissionsDescription` (uma, duas ou várias pessoas) | NEEDS VALIDATION |
| Cartão | 1366,9x664, raio 16, padding 40 40 20 | `.atend-cartao-permissoes` | NEEDS VALIDATION |
| Cabeçalho da seção | "Gerais" e coluna "Status" à direita; 44 de altura | um cabeçalho por grupo do catálogo do Pipe, com "Status" | NEEDS VALIDATION |
| Linhas | 56 de altura, padding 16, fundo alternado, interruptor 32x24 à direita | `--p-atend-equipe-linha-permissao`; interruptor 32x21 (altura 24 da Blip não adotada, vale a de Editar) | NEEDS VALIDATION |
| Conteúdo das linhas | dez permissões da Blip (editar contato, mensagem ativa, link de pagamento, pastas, transferência, transferência múltipla, ligações recebida e feita, histórico, respostas personalizadas) | o catálogo de permissões do Pipe (o que as rotas checam); não é a lista da Blip | lacuna: conteúdo próprio |
| Estado parcial | não existe | terceiro estado do interruptor quando só parte dos selecionados tem a permissão | lacuna do Pipe |
| Seções além de "Gerais" e linhas abaixo da sexta | NÃO medidas | segue os grupos do Pipe | lacuna |
| Botão | Cancelar e Salvar | Cancelar e Salvar (antes "Salvar alterações") | NEEDS VALIDATION |

## Estado: remover atendente (confirmação)
Texto do UI-SPEC: "Remover atendente: a pessoa perde acesso ao atendimento deste fluxo. Tickets em andamento precisam ser transferidos antes." Botões "Remover atendente" e "Cancelar" com foco inicial em Cancelar (`ConfirmModal`). No Pipe a ação tira a pessoa de todas as filas (a conta e o histórico ficam). Capturar a confirmação real da Blip: pendente. NEEDS VALIDATION.

## Navegação
- Lista, "Adicionar atendentes": `team/create`. Lápis: `team/edit?agents=`. Chave: `team/permission?agents=`. Em lote: os botões "Editar" e "Permissões" da barra.
- Voltar (seta) e Cancelar: `team`. Salvar com sucesso: `team`.
- Clique na linha do atendente (fora dos ícones): a Blip não foi capturada; o Pipe não navega. Lacuna.

## Lacunas
- Medidas da lista; tipografia interna (`bds-typo`); filetes entre linhas; foco, hover; validação do e-mail; interruptor desligado em Adicionar; permissões abaixo da sexta linha; sombra dos cartões.
- Fonte Nunito Sans x IBM Plex Sans (L-05, aprovada).
- Spinner de carregamento da lista.

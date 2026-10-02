Base: 28212259cdfeafca8647bc959e141160414e14a8
Tema: claro nas medições da Blip; o Pipe mantém os próprios tokens de superfície e tema escuro (D-12).

# Verificação: Modelos de mensagens (message-template) Blip x Pipe

**Fonte Blip.** Captura ao vivo de 2026-10-01 em `ref/verificacao/message-template-blip.md` (somente leitura). **Fonte Pipe.** Código, testes automáticos (servidor com banco real, regras puras) e tipos; sem render no navegador. Nenhuma linha está VISUALLY VERIFIED: toda linha visual é NEEDS VALIDATION.

Tela: `apps/management-vite/src/pages/registrations/communication-templates.tsx` e `communication-templates-formulario.tsx`. Servidor: `GET /v1/management/communication/templates?pagina&porPagina&q&status`.

## Estado: lista

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Título e painel | "Modelos de mensagens" e um cartão com o título repetido [M] | igual | NEEDS VALIDATION |
| Filtros | "Filtrar por:", "Fluxo de retorno", "Status" e busca "Pesquise pelo nome do modelo de mensagem" 868,7 x 42 [M] | mesmo texto e ordem; "Fluxo de retorno" desabilitado com "Este recurso será liberado em breve para este fluxo."; "Status" e busca filtram no servidor; selects são o `Select` do produto | NEEDS VALIDATION |
| Colunas | Nome, Idioma, Mensagem (prévia truncada e "abrir"), Fluxo de retorno, Status (interruptor) [M] | Nome, Idioma, Mensagem (prévia de 2 linhas e "abrir"), Fluxo de retorno ("—", desabilitado), Status (rótulo do estado na Meta) e lixeira | NEEDS VALIDATION |
| Quantidade | sem paginação, ~1.490 linhas de uma vez [M] | paginado no servidor (`pagina`/`porPagina`/`total`, padrão 25) com o componente `Pagination` | divergência decidida pelo dono (Q2) |
| Status | interruptor local ativo/inativo | não existe campo no modelo; mostra o estado de aprovação na Meta (pendente do dono, ver DEPENDENCIAS-03.1.md) | divergência registrada |
| Criação | não é feita nesta tela | formulário "Novo modelo de mensagem" mantido abaixo da lista (cria na Meta); selects trocados pelo `Select` do produto | divergência registrada |

## Estado: vazio

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Sem modelos | não capturado; ficha: "Ainda não foram cadastrados modelos de mensagem válidos para este chatbot!" | esse texto; com filtro ativo: "Nenhum modelo de mensagem encontrado para esse filtro." | NEEDS VALIDATION |

## Estado: carregando

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Indicador | não capturado | `Carregando` na primeira leitura; troca de página mantém a anterior até chegar a nova | NEEDS VALIDATION |

## Estado: erro

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Falha de leitura | não capturado | `Etiqueta` de erro "Não foi possível carregar os modelos de mensagem." | NEEDS VALIDATION |

## Estado: detalhe aberto

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Modal "abrir" | título `Modelo "{nome}"`, texto completo com quebras, `{{1}}` em azul, X, Esc fecha, só leitura [M] | mesmo título e conteúdo; variáveis destacadas com a cor da marca; texto renderizado como texto React (sem HTML) | NEEDS VALIDATION |
| Rodapé e botões do WhatsApp | não medido | não aparecem na prévia: perda de rodapé e botões é bug da 03.1 | lacuna (03.1) |

## Estado: criar aberto

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Formulário | não existe nesta tela | formulário próprio do Pipe abaixo da lista; mesmos campos de antes | divergência registrada |

## Navegação

- Menu lateral Comunicação > Modelos de mensagens; o modal "abrir" não muda a URL.
- Fluxo de retorno x Builder: o modelo não tem campo para o bloco do Builder, então a escolha não existe (migração necessária, ver DEPENDENCIAS-03.1.md). Nenhum bloco do Builder referencia modelo por id ou nome; sem campo não há o que recusar na exclusão.

## Não medido

Opções e significado do filtro e do interruptor de Status na Blip; altura de linha e tipografia do cabeçalho da tabela; edição do fluxo de retorno por linha; estados vazio, carregando e erro na Blip.

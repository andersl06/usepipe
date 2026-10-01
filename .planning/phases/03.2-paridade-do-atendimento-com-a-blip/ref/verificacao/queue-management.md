Base: eeca2959567b3daf8924c0738e02efb63d3692a6
Tema: claro (cartões cinza-claro sobre fundo claro nas capturas `.jpg`; o HTML não traz `data-theme`; D-12).

# Verificação: Filas (queue-management) Blip x Pipe

**Fontes Blip.** Capturas de 2026-09-30 em `referencias-blip/atendimento/03.2-capturas/` (fora do Git, com dados pessoais; nada foi copiado): `filas-lista`, `filas-criar-nova-fila-modal`, `filas-gestao-da-fila-aberta` (.jpg e .html), mais a ficha `referencias-blip/fichas/FICHA-queue-management.md`. Textos e estrutura vêm do HTML renderizado = [M] para texto/ordem/`data-testid`. As capturas `.jpg` são recortes de 941px de largura e o HTML não traz estilo computado: **nenhuma medida em pixel foi tomada**. Toda proporção citada abaixo é leitura visual da imagem = [A] e não vira token (`--p-atend-fila-*` não criado: sem [M] não há o que medir contra a tolerância de 1px da Q1).

**Fonte Pipe.** Leitura do código das três páginas e de `lista-regras.tsx`; sem render no navegador neste plano. Por isso nenhuma linha está VISUALLY VERIFIED.

## Estado: lista

| Elemento | Blip | Pipe (depois deste plano) | Status |
|---|---|---|---|
| Título | "Filas de atendimento", sem subtítulo [M] | igual | NEEDS VALIDATION (C-15, medida) |
| Botão do topo | "Nova fila" com ícone mais, à direita, azul [M] | igual | NEEDS VALIDATION (C-15, medida) |
| Busca | placeholder "Buscar fila", coluna estreita (~30%) [A] | igual (`.search-top`) | NEEDS VALIDATION (C-15, medida) |
| Cartão da fila | dois campos rotulados: "Fila de atendimento" e "Atendentes atribuídos" [M] | igual | NEEDS VALIDATION (C-15, medida) |
| Ações do cartão, ordem | lápis ("Editar"), lixeira ("Excluir"), interruptor, nesta ordem [M] | igual (antes era interruptor, lápis, lixeira) | NEEDS VALIDATION (C-15, medida) |
| Rodapé | "Resultados por página" (5/10/15/25/50/100/250/500), "1-N de N", quatro setas [M] | `Pagination` skin `grade` (plano 07) | NEEDS VALIDATION (C-15, medida) |

## Estado: vazio

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Texto | sem captura (C-22 pendente) | "Nenhuma fila cadastrada" / "Crie a primeira fila para distribuir os atendimentos." (UI-SPEC) | NEEDS VALIDATION (C-22) |

## Estado: carregando

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Aparência | sem captura (C-23 pendente) | a página não renderiza nada até a leitura chegar (`if (!read.data) return null`) | NEEDS VALIDATION (C-23) |

## Estado: erro

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Erro de leitura | sem captura (C-24 pendente) | tratamento da leitura é o do `useRead` (sem tela própria) | NEEDS VALIDATION (C-24) |
| Erro ao ligar/desligar ou excluir | sem captura | "Não foi possível salvar: {motivo}. Suas alterações continuam na tela; tente novamente." (UI-SPEC) | NEEDS VALIDATION (C-15) |

## Estado: gestão da fila aberta

Estrutura da Blip, de cima para baixo [M] (texto do HTML):

1. Cabeçalho: seta voltar, nome da fila, lápis (renomear).
2. Cartão "Atendentes atribuídos" ("Defina os atendentes que irão atender nesta fila"), botão "Adicionar atendentes"; busca "Buscar por nome ou e-mail"; "Selecionar todos"; linhas com caixa de seleção, avatar com iniciais, "Nome", "E-mail" e lixeira; rodapé de paginação.
3. Cartão "Regras de Atendimento" ("Defina as regras de atendimento para a fila"), botão "Criar regra"; linhas "Nome da regra" e "Regra" com "Editar" e "Excluir"; paginação.
4. Cartão "Regras de Priorização" ("Defina a prioridade para todos os atendimentos da fila ou crie condições para a priorização"), botão "Criar regra"; vazio "Esta fila ainda não tem regras de priorização!" / "Crie uma regra para definir a prioridade de atendimento dos clientes."
5. Cartão "Tags da fila" ("Adicione ou edite as tags disponíveis para os atendentes desta fila."): campo "Insira as tags separando por vírgulas" e "Salvar alterações".
6. Cartão "Encerramento automático de tickets" ("Encerre automaticamente os tickets por inatividade") com interruptor.

| Configuração da Blip | Existe no Pipe? | Depende da 03.1? | Estado no Pipe | Status |
|---|---|---|---|---|
| Voltar + nome + lápis (renomear) | sim | não | `QueueHeader`: renomeia no lugar via `PATCH agents/queues/:id` | NEEDS VALIDATION (C-15, medida) |
| Atendentes atribuídos: listar, buscar por nome ou e-mail, excluir da fila | sim | não | `SectionAgents`; e-mail passou a vir de `GET agents/queues`; remover usa `DELETE agents/queues/:id/agents/:agentId` | NEEDS VALIDATION (C-15, medida) |
| Selecionar todos / caixa por linha | parcial | não | a seleção existe e funciona; **sem ação em lote** porque a captura não mostra qual ação ela habilita | NEEDS VALIDATION (C-15: ação da seleção) |
| Adicionar atendentes | parcial | não | leva à tela Equipe (`team`), onde o vínculo à fila é gravado; a tela "Adicionar atendentes" é o plano 15 | NEEDS VALIDATION (C-16) |
| Regras de Atendimento da fila | parcial | não | lista as regras de entrada cujo destino é a fila; "Criar regra" e "Editar" levam à página de regras; "Excluir" apaga pela API existente. Criar/editar dentro da fila (modal) não foi capturado | NEEDS VALIDATION (C-15) |
| Regras de Priorização da fila | sim | não | já existia; rótulos e vazio igualados à Blip | NEEDS VALIDATION (C-15) |
| Tags da fila | não | sim (tag por fila exige vínculo etiqueta-fila no domínio) | campo desabilitado com "Este recurso será liberado em breve para este fluxo." | NEEDS VALIDATION (C-15) |
| Encerramento automático por inatividade | não | sim (regra por fila no motor) | interruptor desabilitado com o mesmo texto | NEEDS VALIDATION (C-15) |
| Cor, capacidade padrão, ordem, horário e "Ativa" | sim | não | **não existem na Blip**; mantidos em UM disclosure recolhido "Configurações do Pipe", no fim da página (antes era o cartão "Dados da fila") | pendente do dono: manter ou remover |
| Cinco cartões empilhados (ordem Atendentes, Regras de Atendimento, Regras de Priorização, Tags, Encerramento) com raio 16, padding 40, 20 entre cartões, sombra `0 2px 8px -2px rgba(0,0,0,.16)` | sim | não | classe `fila-cartao` com tokens `--p-atend-fila-*`; **medido na Blip [M], declarado no Pipe**: fundo `#f6f6f6` não adotado (superfície branca do Pipe), busca com borda de 1px | NEEDS VALIDATION (sem render no Pipe) |
| URL da edição | sim | não | mesmo caminho da lista, `queue-management?fila={id}`; a antiga `queue-management/:id/edit` redireciona | NEEDS VALIDATION (declarado) |
| Paginação de atendentes e de regras | sim | não | `Pagination` (`grade`), 5 por página | NEEDS VALIDATION (C-15, medida) |

## Estado: criar fila

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Modal "Criar nova fila" | título; "Dê um nome para essa fila de atendimento"; campo "Nome da fila"; ajuda "Use apenas letras, números, hifens (-) e sublinhados (_)"; "Cancelar" e "Salvar" (desabilitado sem nome); ilustração à esquerda [M]/[A] | textos iguais; Salvar desabilitado sem nome; **sem a ilustração** (arte própria necessária; não copiar da Blip) | NEEDS VALIDATION (C-15, medida) |

## Estado: excluir fila (confirmação)

| Elemento | Blip | Pipe | Status |
|---|---|---|---|
| Modal | sem captura | texto do UI-SPEC: "Excluir fila: os atendentes da fila ficam sem esta fila e tickets novos não serão direcionados a ela. Esta ação não pode ser desfeita."; botões "Excluir fila" e "Cancelar"; foco inicial em "Cancelar" (`ConfirmModal` passou a focar o cancelar) | NEEDS VALIDATION (C-15) |

## Navegação

- Clique no lápis de uma fila: tela da fila no MESMO caminho da lista (`queue-management?fila={id}`), como a Blip, que não muda a URL ao editar (R-02 decidido pelo dono em 2026-10-01; o uso da query `?fila=` é escolha da execução, pendente de confirmação do dono). A rota antiga `queue-management/:id/edit` redireciona para ela.
- Clique em "Nova fila": abre o modal de criação; Salvar fecha o modal e a fila entra na lista.
- Seta voltar da tela da fila: lista de filas.
- Lixeira do cartão: abre a confirmação de excluir.
- "Adicionar atendentes": tela Equipe. "Criar regra" e "Editar" de regra de atendimento: página de regras.

## Lacunas

- Sem medida em pixel em todo o arquivo (capturas sem estilo computado); medir por CDP quando o dono liberar.
- Capturas faltando: vazio, carregando e erro da lista (C-22 a C-24); confirmação de excluir fila; modal de criar/editar regra dentro da fila; ação da seleção em lote dos atendentes; "Salvar alterações" das tags e campo de inatividade do encerramento automático (parte inferior da gestão).
- Ilustração do modal "Criar nova fila": arte própria pendente.

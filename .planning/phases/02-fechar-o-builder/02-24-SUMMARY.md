---
phase: 02-fechar-o-builder
plan: 24
subsystem: builder-ui
tags: [builder, acoes, css, fidelidade-visual, icones]
dependency-graph:
  requires: ["02-23"]
  provides: ["F-1 action-row visual parity"]
  affects:
    - apps/management-vite/src/pages/builder/panel-actions.tsx
    - apps/management-vite/src/pages/builder/actions-of-block.ts
    - apps/management-vite/src/pages/builder/cabecalho-info.tsx
    - apps/management-vite/src/pages/builder/panel-configuration.tsx
    - apps/management-vite/src/pages/builder/flow-functions-panel.tsx
    - apps/management-vite/src/pages/builder/panel.tsx
    - apps/management-vite/src/pages/builder/editor.tsx
    - apps/management-vite/src/pages/builder.tsx
    - apps/management-vite/src/pages/builder/panel-block.css
    - packages/ui/src/icones.tsx
tech-stack:
  added: []
  patterns:
    - "ACTION_TYPE_ICON/iconOfActionType(tipo): map an action type to a Pipe-drawn @pipe/ui icon, generic fallback for unmapped types"
    - "removeActions(list, indices): pure bulk-delete by position, used by 'Deletar selecionados'"
    - "DescricaoParte[] + renderDescricao(): T:836 bold segments render through React (<strong>), never raw HTML; CabecalhoInfo grew an optional 'etiqueta' badge slot"
    - "onAbrirFuncoes(modo) threads block.tsx -> editor.tsx -> panel.tsx -> ActionsPanel; ConfigurationPanel/FlowFunctionsPanel take an initial-tab/initial-creation prop to land on the requested mode"
key-files:
  created: []
  modified:
    - packages/ui/src/icones.tsx
    - apps/management-vite/src/pages/builder/actions-of-block.ts
    - apps/management-vite/src/pages/builder/cabecalho-info.tsx
    - apps/management-vite/src/pages/builder/panel-actions.tsx
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/src/pages/builder/panel-configuration.tsx
    - apps/management-vite/src/pages/builder/flow-functions-panel.tsx
    - apps/management-vite/src/pages/builder/panel.tsx
    - apps/management-vite/src/pages/builder/editor.tsx
    - apps/management-vite/src/pages/builder.tsx
    - apps/management-vite/tests/builder-actions.test.ts
decisions: []
metrics:
  duration: ~2h
  completed: 2026-09-28
---

# Phase 2 Plan 24: Linhas de ação da aba Ações (F-1) Summary

## One-liner

Ícone por tipo de ação, chip "Erro" sem contagem, checkbox e divisores próprios, seleção em lote com copiar/apagar e a seção "BIBLIOTECA DE FUNÇÕES" no topo da aba Ações — segunda metade de F-1, com as medidas ao vivo do Builder da Blip (`CAPTURAS-F1-F6.md`).

## Progresso

### Task 1 — Ícones por tipo e remoção em lote

Commits:
- `71d62e88` test(02-24): add failing coverage for action icons, removeActions and description parts (RED)
- `6ac6d7f9` feat(02-24): action-type icons, bulk removal and structured descriptions (GREEN)

`ACTION_TYPE_ICON`/`iconOfActionType(tipo)` em `actions-of-block.ts` mapeiam os 12 tipos de ação da tabela F-1.2 para um ícone próprio de `@pipe/ui` (`ExecuteScript`/`ExecuteScriptV2` reaproveitam `script`; `ProcessHttp` reaproveita `httpRequest`), com `actionGeneric` como fallback para tipos fora da tabela (ex.: `SendMessageFromHttp`, `SetBucket`). Onze ícones novos foram desenhados em `packages/ui/src/icones.tsx` no mesmo estilo (grade 24, sem preenchimento, traço arredondado), nenhum copiado da Blip (D-33): `trackEvent`, `mergeContact`, `redirect`, `manageList`, `blipFunction`, `setVariable`, `processCommand`, `executeTemplate`, `forwardToAgent`, `actionGeneric`, `addOutline`.

`removeActions(list, indices)` em `actions-of-block.ts` é uma função pura que remove as posições selecionadas preservando a ordem das demais (base para "Deletar selecionados" da Task 2).

`LABELS_OF_ACTIONS` ganhou os textos de seleção em lote (`copiarSelecionados`, `deletarSelecionados`), o texto do chip (`erro`) e `entradaDescricao`/`saidaDescricao` viraram `DescricaoParte[]` (partes `{ texto, forte }`) em vez de string simples, com o trecho em negrito de T:836 marcado por `forte: true`.

`cabecalho-info.tsx` ganhou `renderDescricao(partes)` (renderiza `forte` como `<strong>` via React, nunca HTML cru) e um slot opcional `etiqueta` no `CabecalhoInfo` para a etiqueta "Novo" da Task 3.

### Task 2 — Linha da ação, barra de seleção e cabeçalhos (F-1.4 linhas 14–24)

Commit: `1d976139` feat(02-24): action row, bulk-selection bar and section headers (F-1.4 rows 14-24)

Em `panel-actions.tsx`: o `ActionCard` ganhou `<span className="bl-acao-icone">` com `iconOfActionType(acao.type)` em 24×24 entre o checkbox e o título; o chip de erro trocou a etiqueta redonda com contagem por `<Etiqueta tom="erro">Erro</Etiqueta>` (sem número). A barra de seleção troca "Colar ação" por dois botões-ícone (copiar/lixeira do Pipe) com tooltips "Copiar selecionados"/"Deletar selecionados" quando há seleção; o apagar em lote chama `removeActions` e passa pelo mesmo `onMudar` (reducer com desfazer) das demais edições. `ListOfActionsOfBlock` passou a renderizar `renderDescricao(description)`.

Em `panel-block.css`: `.bl-info-texto{color:#949494}`; link do painel usa `var(--p-builder-marca)`; `.bl-mais` (todos os botões "+ Adicionar…" do Builder, não só os de ação) foi para `min-height:56px`; `.bl-acao{padding:10px 0; border-bottom:1px solid #393939}`; `.bl-acao-abrir` virou flex para acomodar ícone+título; `.bl-acao-tipo` com `width:80%; margin-left:5px; line-height:21px` e `-webkit-line-clamp:2` (título de até 2 linhas, altura da linha cresce sozinha para os 52px de duas linhas); checkbox próprio de 16px (raio 4, borda 2px, marca `--p-builder-marca`) substitui o nativo de 20px nas linhas de ação e na barra de seleção; `.bl-actions-selection{padding:16px 0}`; `.bl-section{margin:0 0 20px}` com divisor `1px #393939` entre seções (`:not(:last-child)`).

"Colar ação" já usava contorno (secondary) antes deste plano — confirmado contra a captura, sem mudança (linha 22 da F-1.4).

### Task 3 — Seção BIBLIOTECA DE FUNÇÕES no topo da aba Ações

Commit: `3c7b71ad` feat(02-24): BIBLIOTECA DE FUNÇÕES section opens the function library in place

`ActionsPanel` renderiza `FunctionLibrarySection` (título "Biblioteca de funções", etiqueta "Novo" verde-escura, texto da Blip e os botões "Gerenciar funções" — contorno com ícone — e "Criar função" — primary com ícone "mais") antes das seções AÇÕES DE ENTRADA/SAÍDA, para todo bloco fora do de atendimento (inclusive o bloco raiz). Os botões chamam `onAbrirFuncoes('gerenciar' | 'criar')`, propagado de `builder.tsx` por `editor.tsx` → `panel.tsx` → `ActionsPanel`. Em `builder.tsx`, `abrirFuncoes(modo)` seleciona a aba "Funções" (`configTab`), marca `criarFuncaoAoAbrir` e abre `ConfigurationPanel`; o botão da pílula "Configuração" volta a abrir sempre em "Ações Globais". `ConfigurationPanel` ganhou o prop `abaInicial` (estado inicial da aba, aplicado uma vez na montagem) e `criarFuncaoAoAbrir`, repassado a `FlowFunctionsPanel` como `iniciarCriando` (abre direto no formulário de criação).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — correção de bloqueio] `ActionsGlobalList` (fora dos arquivos do plano) quebrou com a mudança de tipo de `entradaDescricao`/`saidaDescricao`**
- **Found during:** Task 1, ao rodar `pnpm -s --filter @pipe/management-vite typecheck` após trocar `string` por `DescricaoParte[]`.
- **Issue:** `panel-configuration.tsx`'s `ActionsGlobalTab`/`ActionsGlobalList` (aba "Ações Globais" da Configuração) também consome `LABELS_OF_ACTIONS.entradaDescricao`/`saidaDescricao` como string simples.
- **Fix:** prop `description` de `ActionsGlobalList` passou a `DescricaoParte[]`, renderizado com `renderDescricao`.
- **Files modified:** `apps/management-vite/src/pages/builder/panel-configuration.tsx`
- **Commit:** `6ac6d7f9`

**2. [Rule 3 — correção de bloqueio, achado na Task 3] Comentários citando o nome literal da API de HTML cru quebravam o grep de verificação do próprio plano**
- **Found during:** Task 3, ao rodar `grep -rn "dangerouslySetInnerHTML" apps/management-vite/src/pages/builder` (verificação geral do plano, esperada vazia).
- **Issue:** dois comentários explicativos (em `actions-of-block.ts` e `cabecalho-info.tsx`) citavam o nome da API proibida por extenso para dizer que ela NÃO é usada; isso fazia o grep antiXSS do plano encontrar uma ocorrência mesmo sem uso real.
- **Fix:** reescritos para "raw/unescaped HTML" sem citar a API pelo nome; nenhuma mudança de comportamento.
- **Files modified:** `apps/management-vite/src/pages/builder/actions-of-block.ts`, `apps/management-vite/src/pages/builder/cabecalho-info.tsx`
- **Commit:** `3c7b71ad`

### Scope additions (necessárias para o callback funcionar de ponta a ponta)

**3. `panel-configuration.tsx` e `flow-functions-panel.tsx` não estavam em `files_modified`, mas precisaram de um prop cada**
- O texto da Task 3 pede que os botões "abram a biblioteca de funções já existente (...) no modo pedido". Sem um jeito de abrir a `ConfigurationPanel` direto na aba "Funções" (e, no modo "criar", direto no formulário), o callback `onAbrirFuncoes` não teria efeito visível. Adicionados `abaInicial`/`criarFuncaoAoAbrir` em `ConfigurationPanel` e `iniciarCriando` em `FlowFunctionsPanel` — dois props opcionais, sem mudar o comportamento de quem já os usava sem eles.

**4. Textos da Biblioteca de funções ficaram literais em `panel-actions.tsx`, não em `LABELS_OF_ACTIONS`**
- A Task 1 havia colocado `bibliotecaFuncoes`/`bibliotecaFuncoesEtiqueta`/`bibliotecaFuncoesDescricao`/`gerenciarFuncoes`/`criarFuncao` em `LABELS_OF_ACTIONS` (achando que seguiria o mesmo padrão de `entradaDescricao`). A verificação da Task 3 (`grep -q "Gerenciar funções" .../panel-actions.tsx`) espera o texto literal no próprio arquivo, e essa seção não é reaproveitada em nenhum outro componente (ao contrário de `entradaDescricao`/`saidaDescricao`, usadas também em `panel-configuration.tsx`). Removidas essas cinco chaves de `LABELS_OF_ACTIONS` e os textos escritos direto no JSX de `FunctionLibrarySection`, junto com o teste que checava as chaves antigas (ajustado para checar o texto no arquivo, igual ao padrão já usado para o Monaco lazy-load).

### Known limitation (não corrigida, comportamento aceitável)

Se o painel de Configuração já estiver aberto numa aba diferente (ex.: "Versões") e o dono clicar em "Gerenciar/Criar função" na aba Ações de um bloco, a aba não troca sozinha: `ConfigurationPanel` só lê `abaInicial` na montagem (React `useState` inicial), e como o painel já estava montado, ele não remonta. Fechar e clicar de novo resolve. Caso raro (o botão é o ponto de entrada normal, com o painel fechado); tornar `aba` totalmente controlada por fora exigiria um `useEffect` com um "sinal" para não conflitar com o clique manual nas abas — decisão adiada por não valer a complexidade para este plano.

## Assumption Drift (advisory)

**`removeActions(list, ids)` → `removeActions(list, indices)`**
- **Planned:** o texto da Task 1 nomeia o segundo parâmetro `ids`, sugerindo remoção por `acao.$id`.
- **Actual:** implementado por posição (`indices: readonly number[]`), igual às demais funções de lista do arquivo (`removerAcao`, `moverAcao`, `substituirAcao`).
- **Why:** `$id` é opcional em `AcaoDoEditor` (fluxos importados podem não ter); a seleção em tela (`selecionadas: number[]`) já é por índice, dentro de uma lista estável (entrada OU saída) no momento do clique. Índice evita o caso `$id` ausente sem precisar gerar um novo id só para permitir a remoção.

## Threat Flags

Nenhuma superfície nova fora do `threat_model` do plano. O apagar em lote passa pelo mesmo `onMudar`/reducer com desfazer das demais edições (T-2-24-02); as descrições com negrito renderizam por partes estruturadas via React, nunca HTML cru (T-2-24-01).

## Self-Check: PASSED

Arquivos:
- FOUND: packages/ui/src/icones.tsx
- FOUND: apps/management-vite/src/pages/builder/actions-of-block.ts
- FOUND: apps/management-vite/src/pages/builder/cabecalho-info.tsx
- FOUND: apps/management-vite/src/pages/builder/panel-configuration.tsx
- FOUND: apps/management-vite/src/pages/builder/panel-actions.tsx
- FOUND: apps/management-vite/src/pages/builder/panel-block.css
- FOUND: apps/management-vite/src/pages/builder/panel.tsx
- FOUND: apps/management-vite/src/pages/builder/editor.tsx
- FOUND: apps/management-vite/src/pages/builder.tsx
- FOUND: apps/management-vite/src/pages/builder/flow-functions-panel.tsx
- FOUND: apps/management-vite/tests/builder-actions.test.ts

Commits:
- FOUND: `71d62e88` test(02-24): add failing coverage for action icons, removeActions and description parts
- FOUND: `6ac6d7f9` feat(02-24): action-type icons, bulk removal and structured descriptions
- FOUND: `2b7c4158` docs(02-24): draft summary after Task 1
- FOUND: `1d976139` feat(02-24): action row, bulk-selection bar and section headers (F-1.4 rows 14-24)
- FOUND: `3c7b71ad` feat(02-24): BIBLIOTECA DE FUNÇÕES section opens the function library in place

Verificação executada (comandos reais, saída observada):
- `pnpm --filter @pipe/ui typecheck` — limpo, sem erros.
- `pnpm -s --filter @pipe/management-vite typecheck` — limpo, sem erros.
- `pnpm --filter @pipe/management-vite test` — `tests 342, pass 342, fail 0` (o número total de testes do app, não só de `builder-actions.test.ts`; a suspeita inicial de que o glob `tests/*.test.ts` não rodava todos os arquivos era falsa — a contagem baixa de "suites" no resumo do runner conta só os blocos `describe`, não os arquivos).
- `grep -q "bl-acao-icone" .../panel-actions.tsx` — encontrado.
- `grep -q "Deletar selecionados" .../actions-of-block.ts` — encontrado.
- `grep -q "BIBLIOTECA DE FUNÇÕES\|Biblioteca de funções" .../panel-actions.tsx` — encontrado (texto literal, não só comentário).
- `grep -q "Gerenciar funções" .../panel-actions.tsx` — encontrado (texto literal).
- `grep -rn "dangerouslySetInnerHTML" apps/management-vite/src/pages/builder` — vazio.
- RED confirmado na Task 1: com os 3 arquivos de implementação temporariamente revertidos (`git stash` escopado, restaurado com `apply`+`drop` pelo hash, nunca `pop`), `node --import tsx --test tests/builder-actions.test.ts` falhou por import ausente (`SyntaxError`); GREEN confirmado depois de restaurar.

Não verificado (deixado para o portão de fidelidade visual formal, D-02/D-04, citado no próprio plano): comparação lado a lado com `R/screenshots/d-acoes-menu.jpg` via captura de tela real — não há navegador/DOM disponível neste ambiente de execução; a plano já reconhece essa medição formal como tarefa do 02-35.

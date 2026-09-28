---
phase: 02-fechar-o-builder
plan: 28
subsystem: ui
tags: [react, builder, error-handling, css, vite]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder
    provides: "02-27: o toast compartilhado do Builder (toast.tsx/toast-queue.ts, `toast()` em builder.tsx)"
provides:
  - "error-marks.ts: blockMarks/invalidBlocks — derivação pura de $invalid por bloco, sem filtro de rascunho"
  - "nó do canvas vermelho (#7b3d3d) com anel rgb(182,12,12) em vez de contador/title nativo"
  - "card de saída, card de conteúdo e campo obrigatório marcados por cor (borda + ícone/rótulo), sem texto no card"
  - "remoção de todas as listas `ul.bl-errors`/`bl-panel-errors` do painel"
  - "gate de Publicar usando invalidBlocks + apiErrors + engineErrors"
affects: [02-fechar-o-builder]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "blockMarks(block, mapa, engineMessages) como fonte única de verdade para pintura de erro (nó, cards, campos), separada de blockErrors/errorsLocal (que seguem alimentando a mensagem para a api/motor)"
    - "mensagens de erro só em `title` (nunca texto renderizado), seguindo D-56"

key-files:
  created:
    - apps/management-vite/src/pages/builder/error-marks.ts
    - apps/management-vite/tests/builder-errors.test.ts
  modified:
    - apps/management-vite/src/pages/builder/no.tsx
    - apps/management-vite/src/pages/builder/canvas.tsx
    - apps/management-vite/src/pages/builder/editor.tsx
    - apps/management-vite/src/pages/builder/panel.tsx
    - apps/management-vite/src/pages/builder/panel-outputs.tsx
    - apps/management-vite/src/pages/builder/panel-content.tsx
    - apps/management-vite/src/pages/builder/panel-actions.tsx
    - apps/management-vite/src/pages/builder/condition.tsx
    - apps/management-vite/src/pages/builder/conteudo.ts
    - apps/management-vite/src/pages/builder/editor.css
    - apps/management-vite/src/pages/builder.tsx

key-decisions:
  - "blockMarks inclui TODOS os erros de saída/ação (sem o filtro ERRORS_OF_DRAFT_OF_OUTPUT/ProcessHttp da validation.ts), conforme a paridade D-56 — uma saída sem 'Ir para' agora deixa o nó vermelho, igual à Blip"
  - "Bolinha de erro nas abas do painel NÃO implementada (captura ao vivo não confirmou; só volta com nova evidência)"

requirements-completed: [BUILDER-01]

duration: 35min
completed: 2026-09-28
---

# Phase 02 Plan 28: Marcas de erro como na Blip Summary

**Nó vermelho `#7b3d3d` com anel `rgb(182,12,12)`, cards e campos com borda/ícone/rótulo vermelho (sem texto) e remoção total das listas `ul.bl-errors`, com `error-marks.ts` como derivação testada do `$invalid` por bloco.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-28T19:07:02-03:00 (base 20d9e407)
- **Completed:** 2026-09-28T19:33:38-03:00 (commit fbb037c5)
- **Tasks:** 2 de 3 (Task 3 é checkpoint do dono, ver abaixo)
- **Files modified:** 13 (2 criados, 11 modificados)

## Accomplishments
- `error-marks.ts` (`blockMarks`/`invalidBlocks`) deriva o `$invalid` completo por bloco — saída sem destino, card de conteúdo vazio, ação sem campo obrigatório, mensagem vinda do motor — sem o filtro de rascunho que a `validation.ts` mantém só para a mensagem da faixa/api.
- `no.tsx`: nó inválido pinta `#7b3d3d` com ponto de saída `#b60c0c` e anel `0 0 0 4px rgb(182,12,12)` em hover/selecionado/editando, sem virar verde e sem contador/`title` nativo.
- `panel-outputs.tsx`: card de saída inválido (inclusive a saída padrão) ganha borda `1px rgb(182,12,12)`, raio 10, fundo `#1f1f1f` e o ícone de informação sólido do Pipe a `left:-28px; top:5px`, com as mensagens só no `title` do ícone.
- `panel-content.tsx`: card de conteúdo inválido ganha `border:1px solid #b60c0c`, sem texto.
- `panel-actions.tsx` e `condition.tsx`: campo obrigatório vazio ganha a classe `bl-campo--danger` (borda `#b60c0c`, raio 8, rótulo `#b60c0c`), mensagem só no `title`.
- Todas as listas de mensagens (`ul.bl-panel-errors` no topo do painel, `ul.bl-errors` no card de saída e no detalhe da ação, `p.bl-field-error` na condição) foram removidas, junto com o CSS claro `#fbe9e6`/`#c4442e` que as pintava.
- `builder.tsx`: o toast de aviso ao publicar (já existente desde 02-27) passa a disparar quando `invalidBlocks(...)` não está vazio, não mais quando a lista filtrada de `errorsLocal` tinha itens — agora cobre também os casos que antes só apareciam no card (saída em rascunho, `ProcessHttp` sem URL).

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Derivação das marcas e nó vermelho** - `7790d867` (feat)
2. **Task 2: Borda nos cards, campo danger e remoção das listas** - `fbb037c5` (feat)
3. **Task 3: Dono compara as marcas de erro lado a lado** - checkpoint, não executado por este agente (ver abaixo)

## Files Created/Modified
- `apps/management-vite/src/pages/builder/error-marks.ts` - `blockMarks`/`invalidBlocks`, derivação pura do `$invalid` por bloco
- `apps/management-vite/tests/builder-errors.test.ts` - 6 testes cobrindo saída/conteúdo/ação/motor/válido/`invalidBlocks`
- `apps/management-vite/src/pages/builder/no.tsx` - prop `invalido: boolean` no lugar de `errors: string[]`; sem `Etiqueta` de contagem nem `title`
- `apps/management-vite/src/pages/builder/canvas.tsx` - prop `invalidBlocks: Set<string>` no lugar de `errorsByBlock`
- `apps/management-vite/src/pages/builder/editor.tsx` - computa `invalidBlocks(mapa, [...apiErrors, ...engineErrors])`, não monta mais `errorsByBlock`/passa `errors` ao `BlockPanel`
- `apps/management-vite/src/pages/builder/panel.tsx` - removida a `ul.bl-panel-errors` e a prop `errors`
- `apps/management-vite/src/pages/builder/panel-outputs.tsx` - `OutputErrorIcon`, borda/fundo do card inválido (inclusive saída padrão), remoção da `ul.bl-errors`
- `apps/management-vite/src/pages/builder/panel-content.tsx` - `.bl-card--erro` por card, computado com `contentErrorsOfCard`
- `apps/management-vite/src/pages/builder/panel-actions.tsx` - `bl-campo--danger` no campo obrigatório vazio do detalhe; remoção da `ul.bl-errors`
- `apps/management-vite/src/pages/builder/condition.tsx` - `bl-campo--danger` na caixa de valores e no campo de variável; removido `p.bl-field-error`
- `apps/management-vite/src/pages/builder/conteudo.ts` - extraído `contentErrorsOfCard(card)` de `contentErrors(block)`, reaproveitado por `error-marks.ts` e `panel-content.tsx`
- `apps/management-vite/src/pages/builder/editor.css` - `.bl-node--error` (fundo/ponto/anel), `.bl-output--error`/`.bl-output-erro`, `.bl-card--erro`, `.bl-campo--danger`; removidas `.bl-node-errors`, `.bl-panel-errors`/`.bl-errors` (`#fbe9e6`), `.bl-field-error`
- `apps/management-vite/src/pages/builder.tsx` - gate de Publicar em `invalidBlocks(...).size > 0 || apiErrors.length > 0 || engineErrors.length > 0`

## Decisions Made
- `blockMarks` não usa o filtro `ERRORS_OF_DRAFT_OF_OUTPUT`/exceção do `ProcessHttp` que `validation.ts` mantém — por decisão do dono (D-56), o `$invalid` da tela conta tudo, igual à Blip, mesmo que a mensagem da faixa/api continue mais enxuta.
- Bolinha de erro nas abas do painel **não** entrou nesta implementação: o relatório previa (F-6.1 C), mas a captura ao vivo de 2026-09-28 não a confirmou (nenhuma marca apareceu na aba mesmo com card inválido). Fica pendente de nova evidência, conforme o próprio plano orienta.
- Chip "Erro" na ação (etiqueta `tom="erro"` em `panel-actions.tsx:452`) já existia da 02-24; nenhuma mudança foi necessária ali.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `editor.tsx` e `canvas.tsx` também precisaram mudar, fora do `files_modified` do plano**
- **Found during:** Task 1
- **Issue:** `no.tsx` passou a receber `invalido: boolean` no lugar de `errors: string[]`, e `panel.tsx` deixou de aceitar a prop `errors`. Quem monta essas props é `canvas.tsx` (para `No`) e `editor.tsx` (para `Canvas` e `BlockPanel`), nenhum dos dois listado no `files_modified` do plano — sem tocá-los o build quebraria (prop inexistente/tipo incompatível).
- **Fix:** `canvas.tsx` trocou a prop `errorsByBlock: Record<string,string[]>` por `invalidBlocks: Set<string>`; `editor.tsx` passou a calcular `invalidBlocks(mapa, [...apiErrors, ...engineErrors])` uma vez e usá-lo tanto no `Canvas` quanto (implicitamente, ao não precisar mais) no `BlockPanel`.
- **Files modified:** `apps/management-vite/src/pages/builder/canvas.tsx`, `apps/management-vite/src/pages/builder/editor.tsx`
- **Verification:** `tsc --noEmit` limpo; suíte de testes (388) verde.
- **Committed in:** `7790d867` (Task 1)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessário para o build compilar depois da mudança de assinatura de `no.tsx`/`panel.tsx`; sem escopo além do que o próprio Task 1 já pedia.

## Issues Encountered
- O worktree tinha `HEAD` num histórico antigo e não relacionado (`apps/gestao-vite`, antes do rename da Phase 1). Resolvido com `git reset --hard 20d9e407` (passo explicitamente autorizado pelo `<worktree_branch_check>` do prompt) antes de qualquer edição; árvore de trabalho estava limpa (`git status` sem alterações) no momento do reset.
- `node_modules` ausente no worktree; resolvido com `pnpm install --prefer-offline --frozen-lockfile` e build de `@pipe/core`/`@pipe/contracts`, conforme as notas de ambiente do prompt.

## User Setup Required
None - nenhuma configuração de serviço externo.

## Next Phase Readiness

**Task 3 (checkpoint:human-verify) não foi executada — fica registrada aqui para o dono, sem bloquear a entrega das Tasks 1-2.**

### O que foi construído
Nó vermelho com anel na seleção, borda + ícone no card de saída (inclusive saída padrão), borda no card de conteúdo, campo `danger`, chip "Erro" (já existia da 02-24) — sem listas de texto e sem marca nas abas do painel.

### Como verificar (passo a passo no navegador)
1. Abrir o Builder local (`pnpm --filter @pipe/management-vite dev`) com um fluxo que tenha um bloco descartável para testar.
2. **Saída sem "Ir para":** criar/editar uma saída e deixar o campo "Ir para" vazio → fechar o painel do bloco.
   - **Esperado:** o nó fica com fundo `#7b3d3d`, o ponto de saída fica `#b60c0c`; ao selecionar o nó (clique único) ou ao editá-lo (duplo clique), aparece um anel `0 0 0 4px rgb(182,12,12)` — o nó **não** fica verde nesse estado.
   - Reabrir o painel: o card da saída sem destino tem borda `rgb(182,12,12)`, raio 10, fundo `#1f1f1f`, e um ícone de informação (16px, cor `rgb(240,72,71)`) à esquerda do card, fora dele; passar o mouse sobre o ícone mostra a mensagem no tooltip nativo (`title`), sem texto solto no card.
   - Abas do painel (Conteúdo/Condições de saída/Ações): nenhuma delas ganha marcador/bolinha de erro (comportamento intencional, D-56 F-6.1 C não confirmado).
3. **Requisição HTTP sem URL:** na aba Ações, adicionar "Requisição HTTP" e deixar "URL" vazio → voltar para a lista de ações.
   - **Esperado:** chip "Erro" ao lado do menu ⋮ da ação (já existente da 02-24); o nó do bloco fica vermelho também (novo nesta plan, pois `blockMarks` conta o erro de `ProcessHttp` sem filtro).
4. **Texto vazio:** na aba Conteúdo, criar um card de Texto e deixar vazio.
   - **Esperado:** o card ganha borda `1px solid #b60c0c`, sem nenhum texto de erro dentro dele.
5. **Campo obrigatório vazio:** abrir o detalhe de uma ação com campo obrigatório vazio (ex.: "Definir variável" sem "Nome da variável") ou uma condição com fonte "Variável" sem "Nome da variável" preenchido.
   - **Esperado:** o campo (e seu rótulo) ficam vermelhos (`#b60c0c`), raio 8; a mensagem de erro aparece só ao passar o mouse (`title`), nunca como texto abaixo do campo.
6. **Medir e comparar:** usar `ref/medir-tela.js` nos elementos acima e comparar os valores com `ref/CAPTURAS-F1-F6.md` (nó: `#7b3d3d`/`#b60c0c`/anel `rgb(182,12,12)`; card de saída: `padding:5px; border:1px solid rgb(182,12,12); border-radius:10px; background:#1f1f1f`; ícone `rgb(240,72,71)` em `left:-28px; top:5px`).

### Resposta do dono
_Pendente — aguardando "aprovado" ou lista de diferenças, conforme o `<resume-signal>` do Task 3 do plano._

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-28*

## Self-Check: PASSED
- FOUND: apps/management-vite/src/pages/builder/error-marks.ts
- FOUND: apps/management-vite/tests/builder-errors.test.ts
- FOUND: .planning/phases/02-fechar-o-builder/02-28-SUMMARY.md
- FOUND commit: 7790d867
- FOUND commit: fbb037c5

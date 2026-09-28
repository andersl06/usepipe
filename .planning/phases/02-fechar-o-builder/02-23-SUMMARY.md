---
phase: 02-fechar-o-builder
plan: 23
subsystem: builder-ui
tags: [builder, condicoes-de-saida, css, fidelidade-visual]
dependency-graph:
  requires: ["02-22"]
  provides: ["F-1 exit-condition cards visual parity (lines 1-10, 12 of F-1.4)"]
  affects:
    - apps/management-vite/src/components/selection.tsx
    - apps/management-vite/src/pages/builder/condition.tsx
    - apps/management-vite/src/pages/builder/conditions.ts
    - apps/management-vite/src/pages/builder/panel-outputs.tsx
    - apps/management-vite/src/pages/builder/destination-picker.tsx
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/src/pages/builder/editor.css
    - apps/management-vite/src/pages/builder/panel-actions.tsx (indirectly, via shared ConditionsEditor)
tech-stack:
  added: []
  patterns:
    - "removeCondition(block, outputIndex, conditionIndex): removing an output's last condition removes the output, matching Blip's on-remove-condition"
    - "flowHasSurvey(mapa): whether any block in the flow is survey:-prefixed, gating the destination-filter switch"
    - "Selection rotulo prop draws an internal label (`.bl-campo--interno > .sub` pattern) inside `.selection-control`"
    - "ConditionsEditor's onRemoverCondicao is optional: output context passes it (output-aware removal), action context falls back to plain array filtering"
key-files:
  created: []
  modified:
    - apps/management-vite/src/pages/builder/conditions.ts
    - apps/management-vite/tests/builder-editor.test.ts
    - apps/management-vite/src/components/selection.tsx
    - apps/management-vite/src/pages/builder/condition.tsx
    - apps/management-vite/src/pages/builder/panel-outputs.tsx
    - apps/management-vite/src/pages/builder/destination-picker.tsx
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/src/pages/builder/editor.css
decisions: []
metrics:
  duration: ~20min
  completed: 2026-09-28
---

# Phase 2 Plan 23: Cards de condição de saída (F-1) Summary

## One-liner

Cards da aba Condições de saída reconstruídos com o grid Se/Condição de rótulo interno, conector "E" em negrito, chips arredondados, "+" circular e divisor "OU", alinhados às medidas ao vivo do Builder da Blip (`ref/CAPTURAS-F1-F6.md`).

## O que foi feito

### Task 1 — Lógica: remover a última condição remove a saída; operador preservado

`removeCondition(block, outputIndex, conditionIndex)` em `conditions.ts` remove uma condição de uma saída; se a saída ficar sem condições, a própria saída é removida de `$conditionOutputs` (paridade com o `on-remove-condition` da Blip). `flowHasSurvey(mapa)` verifica se algum bloco do mapa é `survey:` (via `isSurveyBlock` já existente em `model.ts`), usado pela Task 2 para condicionar o switch de filtro de pesquisa.

Ciclo TDD seguido à risca: testes escritos primeiro (RED, commit `6569ec75`, falharam por import inexistente — 299 passaram/1 falhou por erro de importação no arquivo inteiro), depois a implementação (GREEN, commit `f05325b2`, 338 passaram/0 falharam).

### Task 2 — Layout e CSS dos cards (F-1.4 linhas 1–10 e 12)

Aplicada linha por linha da tabela F-1.4, usando os valores medidos ao vivo (`ref/CAPTURAS-F1-F6.md`) como fonte de verdade quando presentes:

1. **Grid Se/Condição** (`selection.tsx`): `Selection` ganhou a prop opcional `rotulo`, desenhada como `<span className="sub">` dentro de `.selection-control`, absoluta no padrão `.bl-campo--interno > .sub` (12px/700, lh 18, topo 5px, esquerda 12px). `condition.tsx` usa `rotulo="Se"` na fonte e `rotulo="Condição"` na comparação; a caixa ganhou altura 56px, padding `7px 4px 7px 12px`, borda `rgba(255,255,255,.2)`, `align-items:flex-end` para o valor 14px/400 (lh 22) ficar embaixo do rótulo, seta 20×20. A largura de cada caixa vem do grid `1fr 1fr` (coluna igual) em vez de um `155px` fixo — ver Deviations.
2. **Conector "E"**: da 2ª condição em diante, um `<b className="bl-condition-and">E</b>` centralizado (16px/700) substitui o antigo texto "e"/"Se" solto; cada linha continua mostrando "Se" como rótulo interno do próprio select.
3. **Select OU/E entre valores**: removido da UI (`condition.tsx`); o campo `condition.operator` nunca é apagado — cobrto pelo teste da Task 1 e pelo comentário no JSX.
4. **Chips de valor**: `.bl-value` 24px de altura, padding `0 4px 0 10px`, raio 12, fundo `#141414`, gap 4px; botão "×" 16×16 transparente e redondo (sem quadrado cinza do botão nativo).
5. **Caixa de valores**: fundo `#393939`, borda `#141414`, raio 8, `min-height:55px` (medido); placeholder branco.
6. **Card/condição**: `.bl-saida` com padding 5px, margem 10px, fundo `#1f1f1f`; `.bl-condition` com padding 10px.
7. **Divisor "OU"** (`panel-outputs.tsx`): entre saídas não-últimas, bloco de 24px com duas linhas de 1px `#393939` e o texto 16px/700 com 10px de respiro de cada lado.
8. **"+" de nova condição**: círculo 25×26 `#393939` sem borda, posicionado sobre uma linha 1px `#141414` (`.bl-add-condition-wrapper`/`.bl-add-condition-linha`), reaproveitando o ícone `mais` já existente em `packages/ui/src/icones.tsx` em vez de desenhar um novo `maisContorno` (D-33 permite reuso quando serve).
9. **Lixeira da condição**: `.bl-remover` 30×30, raio 50%, padding 3px, `opacity:0` por padrão e `opacity:1` só no hover/focus do `.bl-saida` que a contém.
10. **Abas do painel**: 46px de altura, ativa com sublinhado 2px `--p-builder-marca-selecionado` (= `--p-marca`, D-32) e texto branco; inativa `rgb(82,99,108)`.
11. **"Ir para"** (`destination-picker.tsx`): label trocado para `bl-campo bl-campo--interno bl-destination-picker`, reaproveitando o padrão `.bl-campo--interno > .sub` já existente (antes só usado dentro de `.bl-detalhe`), agora generalizado em `panel-block.css` para qualquer contexto do painel do bloco.
12. **Switch de pesquisa** (`panel-outputs.tsx`): o checkbox "Exibir apenas blocos de pesquisa de satisfação" virou o `Interruptor` (`curto`) já existente em `pages/flow/integrations/interruptor.tsx`, com o texto "Exibir pesquisa de satisfação", mostrado apenas quando `flowHasSurvey(mapa)` é verdadeiro.

Commit: `0dbf8ff2` feat(02-23): Se/Condição cards, E connector, OU divider and survey switch (F-1).

## Verificação executada

- `pnpm --filter @pipe/management-vite typecheck` — sem saída (limpo), rodado após cada task.
- `pnpm --filter @pipe/management-vite test` — 338 passed, 0 failed (rodado três vezes: RED da Task 1, GREEN da Task 1, e após a Task 2).
- Greps da Task 2, todos confirmados: `bl-condition-and` em `condition.tsx`; `bl-ou` em `panel-outputs.tsx`; `Exibir pesquisa de satisfação` presente e `Exibir apenas blocos de pesquisa` ausente em `panel-outputs.tsx`.
- `grep -n "#4a5d23\|--bl-verde"` nos arquivos tocados — nenhuma ocorrência nova.
- Verificação visual formal (screenshot lado a lado com `R/screenshots/c-condicoes-de-saida.jpg`) **não executada** — o próprio plano reserva essa medição para o 02-35; não há servidor dev rodando nesta sessão para capturar.

## Deviations from Plan

### Auto-fixed / judgment calls (Rule 1-3, no architectural change)

**1. [Rule 3 - safe substitution] Largura das caixas Se/Condição via grid `1fr 1fr`, não `155px` fixo**
- **Found during:** Task 2, item (2).
- **Issue:** CAPTURAS-F1-F6.md mediu `155×56` para cada caixa dentro de um card Blip de 341px de largura útil — um contexto de layout específico da Blip. O painel do Pipe (`.bl-panel--block`) tem 460px fixos com paddings próprios, então fixar `155px` poderia estourar ou sobrar espaço conforme o padding real do card.
- **Fix:** `grid-template-columns: 1fr 1fr; column-gap: 10px` no lugar de larguras fixas; a altura 56px (medida) foi mantida fixa, que é o valor mais estável entre contextos.
- **Files modified:** `panel-block.css`.
- **Commit:** `0dbf8ff2`.

**2. [Rule 3 - reuse existing component] Switch de pesquisa reaproveita `Interruptor` de `flow/integrations/interruptor.tsx`**
- **Found during:** Task 2, item (12).
- **Issue:** O plano permitia "componente de switch já usado no Builder, se houver; senão um `input[type=checkbox][role=switch]` estilizado". Não havia switch usado dentro de `pages/builder/`, mas o app já tinha dois componentes `Interruptor` prontos (um em `flow/integrations/`, outro em `flow/settings/pecas.tsx`).
- **Fix:** Reaproveitado `flow/integrations/interruptor.tsx` — é literalmente um `<input type="checkbox" role="switch">` estilizado, o mesmo fallback que o plano descreve, já com tema (`--p-marca-forte`, sem azul) e a variante `curto`. Builder já importa de `../flow/*` em outros arquivos (`editor.tsx`, `panel-queues.tsx`), então o import cross-feature é padrão estabelecido.
- **Files modified:** `panel-outputs.tsx`.
- **Commit:** `0dbf8ff2`.

**3. [Rule 1 - dead code cleanup] Removidas regras CSS e um export que ficaram inalcançáveis**
- **Found during:** Task 2, ao remover o select OU/E e o `span.bl-condition-if`.
- **Issue:** `.bl-condition-if` (duas ocorrências em `editor.css`, uma em `panel-block.css`), `.bl-condition-operator` e o `.bl-add-condition::before/::after` antigo ficaram sem elemento correspondente no DOM; `OPERADORES_DA_TELA` (export de `conditions.ts`) ficou sem nenhum import em todo o app.
- **Fix:** Removidos. Nenhum comportamento visível muda — eram, respectivamente, CSS morto e um export não referenciado em lugar nenhum.
- **Files modified:** `editor.css`, `panel-block.css`, `conditions.ts`.
- **Commit:** `0dbf8ff2`.

**4. [Implementation detail] `removeCondition` assinatura em nível de `Block`, não de lista de saídas**
- O plano sugeria (como exemplo, não obrigação) `removeCondition(outputs, outputIndex, conditionIndex)`. Implementado como `removeCondition(block, outputIndex, conditionIndex): Block`, seguindo a convenção já usada por toda `conditions.ts` (`outputSetConditions(block, ...)`, `outputSetDestination(block, ...)`, `removerSaida(block, ...)`), o que também simplificou o `onMudar(removeCondition(block, i, conditionIndex))` no `panel-outputs.tsx`.

### None requiring Rule 4 (architectural)

Nenhuma mudança encontrada exigiu nova tabela, novo serviço ou troca de biblioteca.

## Assumption Drift (advisory)

**Assumption drift:** plano escopa a Task 2 só para a aba "Condições de saída" (F-1) -> `ConditionsEditor`/`ConditionRow` (`condition.tsx`) é um componente único, já compartilhado antes deste plano entre saídas (`panel-outputs.tsx`) e condições de ação (`panel-actions.tsx`, aba Ações). Como a mudança está no componente compartilhado, a aba Ações também passa a mostrar o grid Se/Condição com rótulo interno, o conector "E", o select OU/E escondido e o novo "+" circular — não só a aba de saídas.
- **Why:** o próprio `condition.tsx` já dizia em seu comentário de topo "Reference `condition-wrapper` for an exit **or action**" antes deste plano; dividir o componente para blindar só a aba de saídas duplicaria ~150 linhas sem nenhum requisito visual diferente documentado para Ações. A única acomodação feita para não quebrar Ações foi o `onRemoverCondicao` opcional (a exclusão por-condição de Ações continua removendo só a condição, nunca a ação inteira, porque Ações não tem o conceito de "saída").
- O botão de excluir condição (`.bl-remover`) permanece sempre visível em Ações (sem `.bl-saida` como ancestral, a regra `opacity:0`/hover-reveal não se aplica lá) e só ganha o hover-reveal 30×30 dentro da aba de saídas, evitando esconder permanentemente o botão em Ações.

## Known Stubs

Nenhum. Toda a UI alterada está conectada a dados reais (`block.$conditionOutputs`, `condition.operator`, `mapa`); não há placeholder nem dado mock.

## Threat Flags

Nenhuma superfície nova (rede, auth, arquivo, schema) foi introduzida — apenas layout/CSS e uma função pura de edição de array. O threat register do plano (T-2-23-01: `operator` preservado; T-2-23-02: texto escapado pelo React) segue coberto pelo teste da Task 1 e pela ausência de `dangerouslySetInnerHTML`.

## Self-Check: PASSED

Arquivos confirmados no disco:
- FOUND: `apps/management-vite/src/pages/builder/conditions.ts`
- FOUND: `apps/management-vite/tests/builder-editor.test.ts`
- FOUND: `apps/management-vite/src/components/selection.tsx`
- FOUND: `apps/management-vite/src/pages/builder/condition.tsx`
- FOUND: `apps/management-vite/src/pages/builder/panel-outputs.tsx`
- FOUND: `apps/management-vite/src/pages/builder/destination-picker.tsx`
- FOUND: `apps/management-vite/src/pages/builder/panel-block.css`
- FOUND: `apps/management-vite/src/pages/builder/editor.css`

Commits confirmados em `git log --oneline --all`:
- FOUND: `6569ec75` test(02-23): add failing coverage for removeCondition and flowHasSurvey
- FOUND: `f05325b2` feat(02-23): remove the whole output on its last condition; add flowHasSurvey
- FOUND: `e4d32c47` docs(02-23): draft summary after Task 1 (logic done, layout pending)
- FOUND: `0dbf8ff2` feat(02-23): Se/Condição cards, E connector, OU divider and survey switch (F-1)

Nenhum item ausente.

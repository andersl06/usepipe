---
phase: 02-fechar-o-builder
plan: 33
subsystem: ui
tags: [react, builder, filas, toast, queue-management]

requires:
  - phase: 02-fechar-o-builder
    provides: FloatingSidebar shell (02-26), model.ts ehAttendance/Mapa (base)
provides:
  - Regras puras do painel de filas (queues-panel.ts) testadas
  - Aviso na pílula sem bloco de atendimento
  - Painel de filas embutido no Builder (lista, busca, cards, switch, rodapé, vazio, sem resultado, criação)
affects: [02-34 (modo regras da fila), 02-27 (toast compartilhado, a integrar no merge)]

tech-stack:
  added: []
  patterns:
    - "Pure reducer + rule module (queues-panel.ts) tested with node:test, mirroring rule-queue.ts/search.ts"
    - "Local toast fallback: `recado` state in builder.tsx extended with titulo/duracaoMs, a trocar pelo toast compartilhado de 02-27 no merge"

key-files:
  created:
    - apps/management-vite/src/pages/builder/queues-panel.ts
    - apps/management-vite/tests/builder-queues.test.ts
  modified:
    - apps/management-vite/src/pages/builder/panel-queues.tsx
    - apps/management-vite/src/pages/builder.tsx
    - apps/management-vite/src/pages/builder/panel-block.css

key-decisions:
  - "queueNameError devolve o sentinel 'reservado' para DIRECT_TRANSFER em vez de texto de exibição, para o chamador rotear para um toast em vez de mensagem de campo"
  - "Sem toast compartilhado ainda (02-27 roda em paralelo, não mesclado): estendi o `recado` local existente (Etiqueta no rodapé) com titulo + duracaoMs (auto-dismiss), em vez de construir um segundo sistema de toast"
  - "Card da fila usa width:100% dentro do corpo de 396px (não os 383px medidos da captura): a diferença de 13px é consistente com folga de scrollbar/box-sizing já observada em outras medidas de F-5 (CAPTURAS-F1-F6.md nota sobre 0.89px virar 1px); registrar como ponto a confirmar no checkpoint visual"

requirements-completed: [BUILDER-04]

duration: 25min
completed: 2026-09-28
---

# Phase 02 Plan 33: Gerenciamento de filas embutido no Builder Summary

**Painel de filas do Builder reescrito como CRUD embutido (lista, busca só no Enter, cards com switch, criação), gravando nas mesmas filas do Desk, revertendo D-15 (D-56 item 4).**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-28T18:35Z (reset ao HEAD `a95f7a45`)
- **Completed:** 2026-09-28T19:00Z
- **Tasks:** 2 automáticos concluídos + 1 checkpoint do dono (não aguardado, ver abaixo)
- **Files modified:** 5 (2 criados, 3 modificados)

## Accomplishments
- `queues-panel.ts`: `hasAttendanceBlock`, `queueNameError`, `filterQueues`, `pageQueues`, `queuesPanelReducer` — 15 testes `node:test`, todos verdes (RED→GREEN).
- Pílula "Gerenciamento de Filas" em `builder.tsx`: sem bloco `desk:*` no fluxo, mostra o toast de aviso (título + texto, 3000 ms) em vez de abrir o painel; ícone próprio de atendente (`userEngaged`, `@pipe/ui`, D-33) substitui o ícone de origem Blip que estava em uso.
- `panel-queues.tsx` reescrito: modo lista (busca só no Enter, "+"/X, cards com hover mostrando lápis "Editar fila" + divisor + switch ligado a `toggleQueue`, rodapé "Exibindo X de Y" + "Carregar mais" paginando 100 em 100), vazio (texto + "Criar nova fila" primary), sem resultado (`Illustration nome="busca"` + "Fila não encontrada  :(" + texto), e modo criar (formulário embutido com `saveQueue`, validação por `queueNameError`, mensagens DIRECT_TRANSFER/duplicado/sucesso/erro genérico da tabela do contexto). Modo regras é um placeholder (voltar + nome da fila), completado no plano 02-34.
- `panel-block.css`: estilos `.bl-queues-*`/`.bl-queue-card*` com os valores medidos em `ref/CAPTURAS-F1-F6.md` §F-5 (busca 48px, card `#393939`/raio 8/sombra/padding 20/label 12px `rgb(148,148,148)`/nome 16×700, hover 125ms com borda `#8ca0b3`, switch 50×24 padding-left 8, formulário 396×40 + botões 56 de altura).
- `typecheck`, `test` (373/373) e os três `grep` do plano passam (ver Self-Check).

## Task Commits

1. **Task 1: Regras puras do painel de filas** - `09a222ca` (test)
2. **Task 2: Aviso na pílula, modo fila e criação embutidos** - `9589665c` (feat)

**Plan metadata:** (este commit, a seguir)

## Files Created/Modified
- `apps/management-vite/src/pages/builder/queues-panel.ts` - regras puras (attendance gate, validação de nome, busca, paginação, máquina de modos: lista/criar/regras)
- `apps/management-vite/tests/builder-queues.test.ts` - 15 testes das regras acima
- `apps/management-vite/src/pages/builder/panel-queues.tsx` - painel reescrito (lista, busca, criação, placeholder de regras)
- `apps/management-vite/src/pages/builder.tsx` - aviso da pílula (toast local com título/duração), troca do ícone, `onAviso` para o painel
- `apps/management-vite/src/pages/builder/panel-block.css` - CSS `.bl-queues-*`/`.bl-queue-card*` e `.bl-recado-titulo`

## Decisions Made
Ver `key-decisions` no frontmatter. Resumo:
1. Sentinel `'reservado'` em `queueNameError` para separar "mensagem de campo" de "toast" sem duplicar a regra de nome reservado em dois lugares.
2. Toast local (extensão do `recado` já existente) como substituto temporário do componente compartilhado de 02-27, que roda em paralelo e ainda não foi mesclado. Todo `setRecado({tom, texto, duracaoMs?, titulo?})` já usa a forma esperada do toast compartilhado — a troca no merge deve ser mecânica (substituir `setRecado`/`recado` por chamadas ao componente de 02-27, sem mudar as chamadas de sites como `onAviso`).
3. Card com `width: 100%` do corpo (396px efetivos) em vez do valor medido de 383px: ver nota de decisão e "Assumption Drift" abaixo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Renomeada a classe do corpo do painel para evitar colisão CSS com o atalho antigo**
- **Found during:** Task 2 (implementação do painel)
- **Issue:** O atalho antigo (`panel-queues.tsx` anterior) usava a classe `.bl-queues-body`, ainda definida em `editor.css:373` (`display:flex; flex-direction:column; align-items:flex-start; gap:16px; padding:24px`). Reusar esse nome de classe no novo corpo do painel faria essas regras órfãs vazarem para o layout novo (coluna com `align-items:flex-start`, gap fixo), quebrando a busca/lista/rodapé.
- **Fix:** O wrapper do corpo agora usa `.bl-panel-body bl-queues-panel-body` (nome novo, sem CSS próprio — o padding 24px 32px já vem de `.bl-panel--flutuante .bl-panel-body`).
- **Files modified:** `apps/management-vite/src/pages/builder/panel-queues.tsx`
- **Verification:** `typecheck` e `test` verdes; inspeção visual não foi possível nesta wave (ver checkpoint do dono).
- **Committed in:** `9589665c` (Task 2)

---

**Total deviations:** 1 auto-fixed (1 bug de CSS evitado antes de existir).
**Impact on plan:** Nenhum impacto de escopo; a correção evitou um bug visual que só apareceria no checkpoint do dono.

**Nota:** `editor.css:373-384` (`.bl-queues-body`/`.bl-queues-summary`) ficou órfão — nada mais referencia essas classes. Não removi porque `editor.css` está reservado ao executor paralelo de 02-27 (toast); deixo registrado para limpeza num merge futuro.

## Assumption Drift (advisory)

Assumption drift: card medido em 383px de largura (CAPTURAS-F1-F6.md §F-5) -> implementado com `width: 100%` do corpo de 396px efetivos (planned width 383px vs actual 100%/396px; a diferença de 13px não tem explicação nas capturas — tratada como folga de medição, como o próprio arquivo de captura já registra para bordas de 0.89px viradas 1px). Não bloqueante; o dono deve confirmar no checkpoint visual se os 13px importam.

## Issues Encountered
Nenhum bloqueio. A investigação de arquivos (registrations.ts, actions.ts, agents-queues.tsx/formulario, interruptor.tsx, illustrations.tsx) confirmou que toda a escrita (`toggleQueue`, `saveQueue`) e os componentes visuais (`Interruptor`, `Illustration`, `Carregando`, `Etiqueta`) já existiam e foram reaproveitados sem duplicação.

## User Setup Required
None - nenhuma configuração de serviço externo.

## Next Phase Readiness

- 02-34 pode implementar o modo "regras" (lista de regras por fila) substituindo o placeholder em `panel-queues.tsx` (bloco `modo.modo === 'regras'`), sem tocar no restante do painel.
- 02-27, ao mesclar o toast compartilhado, deve procurar por `setRecado(` em `builder.tsx` (5 ocorrências: aviso da pílula, `onAviso` das filas, restaurar versão, `onAviso` de variáveis, importar fluxo) e trocar pelo componente novo; a forma `{tom, texto, titulo?, duracaoMs?}` já é compatível.
- `editor.css:373-384` (`.bl-queues-body`/`.bl-queues-summary`) ficou órfão — remover quando alguém tocar `editor.css` de novo.

### Checkpoint do dono (Task 3 — não aguardado nesta execução)

A Task 3 é `checkpoint:human-verify`. Não esperei pela resposta; os passos abaixo ficam registrados para o dono rodar quando revisar este plano.

**O que foi construído:** aviso sem bloco de atendimento; painel de filas embutido com lista, busca, cards, switch, rodapé, vazio, sem resultado e criação.

**Como verificar (navegador, tenant local descartável — nunca dados reais):**
1. Abrir o Builder num fluxo **sem** bloco de atendimento humano. Clicar no último botão da pílula (ícone de atendente, tooltip "Gerenciamento de Filas"). **Esperado:** nenhum painel abre; aparece um toast por 3 segundos com o título "Você ainda não configurou o atendimento humano." e o texto "Para ativar o atendimento humano, adicione um bloco de atendimento no Builder." (V-F5-01).
2. Adicionar um bloco de atendimento (Humano) ao fluxo e clicar de novo no mesmo botão. **Esperado:** painel "Gerenciamento de filas" abre (460px, canto superior direito); com filas cadastradas no tenant, a lista aparece com busca no topo. Comparar com `ref/medir-tela.js` contra `ref/CAPTURAS-F1-F6.md` §F-5 (caixa, busca, card, hover, switch, rodapé) (V-F5-02).
3. Digitar um termo na busca e apertar Enter (a lista só deve filtrar no Enter, não a cada tecla); clicar no "+"/X para confirmar que ele vira X com termo aplicado e limpa a busca ao clicar.
4. Clicar no "+" sem busca aplicada → abre o formulário "CRIAR NOVA FILA" (V-F5-03). Digitar o nome de uma fila já existente e sair do campo (Tab/blur): deve aparecer "Já existe uma fila com esse nome." sem enviar nada. Digitar "DIRECT_TRANSFER" e clicar Confirmar: deve aparecer o toast "Ops! Não é possível criar fila com este nome." sem enviar. Criar uma fila de teste com um nome novo: deve aparecer o toast "Fila adicionada com sucesso!" e o painel deve ir para o modo regras (placeholder com voltar + nome da fila nova).
5. Buscar "zzzz" (termo sem correspondência) e apertar Enter: deve aparecer a ilustração + "Fila não encontrada  :(" + "Não há filas cadastradas com este nome" (V-F5-05).
6. Conferir na página de filas do Desk (`Configurações > Filas`) que a fila criada no passo 4 aparece lá, com os mesmos dados (nome, ativa, capacidade padrão 5).

**Resposta do dono:** (a preencher quando o checkpoint for revisado — "aprovado" ou lista de diferenças, que viram correção neste plano).

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-28*

## Self-Check: PASSED

Todos os arquivos citados (criados e modificados) e os dois hashes de commit (`09a222ca`, `9589665c`) foram confirmados no disco/histórico do git.

---
phase: 02-fechar-o-builder
plan: 34
subsystem: ui
tags: [react, builder, filas, regras, toast, queue-management]

requires:
  - phase: 02-fechar-o-builder
    provides: Painel de filas embutido no Builder (02-33), com o modo "regras" como placeholder
provides:
  - Modo regras do painel de filas embutido no Builder (nome editável com travas, lista de regras com switch, busca, rodapé, vazio, criação)
  - Regras puras do modo regras (queues-panel.ts) testadas
affects: [02-27 (toast compartilhado, a integrar no merge)]

tech-stack:
  added: []
  patterns:
    - "Pure rule module extended (queues-panel.ts): queueRules/renameBlockReason/queueRenameError reuse ordenarRegras/queueNameError instead of duplicating logic"
    - "RuleQueueForm ganhou destinoFixo? opcional (hidden input + campo somente leitura) sem mudar o comportamento da página do Desk quando ausente"

key-files:
  created:
    - apps/management-vite/src/pages/builder/queue-rules.tsx
  modified:
    - apps/management-vite/src/pages/builder/queues-panel.ts
    - apps/management-vite/tests/builder-queues.test.ts
    - apps/management-vite/src/pages/builder/panel-queues.tsx
    - apps/management-vite/src/pages/registrations/rules-attendance-formulario.tsx
    - apps/management-vite/src/pages/builder/panel-block.css

key-decisions:
  - "Texto de bloqueio por regras atribuídas: a busca inicial em referencias-blip (grep -l) veio vazia por eu ter lido o resultado do comando em segundo plano cedo demais; uma segunda busca direta (grep -oE) achou o texto exato em attendance-desk-queue-management/.../main.js: editQueueNameRuleWarning = 'Ops! Esta fila já tem regras atribuídas, por isso não é possível fazer alterações.' — coincide com o texto que eu já tinha usado (sugerido pelo próprio plano como alternativa)"
  - "Texto de erro de nome curto: achado no mesmo bundle (minLengthField, T:.../attendance-desk-queue-management) = 'Esse campo deve ter no mínimo 3 caracteres.'; corrigi o valor inventado inicialmente ('Nome precisa ter ao menos 3 caracteres.') num commit fixup (e18b4623) antes de seguir para a Task 3"
  - "Texto de bloqueio por falta de permissão ('permissao') é código morto hoje, porque não existe helper de permissão de gravação na página do Desk (agents-queues.tsx) nem em nenhum outro lugar do management-vite; segui a instrução do plano e usei podeGravar = true, com o texto de bloqueio escrito só por completude"
  - "Texto 'Regra não encontrada  :(' para busca sem resultado no modo regras não está nas capturas nem no dicionário pesquisado (só o modo lista de filas tem esse estado capturado); espelhei o texto e o espaçamento duplo de 'Fila não encontrada  :(' por consistência — único texto desta plano sem confirmação na fonte"

requirements-completed: [BUILDER-04]

duration: 35min
completed: 2026-09-28
---

# Phase 02 Plan 34: Modo regras do painel de filas embutido Summary

**Modo "regras" do painel de filas do Builder completo: nome da fila editável com as travas da Blip, lista de regras com switch, busca, rodapé "Exibindo X de Y" centralizado, vazio, e criação de regra via `RuleQueueForm` embutido no painel — sem lixeira, como a captura confirmou.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-28 (reset ao HEAD `740c2397`)
- **Completed:** 2026-09-28
- **Tasks:** 2 automáticos + 1 checkpoint do dono (não aguardado, ver abaixo)
- **Files modified:** 5 (1 criado, 4 modificados)

## Accomplishments

- `queues-panel.ts`: `queueRules` (regras de uma fila, na ordem do motor), `renameBlockReason` (atendentes > regras > permissão), `queueRenameError` (mínimo 3, reaproveitando `queueNameError`) — 8 testes novos `node:test`, todos verdes.
- `queue-rules.tsx` (novo): `QueueRulesView({ fila, onVoltar, onAviso })` — cabeçalho com voltar, nome (editável só quando `renameBlockReason` é `null`) e lápis; toast de bloqueio quando não pode editar; `hr`; vazio com texto + "Criar nova regra"; lista com busca (Enter-only, "+"/X), cards (`Nome da regra` + nome + switch via `toggleRuleQueue`), "sem resultado" e rodapé "Exibindo X de Y" centralizado em negrito + "Carregar mais" (100 por página); "+"/"Criar nova regra" abrem `RuleQueueForm` no próprio painel com a fila já fixada como destino.
- `panel-queues.tsx`: troca o placeholder do modo `regras` por `QueueRulesView`, passando a fila encontrada em `queues` e o `onAviso` já existente.
- `rules-attendance-formulario.tsx`: `RuleQueueForm` ganhou a prop opcional `destinoFixo?: { id; name }` — quando presente, mostra a fila como texto somente-leitura e um `<input type="hidden">` com o id, no lugar do `<Seletor>`; ausente, o comportamento da página do Desk (`rules-attendance.tsx`) não muda.
- `panel-block.css`: `.bl-rules-header`/`.bl-rules-nome`/`.bl-rules-nome-input` (cabeçalho e input inline do nome) e `.bl-rules-footer` (rodapé centralizado em negrito, diferente do rodapé `space-between` da lista de filas).
- `typecheck`, `test` e os três `grep` do plano passam (ver Self-Check).

## Task Commits

1. **Task 1: Regras puras do modo regras** - `ecc7c1f0` (test)
2. **Task 2: Modo regras dentro do painel** - `9c348cd2` (feat)
3. **Fixup: texto de nome curto com a fonte exata** - `e18b4623` (fix)

**Plan metadata:** (este commit, a seguir)

## Files Created/Modified
- `apps/management-vite/src/pages/builder/queue-rules.tsx` - modo regras completo (cabeçalho editável, lista, busca, criação)
- `apps/management-vite/src/pages/builder/queues-panel.ts` - `queueRules`/`renameBlockReason`/`queueRenameError`
- `apps/management-vite/tests/builder-queues.test.ts` - 8 testes das regras acima
- `apps/management-vite/src/pages/builder/panel-queues.tsx` - liga `QueueRulesView` no modo `regras`
- `apps/management-vite/src/pages/registrations/rules-attendance-formulario.tsx` - `destinoFixo?` opcional em `RuleQueueForm`
- `apps/management-vite/src/pages/builder/panel-block.css` - CSS do cabeçalho e rodapé do modo regras

## Decisions Made
Ver `key-decisions` no frontmatter. Resumo:
1. Dois dos três textos sem captura ao vivo (bloqueio por regras atribuídas, nome curto) foram confirmados no dicionário T do bundle do Desk (`attendance-desk-queue-management/.../main.js`) depois de escritos; o terceiro (busca de regras sem resultado) não tem fonte encontrada e ficou como texto espelhado, registrado como o único sem confirmação.
2. `podeGravar` fixo em `true`: não existe helper de permissão de gravação reaproveitável na página do Desk nem em outro lugar do app, como o plano previu como possibilidade.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `ordenarRegras`/`queueRules` viraram genéricos para não perder o campo extra da subclasse**
- **Found during:** Task 2 (typecheck)
- **Issue:** `ordenarRegras` (lib/rule-queue.ts) e a nova `queueRules` (queues-panel.ts) devolviam `QueueRule[]`, o tipo base. `queue-rules.tsx` chama `queueRules` com `QueueRegisteredRule[]` (que estende `QueueRule` com `queueDestinationActive`) e passa o resultado direto para `<RuleQueueForm regraExistente=... />`/`QueueRulesList`, que exigem `QueueRegisteredRule[]`. O typecheck falhou: `Property 'queueDestinationActive' is missing`.
- **Fix:** `ordenarRegras<T extends QueueRule>(regras: readonly T[]): T[]` e `queueRules<T extends QueueRule>(...)` genéricos, preservando o tipo de entrada. Nenhuma chamada existente muda de comportamento (inferência automática).
- **Files modified:** `apps/management-vite/src/lib/rule-queue.ts`, `apps/management-vite/src/pages/builder/queues-panel.ts`
- **Verification:** `typecheck` verde.
- **Committed in:** `9c348cd2` (Task 2)

---

**Total deviations:** 1 auto-fixed (1 bug de tipo pego pelo typecheck antes de rodar).
**Impact on plan:** Nenhum impacto de escopo.

## Assumption Drift (advisory)

Nenhum desvio material das premissas do plano ou do `02-CONTEXT.md` além dos três textos não capturados já registrados em `key-decisions` (nome curto, regras atribuídas, busca sem resultado) — nenhum deles muda o comportamento descrito no plano, só preenche lacunas de texto que as capturas ao vivo não cobriram.

## Issues Encountered

Nenhum bloqueio. O helper de permissão de gravação citado no plano (`agents-queues.tsx` ou outro ponto do Desk) não existe no código — busquei por `podeGravar`/`canWrite`/`permiss` em todo `apps/management-vite/src` e não encontrei nada reutilizável; segui a instrução do próprio plano ("se não houver, considerar `true`"). A primeira busca por "regras atribuídas" em `referencias-blip/` (rodada em segundo plano) parecia vazia porque li o arquivo de saída antes do comando terminar de escrever; uma segunda busca direta confirmou o texto exato no bundle do Desk, e o mesmo bundle também tinha o texto de nome curto, corrigido em `e18b4623`.

## User Setup Required
None - nenhuma configuração de serviço externo.

## Next Phase Readiness

- O CRUD embutido de filas do Builder (D-56 item 4) está completo: lista (02-33) + regras (02-34), fila + regra sempre gravando nas mesmas tabelas do Desk.
- `RuleQueueForm` ganhou `destinoFixo?`; qualquer outro ponto do produto que precise fixar o destino de uma regra pode reaproveitar a mesma prop.
- Pendência de fidelidade visual: nenhuma medida nova de `CAPTURAS-F1-F6.md` §F-5 modo regras ficou sem aplicar — a caixa, o card, o rótulo e o switch reaproveitam exatamente as classes CSS medidas em 02-33 (`.bl-queue-card` etc.), e o rodapé centralizado/negrito é a única regra nova, sem medida de pixel própria na captura (só "centralizado em negrito").

### Checkpoint do dono (Task 3 — não aguardado nesta execução)

A Task 3 é `checkpoint:human-verify`. Não esperei pela resposta; os passos abaixo ficam registrados para o dono rodar quando revisar este plano.

**O que foi construído:** modo regras do painel de filas embutido: nome editável com as travas da Blip, busca, lista de regras com switch, rodapé, vazio e criação de regra dentro do painel.

**Como verificar (navegador, tenant local descartável — nunca dados reais):**
1. Builder local com um bloco de atendimento no fluxo → abrir "Gerenciamento de Filas" pela pílula → clicar no lápis de uma fila que já tenha atendentes vinculados. **Esperado:** o painel entra no modo regras (voltar, nome, lápis, `hr`, lista de regras dessa fila) e, ao clicar no lápis do NOME (dentro do modo regras, não o da lista), aparece o toast "Ops! Esta fila já tem atendentes vinculados, por isso não é possível fazer alterações." em vez de abrir o campo de edição.
2. Criar uma fila nova pelo "+" (sem atendentes, sem regras): ao salvar, o painel já entra no modo regras dessa fila nova. **Esperado:** vazio com "Você ainda não possui regras de atendimento definidas." + botão "Criar nova regra"; o lápis do nome abre o campo de edição (sem toast de bloqueio).
3. No modo regras da fila nova, clicar em "Criar nova regra" (ou o "+" da busca): **Esperado:** o formulário de regra do Desk (`RuleQueueForm`) abre dentro do próprio painel, com "Fila de destino" já mostrando o nome da fila atual, sem seletor. Preencher nome + uma condição e salvar: **Esperado:** volta para a lista, que agora mostra a regra criada com um switch, e o rodapé "Exibindo 1 de 1" centralizado em negrito.
4. Clicar no switch da regra criada: **Esperado:** o switch muda de estado (chama `toggleRuleQueue`, mesma ação da tela de regras do Desk).
5. Medir a caixa/card/switch com `ref/medir-tela.js` e comparar com `ref/CAPTURAS-F1-F6.md` §F-5 "Editar (modo regras)" — o card e a caixa já usam as mesmas classes CSS medidas em 02-33, então a paridade esperada é a mesma; o rodapé centralizado/negrito é o único elemento novo desta plano.
6. Conferir na página de regras do Desk (`Configurações > Atendimento > Regras`) que a regra criada no passo 3 aparece lá, com a mesma fila de destino.
7. Confirmar que não há nenhum botão de lixeira em lugar nenhum do modo regras (nem no cabeçalho, nem no card da regra) — por fidelidade com a captura ao vivo, que confirmou que a Blip nunca mostra esse botão aqui.

**Resposta do dono:** (a preencher quando o checkpoint for revisado — "aprovado" ou lista de diferenças, que viram correção neste plano).

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-28*

## Self-Check: PASSED

Todos os arquivos citados (criados e modificados) e os três hashes de commit (`ecc7c1f0`, `9c348cd2`, `e18b4623`) foram confirmados no disco/histórico do git.

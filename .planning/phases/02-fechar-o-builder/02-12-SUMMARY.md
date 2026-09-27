---
phase: 02-fechar-o-builder
plan: 12
subsystem: ui
tags: [react, builder, satisfaction-survey, editor-model]

requires:
  - phase: 02-fechar-o-builder
    provides: "motor de pesquisa de satisfação (schema pesquisa_satisfacao_resposta, satisfaction-survey.ts, ultimoAtendimento com tags/sequentialId) de 02-11"
  - phase: 02-fechar-o-builder
    provides: "DestinationPicker e filterDestinations de 02-09"
provides:
  - "newSurveyBlock + isSurveyBlock em model.ts: bloco de pesquisa nativo (survey:), sem categoria fixa embutida"
  - "criação do bloco de pesquisa pelo menu NOVO BLOCO, edição da pergunta e filtro 'Exibir apenas blocos de pesquisa de satisfação' em painel-saidas.tsx"
  - "input.content@tags/@sequentialId/@team/@agentIdentity/@openDate/@closeDate/@closedBy em VARIABLES_OF_SYSTEM"
  - "nó de pesquisa distinguível no canvas (ícone Pipe, classe bl-node--survey)"
affects: [builder, satisfaction-survey]

tech-stack:
  added: []
  patterns:
    - "Predicado de tipo de bloco especial por prefixo de id (isSurveyBlock), igual ehAttendance, sem campo dedicado no schema"
    - "Filtro do destination picker é estado local por linha de saída (Set<number>), não um dado persistido no bloco"

key-files:
  created: []
  modified:
    - apps/management-vite/src/pages/builder/model.ts
    - apps/management-vite/tests/builder-editor.test.ts
    - apps/management-vite/src/pages/builder/panel-outputs.tsx
    - apps/management-vite/src/pages/builder/menu-new-block.tsx
    - apps/management-vite/src/pages/builder/editor.tsx
    - apps/management-vite/src/pages/builder/no.tsx
    - apps/management-vite/src/pages/builder/editor.css
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/src/pages/builder/variables.ts

key-decisions:
  - "newSurveyBlock nasce com $conditionOutputs vazio: ramificação por condição de saída genérica configurada pelo autor, sem categoria fixa promotor/neutro/detrator embutida (D-08.5/D-09, portão do dono)"
  - "'Exibir apenas blocos de pesquisa de satisfação' é um filtro de UI local (não persistido no bloco), igual à referência (D-08: mecanismo genérico do destination picker, não ramificação especial)"
  - "Criação do bloco de pesquisa acontece pelo menu NOVO BLOCO (mesmo caminho de Padrão/Humano), não por um botão '+Adicionar' embutido no destination picker de uma saída específica — ver Deviations"

patterns-established:
  - "Campos de configuração de um bloco especial (pergunta da pesquisa) vivem na aba Condições de saída (painel-saidas.tsx) quando o bloco não passa pelo catálogo de conteúdo comum"

requirements-completed: [BUILDER-03]

duration: ~50min
completed: 2026-09-27
---

# Phase 02 Plan 12: Pesquisa de Satisfação e Etiquetas no Editor do Builder Summary

**`newSurveyBlock` cria o bloco nativo de pesquisa (`survey:`, escala fixa 1-5) sem ramificação embutida; o editor ganha criação pelo menu Novo Bloco, edição da pergunta, filtro de destino "Exibir apenas blocos de pesquisa de satisfação" e sete variáveis de sistema `input.content@*` do ticket encerrado.**

## Performance

- **Duration:** ~50min
- **Tasks:** 2/2 completas
- **Files modified:** 9

## Accomplishments
- Bloco de pesquisa de satisfação nativo reproduzido no modelo puro do editor (`newSurveyBlock`), com a marca serializada (`application/vnd.lime.satisfaction-survey+json`) que o motor de 02-11 já reconhece, e ida/volta `montarDesenho`/`lerDesenho` preservando o bloco
- Ramificação por condição de saída genérica (sem promotor/neutro/detrator embutido), conforme D-08.5/D-09 aprovado no portão
- Criação do bloco pelo menu "NOVO BLOCO" (ao lado de Padrão/Humano), edição da pergunta e filtro de destino específico para blocos de pesquisa
- Sete campos do ticket encerrado (`tags`, `sequentialId`, `team`, `agentIdentity`, `openDate`, `closeDate`, `closedBy`) na biblioteca de variáveis do sistema, cada um documentando que só valem após encerramento pelo atendente ou por inatividade (D-12) — sem UI de "ramificar por etiqueta"

## Task Commits

Each task was committed atomically:

1. **Task 1: newSurveyBlock e saídas da pesquisa no modelo (D-06, D-09)** - `d8f47d4` (feat)
2. **Task 2: UI de criação/configuração da pesquisa e variáveis de ticket (D-08, D-12)** - `80d041d` (feat)

**Plan metadata:** commit deste SUMMARY (a seguir)

## Files Created/Modified
- `apps/management-vite/src/pages/builder/model.ts` - `PREFIX_OF_SURVEY`, `TITLE_OF_SURVEY`, `SURVEY_SCALE`, `SURVEY_QUESTION_DEFAULT`, `isSurveyBlock`, `surveyQuestion`/`setSurveyQuestion`, `newSurveyBlock`
- `apps/management-vite/tests/builder-editor.test.ts` - 5 testes `survey:` (criação, predicado por prefixo, get/set da pergunta, ida/volta, aresta D-29.2)
- `apps/management-vite/src/pages/builder/panel-outputs.tsx` - seção "Pergunta da pesquisa" para blocos `survey:`; checkbox "Exibir apenas blocos de pesquisa de satisfação" por linha de saída, filtrando o `DestinationPicker`
- `apps/management-vite/src/pages/builder/menu-new-block.tsx` - item "Pesquisa de satisfação" no menu NOVO BLOCO (ícone `gostei`, `data-test="builder-add-survey-state"`)
- `apps/management-vite/src/pages/builder/editor.tsx` - `createSurvey()` análogo a `createHuman()`/`createDefault()`, wiring do novo item de menu (deviation, ver abaixo)
- `apps/management-vite/src/pages/builder/no.tsx` - classe `bl-node--survey` e ícone Pipe (`IconePortal nome="gostei"`) antes do título do nó de pesquisa (D-33)
- `apps/management-vite/src/pages/builder/editor.css` - `.bl-no-icone` (espaçamento do ícone do nó, sem cor) (deviation, ver abaixo)
- `apps/management-vite/src/pages/builder/panel-block.css` - `.bl-survey-config`/`.bl-survey-filtro` (só layout, sem hex)
- `apps/management-vite/src/pages/builder/variables.ts` - sete entradas `input.content@*` em `VARIABLES_OF_SYSTEM`

## Decisions Made
- `newSurveyBlock` nasce com `$conditionOutputs: []` (herdado de `esqueleto`), nunca com categoria fixa embutida — D-08.5/D-09 aprovado no portão exige ramificação só por condição genérica configurada pelo autor.
- O predicado `isSurveyBlock(block)` verifica só o prefixo do id (`survey:`), igual a `ehAttendance` — nenhum campo novo no schema serializado do bloco.
- A pergunta da pesquisa é editável em `painel-saidas.tsx` (aba Condições de saída), não na aba Conteúdo: o Content tab (`conteudo.ts`/`panel-content.tsx`) não reconhece o tipo `application/vnd.lime.satisfaction-survey+json` e é arquivo do executor paralelo (02-15) — ver Deviations/Known gaps.
- Escala fixa 1-5 (D-06): `setSurveyQuestion` nunca toca `scale`, só `question`.

## Deviations from Plan

### Auto-fixed Issues

Nenhuma correção automática de bug/segurança fora do previsto pelo plano.

### Ajustes de escopo documentados (não Rule 1-3, mas necessários para completar a Task 2)

**1. [Rule 3 - Blocking] Wiring do novo item do menu NOVO BLOCO em `editor.tsx`**
- **Found during:** Task 2
- **Issue:** `menu-new-block.tsx` (arquivo do plano) precisa de um handler `onPesquisa` fornecido por quem o renderiza; sem essa mudança o componente ficaria com uma prop obrigatória sem consumidor, quebrando o typecheck.
- **Fix:** adicionada `createSurvey()` em `editor.tsx`, mesmo padrão de `createDefault()`/`createHuman()` já existentes (chama `newSurveyBlock`, `addBlock`, seleciona e abre o bloco criado); `editor.tsx` não está em `files_modified` do plano, mas é o único chamador de `MenuNewBlock`.
- **Files modified:** `apps/management-vite/src/pages/builder/editor.tsx`
- **Verification:** `pnpm --filter @pipe/management-vite typecheck` → 0; `pnpm --filter @pipe/management-vite build` → sucesso
- **Committed in:** `80d041d`

**2. [Rule 3 - Blocking] CSS de espaçamento do ícone do nó de pesquisa em `editor.css`**
- **Found during:** Task 2
- **Issue:** todas as regras `.bl-no*`/`.bl-node--*` (incluindo a irmã `.bl-node--attendance`) vivem em `editor.css`, não em `panel-block.css` (citado no plano); sem uma regra mínima de espaçamento o ícone ficaria colado ao título.
- **Fix:** uma regra `.bl-no-icone { vertical-align: -3px; margin-right: 4px; }`, sem cor/hex — a diferenciação visual do nó em si é só a classe `bl-node--survey` (sem novo valor de cor: `02-UI-SPEC.md` registra que a tela de pesquisa ainda não tem medida capturada, então nenhuma cor nova foi inventada).
- **Files modified:** `apps/management-vite/src/pages/builder/editor.css`
- **Verification:** `pnpm --filter @pipe/management-vite build` → sucesso; `grep` sem hex na regra nova
- **Committed in:** `80d041d`

---

**Total deviations:** 2 ajustes de escopo (Rule 3, wiring bloqueante), 0 correções de bug/segurança
**Impact on plan:** Ambos os ajustes são a continuação direta e mínima de arquivos já listados no plano (o componente que os arquivos do plano expõem precisa de um consumidor funcional); sem eles o menu novo item não compilaria nem teria efeito. Sem scope creep de produto.

## Known Gaps (documentados, não stubs)

- **"+Adicionar" a partir da saída de atendimento não implementado.** A referência (`ref/inventario-satisfacao-e-tags.md` §1) descreve um atalho: com o filtro "Exibir apenas..." ligado, o botão "+Adicionar" da saída cria o bloco de pesquisa diretamente como destino daquela saída. `OutputsPanel` (`painel-saidas.tsx`) só recebe `onMudar(block)` — atualiza o bloco atual, não pode inserir um novo bloco no mapa do fluxo sem uma prop nova roteada por `panel.tsx`/`editor.tsx` (que não estão no escopo de arquivos do plano e não foram alterados para isso). Implementado em vez disso: o atendente cria o bloco de pesquisa pelo menu "NOVO BLOCO" (mesmo caminho de Padrão/Humano) e depois liga a saída de encerramento a ele pelo `DestinationPicker` — com o filtro "Exibir apenas..." ligado, a lista já mostra só blocos de pesquisa, uma etapa a mais que o atalho da referência, mesmo resultado final. Se o dono quiser o atalho de um clique, é um plano pequeno adicional que estende `OutputsPanel`/`panel.tsx` com uma prop `onCriarBloco`.
- **Aba Conteúdo não reconhece o bloco de pesquisa.** `conteudo.ts`/`panel-content.tsx` (arquivos do executor paralelo 02-15, fora de alcance) não têm um `case` para `application/vnd.lime.satisfaction-survey+json`; abrir a aba Conteúdo de um bloco `survey:` mostra o card como "Conteúdo que o Pipe não envia" (`cardsOf`, `conteudo.ts`), mesmo o motor processando a pesquisa normalmente (02-11). A edição da pergunta funciona pela aba Condições de saída (`painel-saidas.tsx`, implementada nesta plano). Também por isso `CONTEUDOS_SUPORTADOS` (`packages/core/src/flow/editor.ts`, arquivo proibido nesta execução) ainda não lista o MIME da pesquisa — `importReport`/`naoSuportado` classificam esse conteúdo como não suportado, sem bloquear publicação (a validação que bloqueia publicação é `flowErrors`/`engineContentErrors`, que não rejeita esse tipo). Ajuste de exibição, não de comportamento; recomendado ao plano dono de `editor.ts`/`conteudo.ts` (02-15 ou fase seguinte de conteúdo).
- **Timeout e destino após timeout do bloco de pesquisa não implementados**, por D-03 (bloqueado por captura pendente #3 do inventário — não confirmado se o bloco tem timeout distinto da expiração genérica de "Entrada do usuário").
- **Nome exato da variável de nota/comentário da resposta (C-29)** segue não confirmado pela investigação; não bloqueia este plano porque `packages/core/src/flow/satisfaction-survey.ts` (02-11) já interpreta a resposta bruta sem depender de um nome de variável de contexto específico.

## Issues Encountered
Nenhum bloqueio. `pnpm install`/build de `@pipe/core`/`@pipe/contracts`/`@pipe/db`/`@pipe/ui` necessários antes dos testes (cache do turbo restaurado de outro worktree, `dist/` já continha o `SURVEY_CONTENT_TYPE` de 02-11).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Critério 3 do roadmap (pesquisa de satisfação nativa + paleta de tags nas saídas de atendimento) completo com 02-08 (tags/tokens) e 02-11 (motor/persistência) e este plano (editor).
- Gaps documentados acima (atalho de criação em um clique, reconhecimento no Content tab, timeout) ficam para um plano futuro de refinamento do Builder ou para quando as capturas pendentes (#1, #3) forem resolvidas.
- Nenhum arquivo do executor paralelo (02-15: `packages/core/src/flow/editor.ts`, `apps/api/src/domain/flow.ts`, `conteudo.ts`, `panel-content.tsx`, `builder-content.test.ts`) foi tocado.

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-27*

## Self-Check: PASSED

Todos os arquivos citados (`model.ts`, `builder-editor.test.ts`, `panel-outputs.tsx`, `menu-new-block.tsx`, `editor.tsx`, `no.tsx`, `editor.css`, `panel-block.css`, `variables.ts`, este SUMMARY) existem no worktree; os commits citados (`d8f47d4`, `80d041d`) existem em `git log`.

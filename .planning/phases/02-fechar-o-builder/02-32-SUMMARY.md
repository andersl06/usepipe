---
phase: 02-fechar-o-builder
plan: 32
subsystem: ui
tags: [builder, react, configuration-panel, versions, global-actions]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder
    provides: "02-24 aba Ações do bloco (ActionsPanel, BIBLIOTECA DE FUNÇÕES); 02-31 seção recolhível de Configuração (bl-config-secao)"
provides:
  - "versions-list.ts: lastPublished/latestPublished/formatPublishedAt para as últimas 10 publicações"
  - "aba Versões com Carregar/Baixar/Restaurar e cards VERSÕES PUBLICADAS (383x96)"
  - "aba Ações globais renderizando o mesmo ActionsPanel do bloco, via pseudobloco de `global`"
affects: [03-validacao-visual]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "pseudoBlockOfGlobal/globalOfPseudoBlock (actions-global.ts): reaproveita um componente `Block`-based para editar `global` sem duplicar UI"

key-files:
  created:
    - apps/management-vite/src/pages/builder/versions-list.ts
  modified:
    - apps/management-vite/src/pages/builder/panel-configuration.tsx
    - apps/management-vite/src/pages/builder/actions-global.ts
    - apps/management-vite/src/pages/builder/import-exportar.ts
    - apps/management-vite/src/pages/builder/editor.css
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/src/pages/builder.tsx
    - apps/management-vite/src/pages/registrations/_modal.tsx
    - apps/management-vite/tests/builder-painels.test.ts

key-decisions:
  - "'Nomear versão' (edit, primary) não é desenhado: fluxo_versao não tem título/descrição hoje; fica pendência para o dono (fora deste plano, conforme o objective)."
  - "Erro ao restaurar mostra o texto fixo da Blip ('Não foi possível restaurar a versão publicada'), não a mensagem crua da API, para paridade de texto (F-2.1)."
  - "MESSAGES_OF_IMPORT.erroAoCarregar existe para paridade de texto mas fica inatingível: o Carregar fluxo do Pipe é despacho síncrono no cliente, sem chamada de API que possa falhar depois da confirmação."

requirements-completed: [BUILDER-04]

# Metrics
duration: 30min
completed: 2026-09-28
---

# Phase 02 Plan 32: Configuração "Versões" e "Ações globais" como na Blip Summary

**Aba Versões com cards de publicação (383×96, `#393939`) no lugar da tabela de 5 colunas, e aba Ações globais renderizando o mesmo `ActionsPanel` do bloco via um pseudobloco de `global`.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-09-28T22:38:17Z (reset do worktree)
- **Completed:** 2026-09-28T23:06:35Z
- **Tasks:** 2 auto tasks completas; 1 checkpoint (owner) aberto, ver abaixo
- **Files modified:** 8 (1 criado)

## Accomplishments
- `versions-list.ts` criado e testado: `lastPublished` (últimas 10 publicadas, mais nova primeiro), `latestPublished`, `formatPublishedAt` (`dd/MM/yyyy - HH:mm:ss`, fuso configurável, padrão `America/Sao_Paulo`).
- Aba Versões reescrita: itens "Carregar fluxo"/"Baixar fluxo" com o aviso da Blip entre eles, "Restaurar versão" que restaura a última publicação (ou avisa "Não foi encontrada nenhuma versão publicada"); seção recolhível "VERSÕES PUBLICADAS" com cards por publicação (data em negrito + autor, dois botões-ícone 40×40 restaurar/baixar); tabela de 5 colunas removida junto com seu CSS.
- Aba Ações globais deixou de ter uma lista própria (`ActionsGlobalList`) e passou a renderizar o `ActionsPanel` da aba Ações do bloco (BIBLIOTECA DE FUNÇÕES, AÇÕES DE ENTRADA/SAÍDA, seleção, colar ação), alimentado por um pseudobloco de `global` (`pseudoBlockOfGlobal`/`globalOfPseudoBlock`).
- Textos de Carregar/Restaurar trocados pelos da Blip (confirmação "Sim"/"Não", "arquivo inválido", confirmação e erro de restaurar); `ModalConfirmation` ganhou `rotuloCancelar` opcional para o caso "Sim"/"Não".

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): failing test for versions-list** - `ac0e55d` (test)
2. **Task 1 (GREEN): implement versions-list** - `998bc24` (feat)
3. **Task 2: Versões cards and shared Ações globais panel** - `1a0c091` (feat)

_Task 1 is `tdd="true"`: RED (test) → GREEN (feat), no refactor commit needed._

## Files Created/Modified
- `apps/management-vite/src/pages/builder/versions-list.ts` — `lastPublished`/`latestPublished`/`formatPublishedAt` e o tipo `PublishedVersion` (narrowing de `publicadaEm`)
- `apps/management-vite/src/pages/builder/panel-configuration.tsx` — Versões (itens, aviso, seção de cards, modais) e Ações globais (`ActionsPanel` via pseudobloco); `ActionsGlobalTab`/`ActionsGlobalList` removidos
- `apps/management-vite/src/pages/builder/actions-global.ts` — `pseudoBlockOfGlobal`/`globalOfPseudoBlock` (CRUD `*Global` existente mantido, ainda usado pelos testes)
- `apps/management-vite/src/pages/builder/import-exportar.ts` — textos de `MESSAGES_OF_IMPORT` trocados pelos da Blip
- `apps/management-vite/src/pages/builder/editor.css` — itens de Versões (padding/raio/gap conforme captura), aviso, cards `.bl-version-card*`; tabela de versões removida
- `apps/management-vite/src/pages/builder/panel-block.css` — regra órfã `.bl-versions-table th` removida (tabela não existe mais)
- `apps/management-vite/src/pages/builder.tsx` — `onAviso={toast}` passado ao `ConfigurationPanel`
- `apps/management-vite/src/pages/registrations/_modal.tsx` — `ModalConfirmation` ganhou `rotuloCancelar?: string` (padrão `'Cancelar'`)
- `apps/management-vite/tests/builder-painels.test.ts` — testes de `versions-list.ts`

## Decisions Made
- Reaproveitar o `ActionsPanel` (block-based) para "Ações globais" via um pseudobloco (`{...global, id: '$global'}`) em vez de extrair um componente novo: menor diff, mesmo comportamento (seleção, colar, limite de 15, Biblioteca de funções) garantido pelo mesmo código que a aba Ações do bloco já usa.
- Erro de restauração mostra o texto fixo da Blip, não o detalhe cru do backend (paridade de texto do F-2.1); a mensagem real do backend não aparece na tela (mesma omissão da referência).
- `MESSAGES_OF_IMPORT.erroAoCarregar` foi adicionado por completude de texto, mas fica sem caminho de disparo: o "Carregar fluxo" do Pipe é um despacho síncrono no cliente (`builder.tsx`'s `onImport`), sem chamada de API que possa falhar depois de `validateImport` já ter aprovado o arquivo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `ActionsGlobalList` engolia o erro de limite (15 ações) em silêncio**
- **Found during:** Task 2 (troca por `ActionsPanel`)
- **Issue:** o código antigo de `ActionsGlobalList.adicionar` fazia `if (!r.ok) return;` sem mostrar nada ao usuário quando o limite de 15 ações era atingido.
- **Fix:** ao trocar pelo `ActionsPanel` compartilhado, o aviso de limite (e de colar acima do limite) passa a usar o `onAviso` real, entregue via toast (`ConfigurationPanel`'s `avisar` → `builder.tsx`'s `toast`).
- **Files modified:** `panel-configuration.tsx`, `builder.tsx`
- **Verification:** `pnpm --filter @pipe/management-vite typecheck` e `test` verdes; o mesmo caminho já é coberto pelos testes de `actions-of-block.ts`/`panel-actions.tsx` reaproveitados.
- **Committed in:** `1a0c091` (Task 2 commit)

**2. [Rule 1 - Bug] regra CSS órfã `.bl-versions-table th` em `panel-block.css`**
- **Found during:** Task 2 (remoção da tabela de versões)
- **Issue:** a tabela de 5 colunas foi removida de `panel-configuration.tsx`/`editor.css`, mas `panel-block.css` ainda tinha uma regra de tema escuro apontando para essa tabela que deixou de existir.
- **Fix:** regra removida; confirmado que nenhum outro `<table>`/`<th>` existe nos painéis do Builder.
- **Files modified:** `panel-block.css`
- **Verification:** `grep` por `<table` nos painéis do Builder não encontra nada; `lint`/`typecheck`/`test` verdes.
- **Committed in:** `1a0c091` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug/dead code)
**Impact on plan:** Ambos os ajustes vieram naturalmente da troca de componente de Ações globais e da remoção da tabela; nenhum aumento de escopo.

## Issues Encountered
None.

## Known Stubs
None. Nenhum valor vazio/placeholder foi deixado nas telas alteradas; a única funcionalidade fora do escopo ("Nomear versão") não desenha nenhum botão sem função, conforme o `<objective>` do plano.

## Pending Item (registrado para o dono)

**"Nomear versão" (botão `edit`, primary, no card de cada publicação):** a Blip permite editar título e descrição de cada versão publicada (modal "Edite o título e descrição da versão", campos "Título" 50 caracteres / "Descrição" 200 caracteres). A tabela `fluxo_versao` do Pipe não tem essas colunas hoje — precisa de migração de schema, endpoint de API e o modal de edição. Fora do escopo deste plano (o escopo do dono para Versões são os cards das últimas 10 publicações); nenhum botão de "Nomear versão" foi desenhado. Fica como item pendente para o dono confirmar se entra em uma próxima rodada.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `versions-list.ts` fica disponível para qualquer outra tela que precise das últimas publicações (ex.: um futuro painel de publicação).
- A aba Ações globais agora herda automaticamente qualquer correção futura de F-1 (Ações do bloco), por vir do mesmo componente.
- Pendência de "Nomear versão" (schema + API + modal) deve ser avaliada pelo dono antes de fechar o F-2 por completo.

---

## CHECKPOINT (Task 3): Dono compara Versões e Ações globais lado a lado

**Type:** human-verify
**Gate:** blocking — não foi aprovado nesta execução; a IA não espera resposta, apenas documenta os passos e o resultado esperado para o dono confirmar depois.

### O que foi construído
- Aba Versões: "Carregar fluxo" / "Baixar fluxo" (com o aviso "Baixar o fluxo e as configurações de ações globais." entre eles) / "Restaurar versão"; seção "VERSÕES PUBLICADAS" com até 10 cards (383×96, fundo `#393939`, raio 16) da mais nova para a mais antiga.
- Aba Ações globais: idêntica à aba Ações do bloco (BIBLIOTECA DE FUNÇÕES, AÇÕES DE ENTRADA/SAÍDA, contadores, "Selecionar todos"/"Colar ação").

### Como verificar (passos exatos no navegador)
1. Abrir o Builder local de um fluxo qualquer → clicar no botão "Configuração" (4º ícone da pílula) → aba **Versões**.
2. **V-F2-03** (itens e cards): passar o mouse e focar em "Carregar fluxo", "Baixar fluxo" e "Restaurar versão" (hover/foco visíveis); abrir a seção "VERSÕES PUBLICADAS" e comparar cada card com `ref/CAPTURAS-F1-F6.md` §F-2 usando `ref/medir-tela.js` (padding, raio, sombra, posição dos dois botões-ícone).
3. **V-F2-04**: clicar em "Carregar fluxo", escolher um `.json` válido, conferir o modal "Carregar fluxo" com os botões **Sim**/**Não** e o texto "Ao importar o fluxo, a sua versão atual será substituída. Deseja continuar?" — clicar em **Não** para cancelar sem aplicar.
4. **V-F2-05**: clicar em "Restaurar versão" (ou no botão de restaurar de um card), conferir o modal "Restaurar versão" com o texto de restauração e os botões **Restaurar**/**Cancelar** — clicar em **Cancelar**.
5. **V-F2-06**: abrir a aba **Ações globais** e comparar com a aba **Ações** de qualquer bloco (mesmos cabeçalhos, contador, "Selecionar todos"/"Colar ação", menu "ADICIONAR FERRAMENTAS").
6. Confirmar com o dono se o botão "Nomear versão" (editar título/descrição da versão) pode ficar pendente para uma próxima rodada (ver seção "Pending Item" acima).

### Resultado esperado
- Itens de Versões sem borda, fundo igual ao do painel, ícone e texto com 20px de vão, 20px entre os itens.
- Cards de VERSÕES PUBLICADAS: 383×96, padding 24px 16px 24px 24px, raio 16, `#393939`, sombra `0 6px 16px -4px rgba(0,0,0,.16)`; data em negrito + autor abaixo; dois botões-ícone 40×40 à direita (restaurar, baixar) — sem o terceiro botão "Nomear versão"/editar.
- Modal de Carregar: título "Carregar fluxo", botões "Sim"/"Não".
- Modal de Restaurar: título "Restaurar versão", botões "Restaurar"/"Cancelar".
- Aba Ações globais visualmente idêntica à aba Ações do bloco.

### Awaiting
Resposta do dono: "aprovado" ou lista de diferenças (que viram correção neste plano, conforme as regras de execução).

## Self-Check: PASSED

- FOUND: `apps/management-vite/src/pages/builder/versions-list.ts`
- FOUND: commit `ac0e55d` (test)
- FOUND: commit `998bc24` (feat)
- FOUND: commit `1a0c091` (feat)
- `pnpm --filter @pipe/management-vite typecheck` — sem erros
- `pnpm --filter @pipe/management-vite lint` — sem erros
- `pnpm --filter @pipe/management-vite test` — 397/397 passando
- Greps do plano: `VERSÕES PUBLICADAS` presente, `ActionsGlobalList` ausente, `Carregar fluxo` presente — todos confirmados

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-28*

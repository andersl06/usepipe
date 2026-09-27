---
phase: 02-fechar-o-builder
plan: 08
subsystem: ui
tags: [design-tokens, css-custom-properties, dark-theme, react, icons]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder
    provides: "02-07 (wave 2 do Builder — pré-requisito do wave 3)"
provides:
  - "11 tokens --p-builder-marca-* (base, hover, ativo, anel, borda-ativa, selecionado, destaque, brilho, sombra, sobreposicao, gradiente) no escopo escuro de tokens.css, espelhados em TEMA.builder.marca"
  - "Builder com tema escuro fixo via data-tema=\"escuro\" no contêiner raiz, independente do alternador global"
  - "editor.css/panel-block.css migrados: nenhum #4a5d23/--bl-verde restante; setas voltam ao cinza neutro #666 da referência"
  - "TAG_PALETTE/TAG_SUGGESTIONS/isLegacyBlue/resolveTagColor exportados de tags-of-block.ts; painel de tag usa a paleta e sugestões, sem azul embutido"
  - "Sete ícones próprios em icones.tsx (userEngaged, numberedMenu, location, httpRequest, script, testEnvironment, restoreVersion)"
affects: ["02-09", "02-10", "wave 3 do Builder"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tokens semânticos por papel visual (--p-builder-marca-*) em vez de reutilizar --p-marca/--p-foco diretamente dentro do Builder"
    - "data-tema=\"escuro\" aplicado a um contêiner qualquer (não só :root) via seletor CSS duplo [data-tema='escuro']"
    - "Token CSS (var()) para exibição ao vivo + resolução para hex literal só no momento de persistir em contrato externo ($tags)"

key-files:
  created: []
  modified:
    - packages/ui/src/estilos/tokens.css
    - packages/ui/src/tema.ts
    - docs/marca/MARCA.md
    - apps/management-vite/src/pages/builder/editor.tsx
    - apps/management-vite/src/pages/builder/editor.css
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/src/pages/builder/tags-of-block.ts
    - apps/management-vite/src/pages/builder/panel.tsx
    - packages/ui/src/icones.tsx
    - apps/management-vite/tests/builder-painels.test.ts

key-decisions:
  - "Arrows (.bl-seta-traco/.bl-seta-ponta padrão) voltam ao #666 neutro da referência medida, em vez do token de marca — só a seta selecionada usa --p-builder-marca-borda-ativa"
  - "TAG_PALETTE guarda 'var(--p-builder-marca)' para a entrada Marca (exibição ao vivo); resolveTagColor() converte para o hex escuro fixo (#a3b76a, igual ao --p-marca escuro) só na hora de gravar em $tags, porque a Blip lê um hex literal do fluxo exportado, não uma CSS custom property"
  - "Seletor de tokens.css passou a aceitar [data-tema='escuro'] sem :root, para o Builder escopar o tema escuro no próprio contêiner sem depender do <html>"

requirements-completed: [BUILDER-03, BUILDER-04]

# Metrics
duration: ~20min (excluindo leitura inicial do plano/inventários)
completed: 2026-09-26
---

# Phase 02 Plan 08: Identidade Visual do Builder Summary

**11 tokens `--p-builder-marca-*` por papel substituindo `#4a5d23`/`--bl-verde` no Builder, tema escuro fixo via `data-tema`, paleta de `$tags` sem azul e sete ícones próprios (`userEngaged` incluso).**

## Performance

- **Duration:** ~20 min de execução (commits entre 22:33 e 22:43 -03, sem contar leitura de contexto)
- **Completed:** 2026-09-26
- **Tasks:** 3/3 (mais o Task 0 pre-flight gate, que passou)
- **Files modified:** 10

## Accomplishments
- Onze tokens `--p-builder-marca-*` declarados nos dois blocos escuros de `tokens.css` (preferência de sistema e escolha explícita), mais um terceiro ponto de aplicação via seletor `[data-tema='escuro']` sem `:root`, para o Builder poder escopar o tema no próprio contêiner
- `editor.tsx` força `data-tema="escuro"` no `<div className="bl-editor">`, então o Builder não depende mais do alternador de tema do resto do produto (D-31)
- Todo `#4a5d23`/`--bl-verde`/`color-mix(...--p-marca...)` de `editor.css` e `panel-block.css` virou o token do papel correspondente; as setas do canvas voltaram à cor neutra `#666` da referência medida (corrigindo um desvio existente, já que hoje elas usavam o verde de marca)
- `tags-of-block.ts` exporta `TAG_PALETTE`, `TAG_SUGGESTIONS`, `isLegacyBlue` e `resolveTagColor`; `corDaEtiqueta` (badge do canvas) devolve `var(--p-builder-marca)` para qualquer azul legado; `panel.tsx` usa a paleta e sugestões compartilhadas, sem lista de azul embutida
- Sete ícones próprios acrescentados a `icones.tsx` (`userEngaged`, `numberedMenu`, `location`, `httpRequest`, `script`, `testEnvironment`, `restoreVersion`), fechando a lista "Existe em icones.tsx? = não" do inventário visual

## Task Commits

Each task was committed atomically:

1. **Task 1: Tokens `--p-builder-marca-*` no escopo escuro, espelho em `tema.ts` e `MARCA.md`** - `b5a67b5` (feat)
2. **Task 2: Tema escuro fixo e migração do CSS do Builder** - `ec39334` (feat)
3. **Task 3: Paleta de `$tags` e ícones próprios** - `20ba19c` (feat)

_Task 0 (Pre-flight Gate) passou sem commit próprio: `git tag -l std-apply-all-end` já imprimia `std-apply-all-end` no início da execução._

## Files Created/Modified
- `packages/ui/src/estilos/tokens.css` - 11 tokens `--p-builder-marca-*` nos dois blocos escuros + seletor `[data-tema='escuro']` plano
- `packages/ui/src/tema.ts` - `TEMA.builder.marca.*` espelhando os tokens
- `docs/marca/MARCA.md` - seção "Builder: tokens de marca (tema escuro)" com a tabela dos 11 papéis
- `apps/management-vite/src/pages/builder/editor.tsx` - `data-tema="escuro"` no contêiner raiz do editor
- `apps/management-vite/src/pages/builder/editor.css` - todo hex/var de marca migrado para o token do papel; setas voltam a `#666`
- `apps/management-vite/src/pages/builder/panel-block.css` - `--bl-verde` removido, quatro usos migrados
- `apps/management-vite/src/pages/builder/tags-of-block.ts` - `TAG_PALETTE`, `TAG_SUGGESTIONS`, `isLegacyBlue`, `resolveTagColor`; `corDaEtiqueta` usa o token
- `apps/management-vite/src/pages/builder/panel.tsx` - seletor de cor da tag e sugestão de rótulo usam a paleta compartilhada
- `packages/ui/src/icones.tsx` - sete ícones próprios novos
- `apps/management-vite/tests/builder-painels.test.ts` - dois testes novos + assert existente atualizado para o novo valor de retorno

## Decisions Made
- **Setas do canvas:** a referência mede `#666` sólido, não azul de marca — corrigido em vez de simplesmente tokenizar o hex existente, seguindo a instrução explícita de corrigir esse desvio conhecido. Só a seta *selecionada* usa `--p-builder-marca-borda-ativa`.
- **Cor de `$tags` exportada:** `TAG_PALETTE` guarda `var(--p-builder-marca)` para a entrada "Marca" (o que a UI mostra ao vivo, sempre correto no tema escuro do Builder); `resolveTagColor()` converte esse token para o hex fixo `#a3b76a` (o mesmo `--p-marca` escuro) só no instante de gravar em `block.$tags`, porque esse campo é lido pela Blip como string literal no fluxo exportado (STD-06), nunca como CSS custom property. Isso mantém `apps/management-vite/src/pages/builder` livre de `#4a5d23`/`--bl-verde` sem quebrar o contrato de exportação.
- **`--p-builder-marca-brilho`/`-sombra`/`-gradiente`:** sem captura ao vivo do canvas da Blip (pendência registrada em `ref/inventario-visual.md`), ficam com valor semente derivado de `--p-marca`/`--p-marca-forte`, documentado em `MARCA.md` como "sem uso ainda" — não há seletor no CSS atual que os consuma.
- **Seletor `[data-tema='escuro']` sem `:root`:** acrescentado ao lado do `:root[data-tema='escuro']` existente (mesmo bloco de valores, sem duplicar), para permitir que o Builder escopor o tema escuro num contêiner interno em vez do `<html>`, sem afetar o alternador de tema global.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Setas do canvas usavam a cor de marca em vez do cinza neutro medido na referência**
- **Found during:** Task 2
- **Issue:** `.bl-seta-traco`/`.bl-seta-ponta` usavam `var(--p-marca, #4a5d23)`; a referência (correção de 2026-09-26 do UI-SPEC) mede `#666` sólido para as setas, que não são cor de marca.
- **Fix:** setas padrão passam a `#666` fixo; só `.bl-seta--selecionada` usa `--p-builder-marca-borda-ativa`.
- **Files modified:** `apps/management-vite/src/pages/builder/editor.css`
- **Verification:** `grep -n "p-marca" editor.css` não mostra mais as regras de seta padrão; typecheck e build do app verdes.
- **Committed in:** `ec39334` (Task 2 commit)

**2. [Rule 2 - Missing Critical] Teste existente quebraria com a troca de `corDaEtiqueta`**
- **Found during:** Task 3
- **Issue:** `builder-painels.test.ts` tinha `assert.equal(etiquetas[0]?.cor, '#4a5d23')` para uma tag de origem azul — esse assert ficaria falso assim que `corDaEtiqueta` passasse a devolver `var(--p-builder-marca)` (mudança exigida pela própria Task 3).
- **Fix:** assert atualizado para o novo valor de retorno; dois testes novos acrescentados conforme pedido pelo plano.
- **Files modified:** `apps/management-vite/tests/builder-painels.test.ts`
- **Verification:** `pnpm --filter @pipe/management-vite test` — 271/271 passam, incluindo os dois testes novos.
- **Committed in:** `20ba19c` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical/teste quebrado pela própria mudança pedida)
**Impact on plan:** Ambos os ajustes eram exigidos pela correção de referência e pela própria mudança da Task 3; sem escopo adicional.

## Issues Encountered
- O worktree nasceu com `HEAD` numa história divergente da esperada (`git merge-base` não continha o commit-base `749e010`); corrigido com o `git reset --hard` sancionado pelo próprio passo de verificação de branch no início da execução, antes de qualquer alteração de arquivo.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Os 11 tokens `--p-builder-marca-*` e o padrão `data-tema` escopado ficam disponíveis para os próximos planos do wave 3 do Builder (etiquetas de encerramento, D-33 remanescente se houver).
- `--p-builder-marca-brilho`/`-sombra`/`-gradiente` seguem como valor semente até uma captura ao vivo do canvas da Blip confirmar o efeito real — nenhum consumidor os usa ainda, então não há regressão visual pendente.

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-26*

## Self-Check: PASSED

- Todos os 10 arquivos modificados listados acima confirmados no disco (`FOUND`).
- Os três commits de task (`b5a67b5`, `ec39334`, `20ba19c`) confirmados em `git log --oneline -5`.
- `grep -rn "#4a5d23\|--bl-verde" apps/management-vite/src/pages/builder` vazio.
- `pnpm --filter @pipe/ui test` — ok, 91 tokens, 84 em uso, tema claro e escuro em paridade.
- `pnpm --filter @pipe/management-vite test` — 271/271 passam (inclui os dois testes novos).
- `pnpm exec turbo run typecheck --filter=@pipe/management-vite --filter=@pipe/ui` — 6/6 tarefas verdes.
- `pnpm --filter @pipe/management-vite build` — build de produção concluído sem erro.

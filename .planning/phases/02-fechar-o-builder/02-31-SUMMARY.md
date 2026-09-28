---
phase: 02-fechar-o-builder
plan: 31
subsystem: builder
tags: [react, vitest, configuration, blip-parity]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder
    provides: "configuration flow through the engine (02-29): flow.configuration, gesto configuracao, validConfigKey, {{config.X}} lido por packages/core/src/flow/context.ts"
provides:
  - "configuration-sections.ts: definição pura das 8 seções capturadas da aba Variáveis + secondsToTimeSpan/timeSpanToSeconds"
  - "panel-configuration-variables.tsx: aba Variáveis funcional — 'Variáveis de configuração' grava em flow.configuration; as outras 7 seções aparecem desabilitadas com a marca 'Não disponível no Pipe'"
  - "Configuração abre em Variáveis; ordem das abas Variáveis · Versões · Ações globais · Funções"
affects: [02-32-versoes-acoes-globais]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reuso entre páginas do Interruptor (apps/management-vite/src/pages/flow/integrations/interruptor.tsx) para o switch 42x24 da Blip — já usado por panel-queues.tsx, agora também pela aba Variáveis"
    - "Regras .bl-panel--block .bl-campo--interno/.campo eram exclusivas do painel de bloco; a aba Variáveis mora no casco flutuante (.bl-panel--flutuante), então ganhou as mesmas regras como blocos aditivos novos, sem tocar nas linhas existentes do painel de bloco"

key-files:
  created:
    - apps/management-vite/src/pages/builder/configuration-sections.ts
    - apps/management-vite/src/pages/builder/panel-configuration-variables.tsx
  modified:
    - apps/management-vite/src/pages/builder/panel-configuration.tsx
    - apps/management-vite/src/pages/builder/panel-block.css
    - apps/management-vite/src/pages/builder.tsx
    - apps/management-vite/tests/builder-painels.test.ts

key-decisions:
  - "Disponibilidade decidida pela busca no motor (packages/core/src/flow), não por suposição: só a seção 'Variáveis de configuração' está disponível, porque o motor só lê configuration genericamente via {{config.X}} (context.ts:407); as chaves builder:* nunca são lidas de volta, e defaultActionTimeLimitMs (manager.ts) é uma configuração fixa do gerenciador, não algo lido por fluxo de configuration['builder:actionExecutionTimeout'] — então TEMPO LIMITE DE AÇÕES também fica desabilitado, apesar de o Pipe ter uma noção de timeout de ação"
  - "Seções desabilitadas mostram o valor gravado quando existe (ex.: um fluxo importado da Blip pode trazer builder:stateExpiration com um TimeSpan real) — daí secondsToTimeSpan/timeSpanToSeconds converterem o texto gravado em segundos para exibição, mesmo com o campo desabilitado"
  - "Linhas de 'Variáveis de configuração' permitem renomear a chave (não só editar o valor): ao perder o foco com uma chave nova válida, a troca é feita como remover a chave antiga + gravar a nova, mantendo o valor; chave inválida (fora de [a-zA-Z0-9]) fica com borda vermelha e não grava, reaproveitando validConfigKey de 02-29"

requirements-completed: [BUILDER-04]

# Metrics
duration: "~20min de implementação (commits entre 19:23 e 19:30 -03; leitura/investigação prévia não cronometrada)"
completed: 2026-09-28
---

# Phase 02 Plan 31: Configuração — aba Variáveis Summary

**Configuração abre na aba "Variáveis" com as 8 seções medidas ao vivo da Blip; "Variáveis de configuração" grava de verdade em `flow.configuration` (lido pelo motor via `{{config.X}}`), as outras 7 aparecem desabilitadas com a marca "Não disponível no Pipe".**

## Performance

- **Tasks:** 2/3 concluídas (Task 3 é `checkpoint:human-verify` — instruções deixadas abaixo, sem aguardar)
- **Files modified:** 6 (2 criados, 4 modificados)
- **Commits:** 5 (2 pares test/feat + 1 docs de rascunho + 1 feat da Task 2)

## Accomplishments

- `configuration-sections.ts`: `CONFIGURATION_SECTIONS` com as 8 seções na ordem de `ref/CAPTURAS-F1-F6.md` §F-2, textos literais copiados (não reescritos), e `secondsToTimeSpan`/`timeSpanToSeconds` para o formato `TimeSpan` que a Blip grava em `builder:stateExpiration`/`builder:actionExecutionTimeout`
- Busca no motor confirmada por `grep` em `packages/core/src`: `context.ts:407` lê `flow.configuration?.[nome]` genericamente para `{{config.X}}` (qualquer chave, inclusive as do usuário) — por isso só "Variáveis de configuração" está disponível; nenhuma chave `builder:*` tem leitura própria, e `defaultActionTimeLimitMs` (`manager.ts`) é uma constante do gerenciador, não lida de `flow.configuration` por fluxo
- `panel-configuration-variables.tsx`: `ConfigurationVariablesTab` renderiza as 8 seções recolhidas por padrão, cabeçalho 16px/700 maiúsculo com chevron à esquerda (`baixo` de `@pipe/ui`, rotacionado), switch 42×24 (`Interruptor` reaproveitado de `flow/integrations`) na linha do título das seções 2 e 3, slider desabilitado com "N%" na cor da marca para a seção 1, campos com rótulo interno (padrão `bl-campo--interno` de 02-23) para as seções 4/5/6, "Identificador do fluxo" mostrando o `flowId` real (desabilitado) com o link "Redefinir identificador do fluxo" também desabilitado
- "Variáveis de configuração" funcional: linhas chave/valor 160×56 com lixeira, renomeação de chave ao perder o foco, chave inválida com borda vermelha e sem gravação, botão tracejado 60px "+ Adicionar informações extras" que abre uma linha nova local até a chave virar válida — cada mudança válida despacha `onChange(chave, valor|null)` → `despachar({ tipo: 'configuracao', ... })` em `builder.tsx`, mesmo caminho de desfazer/refazer de 02-29
- "Variáveis sensíveis" mostra os dois textos literais da captura e o botão "+ Adicionar informações extras" desabilitado — nunca grava segredo
- `panel-configuration.tsx`: abas reordenadas para Variáveis (padrão) · Versões · Ações globais (g minúsculo) · Funções — igual à Blip mais a biblioteca de funções do Pipe por último (D-22); comentário do topo do arquivo corrigido (não dizia mais que a engine "não tem nada" da aba Variáveis, que era parcialmente falso)
- `builder.tsx`: `ConfigurationPanel` recebe `configuration={state.configuracao}` e `onChangeConfiguration`; o botão da pílula agora abre direto em `'variaveis'`
- `panel-block.css`: chevron/divisor/slider/botão tracejado novos; como a aba Variáveis mora no casco flutuante (`.bl-panel--flutuante`) e o padrão `.bl-campo--interno`/borda de erro só existia para o painel de bloco (`.bl-panel--block`), adicionei os mesmos blocos para o casco flutuante como regras novas — sem mexer nas linhas existentes do painel de bloco

## Task Commits

1. **Task 1: Definição das seções e conversões** (RED → GREEN, confirmado rodando os testes com o módulo temporariamente fora do disco)
   - `f805941f` (test) — cobertura falhando para `CONFIGURATION_SECTIONS`/`secondsToTimeSpan`/`timeSpanToSeconds`
   - `4870d340` (feat) — `configuration-sections.ts`
   - `2499d09c` (docs) — rascunho deste SUMMARY, escrito após a Task 1
2. **Task 2: Aba Variáveis e ordem das abas**
   - `1ddcdb3d` (feat) — `panel-configuration-variables.tsx`, `panel-configuration.tsx`, `panel-block.css`, `builder.tsx`

**Plan metadata:** (commit final, após este SUMMARY)

## Files Created/Modified

- `apps/management-vite/src/pages/builder/configuration-sections.ts` — 8 seções capturadas, textos literais, `secondsToTimeSpan`/`timeSpanToSeconds`
- `apps/management-vite/src/pages/builder/panel-configuration-variables.tsx` — `ConfigurationVariablesTab`, seções recolhíveis, controles Blip desabilitados/habilitado
- `apps/management-vite/src/pages/builder/panel-configuration.tsx` — abas reordenadas, `ConfigurationPanel` recebe/repassa `configuration`/`onChangeConfiguration`, comentário do topo corrigido
- `apps/management-vite/src/pages/builder/panel-block.css` — CSS das seções, divisor, slider, botão tracejado, campo com rótulo interno e borda de erro no casco flutuante
- `apps/management-vite/src/pages/builder.tsx` — passa `state.configuracao`/`despachar({tipo:'configuracao'})`, pílula abre em `'variaveis'`
- `apps/management-vite/tests/builder-painels.test.ts` — 3 testes novos para `configuration-sections.ts`

## Decisions Made

Ver `key-decisions` no frontmatter — resumo: disponibilidade decidida por busca real no motor (não suposição), seções desabilitadas mostram o valor gravado quando existe, e "Variáveis de configuração" suporta renomear chave (remover + recriar) além de editar valor.

## Deviations from Plan

None — plano executado como escrito. O plano já previa que 02-28 (marcas de erro) e 02-30 (Biblioteca de variáveis) rodam em paralelo e podem não estar presentes neste worktree; confirmado por grep que nenhum dos dois havia aterrissado (`Não disponível no Pipe` e `error-marks.ts` ausentes antes deste plano), então a marca "Não disponível no Pipe" e a borda de chave inválida foram criadas aqui, com CSS/textos simples e reaproveitáveis, para os planos 02-28/02-30/02-32 convergirem no merge.

## Issues Encountered

None de bloqueio. O worktree não tinha `node_modules`; rodei `pnpm install --prefer-offline --frozen-lockfile` e `pnpm --filter @pipe/core build && pnpm --filter @pipe/contracts build` antes de testar, conforme as notas de ambiente do plano.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 02-32 (Versões e Ações globais) pode seguir direto: a `ConfigurationPanel` já expõe o tipo `Aba` com `'versoes'`/`'acoes'` e as duas abas seguem funcionando como antes, só reordenadas.
- Ao mergear com 02-28 (marcas de erro) e 02-30 (Biblioteca de variáveis), conferir se a marca "Não disponível no Pipe" que este plano criou (usando `<Etiqueta tom="neutro">`) bate com a que 02-30 usar na Biblioteca — nenhum dos dois planos havia decidido o padrão ainda quando este rodou.
- Nenhum bloqueio conhecido.

---

## Task 3 (checkpoint:human-verify) — não aguardado, instruções para o dono

Por instrução explícita da execução, esta task NÃO foi aguardada interativamente. Os passos abaixo são exatamente os do plano, para o dono rodar quando quiser:

**O que foi construído:** aba Variáveis da Configuração com as 8 seções da Blip; "Variáveis de configuração" funcional; abas na ordem da Blip (Variáveis · Versões · Ações globais · Funções).

**Como verificar:**
1. Builder local → pílula, 4º botão ("Configuração"). O painel deve abrir já na aba "Variáveis".
2. Medir painel, abas e seções com `ref/medir-tela.js` e comparar com `ref/CAPTURAS-F1-F6.md` §F-2.
3. Abrir cada seção: conferir chevron (rotaciona ao abrir), switch 42×24 na linha do título (seções 2 e 3), slider com "%" na cor da marca (seção 1), campos com rótulo interno (seções 4, 5, 6), linha chave-valor 160×56 com lixeira (seção 7), botão tracejado "+ Adicionar informações extras" (seções 7 e 8).
4. Criar a chave `Saudacao` = `Olá` na seção "Variáveis de configuração", usar `{{config.Saudacao}}` num bloco de Texto, publicar e conferir no painel de Teste que a mensagem sai "Olá".
5. Conferir as marcas "Não disponível no Pipe" nas seções 1, 2, 3, 4, 5, 6 (link "Redefinir identificador do fluxo") e 8.

**Resultado esperado:** todas as 8 seções presentes, na ordem certa, com os textos literais da captura; só "Variáveis de configuração" grava de verdade; `{{config.Saudacao}}` substitui por "Olá" ponta a ponta.

**Resume-signal:** responder "aprovado" ou listar as diferenças encontradas — diferenças viram correção neste plano (02-31), antes de fechá-lo.

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-28*

## Self-Check: PASSED

- `apps/management-vite/src/pages/builder/configuration-sections.ts` — FOUND
- `apps/management-vite/src/pages/builder/panel-configuration-variables.tsx` — FOUND
- `apps/management-vite/src/pages/builder/panel-configuration.tsx` — FOUND (modified)
- `apps/management-vite/src/pages/builder/panel-block.css` — FOUND (modified)
- `apps/management-vite/src/pages/builder.tsx` — FOUND (modified)
- `apps/management-vite/tests/builder-painels.test.ts` — FOUND (modified)
- Commits `f805941f`, `4870d340`, `2499d09c`, `1ddcdb3d` — all present in `git log`
- `pnpm --filter @pipe/management-vite typecheck` — no errors (executed)
- `pnpm --filter @pipe/management-vite test` — 385/385 passing (executed)
- `pnpm --filter @pipe/management-vite lint` — no errors (executed)
- Verify greps (`Adicionar informações extras`, `Ações globais`, absence of `Permitir edição pelo brain`) — all passed (executed)

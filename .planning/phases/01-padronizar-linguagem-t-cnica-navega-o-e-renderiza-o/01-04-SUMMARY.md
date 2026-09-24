---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 04
status: complete
key-files:
  created:
    - tools/std/lib/csv.ts
    - tools/std/lib/map.ts
    - tools/std/lib/project.ts
    - tools/std/rename-symbols.ts
    - tools/std/move-files.ts
    - tools/std/rewrite-literals.ts
    - tools/std/engine.test.ts
    - tools/std/fixtures/mini/package.json
    - tools/std/fixtures/mini/map/core.csv
    - tools/std/fixtures/mini/packages/core/package.json
    - tools/std/fixtures/mini/packages/core/tsconfig.json
    - tools/std/fixtures/mini/packages/core/src/index.ts
    - tools/std/fixtures/mini/packages/core/src/erros.ts
    - tools/std/fixtures/mini/packages/core/src/metricas/index.ts
    - tools/std/fixtures/mini/apps/api/src/Caso.ts
    - tools/std/fixtures/mini/apps/api/src/contracts.ts
    - tools/std/fixtures/mini/apps/api/src/dinamico.ts
    - tools/std/fixtures/mini/apps/api/src/uso.ts
    - tools/std/fixtures/mini/apps/api/tests/uso.test.ts
    - tools/std/fixtures/mini/apps/api/vitest.config.ts
    - tools/std/fixtures/mini/apps/front/src/pagina.tsx
    - tools/std/fixtures/mini/apps/front/src/lib/ajuda.ts
    - tools/std/fixtures/mini/apps/front/tests/ajuda.test.ts
    - tools/std/fixtures/mini/apps/front/vite.config.ts
  modified:
    - package.json
    - pnpm-lock.yaml
commits:
  - 010fa6a feat(01-04): add symbol rename engine and shared map libraries
  - f0b8619 feat(01-04): add file move and technical literal rewrite engines
---

O plano entrega um motor determinístico, dirigido pelo mapa aprovado, para renomear símbolos, mover arquivos/diretórios e reescrever contratos técnicos sem alterar texto visível ao usuário.

## O que foi construído

- `ts-morph` 28.0.0 instalado com versão exata no workspace raiz.
- Parser e serializador CSV RFC4180 com LF, biblioteca do mapa de 14 colunas, filtros por escopo/kind/status/id e resolução de caminhos já aplicados.
- Projeto `ts-morph` multi-root com aliases gerados dos `package.json#exports` dos workspaces.
- `rename-symbols.ts` com rename semântico para `symbol`, `ts-prop` e `ts-local`, suporte a dry-run, status e ids, atualização do mapa e diagnóstico por row id.
- `move-files.ts` com `git mv` por argv, rename case-only em duas etapas, preservação do estilo dos specifiers e atualização de configs e manifests.
- `rewrite-literals.ts` limitado a posições técnicas conhecidas para endpoints, rotas, query params, filas/jobs/eventos/códigos, cookies/storage/métricas, scripts, títulos de teste, packages/subpaths, wire keys e literal unions.
- Mini-monorepo de fixture cobrindo imports estáticos e dinâmicos, re-exports, `import type`, `typeof import`, shorthand, estilos `.js`/`.ts`/extensionless, configs, case-only rename e reescritas tipadas.

## Desvios

- Nenhum desvio de escopo ou requisito funcional.
- No Windows, o root do projeto é canonicalizado com `fs.realpathSync.native` para neutralizar caminhos temporários 8.3 antes dos globs do `ts-morph`.
- O acesso aos enums de JSX usa `ts.JsxEmit`, pois `JsxEmit` não é exposto como named export pelo pacote CommonJS na execução direta com Node 24.

## Resultados de verificação

- `node --test tools/std/engine.test.ts`: 15 testes aprovados, 0 falhas.
- `pnpm typecheck`: 23 tarefas aprovadas, 23 totais.
- Pin `"ts-morph": "28.0.0"`: confirmado em `package.json`.
- Uso de `usePrefixAndSuffixTextForRename`: 0 ocorrências.
- Uso proibido de `.move()`/`moveToDirectory()` em `move-files.ts`: 0 ocorrências.
- `execFileSync('git', ['mv', ...])`: 3 chamadas (incluindo as duas etapas do rename case-only).
- `shell: true` em `tools/std/*.ts`: 0 ocorrências.
- `git diff --check`: aprovado; apenas avisos esperados de conversão LF/CRLF do ambiente Windows.

## Self-Check: PASSED

- Branch conferida: `cx/01-04`.
- Execução e gravações restritas ao worktree `C:/Users/anderson.linhares/pipe-wt/01-04`.
- Nenhum push, deploy, acesso SSH, alteração de banco ou operação destrutiva em containers foi executado.
- `.planning/STATE.md`, `.planning/ROADMAP.md` e `.planning/REQUIREMENTS.md` não foram alterados.

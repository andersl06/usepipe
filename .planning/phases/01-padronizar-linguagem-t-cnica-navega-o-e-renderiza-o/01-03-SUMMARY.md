---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: "01-03"
status: complete
key-files:
  created:
    - tools/std/route-match.ts
    - tools/std/route-match.test.ts
    - tools/std/ddl-snapshot.sh
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/ddl-before.sql
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/smoke-checklist.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/route-drift-allow.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/baseline-routes.json
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/baseline-route-consumers.csv
  modified: []
commits:
  - 9a912f24deea1137591d18deb55218cdebaeeec6
  - 7b105d060e60f7736fd7c53beda582fd0997b184
---

# Plano 01-03 — Resumo

Matcher de rotas/guards, baseline de DDL e checklist manual de smoke entregues como provas reproduzíveis para STD-03, STD-06 e STD-11.

## O que foi construído

- `route-match.ts` usa a AST do TypeScript para coletar os 207 endpoints Nest em todos os arquivos rastreados de `apps/api/src`, combinando prefixos de controller e decorators HTTP.
- O relatório de rotas preserva controller, handler, localização e todos os decorators de classe/método não estruturais; 8 rotas do baseline incluem `Escopos`.
- O matcher analisou 659 referências em fronts, workers, pacotes e testes, além de strings internas da API. Os 10 casos sem endpoint HTTP correspondente foram registrados em `route-drift-allow.csv` com resolução prevista para 01-18.
- A comparação de rotas traduz somente linhas `endpoint` e `symbol` em estado `applied|verified`; linhas apenas `approved` não alteram a expectativa. A remoção de guard gera diferença.
- `ddl-snapshot.sh` salva e confere o `drizzle-kit export` ordenado e também recusa alterações em `packages/db/drizzle` contra `limpeza`, sem comandos de geração ou escrita no banco.
- `ddl-before.sql` registra 103 tabelas do schema anterior aos renames.
- `smoke-checklist.md` contém 22 cenários manuais para callbacks, sessão/WebSocket, navegação e F5, isolamento de filtros por tenant/usuário, CRM, uploads, chave de fluxo, métricas, drain de filas e CSS.

## Desvios

- O primeiro `drizzle-kit export` encontrou o `dist` ignorado de `@pipe/core` ausente. Foi executado `pnpm --filter @pipe/core build` para restaurar o pré-requisito local; nenhum arquivo rastreado adicional foi alterado.
- A ação da Tarefa 2 sugeria um único commit agregado, mas a decisão do dono exige um commit após cada tarefa. Por isso o trabalho foi separado nos dois commits listados no frontmatter.

## Resultados de verificação

- `node --test tools/std/route-match.test.ts`: 5 testes aprovados, 0 falhas.
- Baseline `route-match --check`: 207 rotas, 659 referências, 10 drifts permitidos, saída 0.
- Critérios do matcher: 207 rotas (mínimo 200), 8 rotas com `Escopos` e header do allowlist exatamente `file,raw,reason,resolve_by`.
- `bash tools/std/ddl-snapshot.sh check`: `SQL unchanged`, saída 0.
- Critérios do DDL/checklist: 103 ocorrências de `CREATE TABLE`, 24 linhas de tabela Markdown, zero ocorrência de `generate|push` no script e presença de `callback`, `F5`, `tenant`, `drain` e `NEEDS VALIDATION`.
- `git diff --check`: aprovado.

## Self-Check: PASSED

Todos os artefatos declarados existem, os dois commits de tarefa estão no histórico, a branch permanece `cx/01-03` e o worktree estava limpo antes da criação deste resumo.

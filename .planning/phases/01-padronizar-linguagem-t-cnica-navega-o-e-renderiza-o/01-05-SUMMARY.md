---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 05
status: complete
key-files:
  created:
    - tools/std/inventory.ts
    - tools/std/inventory.test.ts
    - tools/std/lib/jsonb-reach.ts
    - tools/std/jsonb-reach.test.ts
    - tools/std/gate.sh
    - tools/std/gate.test.sh
    - tools/std/test-counts.ts
    - tools/std/test-counts.test.ts
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/baseline-gate.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/baseline-test-counts.json
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/baseline-js-specifiers.txt
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/gate-order.txt
  modified:
    - tools/std/ddl-snapshot.sh
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/baseline-route-consumers.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/baseline-scan.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/baseline-scan-summary.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/01-05-SUMMARY.md
commits:
  - 9b489f2 feat(01-05): add deterministic inventory extractor
  - b1ff4c8 feat(01-05): inventory extractor with jsonb type reach and route dependents
  - 01b4b4c feat(01-05): slice gate; baseline gate green
---

O plano entrega inventário determinístico com alcance JSONB e dependentes de rotas, mais um gate de fatia cuja baseline passou.

## O que foi construído

- Inventário por escopo para identificadores, caminhos, rotas, endpoints, literais, atributos `data-*`, comentários, CSS e contratos técnicos, com ids estáveis e saída CSV.
- Descoberta de rotas frontend aninhadas, incluindo a árvore `rotasDoContato` montada sob fluxo e roteador, rotas do App Router do CRM e dependentes classificados por arquivo e linha.
- Rastreamento transitivo dos tipos que chegam a colunas `jsonb` por `$type`, insert, update/upsert, cast/anotação de leitura e sinks conhecidos do motor de fluxo, outbox/auditoria/CRM.
- Integração do alcance JSONB ao inventário: propriedades e literais alcançados recebem `persisted=unknown`, notas `jsonb:<tabela>.<coluna>` e linhas inglesas recebem `new=KEEP`.
- Relatórios previstos pelo CLI: mapas, comentários por escopo, `front-route-dependents.csv`, `jsonb-reach.csv` e resumo do inventário; `--dry-run` somente imprime totais.
- Gate de 11 passos com limpeza de artefatos, install, typecheck, build, testes completos e isolados, comparação de contagens, DDL, rotas, varredura PT, specifiers e chaves JSONB.
- Parser de contagens para Vitest e Node 24, com renames somente `applied|verified`; testes adversariais cobrem contagem zero, nomes flaky semelhantes, caminhos Windows, limpeza idempotente e troca de léxico.

## Desvios

- A Tarefa 3 aguardou o plano 01-34; suas fixtures sintéticas e o teste de compatibilidade JSONB estão concluídos e incluídos na baseline.
- O build usa `pnpm turbo run build --filter=!@pipe/crm` devido ao EPERM de symlink do CRM no Windows, conforme `std/baseline.md`.
- `ddl-snapshot.sh` ignora somente diferenças CRLF/LF no diff: os SHA-256 normalizados do DDL anterior e do export atual coincidem.
- A primeira tentativa do gate usou o diretório temporário padrão fora do worktree; ele foi removido pelo trap. O gate foi corrigido para criar scratch dentro do worktree antes da execução final.
- A contagem de consumidores é aproximada por ocorrência lexical de token no repositório; dependentes de rotas continuam sendo levantados individualmente por arquivo e linha.

## Resultados de verificação

- `node --test tools/std/inventory.test.ts`: 7 testes aprovados, 0 falhas.
- `node --test tools/std/jsonb-reach.test.ts tools/std/inventory.test.ts`: 13 testes aprovados, 0 falhas.
- Dry-run completo: 18 escopos impressos; 179 endpoints; 157 rotas frontend; 513 linhas de alcance JSONB.
- Colunas obrigatórias com alcance não zero: `bloco.conteudo` 45, `execucaoFluxo.contexto` 101 e `logAuditoria.antes` 17.
- Os membros `entrada`, `conteudo`, `saida` e as propriedades de `Contexto` aparecem no alcance JSONB.
- O dry-run não alterou `std/map`.
- Critérios textuais: `front-route-dependents.csv` aparece no extrator e `literal-value|data-attr` aparece 8 vezes.
- `bash tools/std/gate.sh baseline`: exit 0, 11 linhas `PASS`; `grep -c FAIL` = 0. A suíte passou com 21/21 tarefas, inclusive os 6 testes JSONB do plano 01-34; os três testes API conhecidos também passaram isolados.
- `baseline-test-counts.json`: 13 workspaces; API 653, Desk 27, Gestão 237, CRM 34; nenhuma falha. `@pipe/ui` usa verificação própria sem contagem numérica.
- `baseline-js-specifiers.txt`: 1 correspondência real, o import JSON em `packages/core/src/fluxo/editor.teste.ts`. `gate-order.txt` começa com `baseline`; varredura: `Lexicon: none`, `Unclassified: 36590`.
- `node --test tools/std/test-counts.test.ts`: 5 testes aprovados. `bash tools/std/gate.test.sh`: limpeza repetida e cenários adversariais de léxico aprovados. `bash tools/std/ddl-snapshot.sh check`, ESLint e `git diff --check` aprovados.

## Self-Check: FAILED

- Branch conferida: `cx/01-05`.
- A execução final ficou restrita ao worktree; a primeira tentativa usou scratch temporário fora dele, em desacordo com D-40.
- Nenhum push, deploy, SSH ou operação destrutiva nos containers compartilhados foi executado; a suíte usou somente os tenants temporários criados e limpos pelos próprios testes.
- `.planning/STATE.md`, `.planning/ROADMAP.md` e `.planning/REQUIREMENTS.md` não foram alterados.
- Três tarefas concluídas, sem bloqueio. Diff completo contra `66cddcc0d7e0a8f607ad39d6bbd675aa51c53030` revisado antes deste resumo.

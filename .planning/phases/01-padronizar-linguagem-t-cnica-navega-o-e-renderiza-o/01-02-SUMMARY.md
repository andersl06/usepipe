---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 01-02
status: complete
key-files:
  created:
    - tools/std/pt-detect.ts
    - tools/std/pt-lexicon.txt
    - tools/std/en-words.txt
    - tools/std/pt-detect.test.ts
    - tools/std/scan-pt.ts
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/exceptions.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/baseline-scan.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/baseline-scan-summary.md
  modified: []
commits:
  - efe88ac
  - 3a7081e
---

# Plano 01-02 — Detector PT e scanner STD-11

Detector determinístico, scanner técnico classificável, exceções A/B/C e baseline reproduzível foram entregues.

## O que foi construído

- Detector compartilhado de tokens e comentários PT, com léxicos PT/EN, léxico extra seguro e fingerprint SHA-1 estável.
- CLI STD-11 sobre arquivos rastreados, com análise AST de TypeScript/JavaScript e cobertura de caminhos, identificadores, posições técnicas, SQL, CSS, comentários, literais `as const`/uniões e atributos `data-*`.
- Classificação pela primeira exceção correspondente, incluindo compatibilidade com caminhos de inventário após renames aplicados.
- Allowlist auditável com 79 nomes de variáveis de ambiente, exceções de SQL, escopos persistidos e exclusões documentadas.
- Baseline com 36.790 achados, dos quais 36.249 ainda não classificados, e `Lexicon: none`.

## Desvios

- Os commits foram separados por tarefa, conforme a instrução do dono, em vez do commit único sugerido no corpo do plano.
- `a` foi incluído entre as palavras funcionais do comentário para que o caso obrigatório “Busca a conversa quando...” atinja o limiar especificado de duas palavras.

## Resultados da verificação

- `node --test tools/std/pt-detect.test.ts`: 9 testes passaram.
- `node tools/std/scan-pt.ts --out ... --summary ...`: exit 0; `Unclassified: 36249`; `Lexicon: none`.
- Execução com `--map` apontando para diretório inexistente: exit 0 e `Lexicon: none`.
- `node tools/std/scan-pt.ts --help`: lista `--lexicon-file` e `--write-lexicon`.
- `pnpm exec eslint tools/std/pt-detect.ts tools/std/scan-pt.ts tools/std/pt-detect.test.ts`: exit 0.
- Critérios estruturais: 140 entradas PT, 514 palavras EN, 79 exceções D-06/D-36, headers CSV corretos, zero achado de `referencias-blip/`, e kinds `literal-value`/`data-attr` presentes.

## Self-Check: PASSED

Todos os artefatos existem, os dois commits de tarefa estão no branch `cx/01-02`, as verificações passaram e nenhuma alteração fora do plano foi incluída.

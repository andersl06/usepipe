---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 06
status: complete
key-files:
  created:
    - tools/std/codex-run.sh
    - tools/std/codex-prompt.ts
    - tools/std/schemas/map-rows.schema.json
    - tools/std/schemas/comment-triage.schema.json
    - tools/std/schemas/glossary-terms.schema.json
    - tools/std/schemas/nav-classification.schema.json
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/prompts/TEMPLATE-map.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/prompts/TEMPLATE-persisted.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/prompts/TEMPLATE-comments.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/prompts/TEMPLATE-glossary.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/prompts/TEMPLATE-nav.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/codex-log-1-smoke.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/codex-log-2-smoke.csv
  modified: []
commits:
  - 0891101 feat(01-06): add safe Codex proposal tooling
---

O plano entrega uma esteira segura e reproduzível para obter propostas semânticas estruturadas das duas contas Codex sem expor arquivos sensíveis nem permitir edição do repositório.

## O que foi construído

- Wrapper `codex-run.sh` com seleção explícita das contas 1 e 2, modelo `gpt-5.6-sol`, esforço `medium`, sandbox `read-only`, execução efêmera e schema de saída obrigatório.
- Isolamento por worktree descartável no `HEAD`, remoção prévia de `.env*`, chaves e certificados rastreados, comparação do estado rastreado antes/depois e preservação do worktree caso o agente o altere.
- Logs separados por conta e job com timestamp, commit, prompt, saída e exit code, evitando concorrência entre planos que compartilham uma conta.
- Chunker CSV com filtros por campo/status, tamanho configurável, resolução de `declared_at` e `file` pelo mapa aplicado e prompts numerados por job.
- Quatro schemas JSON estritos para mapa, triagem de comentários, glossário e navegação.
- Cinco templates em inglês com proibição explícita de edição e acesso a segredos, além das regras semânticas D-01/D-02/D-05/D-06/D-09..D-11/D-16/D-17/D-26..D-40 aplicáveis.

## Desvios

- Nenhum desvio funcional ou de escopo.
- Os dois logs de smoke foram incluídos no commit da tarefa porque são artefatos exigidos pelos critérios de aceitação, embora não apareçam na lista inicial de `files_modified`.

## Resultados de verificação

- Comando `<verify>` do plano: aprovado (`gpt-5.6-sol` = 1 ocorrência, `-s read-only` = 1 ocorrência e os quatro schemas parseiam como JSON).
- Critérios do wrapper: linha fixa de execução = 1; modos de sandbox proibidos = 0; `worktree add --detach` = 1; guards `untracked-files=no` = 2; restore/clean/checkout automático = 0.
- Schemas: todos os objetos tipados como `object` têm `additionalProperties: false`; todas as propriedades são obrigatórias.
- Templates: 5/5 contêm a cláusula de proteção e 5/5 contêm `Do not modify any file`.
- Smoke conta 1: `{"rows":[]}`, log único com exit 0 e worktree removido.
- Smoke conta 2: `{"rows":[]}`, log único com exit 0 e worktree removido.
- Job inválido `Bad Job`: exit 2 antes de chamar Codex.
- `node --check tools/std/codex-prompt.ts`: aprovado.
- `bash -n tools/std/codex-run.sh`: aprovado.
- `pnpm typecheck`: 23 tarefas aprovadas, 23 totais.
- `git diff --cached --check`: aprovado antes do commit; apenas avisos esperados de conversão LF/CRLF do ambiente Windows.

## Self-Check: PASSED

- Branch conferida: `cx/01-06`.
- Execução e gravações restritas ao worktree `C:/Users/anderson.linhares/pipe-wt/01-06`; o scratch local dos testes foi removido.
- Nenhum push, deploy, SSH, alteração de banco ou operação em containers foi executado.
- `.planning/STATE.md`, `.planning/ROADMAP.md` e `.planning/REQUIREMENTS.md` não foram alterados.

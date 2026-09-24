---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 05
status: partial
key-files:
  created:
    - tools/std/inventory.ts
    - tools/std/inventory.test.ts
    - tools/std/lib/jsonb-reach.ts
    - tools/std/jsonb-reach.test.ts
  modified: []
commits:
  - 9b489f2 feat(01-05): add deterministic inventory extractor
  - b1ff4c8 feat(01-05): inventory extractor with jsonb type reach and route dependents
---

O plano entrega o extrator determinístico de inventário com dependentes de rotas e alcance transitivo de tipos gravados em `jsonb`; o gate de fatia permanece pendente do plano 01-34.

## O que foi construído

- Inventário por escopo para identificadores, caminhos, rotas, endpoints, literais, atributos `data-*`, comentários, CSS e contratos técnicos, com ids estáveis e saída CSV.
- Descoberta de rotas frontend aninhadas, incluindo a árvore `rotasDoContato` montada sob fluxo e roteador, rotas do App Router do CRM e dependentes classificados por arquivo e linha.
- Rastreamento transitivo dos tipos que chegam a colunas `jsonb` por `$type`, insert, update/upsert, cast/anotação de leitura e sinks conhecidos do motor de fluxo, outbox/auditoria/CRM.
- Integração do alcance JSONB ao inventário: propriedades e literais alcançados recebem `persisted=unknown`, notas `jsonb:<tabela>.<coluna>` e linhas inglesas recebem `new=KEEP`.
- Relatórios previstos pelo CLI: mapas, comentários por escopo, `front-route-dependents.csv`, `jsonb-reach.csv` e resumo do inventário; `--dry-run` somente imprime totais.

## Desvios

- A Task 3 não foi executada por decisão explícita deste run: `gate.sh`, `test-counts.ts` e os baselines dependem das fixtures, manifest e contagens finais do plano 01-34, ainda em andamento.
- A contagem de consumidores é aproximada por ocorrência lexical de token no repositório; dependentes de rotas continuam sendo levantados individualmente por arquivo e linha.

## Resultados de verificação

- `node --test tools/std/inventory.test.ts`: 7 testes aprovados, 0 falhas.
- `node --test tools/std/jsonb-reach.test.ts tools/std/inventory.test.ts`: 13 testes aprovados, 0 falhas.
- Dry-run completo: 18 escopos impressos; 179 endpoints; 157 rotas frontend; 513 linhas de alcance JSONB.
- Colunas obrigatórias com alcance não zero: `bloco.conteudo` 45, `execucaoFluxo.contexto` 101 e `logAuditoria.antes` 17.
- Os membros `entrada`, `conteudo`, `saida` e as propriedades de `Contexto` aparecem no alcance JSONB.
- O dry-run não alterou `std/map`.
- Critérios textuais: `front-route-dependents.csv` aparece no extrator e `literal-value|data-attr` aparece 8 vezes.
- Task 3: pendente do plano 01-34; nenhuma verificação do gate baseline foi executada.

## Self-Check: PASSED

- Branch conferida: `cx/01-05`.
- Execução e gravações restritas ao worktree `C:/Users/anderson.linhares/pipe-wt/01-05`.
- Nenhum push, deploy, SSH, escrita em banco ou operação destrutiva nos containers compartilhados foi executado.
- `.planning/STATE.md`, `.planning/ROADMAP.md` e `.planning/REQUIREMENTS.md` não foram alterados.
- Tasks 1 e 2 concluídas e verificadas; status parcial exclusivamente pela Task 3 pendente do plano 01-34.

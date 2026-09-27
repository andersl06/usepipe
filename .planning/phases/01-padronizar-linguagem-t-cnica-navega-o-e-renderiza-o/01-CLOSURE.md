# Phase 1 — O que falta para fechar

**Levantado:** 2026-09-27
**Base:** `git log` (branch `limpeza`), `std/reports/apply-all-gate.md`, `std/reports/apply-all-scan-summary.md`, `std/reports/comments-pending-*.csv`, D-49/D-50/D-51 do `01-CONTEXT.md`

Este arquivo existe porque o D-49 colapsou 18 planos de fatia num único passo de aplicação (`std-apply-all-end`) sem gerar SUMMARY por plano, e o ROADMAP ficou com 25 caixas abertas que não correspondem ao estado real. Aqui fica o mapa plano → estado com evidência, e o trabalho que sobra.

## Estado por plano

| Plano | Estado | Evidência |
|---|---|---|
| 01-01…01-12, 01-34…01-36, 01-38 | feito | SUMMARY próprio |
| 01-13…01-14, 01-16…01-19, 01-21, 01-23, 01-26, 01-28…01-30 | feito, absorvido pelo apply-all (D-49) | tag `std-apply-all-end`, commit `d00dba0`, gate 11/11 em `std/reports/apply-all-gate.md` |
| 01-22, 01-24 (navegação) | feito | merge `a690973` em `limpeza` |
| 01-25 (CSS) | feito | `std/reports/css-apply.md`, ferramenta `tools/std/rename-css.ts` |
| 01-32 (portão 3, dono) | feito | D-50, merge `907803b` |
| 01-33 (virada na VPS) | feito | D-51, commit `49bf298`; tag `std-cutover-end` nunca foi criada |
| **01-15, 01-20, 01-27, 01-37, 01-40** | **aberto** — confirmação de comentários | `comments-pending-api.csv` (150), `-fronts.csv` (184), `-packages.csv` (14): linhas de triagem que não casaram no arquivo ("not-found: 0/2 matching comments") |
| **01-31** | **aberto** — varredura residual parcial | 6 commits de varredura em `limpeza` (`8cc8d1a`, `6dd2b9e`, `49d4a5a`, `b804632`, `26fcfab`, `bcb6231`), mas a classificação do STD-11 não fechou |
| **01-39** | **aberto** — identificadores de infra | `infra/compose/bootstrap.sh` (295 achados), `docker-compose.prod.yml` (183), `observability/alertas.yml` (72), `build-images.sh` (44) |
| **01-41** | **obsoleto como escrito** | pressupõe `std/english-rename` não mergeado e as tags `std-slice-0-end`…`std-slice-5-end` + `std-cutover-end`; o merge já ocorreu (`907803b`) e só existem 3 tags no repositório |

## O portão que falta: STD-11

O critério do gate que roda hoje (`tools/std/gate.sh`, passo 09 `pt-scan`) é **tendência**, não zero: ele falha se o número de achados sem classificação **subir** (`gate.sh:95-96`). Por isso o apply-all passou 11/11 com 26.711 achados. O requisito STD-11 é mais estrito:

> "Toda ocorrência restante em português é classificada como (A) texto de produto/localização, (B) contrato persistido explicitamente adiado, ou (C) exceção documentada — a fase não é considerada concluída enquanto existir ocorrência técnica não classificada"

Estado de `std/reports/apply-all-scan-summary.md`: total 26.711, **sem classificação 25.741** (A=0, B=919, C=51).

### Os baldes, por natureza do trabalho

| Balde | Achados | Caminho de fechamento |
|---|---:|---|
| `sql-name` | 4.158 | classificação B em massa: nomes persistidos, ficam pelo D-08/D-40 — uma linha de exceção por padrão, não por ocorrência |
| `identifier` | 13.556 em **747 arquivos** | renomear: são identificadores técnicos sem linha no mapa aprovado (`escopos`, `requisicao`, `atorDe` em `apps/api/src/authentication.ts`). Palavras mais frequentes: `texto` (439), `campo` (317), `codigo` (290), `resultado` (223), `versao` (200), `etiqueta` (196). Piores arquivos: `infra/compose/bootstrap.sh` (275, ver 01-39), `apps/api/src/domain/management/registrations.ts` (247), `apps/crm/seed/seed-crm.ts` (186) |
| `css-class` + `css-custom-property` | 2.717 | classificação: o `css-apply.md` registra que os nomes compostos parciais ficaram; falta a linha de exceção que diz isso |
| `string-literal` + `literal-value` | 4.273 | separar texto de produto (classificação A) de literal técnico (renomear) |
| `comment` | 1.643 | texto de produto em português é permitido pelo D-16; falta a linha de exceção e resolver as 348 pendências de triagem |
| `path` | 336 | renomear ou classificar (docs e exemplos) |

### Armadilha do gate

`std/exceptions.csv` alimenta o hash de léxico do gate. Mudar o arquivo fora do contexto de re-baseline faz o gate parar com `lexicon changed outside gate 2` (`tools/std/gate.sh:93-94`): o passo `pt-scan` só aceita léxico novo com rótulo `baseline` ou `slice-0`. Portanto a classificação em massa precisa rodar junto de um re-baseline explícito, não como edição solta do CSV.

## Passo que só o dono faz

Cadastrar a URL de retorno nova no console do Google (D-51; e `http://localhost:3010/v1/auth/google/callback` do D-50). Sem isso o login com Google não funciona nem local nem na VPS. É o mesmo cadastro que o D-26 da Phase 01.1 pede para o smoke (`https://login.<base sslip>/v1/auth/google/callback`) — dá para resolver os dois de uma vez.

## Ordem sugerida

1. Passo do dono no console do Google (minutos; desbloqueia login real e o smoke da 01.1).
2. Classificação em massa + re-baseline: `sql-name`, CSS composto, comentário de produto, texto de produto. Fecha ~11 mil achados por regra, não por ocorrência.
3. Rename dos identificadores restantes por escopo (01-31 + 01-39), com a ferramenta de rename já existente e o gate a cada escopo. É o volume: 747 arquivos.
4. Resolver as 348 pendências de `comments-pending-*.csv` (aplicar ou descartar com motivo) — fecha 01-15, 01-20, 01-27, 01-37, 01-40.
5. Decidir o 01-41: descartar (o histórico já está em `limpeza`) ou reduzir a criar a tag `std-cutover-end` apontando para `49bf298`.
6. `01-VALIDATION.md` fica `status: draft` / `wave_0_complete: false`; gerar o VERIFICATION da fase e marcar STD-11 em `REQUIREMENTS.md`.

## Limpeza pendente (cosmética)

13 branches `cx/*` e as branches `discarded/*`, `hotfix/deploy-2026-09-25` seguem no repositório.

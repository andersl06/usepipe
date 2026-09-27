---
phase: 02-fechar-o-builder
plan: 22
subsystem: builder
tags: [regressao, verificacao-visual, portao-final]
requirements-completed: []
key-files:
  created:
    - .planning/phases/02-fechar-o-builder/ref/GATE-FINAL.md
    - .planning/phases/02-fechar-o-builder/ref/VERIFICACAO-VISUAL.md
    - .planning/phases/02-fechar-o-builder/ref/medir-tela.js
    - packages/db/drizzle/0050_rls_subconsulta_acoes_plataforma.sql
  modified:
    - packages/core/src/flow/manager.ts
    - apps/api/src/domain/flow.ts
    - apps/api/tests/flow-functions.test.ts
    - apps/management-vite/src/pages/builder/conteudo.ts
    - apps/management-vite/src/pages/builder/panel-block.css
    - .planning/phases/02-fechar-o-builder/ref/LACUNAS-APROVADAS.md
duration: ~50 min (Tasks 1-2, Opus) + fechamento pelo orquestrador
completed: 2026-09-27
---

# Plano 02-22: regressão final, verificação visual e portão final do dono

Regressão completa verde, comparação visual lado a lado com a referência medida, e portão final aprovado pelo dono em 2026-09-27. Nenhum requisito BUILDER-01..05 está fechado por inteiro: todos têm entrega e capturas pendentes; BUILDER-05 segue aberto até a captura C-42.

## Tasks

| Task | O que fez | Commit |
|---|---|---|
| 1 | Gates automáticos de regressão; correção de RLS (migração 0050) e de lint da própria fase | `00aa8e2f` |
| 2 | Verificação visual lado a lado (`medir-tela.js`, Chrome headless) e correção dos painéis laterais pintados com o tema claro | `d5fad5e4` |
| 3 | Portão final do dono: resposta "aprovado", registrada em `ref/GATE-FINAL.md` | commit de fechamento deste plano |

## Verificação executada (segunda passada, a que vale)

- `turbo run build --filter=!@pipe/crm`: 14/14. O `@pipe/crm` compila e falha só no EPERM de symlink do Windows (exceção aceita na Fase 1).
- `turbo run typecheck`: 23/23.
- Migrações 0047–0050 aplicadas no Postgres local.
- `turbo run test --concurrency=1`: 21/21 tarefas, **1.795 testes**, 0 falhas (api 708, core 470, management-vite 306, ai 75, workers 42, authentication 41, crm 34, desk-vite 33, db 31, storage 24, bridge 17, realtime 14). Tokens do `@pipe/ui` em paridade (91).
- Teste instável `flow-content` (figurinha): 4 execuções verdes, inclusive em paralelo no mesmo Postgres; não reproduziu.
- `conferir-catalogo.mjs --all`: 7 de 8 slots saem 0; `acoes-plataforma` sai 1 só por TrackContactsJourney (excedente aprovado). Carrossel e Solicitar ligação não são conferidos pelo verificador (sem MIME) e vão para o plano de lacunas.
- Buscas `#4a5d23|--bl-verde`, `dangerouslySetInnerHTML` e `cookie|authorization|bearer`: vazias na pasta do Builder.
- Após o merge na `limpeza` pelo orquestrador: `@pipe/db` 31/31 e `@pipe/management-vite` verdes.

## Desvios (Regra 1)

1. **RLS das tabelas do 02-20:** `gravar_memoria`, `lista_distribuicao` e `lista_distribuicao_contato` tinham políticas com `current_setting()` avaliado por linha. Como a 0049 já estava aplicada, a correção veio numa migração nova, `0050_rls_subconsulta_acoes_plataforma.sql`. Só o `turbo run test` completo (teste `packages/db/tests/rls.test.ts`) pegou isso; as suítes por pacote do 02-20 não.
2. **Lint da própria fase:** `prefer-const` em `manager.ts:156` e `flow.ts:185`, `no-explicit-any` em `flow-functions.test.ts:21`, `no-empty` em `conteudo.ts:185`.
3. **Painéis laterais (Filas, Configuração/Versões) com tema claro** por ficarem fora do contêiner escuro do editor: corrigido em `panel-block.css`.

## Verificação visual

11 telas/estados `VISUALLY VERIFIED` (canvas, nó, hover, Início, nó selecionado, etiquetas, setas `#666` 2 px, "Salvo", painel do bloco 460 px, bolha de conteúdo, condições de saída). As diferenças medidas foram aprovadas pelo dono para o plano de lacunas (ver `ref/LACUNAS-APROVADAS.md`): fonte (Nunito Sans em todo o Builder), menu "Adicionar conteúdo" em barra, pílula, alturas de botões, zoom, "Novo bloco", menu de ferramentas, tabela de Versões. Capturas pendentes: C-18, C-37/C-45, C-38, C-39, C-40, C-41, C-42, C-44, C-46. O site ao vivo da Blip não foi acessado.

## Situação dos requisitos

Detalhe em `ref/GATE-FINAL.md` §3. Resumo: BUILDER-01 (16/18 conteúdos, 16/17 ações), BUILDER-02, BUILDER-03 e BUILDER-04 entregues com capturas pendentes; D-14 é simulação local por decisão do dono; **BUILDER-05 aberto** (validação com o fluxo real AUVP Capital bloqueada por C-42). Por isso `requirements-completed` fica vazio.

## Próximo passo

`/gsd:plan-phase 2 --gaps` a partir de `ref/LACUNAS-APROVADAS.md`.

## Self-Check: PASSED

Arquivos citados existem (`GATE-FINAL.md` com a linha "Aprovação final do dono:", `VERIFICACAO-VISUAL.md`, `medir-tela.js`, migração 0050); commits `00aa8e2f` e `d5fad5e4` estão na `limpeza` (merge `def4d048`).

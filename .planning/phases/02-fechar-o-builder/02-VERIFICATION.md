---
phase: 02-fechar-o-builder
verified: 2026-09-27T15:10:00Z
status: gaps_found
score: 3/5 critérios de sucesso verificados (1 parcial, 1 incerto por captura pendente)
has_blocking_gaps: false
overrides_applied: 0
gaps:
  - truth: "SC1: Atendente pode criar bloco de qualquer tipo de conteúdo/ação previsto"
    status: partial
    severity: minor
    reason: "16 de 18 conteúdos e 16 de 17 ações do catálogo aprovado têm editor e motor. Carrossel, Solicitar ligação e TrackContactsJourney (EXCEDE CAPACIDADE) não existem em nenhum dos dois lados; conferir-catalogo.mjs --all sai 1 só por TrackContactsJourney (o verificador não confere itens sem MIME, por isso Carrossel e Solicitar ligação não aparecem). Já em LACUNAS-APROVADAS.md, 'Excedentes do portão'."
    artifacts:
      - path: "packages/core/src/flow/editor.ts"
        issue: "CONTEUDOS_SUPORTADOS sem carrossel nem solicitar ligação"
      - path: "packages/core/src/flow/actions.ts"
        issue: "ACTIONS_OF_MOTOR sem TrackContactsJourney"
      - path: "apps/management-vite/src/pages/builder/actions-of-block.ts"
        issue: "CATALOG_OF_ACTIONS sem TrackContactsJourney"
    missing:
      - "Carrossel (C-09) e Solicitar ligação (C-13/C-20, infra de voz) no editor, motor e canais"
      - "TrackContactsJourney no motor e na tela"
  - truth: "BUILDER-04: ícone user-engaged no Builder"
    status: partial
    severity: minor
    reason: "O ícone userEngaged existe em packages/ui/src/icones.tsx (02-08), mas não é usado em nenhum lugar do repositório (ÓRFÃO). O inventário visual prevê o uso no bloco de Atendimento humano do canvas e no card de conteúdo do tipo Atendimento. GATE-FINAL.md conta o item como entregue. NÃO está em LACUNAS-APROVADAS.md."
    artifacts:
      - path: "packages/ui/src/icones.tsx"
        issue: "userEngaged definido (linha 59), zero referências fora da definição"
    missing:
      - "Usar Icone nome='userEngaged' no bloco/card de Atendimento humano, conforme ref/inventario-visual.md linha 63"
  - truth: "SC3 / 02-12: criar a pesquisa de satisfação a partir do bloco de atendimento humano do mesmo jeito que a referência"
    status: partial
    severity: minor
    reason: "A pesquisa é criada por Novo bloco → Pesquisa e depois ligada; não existe criação em um clique a partir do seletor da saída de atendimento. A aba Conteúdo não reconhece o MIME da pesquisa. Timeout do bloco (C-31) não implementado. Os dois primeiros itens já estão em LACUNAS-APROVADAS.md ('Resíduos'); C-31 está em CAPTURAS-PENDENTES.md."
    artifacts:
      - path: "apps/management-vite/src/pages/builder/panel-outputs.tsx"
        issue: "sem ação que chame newSurveyBlock a partir da saída de atendimento (o único chamador é editor.tsx:146)"
    missing:
      - "Criar pesquisa em um clique a partir da saída de atendimento"
      - "Aba Conteúdo reconhecer application/vnd.lime.satisfaction-survey+json"
  - truth: "Resíduos aprovados (não afetam o objetivo): visual, sandbox, canvas, painel de Teste"
    status: partial
    severity: minor
    reason: "Diferenças visuais medidas (fonte Nunito × IBM Plex, pílula, rodapé, '+ Adicionar', zoom em var(--moss) em builder.css:93 e :331, menu de adicionar conteúdo, Novo bloco, tabela de Versões), sandbox isolated-vm dentro do processo da API, fuso UTC do script, limites do Jint, DNS em confirmarUrlSegura, interações do canvas (trava de edição, reconectar seta, seleção múltipla, reordenar, Alt+Enter, Ctrl+Y). Todos em LACUNAS-APROVADAS.md. O botão desabilitado 'Conversa — em breve' (builder.tsx:469) e o item 'salvar rascunho antes do primeiro teste' estão só na coluna de lacunas de GATE-FINAL.md §3, não em LACUNAS-APROVADAS.md."
    artifacts:
      - path: "apps/management-vite/src/pages/builder.tsx"
        issue: "botão 'Conversa — em breve' redundante (linha 469)"
      - path: "apps/management-vite/src/pages/builder.css"
        issue: "zoom ainda em var(--moss)"
    missing:
      - "Levar 'Conversa — em breve' e 'salvar rascunho antes do teste' para LACUNAS-APROVADAS.md, para não se perderem"
deferred: []
human_verification:
  - test: "Validar as setas com o fluxo real AUVP Capital (C-42): importar o export {flow, globalActions} e comparar arestasDe() com o print do canvas da Blip, preenchendo ref/validacao-setas.md"
    expected: "Mesma quantidade, origem, destino e ausência/presença de setas; qualquer divergência vira teste de regressão antes do fix"
    why_human: "Depende de captura do dono (export de produção + print), inexistente no repositório"
  - test: "Capturas pendentes C-NN que condicionam acabamento (C-04..C-08, C-10..C-12, C-18, C-24..C-41, C-44..C-46)"
    expected: "Linhas NEEDS VALIDATION de ref/VERIFICACAO-VISUAL.md passam a VISUALLY VERIFIED ou viram item de lacuna"
    why_human: "Exigem acesso do dono ao Portal Blip"
---

# Phase 2: Fechar o Builder — Relatório de Verificação

**Objetivo da fase:** O Builder deixa de ser a maior lacuna conhecida do produto — atendente consegue montar e publicar um fluxo completo sem esbarrar em tipo de bloco, ligação ou pesquisa de satisfação sem editor ("paridade funcional suficiente para publicar fluxos completos sem depender de decisões pendentes no motor").
**Verificado em:** 2026-09-27
**Status:** gaps_found (todas as lacunas são `minor`; `has_blocking_gaps: false`)
**Re-verificação:** Não — verificação inicial

## Leitura do resultado

O objetivo, lido como "paridade funcional **suficiente**", está atingido: há editor, motor e canal para 16 dos 18 conteúdos e 16 das 17 ações do catálogo aprovado, busca de variável/função/destino, pesquisa de satisfação nativa com persistência e paleta de tags, Versões com exportação, painel de Teste sobre o motor real e setas caracterizadas por teste. O que falta foi medido e aceito pelo dono no portão final (2026-09-27, `ref/GATE-FINAL.md`) e está, com as exceções apontadas abaixo, em `ref/LACUNAS-APROVADAS.md`. Nenhum requisito BUILDER-0x está 100% fechado, como o próprio portão declara.

O status é `gaps_found` porque o critério 1 diz literalmente "qualquer tipo previsto" e três itens previstos não existem. Nenhuma lacuna impede publicar um fluxo completo, por isso todas são `minor`.

Decisões do dono respeitadas (não contadas como lacunas): D-14, painel de Teste como simulação local (linha datada de 2026-09-27 em `ref/CLASSIFICACAO-PORTAO.md`); D-15, Filas como atalho; D-33, ícones próprios do Pipe; AgenteDeIA fora do escopo (`bloqueado`).

Plano 02-13: a branch `discarded/02-13-haiku-wrong-base` existe e **não** é ancestral de `limpeza` (`git merge-base --is-ancestor` → NOT_MERGED). O 02-13 mesclado são os commits 512c13f2, 99a6a435, ec17bd51 e 72a4dd22 (reexecução com o Sonnet).

## Goal Achievement

### Critérios de sucesso do ROADMAP

| # | Critério | Status | Evidência |
|---|---|---|---|
| 1 | Criar bloco de qualquer tipo de conteúdo/ação previsto | ✗ PARCIAL (minor, aceito pelo dono) | `CONTEUDOS_SUPORTADOS` (`packages/core/src/flow/editor.ts:130`) com mídia, chatstate, input, location, web-link, select, satisfaction-survey e os envelopes `vnd.pipe.http-content`/`dynamic-content`; `ACTIONS_OF_MOTOR` (`actions.ts:458`) com 21 ações, incluindo ExecuteScript/V2, ExecuteTemplate, ExecuteBlipFunction, SendMessageFromHttp, MergeContact e as 5 de plataforma. `conferir-catalogo.mjs --slot` passa em 7 de 8 slots; `--all` sai 1 só por TrackContactsJourney. Carrossel e Solicitar ligação ausentes (grep sem resultado em `pages/builder` e `core/src/flow`); o verificador não os acusa porque ignora itens sem MIME |
| 2 | Buscar variável e função da biblioteca, e selecionar destino por pesquisa | ✓ VERIFICADO | `DestinationPicker` usado 3× em `panel-outputs.tsx` (148, 251, 277), com o filtro `filterDestinations` de `variables.ts`; `filterFlowFunctions` usa `normalizar`; `FlowFunctionsPanel` montado em `panel-configuration.tsx:93` e `FlowFunctionInsertPicker` em `panel-actions.tsx:36`; CRUD REST `v1/management/flow-functions` (GET/POST/PUT/DELETE) mapeado; `filterVariables` em `panel-variables.tsx:42` |
| 3 | Configurar pesquisa de satisfação e usar a paleta de tags completa nas saídas de atendimento humano | ✓ VERIFICADO (com resíduos minor) | tabela `pesquisa_satisfacao_resposta` com checks de nota 1-5 e de estado (`conversations.ts:554`); `recordSatisfactionAnswer` injetado em `flow.ts:408`; endpoint `GET v1/management/satisfaction-surveys/responses`; `newSurveyBlock` (`model.ts:348`) usado no editor; filtro "Exibir apenas blocos de pesquisa de satisfação" (`panel-outputs.tsx:248`); `input.content@tags`/`@sequentialId` na biblioteca de variáveis; paleta sem azul (`tags-of-block.ts`, `LEGACY_BLUES`). Faltam a criação em um clique a partir da saída de atendimento e o MIME na aba Conteúdo (LACUNAS-APROVADAS) |
| 4 | Painéis de Filas e de Teste com paridade funcional, copiar/colar e exportar versão antiga | ✓ VERIFICADO (com resíduo minor) | Versões: `listVersions`/`loadVersion` em `builder-gravar.ts`, `exportText` no painel de Configuração, rotas `GET :id/builder/versions[/:version]` e `restore`, teste de 404 para outro tenant (`builder-by-flow.test.ts:523`). Teste: `runTest` → `POST .../builder/test-runs`; `builder-test-run.ts` roda `processInbound` com `PROVEDOR_PADRAO` e os mesmos serviços de script, função e conteúdo dinâmico da produção. Copiar/colar/duplicar com testes (`builder-editor.test.ts:386+`). O ícone `userEngaged` está definido mas órfão (lacuna nova) |
| 5 | Setas representam toda ligação salva, com teste de `arestasDe()` | ? INCERTO (`unverifiable_runtime`: depende da captura C-42) | `arestasDe()` (`model.ts:468`) lê `$conditionOutputs`, exclui `$isDeskDefaultOutput` e destino inexistente e remove duplicatas; 9 testes de caracterização mais o caso atendimento → pesquisa (`builder-editor.test.ts:186-335`). `ref/validacao-setas.md` registra o AUVP Capital como NEEDS VALIDATION: sem export nem print, a comparação com um fluxo real não foi feita. O próprio dono mantém BUILDER-05 aberto até C-42 |

**Pontuação:** 3/5 verificados, 1 parcial (minor), 1 incerto (humano)

### Must-haves dos PLANs (resumo por plano)

| Plano | Resultado | Observação |
|---|---|---|
| 02-01..02-04 (inventários) | ✓ | os cinco artefatos existem com os marcadores exigidos (`## Capturas pendentes (D-03)`, `## Biblioteca de funções (D-22)`, `## 5. Proposta de persistência (D-08.5)`, `## Relações que geram seta (D-29.2)`, tabela azul→token) |
| 02-05 ProcessHttp | ✓ | testes `$enteringCustomActions` em `manager.test.ts:138,190`; `let idProvedorUsado = Boolean(retomada)` em `flow.ts:657`; `recoverStuckProcessHttp` consumido por `consumeSweepProcessHttp`/`scheduleSweepProcessHttp` (`queues.ts`), ligados em `servidor.ts:123-124` |
| 02-06 setas/copiar-colar | ✓ | ver critérios 4 e 5 |
| 02-07 portão | ✓ | REFERENCIA-CONGELADA (`**Congelado em:**`), CAPTURAS-PENDENTES, CLASSIFICACAO-PORTAO (aprovada em 2026-09-26), `catalogo-aprovado.json` e `conferir-catalogo.mjs --slot` |
| 02-08 tokens/ícones | ⚠ | 22 ocorrências de `--p-builder-marca` em `tokens.css`, `TEMA.builder` em `tema.ts`, documentação em `MARCA.md`, `data-tema="escuro"` em `editor.tsx:177`, zero `#4a5d23`/`--bl-verde` em `pages/builder/`. Porém `builder.css` (fora do diretório) ainda usa `var(--moss)` (aprovado como lacuna) e `userEngaged` está órfão |
| 02-09 destino/setas reais | ⚠ | seletor ✓; comparação com fluxo real não feita (C-42) |
| 02-10, 02-15, 02-19 conteúdos | ⚠ | `toChannelOutput` (`flow.ts:1269`) chamado depois de `resolveDynamicContent` (`flow.ts:356`); `confirmarUrlSegura` no conteúdo HTTP; slots de conteúdo passam no verificador. 02-15 não entregou Carrossel nem Solicitar ligação (excedentes aprovados) |
| 02-11, 02-12 satisfação | ⚠ | backend ✓; UI com os resíduos do critério 3 |
| 02-13 Versões/Filas | ✓ | ver critério 4 |
| 02-14, 02-16, 02-17, 02-18, 02-20 ações | ✓ (menos TrackContactsJourney) | `runFlowScript` com `isolated-vm@6.2.0`, `memoryLimit` e timeout; `EXTERNAL_DEPENDENCY_ACTIONS` idêntico no core e na tela, com a marca "Não executada no Pipe" para URI fora do subconjunto `ALLOWED_COMMAND_URIS` |
| 02-21 Teste | ✓ | conforme D-14 (simulação local) |
| 02-22 portão final | ✓ | GATE-FINAL com aprovação datada; VERIFICACAO-VISUAL com a tabela exigida (13 linhas VISUALLY VERIFIED, 28 menções a NEEDS VALIDATION); `medir-tela.js` usa `getBoundingClientRect` |

### Key links críticos

| De | Para | Status |
|---|---|---|
| worker de varredura em `queues.ts` | `recoverStuckProcessHttp(` | WIRED (e agendado em `servidor.ts`) |
| `panel-outputs.tsx` | `<DestinationPicker` | WIRED (3×) |
| `servicos.enviar` em `flow.ts` | `toChannelOutput(` + `resolveDynamicContent` | WIRED |
| ExecuteScript/V2 em `actions.ts` | `services.runScript` → `runFlowScript` | WIRED (`flow.ts:448`, também no test-run) |
| `flow.ts` | `loadFlowFunctions` / `runFlowFunction` | WIRED (`flow.ts:325,449`) |
| `panel-configuration.tsx` | `listVersions(` / `exportText` | WIRED |
| `test-panel.tsx` | `runTest` → `builder/test-runs` → `PROVEDOR_PADRAO` | WIRED |
| `menu-new-block`/`panel-outputs` | `newSurveyBlock(` | PARCIAL: só `editor.tsx:146` (Novo bloco), nada a partir da saída de atendimento |
| `userEngaged` em `icones.tsx` | algum componente do Builder | NOT_WIRED (órfão) |

### Behavioral spot-checks (executados nesta verificação)

| Comportamento | Comando | Resultado | Status |
|---|---|---|---|
| Motor do core | `pnpm --filter @pipe/core exec vitest run` | 13 arquivos, 470/470 | ✓ PASS |
| Builder no front | `pnpm --filter @pipe/management-vite test` | 306/306 | ✓ PASS |
| API da fase | `vitest run` de script-sandbox, builder-test-run, flow-functions, flow-platform-actions, satisfaction-survey, process-http-retomada, jsonb-compat e flow-content | 8 arquivos, 56/56 | ✓ PASS |
| Catálogo por slot | `conferir-catalogo.mjs --slot <8 slots>` | OK em 7; `acoes-plataforma` acusa TrackContactsJourney | ✓ esperado |
| Catálogo completo | `conferir-catalogo.mjs --all` | exit 1: `FALTA motor/tela TrackContactsJourney` | ✗ (excedente aprovado) |
| Branch descartada do 02-13 | `git merge-base --is-ancestor discarded/02-13-haiku-wrong-base limpeza` | NOT_MERGED | ✓ |

### Probe Execution

Não se aplica: a fase não declara probes `scripts/*/tests/probe-*.sh`. O gate equivalente, `conferir-catalogo.mjs`, foi executado acima.

### Requirements Coverage

| Requisito | Planos | Status | Evidência |
|---|---|---|---|
| BUILDER-01 | 01, 02, 05, 07, 10, 14, 15, 16, 17, 19, 20, 22 | ⚠ PARCIAL (minor) | 16/18 conteúdos, 16/17 ações; faltam Carrossel, Solicitar ligação e TrackContactsJourney (LACUNAS-APROVADAS) |
| BUILDER-02 | 02, 04, 07, 09, 17, 18, 22 | ✓ SATISFEITO | busca de variável, função e destino ligada; acabamento em C-41/C-27 |
| BUILDER-03 | 03, 07, 08, 11, 12, 22 | ✓ SATISFEITO (resíduos minor) | persistência, motor, bloco nativo, paleta; a decisão "modelo nativo" foi fechada no portão (D-08.5/D-09) |
| BUILDER-04 | 04, 06, 07, 08, 13, 21, 22 | ✓ SATISFEITO (resíduo minor) | Teste por D-14 (simulação local; canal real fica para o futuro, por decisão do dono); Filas por D-15; copiar/colar; Versões. `userEngaged` órfão |
| BUILDER-05 | 04, 06, 07, 09, 22 | ? PRECISA DE HUMANO | código e testes ✓; validação com fluxo real bloqueada por C-42 |

Os cinco IDs aparecem no frontmatter de algum PLAN e mapeiam para a Phase 2 em REQUIREMENTS.md; não há requisito órfão. REQUIREMENTS.md ainda marca os cinco como `Pending` (não foi alterado aqui).

### Anti-Patterns (86 arquivos de código tocados por commits `(02-NN)`)

| Arquivo | Linha | Padrão | Severidade | Impacto |
|---|---|---|---|---|
| — | — | `TBD`/`FIXME`/`XXX` | nenhum | gate de marcadores de dívida limpo |
| `apps/management-vite/src/pages/builder.tsx` | 469 | botão desabilitado "Conversa — em breve" | ⚠ Aviso | redundante com o painel de Teste; só em GATE-FINAL §3 |
| `packages/ui/src/icones.tsx` | 59 | `userEngaged` sem uso | ⚠ Aviso | item de BUILDER-04 entregue só pela metade |
| `apps/api/src/domain/script-sandbox.ts` | 11 | `ponytail:` isolate dentro do processo | ℹ Info | endurecimento aprovado em LACUNAS-APROVADAS |

## Classificação das lacunas

| Lacuna | Severidade | Em LACUNAS-APROVADAS.md? |
|---|---|---|
| Carrossel, Solicitar ligação, TrackContactsJourney | minor | Sim ("Excedentes do portão") |
| Validação das setas com o AUVP Capital (C-42) | humano (não conta como falha) | Sim ("Resíduos", 02-09) |
| Pesquisa em um clique a partir da saída de atendimento; MIME da pesquisa na aba Conteúdo | minor | Sim ("Resíduos", 02-12) |
| Timeout do bloco de pesquisa (C-31) | minor | Não. Está em CAPTURAS-PENDENTES (depende de captura) |
| Ícone `userEngaged` órfão | minor | **Não**. Lacuna nova desta verificação |
| Botão "Conversa — em breve"; salvar rascunho antes do primeiro teste | minor | **Não**. Só em GATE-FINAL §3 |
| Diferenças visuais (fonte, pílula, rodapé, zoom `--moss`, menus, Versões) | minor | Sim ("Diferenças visuais do portão final") |
| Sandbox em processo filho, UTC, limites do Jint, DNS, conexão presa 10 s | minor | Sim ("Resíduos", 02-16) |
| Interações do canvas (trava, reconectar, seleção múltipla, reordenar, Alt+Enter, Ctrl+Y) | minor | Sim ("Interações do canvas") |
| Canal de teste real | não é lacuna (D-14, decisão do dono) | registrado como item futuro |
| Lint anterior à fase | minor | Sim |

Nenhuma lacuna é bloqueante: todas deixam o atendente montar e publicar um fluxo completo. Três itens (`userEngaged`, "Conversa — em breve", salvar antes do teste) precisam entrar em LACUNAS-APROVADAS.md para não se perderem na próxima rodada.

## Sugestão de override (se o dono quiser formalizar o aceite já registrado)

```yaml
overrides:
  - must_have: "Atendente pode criar bloco de qualquer tipo de conteúdo/ação previsto"
    reason: "Carrossel, Solicitar ligação e TrackContactsJourney excedem a capacidade dos slots e foram aprovados como excedente para /gsd:plan-phase 2 --gaps (CLASSIFICACAO-PORTAO 2026-09-26; LACUNAS-APROVADAS 2026-09-27)"
    accepted_by: "dono"
    accepted_at: "2026-09-27T00:00:00Z"
```

## Verificação humana necessária

### 1. Setas com o fluxo real (C-42)

**Teste:** importar o export `{flow, globalActions}` do AUVP Capital, rodar `lerDesenho`/`arestasDe` e comparar com o print do canvas da Blip; preencher `ref/validacao-setas.md`.
**Esperado:** paridade de quantidade, origem, destino e presença; qualquer divergência vira teste de regressão antes do fix.
**Por que humano:** o export de produção e o print dependem do dono.

### 2. Capturas C-NN pendentes

**Teste:** fazer as capturas de `ref/CAPTURAS-PENDENTES.md` e reconferir as linhas NEEDS VALIDATION de `ref/VERIFICACAO-VISUAL.md`.
**Esperado:** cada linha vira VISUALLY VERIFIED ou item de lacuna.
**Por que humano:** exige acesso ao Portal Blip.

---

_Verificado em: 2026-09-27_
_Verificador: Claude (gsd-verifier)_

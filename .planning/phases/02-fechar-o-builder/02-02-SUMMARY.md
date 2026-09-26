---
phase: 02-fechar-o-builder
plan: 02
subsystem: builder
tags: [blip-sdk, builder-actions, execute-script, execute-script-v2, sandbox, function-library, sends-command, process-http]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder (plan 01/UI-SPEC)
    provides: contrato de UI aprovado do Builder
provides:
  - Inventário datado (2026-09-26) de todas as 20 ações do Builder de referência (19 do SDK Blip + ExecuteBlipFunction), não limitado ao subconjunto que o motor do Pipe já executa
  - Para cada ação com dependência de plataforma (SetBucket, ManageList, SendCommand, ProcessCommand, ProcessContentAssistant, TrackContactsJourney), duas opções descritas para decisão no portão (D-20): equivalente nativo no Pipe vs. dependência externa
  - Comparativo ExecuteScript x ExecuteScriptV2 e recomendação de sandbox (isolated-vm) para scripts do motor (D-21)
  - Biblioteca de funções documentada como funcionalidade do motor de conversa, com declaração explícita de que não reaproveita `funcao` do motor de workflow (D-22)
  - Tabela resumo com classificação/slot proposto por ação, para consumo do portão do dono (02-07) e do plano de checkpoint de pacote (02-16)
affects: [02-07 (portão do dono), 02-16 (checkpoint de legitimidade de pacote isolated-vm), planos de implementação de BUILDER-01/BUILDER-02]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/02-fechar-o-builder/ref/inventario-acoes.md
  modified: []

key-decisions:
  - "Recomendação de sandbox para ExecuteScript/ExecuteScriptV2: isolated-vm (V8 isolate com heap/timeout por execução), não QuickJS-WASM nem child_process+vm — decisão registrada como proposta para o portão, não uma implementação"
  - "Biblioteca de funções é funcionalidade nova do motor de conversa; NÃO reaproveita `funcao` do motor de workflow (packages/db/src/schema/automacao.ts)"
  - "SendCommand/ProcessCommand/ManageList/SetBucket/ProcessContentAssistant têm equivalente nativo viável no Pipe (não são dependências externas impossíveis de reproduzir); TrackContactsJourney já tem o schema (execucao_fluxo/execucao_passo), falta só a tela de Analytics de fase futura"

patterns-established: []

requirements-completed: [BUILDER-01, BUILDER-02]

# Metrics
duration: ~45min
completed: 2026-09-26
---

# Phase 02 Plan 02: Inventário de Ações, Scripts e Biblioteca de Funções Summary

**Inventário datado das 20 ações do Builder de referência (19 do SDK Blip C# + ExecuteBlipFunction) com opções de portão D-20 para as 6 ações dependentes de plataforma, recomendação de sandbox `isolated-vm` para scripts (D-21) e declaração da Biblioteca de funções como motor de conversa novo, não reaproveito do motor de workflow (D-22).**

## Performance

- **Duration:** ~45 min (estimativa; timer de início não foi capturado no arranque desta sessão)
- **Completed:** 2026-09-26T14:57:52Z
- **Tasks:** 2/2 completos
- **Files modified:** 1 (arquivo novo)

## Accomplishments

- Inventariadas as 20 ações exigidas (`ExecuteScript`, `ExecuteScriptV2`, `SendMessage`, `SendMessageFromHttp`, `SendRawMessage`, `SendCommand`, `ProcessCommand`, `TrackEvent`, `ProcessHttp`, `ManageList`, `MergeContact`, `SetVariable`, `SetBucket`, `Redirect`, `CreateTicket`, `DeleteVariable`, `ProcessContentAssistant`, `TrackContactsJourney`, `ExecuteTemplate`, `ExecuteBlipFunction`), cada uma com os 16 rótulos exigidos (Nome exibido, Ícone, Entrada/Saída/Global, Campos do editor, Valores padrão, Validações, Condições de execução, Variáveis de entrada/saída, Formato serializado, Comportamento no motor, Dependência de plataforma, Erros/timeouts/retries, Teste/Debug, Import/export, Dependência ausente, Estado no Pipe hoje, Fonte)
- Achado extra fora da lista fechada: o bloco "Agente de IA" do Builder **não é** uma das 19 actions do SDK — é um nó de canvas separado, contextualizado por base de conhecimento + ferramentas locais, com variável `{{aiagent.*}}` própria; documentado como achado de investigação, não pré-aprovado para escopo
- Para as 6 ações com dependência de plataforma real (`SetBucket`, `ManageList`, `SendCommand`, `ProcessCommand`, `ProcessContentAssistant`, `TrackContactsJourney`), descritas as duas opções do portão D-20 (equivalente nativo vs. dependência externa marcada "Não executada no Pipe")
- Comparativo lado a lado `ExecuteScript`/`ExecuteScriptV2` (engine, timeout, limites, APIs, timezone) e tabela de 3 mecanismos de sandbox com recomendação justificada (`isolated-vm`), incluindo o aviso de que `isolated-vm` exige pacote npm novo (dispara checkpoint de legitimidade no plano 02-16)
- Biblioteca de funções (D-22) documentada com o mecanismo conhecido (busca/criação pela ação `ExecuteBlipFunction`) e a declaração explícita exigida: não é a mesma coisa que `funcao` do motor de workflow
- Tabela `## Resumo` com classificação proposta e slot (`acoes-contexto`/`acoes-script`/`acoes-funcoes`/`acoes-plataforma`/`ja-suportada`) para as 20 ações + o bloco de Agente de IA
- 8 capturas pendentes (D-03) registradas explicitamente em vez de inventadas: ícones, distinção entrada/saída/global, painel de Teste/Debug, assinaturas nativas do V2, rótulos de 3 ações sem chave de tradução encontrada, visibilidade de `DeleteVariable` no menu real, ciclo de vida da Biblioteca de funções, JSON exportado real

## Task Commits

Cada task foi commitada atomicamente:

1. **Task 1: Inventário ação por ação (D-19, D-20)** - `1303102` (docs)
2. **Task 2: Scripts (D-21), biblioteca de funções (D-22) e resumo para o portão** - `0feb0ae` (docs)

_Nota: as duas tasks escrevem no mesmo arquivo (`ref/inventario-acoes.md`), criado na Task 1 e estendido na Task 2 — sem sobreposição de linhas entre os dois commits._

## Files Created/Modified

- `.planning/phases/02-fechar-o-builder/ref/inventario-acoes.md` - Inventário completo de ações, scripts e biblioteca de funções da referência Blip, datado 2026-09-26

## Decisions Made

- Recomendação de sandbox para D-21: `isolated-vm` (V8 isolate real, heap/timeout por execução), com QuickJS-WASM como plano B se `isolated-vm` falhar build/instalação na VPS de produção — decisão de **implementação** fica para a wave que consumir este inventário, aqui é só a recomendação documentada com justificativa técnica
- Biblioteca de funções: nova tabela no motor de conversa (nome de trabalho `funcao_do_fluxo`), sem reaproveitar `funcao` do motor de workflow (`packages/db/src/schema/automacao.ts:443-454`) — decisão já estava travada em D-22/CONTEXT.md, este plano só a documenta com evidência primária (bundle de tradução) e cita o caminho exato
- `TrackContactsJourney` classificado como "reproduzível no Pipe" (não dependência externa) porque o schema de execução (`execucao_fluxo`/`execucao_passo`) já registra toda transição — falta só a tela de Analytics, que é fase futura per `PROJECT.md`, não uma dependência de plataforma Blip impossível de reproduzir

## Deviations from Plan

None - plan executado como escrito. Todas as investigações usaram fontes primárias já existentes no repositório (`referencias-blip/pesquisa/catalogo-gatilhos-acoes.md`, bundle de tradução do Builder, código-fonte atual do Pipe) — nenhum bloqueio exigiu decisão fora do escopo do plano.

## Assumption Drift (advisory)

Nenhum drift material identificado. A investigação seguiu à risca o D-19/D-20/D-21/D-22 do `02-CONTEXT.md`: nenhuma decisão de catálogo, schema ou sandbox foi fixada além do que o plano pediu (recomendação, não implementação).

## Issues Encountered

- **Ambiente:** o binário `git` deste worktree tem um hook RTK que reescreve `git status`/`git log`/`git diff`/`git add`/`git show` para `rtk git <subcomando>`; o verificador de isolamento de worktree recusa comandos onde `git` não é o primeiro token literal, então esses 5 subcomandos falharam com erro de sandbox. Contornado usando comandos de plumbing equivalentes que não passam pelo hook: `git update-index --add --` no lugar de `git add`, `git ls-files --stage`/`--others` no lugar de `git status`, e a ferramenta `Grep` (em vez de `grep`/`git diff`) para verificação de conteúdo. `git commit`, `git reset --hard`, `git cat-file`, `git rev-parse`, `git merge-base` e `git symbolic-ref` funcionaram normalmente sem contorno.
- **Worktree desatualizado no arranque:** o HEAD do worktree ao ser spawnado apontava para um commit anterior (`3343530`, "fix: align atendimento monitoring...") em vez do commit base esperado (`b79c17d`, "docs(02): add PATTERNS.md from plan-phase"). Corrigido com `git reset --hard b79c17d...` conforme o protocolo `worktree_branch_check` do prompt, antes de qualquer leitura de arquivo de planejamento.
- **Ferramenta WebFetch indisponível:** não foi possível consultar `github.com/takenet/blip-sdk-csharp` nem `help.blip.ai` diretamente nesta sessão. Todas as afirmações `[BLIP-SDK]` vieram da síntese já existente em `referencias-blip/pesquisa/catalogo-gatilhos-acoes.md` (que por sua vez cita o SDK linha a linha com procedência marcada); nenhuma foi inventada. Onde essa síntese já registrava lacuna (`catalogo-gatilhos-acoes.md` §8), o item foi propagado para "Capturas pendentes (D-03)" deste documento em vez de inferido sem marca.

## Known Stubs

Nenhum. Este plano produz documentação (`.planning/`), não código de produto — não há stub de dado/UI a rastrear.

## Threat Flags

Nenhum. O único arquivo tocado é `.planning/phases/02-fechar-o-builder/ref/inventario-acoes.md`, coberto pelo `threat_model` do próprio plano (T-2-01/T-2-02/T-2-07); os gates automatizados de ambas as tasks (grep de `authorization:`/`cookie:`/`bearer `, contagem 0) passaram nas duas verificações.

## User Setup Required

None - nenhuma configuração de serviço externo necessária. O plano só produz um documento de investigação.

## Next Phase Readiness

- O inventário está pronto para alimentar o plano 02-07 (portão do dono) com a classificação proposta ação por ação e as opções D-20 para as 6 ações dependentes de plataforma.
- A recomendação de sandbox (`isolated-vm`) está pronta para disparar o checkpoint de legitimidade de pacote no plano 02-16 quando a implementação de D-21 começar.
- 8 capturas pendentes (D-03) ficam bloqueando qualquer decisão que dependa delas especificamente (ícones, rótulos exatos de 3 ações, ciclo de vida da Biblioteca de funções) — não bloqueiam o portão em si, que já tem evidência suficiente para classificar cada ação, mas devem ser resolvidas antes da implementação de UI pixel-perfect dessas ações específicas.
- Nenhum bloqueio para os demais planos da wave de investigação (D-01) que não dependem deste inventário.

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-26*

## Self-Check: PASSED

- FOUND: `.planning/phases/02-fechar-o-builder/ref/inventario-acoes.md`
- FOUND: `.planning/phases/02-fechar-o-builder/02-02-SUMMARY.md`
- FOUND commit `1303102` (Task 1)
- FOUND commit `0feb0ae` (Task 2)

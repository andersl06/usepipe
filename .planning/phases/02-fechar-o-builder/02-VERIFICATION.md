---
phase: 02-fechar-o-builder
verified: 2026-10-05T22:00:00Z
status: human_needed
score: 4/5 critérios verificados (SC1 por override do dono; SC5 aguarda captura C-42)
has_blocking_gaps: false
overrides_applied: 1
overrides:
  - must_have: "Atendente pode criar bloco de qualquer tipo de conteúdo/ação previsto"
    reason: "Carrossel, Solicitar ligação (infra de voz) e TrackContactsJourney excedem a capacidade dos slots; aprovados como excedente (CLASSIFICACAO-PORTAO 2026-09-26; LACUNAS-APROVADAS 2026-09-27). 16/18 conteúdos e 16/17 ações têm editor e motor."
    accepted_by: "dono"
    accepted_at: "2026-09-27T00:00:00Z"
re_verification:
  previous_status: gaps_found
  previous_score: 3/5
  gaps_closed:
    - "Ícone userEngaged órfão: agora usado em apps/management-vite/src/pages/builder.tsx:516"
    - "Rodada de fidelidade F-1..F-6 (planos 02-36..02-59) com aprovação do dono em 2026-10-05"
  gaps_remaining:
    - "Carrossel / Solicitar ligação / TrackContactsJourney no editor (aceito pelo dono)"
    - "Botão desabilitado 'Conversa — em breve' (builder.tsx:600), minor"
    - "Criar pesquisa em um clique a partir da saída de atendimento; MIME da pesquisa na aba Conteúdo (minor, em LACUNAS-APROVADAS)"
  regressions: []
human_verification:
  - test: "Validar setas com o fluxo real AUVP Capital (C-42): export {flow, globalActions} + print do canvas da Blip, preencher ref/validacao-setas.md"
    expected: "Mesma quantidade, origem, destino de setas que arestasDe(); divergência vira teste de regressão"
    why_human: "Depende de captura do dono; ref/validacao-setas.md ainda registra 'nenhum export real encontrado'"
  - test: "Capturas C-NN pendentes e linhas NEEDS VALIDATION de ref/VERIFICACAO-VISUAL.md (rodada F-1..F-6)"
    expected: "Cada linha vira VISUALLY VERIFIED ou item de lacuna"
    why_human: "Exigem acesso ao Portal Blip. Item conhecido, sem decisão do dono (não é falha nova)"
  - test: "Itens abertos 'Nomear versão' (02-32, precisa migração fluxo_versao) e marca 'Não disponível no Pipe'"
    expected: "Decisão do dono: fazer, adiar ou descartar"
    why_human: "Sem decisão do dono (item conhecido, não é falha nova)"
---

# Phase 2: Fechar o Builder — Verificação (re-verificação)

**Objetivo:** atendente monta e publica um fluxo completo sem esbarrar em tipo de bloco, ligação ou pesquisa de satisfação sem editor.
**Verificado em:** 2026-10-05 (re-verificação após os 59 planos; a anterior era de 2026-09-27 com 35 planos)
**Status:** human_needed

## Critérios de sucesso

| # | Critério | Status | Evidência |
|---|---|---|---|
| 1 | Criar bloco de qualquer tipo de conteúdo/ação previsto | PASSED (override) | 16/18 conteúdos, 16/17 ações; restantes aprovados como excedente pelo dono em 2026-09-27. Planos 02-38..02-59 acrescentaram comandos, subfluxos, agente de IA, base de conhecimento, NLP/AI Answers, biblioteca de funções, secret.* (todos com SUMMARY) |
| 2 | Buscar variável/função e destino por pesquisa | VERIFICADO | Mantido da verificação anterior; 02-30/02-37 reforçaram (118 variáveis, busca) |
| 3 | Pesquisa de satisfação e paleta de tags | VERIFICADO (resíduos minor) | `packages/core/src/flow/satisfaction-survey.test.ts` 12/12 verde; resíduos em LACUNAS-APROVADAS |
| 4 | Painéis de Filas e Teste, copiar/colar, exportar versão | VERIFICADO | Filas embutidas 02-33/02-34; rodada F-1..F-6 aprovada pelo dono (02-35, 2026-10-05); typecheck 25/25 e management-vite 529/529 registrados no 02-35 |
| 5 | Setas refletem toda ligação salva, com teste de `arestasDe()` | INCERTO (`unverifiable_runtime`) | Testes rodados por mim: `tests/builder-editor.test.ts` 42/42 passam (node:test); `packages/core/src/flow` 20 arquivos / 295 testes passam. Validação com fluxo real segue bloqueada por C-42 |

## Requisitos

BUILDER-02/03/04 já `Complete`. BUILDER-01 e BUILDER-05 seguem `Pending` em REQUIREMENTS.md (não alterado aqui): BUILDER-01 pelos 3 excedentes aceitos, BUILDER-05 pela validação C-42. Sem requisito órfão.

## Anti-patterns

Sem `TBD/FIXME/XXX` bloqueantes. Aviso: `builder.tsx:600` botão "Conversa — em breve" (só em GATE-FINAL §3, falta levar a LACUNAS-APROVADAS). `userEngaged` agora usado (fechado).

## Observações

- Não rodei a suíte completa nem a API (só testes pontuais acima); resultados de 02-35 (529/529 etc.) vêm do SUMMARY e não foram reexecutados.
- Nenhuma lacuna bloqueante. Fase pode seguir; itens humanos acima ficam como pendência do dono.

_Verifier: Claude (gsd-verifier)_

## Aprovação do dono, 2026-10-06 (linhas NEEDS VALIDATION)

O dono aprovou **todas** as linhas `NEEDS VALIDATION` de `ref/VERIFICACAO-VISUAL.md` (rodada F-1..F-6 e anteriores), como estão no Pipe: diferenças de medida, cor e texto contra a Blip ficam aceitas. Isso inclui as duas linhas que dependiam de decisão do dono: a mistura Nunito Sans / IBM Plex Sans no Builder e a etiqueta "Padrão" no card de fila (mantidas como estão). As linhas que dependem de captura (C-38, C-39, C-40, C-41, C-44, C-46) ficam aceitas sem a captura.

Continuam em aberto, sem resposta do dono:
- C-42: o export real do fluxo AUVP Capital foi enviado (`auvpcapitaldev1 (7).json`, 174 blocos, 261 saídas de condição). `arestasDe()` desenha 245 setas (14 duplicadas, 1 destino inexistente e 1 saída de erro de encaminhamento ficam de fora). Os `$defaultOutput` (174 blocos, 168 com destino existente) não são desenhados, por regra documentada (`PAINEL-Saidas.md:53`). Falta comparar com o print do canvas da Blip; sem isso SC5 segue `unverifiable_runtime`.
- "Nomear versão" (02-32, exige migração de `fluxo_versao`): fazer, adiar ou descartar.
- Marca "Não disponível no Pipe" na biblioteca de variáveis: manter, esconder ou trocar o texto.

### Decisões do dono, 2026-10-06 (resposta às três pendências)

- **C-42:** aprovado **sem** a comparação com o canvas da Blip (override do dono). SC5 (setas) fica aceito com o teste de `arestasDe()` (42/42) e a rodada com o export real (245 setas; ver `ref/validacao-setas.md`).
- **"Nomear versão":** fazer, incluindo a migração de `fluxo_versao`. Execução registrada fora desta verificação (commit próprio).
- **Rótulo "Não disponível no Pipe":** decisão do dono: não esconder nem só manter. Inventariar tudo que o Pipe marca como "em breve" ou "não disponível", validar se já foi construído, inventariar na Blip o que falta e construir. Vira uma fase própria no ROADMAP.

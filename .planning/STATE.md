---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 03.2 UI-SPEC approved
last_updated: "2026-10-01T01:18:02.799Z"
last_activity: 2026-09-30 -- Phase 03.1 execution started
progress:
  total_phases: 11
  completed_phases: 1
  total_plans: 169
  completed_plans: 97
  percent: 9
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-24)

**Core value:** Atendimento multi-canal (WhatsApp/Instagram/Messenger) confiável e auditável, com CRM espelhado automaticamente e sem fricção para o atendente.
**Current focus:** Phase 03.1 — corrigir-bugs-do-invent-rio-blip-pipe

## Current Position

Phase: 03.1 (corrigir-bugs-do-invent-rio-blip-pipe) — EXECUTING
Plan: 7 of 20
Status: Executing Phase 03.1
Last activity: 2026-09-30 -- Phase 03.1 execution started

Progress: [██████░░░░] 57%

## Performance Metrics

**Velocity:**

- Total plans completed: 22
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 02 | 22 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 01 P01 | 45min | 2 tasks | 6 files |
| Phase 02 P07 | 15min | 4 tasks | 6 files |
| Phase 02 P05 | 40min | 3 tasks | 8 files |
| Phase 03.1 P03 | 50min | 2 tasks | 1 files |
| Phase 03.2 P03 | 75min | 2 tasks | 7 files |

## Accumulated Context

### Roadmap Evolution

- Phase 01.1 inserted after Phase 1: Subdomínio por tenant no padrão Blip (<tenant>.usepipe.ai/application, <tenant>.desk.usepipe.ai); pedido do dono durante o portão 1 da Phase 1
- Phase 03.1 inserted after Phase 3: Corrigir bugs do inventário Blip×Pipe (URGENT)
- Phase 03.2 inserted after Phase 3: Paridade do Atendimento com a Blip (URGENT)

### Decisions

Decisões completas em PROJECT.md (Key Decisions). Resumo relevante para o trabalho atual:

- Fork do Twenty é a decisão de CRM (confirmada 24/09/2026), mas o papel de `apps/crm` diante disso não foi decidido — é o objeto de CRM-01/Phase 4.
- Blip é régua de medida, não base de código, desde 12/09/2026 — nenhum código/CSS/ícone da Blip entra no repositório.
- Front migrado para Vite em Desk/Gestão (07/09/2026); `apps/crm` continua Next.js.
- Fluxos são arquivados, nunca apagados de verdade (`execucao_fluxo.fluxo_versao_id` é `ON DELETE RESTRICT`).
- Linguagem técnica migra de português para inglês (24/09/2026) — cobre também rotas/endpoints da API, não só front; substitui a regra "tudo em português"; texto visível ao usuário não muda; dados persistidos ficam fora do rename mecânico (Phase 1, STD-01..12). Convenção canônica exata ainda não definida — decisão semântica pendente do discuss-phase.
- Critério de "Validated" redefinido (24/09/2026): implementado + funciona ponta a ponta + comparado com a referência (quando aplicável) + aprovado pelo dono — código/teste isolado não basta. A maior parte do que o ingest marcou como Validated foi reclassificada como Needs Validation em PROJECT.md; verificação formal é a Phase 3 (VALSURF-01..05).
- [Phase 01]: 01-01: baseline code commit 57ca8d5; crm standalone EPERM accepted, gates use build --filter=!@pipe/crm + crm 'Compiled successfully'
- [Phase 02]: Portão do dono (D-04) fechado 26/09/2026: dono aprovou classificação item a item e decisões de mecanismo (D-14, D-15, D-21, D-22, D-08.5/D-09, D-20) sem ajustes; itens EXCEDE CAPACIDADE (Carrossel, Solicitar ligação, TrackContactsJourney) aprovados como excedente, replanejar via /gsd:plan-phase 2 --gaps
- [Phase 02]: pré-flight gate da Phase 1 destravado em 26/09/2026 — a tag std-apply-all-end existe (commit d00dba0) e a Phase 02 executa desde então (nota anterior de bloqueio dos planos 02-08..02-22 ficou obsoleta)
- [Phase 01]: fechamento auditado em 27/09/2026 — 33 dos 41 planos feitos (D-49 colapsou as fatias no apply-all; portões 3 e 4 em D-50/D-51). Abertos: 01-15, 01-20, 01-27, 01-31, 01-37, 01-39, 01-40 (classificação STD-11: 25.741 achados sem classificação; identificadores em 747 arquivos; 348 pendências de comentário) e 01-41 (obsoleto). Detalhe em phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/01-CLOSURE.md
- [Phase 01/01.1]: passo do dono pendente — cadastrar a URL de retorno do Google no console (D-51 da Phase 1 e D-26 da Phase 01.1 pedem o mesmo cadastro)
- [Phase ?]: [Phase 02, plan 02-05]: D-25 corrigido no ponto comum de processInbound (packages/core/src/flow/manager.ts) — retomada de ProcessHttp em $enteringCustomActions de qualquer estado, sem caminho especial por lista.
- [Phase 02]: D-26 implementado com fila BullMQ dedicada (pipe-process-http-sweep) para a varredura de process_http_execucao presa, além do modo memória já existente.
- [Phase 02]: recoverStuckProcessHttp devolve {tenantId, processoId}[] em vez de string[]: uma varredura pode recuperar linhas de tenants diferentes na mesma rodada.
- [Phase 02]: D-27 (duplicate-key na retomada de ProcessHttp) já estava corrigido antes desta plan (commit 8dac98b); reforçada a regressão com asserção de contagem e prova por mutação manual revertida.
- [Phase ?]: 03.2-03: tokens --p-atend-* de medida (sem cor) ficam no :root de tokens.css
- [Phase ?]: 03.2-03: evidência de Q3 favorece colapsar grade+lista (Blip tem uma aparência só no Atendimento)

### Pending Todos

None yet.

### Blockers/Concerns

Problemas conhecidos herdados de PROJECT-HANDOFF.md (24/09/2026) — nenhum resolvido ainda, listados aqui para não se perderem:

- Ambiente local frágil: processo de API/Vite em segundo plano é encerrado pelo Claude Code sob pouca memória; API sobe sem `.env` da raiz e login Google quebra. Solução: subir API em janela própria do PowerShell.
- Docker Desktop precisa ser iniciado manualmente após reiniciar o PC (sem ele, testes de API falham por falta de Postgres/Redis).
- Vite nesta máquina escuta em `[::1]`, não `127.0.0.1` — testes/curl contra `127.0.0.1:PORTA` podem dar "connection refused".
- Build do Desk no Git Bash exige `MSYS_NO_PATHCONV=1` no `docker build`, senão reescreve `/desk/` como caminho Windows (já aconteceu em produção).
- `tests/instagram.test.ts`, `tests/fluxo.test.ts`, `tests/messenger.test.ts` oscilam sob carga da bateria inteira (timing/concorrência de banco, não regressão de código, verificado 24/09).
- `pnpm typecheck` na raiz está QUEBRADO por `packages/core/src/fluxo/gerenciador.teste.ts:140` (`variaveis.status` não existe no tipo inferido); typechecks por app não cobrem `packages/core` isoladamente. Não corrigido.
- VPS de demonstração (`144.217.164.204`) publicada, login Google pendente do dono cadastrar o redirect no Google Cloud Console — bloqueia Phase 5 (VAL-01).
- `master` está 2 commits atrás de `limpeza` — decidir quando mesclar (Phase 4, OPS-01).
- Branches soltas sem uso recente (`codex/atendimento-blip`, `desk-visual-pipe`, `integracao`, vários `worktree-agent-*`) — candidatas a apagar (Phase 4, OPS-02).
- Número de teste da Meta expira em 24h, sem versão permanente — reconexão é rotina diária até haver número próprio com usuário de sistema.

## Deferred Items

Itens reconhecidos e adiados no ingest inicial (24/09/2026) — fases já planejadas nas specs, não cortadas. Ver PROJECT.md Out of Scope e REQUIREMENTS.md v2 para detalhe completo.

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| Fase futura | Servidor MCP | Deferred | 2026-09-24 (ingest) | v1 (pós-roadmap atual) |
| Fase futura | Tempo real por WebSocket | Deferred | 2026-09-24 (ingest) | v1 (pós-roadmap atual) |
| Fase futura | Monitoria por IA / módulo de Análise | Deferred | 2026-09-24 (ingest) | v1 (pós-roadmap atual) |
| Não planejado | Base de conhecimento com citação | Deferred | 2026-09-24 (ingest) | v2 |
| Não planejado | SSO em três degraus | Deferred | 2026-09-24 (ingest) | v2 |
| Bloqueado externamente | Cadastro embutido (Embedded Signup) da Meta | Deferred | 2026-09-24 (ingest) | v2 (bloqueado por CNPJ) |

## Session Continuity

Last session: 2026-10-01T01:18:02.765Z
Stopped at: Phase 03.2 UI-SPEC approved
Resume file: .planning/phases/03.2-paridade-do-atendimento-com-a-blip/03.2-UI-SPEC.md

---
gsd_state_version: '1.0'
status: planning
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-24)

**Core value:** Atendimento multi-canal (WhatsApp/Instagram/Messenger) confiável e auditável, com CRM espelhado automaticamente e sem fricção para o atendente.
**Current focus:** Phase 1 — Fechar o Builder (roadmap recém-criado, nenhuma fase iniciada)

## Current Position

Phase: 0 of 6 (roadmap criado, nenhuma fase iniciada)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-09-24 — Ingest de 22 documentos de planejamento (ADRs, SPECs, PRD, DOCs) + PROJECT-HANDOFF.md sintetizados em PROJECT.md, REQUIREMENTS.md, ROADMAP.md e STATE.md (primeira geração de `.planning/` para este repositório brownfield)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisões completas em PROJECT.md (Key Decisions). Resumo relevante para o trabalho atual:

- Fork do Twenty é a decisão de CRM (confirmada 24/09/2026), mas o papel de `apps/crm` diante disso não foi decidido — é o objeto de CRM-01/Phase 2.
- Blip é régua de medida, não base de código, desde 12/09/2026 — nenhum código/CSS/ícone da Blip entra no repositório.
- Front migrado para Vite em Desk/Gestão (07/09/2026); `apps/crm` continua Next.js.
- Fluxos são arquivados, nunca apagados de verdade (`execucao_fluxo.fluxo_versao_id` é `ON DELETE RESTRICT`).

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
- VPS de demonstração (`144.217.164.204`) publicada, login Google pendente do dono cadastrar o redirect no Google Cloud Console — bloqueia Phase 3 (VAL-01).
- `master` está 2 commits atrás de `limpeza` — decidir quando mesclar (Phase 2, OPS-01).
- Branches soltas sem uso recente (`codex/atendimento-blip`, `desk-visual-pipe`, `integracao`, vários `worktree-agent-*`) — candidatas a apagar (Phase 2, OPS-02).
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

Last session: 2026-09-24
Stopped at: Roadmap inicial criado a partir do ingest de documentos de planejamento (PROJECT.md, REQUIREMENTS.md, ROADMAP.md, STATE.md escritos); nenhuma fase iniciada ainda
Resume file: None

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Phase 1 context gathered
last_updated: "2026-09-24T15:20:34.492Z"
last_activity: "2026-09-24 — Roadmap revisado (2ª rodada): escopo da Phase 1 ampliado para toda a base técnica (não só rotas) com STD-10/11/12 e revisão de STD-07; nova Phase 3 \"Validar e fechar superfícies atuais\" (VALSURF-01..05) inserida entre Builder e CRM, após correção do critério de \"Validated\" (não basta código/teste existir — precisa de comparação com a referência e aprovação do dono). 6→8 fases no total. Ingest original de 22 documentos + PROJECT-HANDOFF.md permanece a base de PROJECT.md/REQUIREMENTS.md/STATE.md."
progress:
  total_phases: 8
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-24)

**Core value:** Atendimento multi-canal (WhatsApp/Instagram/Messenger) confiável e auditável, com CRM espelhado automaticamente e sem fricção para o atendente.
**Current focus:** Phase 1 — Padronizar linguagem técnica, navegação e renderização (roadmap revisado, nenhuma fase iniciada)

## Current Position

Phase: 0 of 8 (roadmap revisado, nenhuma fase iniciada)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-09-24 — Roadmap revisado (2ª rodada): escopo da Phase 1 ampliado para toda a base técnica (não só rotas) com STD-10/11/12 e revisão de STD-07; nova Phase 3 "Validar e fechar superfícies atuais" (VALSURF-01..05) inserida entre Builder e CRM, após correção do critério de "Validated" (não basta código/teste existir — precisa de comparação com a referência e aprovação do dono). 6→8 fases no total. Ingest original de 22 documentos + PROJECT-HANDOFF.md permanece a base de PROJECT.md/REQUIREMENTS.md/STATE.md.

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

- Fork do Twenty é a decisão de CRM (confirmada 24/09/2026), mas o papel de `apps/crm` diante disso não foi decidido — é o objeto de CRM-01/Phase 4.
- Blip é régua de medida, não base de código, desde 12/09/2026 — nenhum código/CSS/ícone da Blip entra no repositório.
- Front migrado para Vite em Desk/Gestão (07/09/2026); `apps/crm` continua Next.js.
- Fluxos são arquivados, nunca apagados de verdade (`execucao_fluxo.fluxo_versao_id` é `ON DELETE RESTRICT`).
- Linguagem técnica migra de português para inglês (24/09/2026) — cobre também rotas/endpoints da API, não só front; substitui a regra "tudo em português"; texto visível ao usuário não muda; dados persistidos ficam fora do rename mecânico (Phase 1, STD-01..12). Convenção canônica exata ainda não definida — decisão semântica pendente do discuss-phase.
- Critério de "Validated" redefinido (24/09/2026): implementado + funciona ponta a ponta + comparado com a referência (quando aplicável) + aprovado pelo dono — código/teste isolado não basta. A maior parte do que o ingest marcou como Validated foi reclassificada como Needs Validation em PROJECT.md; verificação formal é a Phase 3 (VALSURF-01..05).

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

Last session: 2026-09-24T15:20:34.470Z
Stopped at: Phase 1 context gathered
Resume file: .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/01-CONTEXT.md

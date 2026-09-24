# SYNTHESIS.md — Pipe doc ingest

Entry point for downstream consumers (`gsd-roadmapper`). MODE=new: this is the first `.planning/` scaffold for this repo — no existing PROJECT.md/REQUIREMENTS.md/ROADMAP.md/STATE.md to merge against.

## Doc counts

22 classified docs consumed from `.planning/intel/classifications/`:
- ADR: 2 (both LOCKED)
- SPEC: 16
- PRD: 1
- DOC: 3 (including PROJECT-HANDOFF.md, which carries an explicit per-doc precedence override of 0 — highest — superseding the default ADR>SPEC>PRD>DOC ordering for this ingest)

## Decisions locked (2)

- ADR: Fork do Twenty como base do CRM — `docs/specs/2026-09-07-fork-do-twenty.md`
- ADR: O CRM: arquitetura e funções do Twenty, tinta nossa — `docs/specs/2026-09-07-crm-tinta-nossa.md`

Verified complementary (not contradictory) by reading both in full — see INGEST-CONFLICTS.md. Four structural questions from fork-do-twenty §4 (fate of `apps/crm`, where the lead object lives, source-of-truth ownership, how atendimento bridges to lead) remain **unresolved** per PROJECT-HANDOFF.md, despite crm-tinta-nossa's header claiming to close them — its content only addresses visual theming.

## Requirements extracted (14 + 1 inventory note)

From the single PRD, `docs/specs/2026-09-05-o-que-falta.md`: REQ-cobranca, REQ-preco, REQ-onboarding-cliente, REQ-dominio (partially resolved — domain name chosen, registration pending), REQ-documentos-legais, REQ-teste-invasao, REQ-nicho, REQ-suporte-cliente, REQ-notificacao-externa, REQ-migracao-atendimento, REQ-mobile, REQ-papeis-customizados, REQ-e2e-homologacao, REQ-documentacao — plus a non-gap inventory note listing what's already designed but not yet built.

## Constraints (16, all SPEC-type)

Types: schema (3), api-contract (3), nfr (9), protocol (1). Full list with source paths in `intel/constraints.md`. Two of these SPECs contain content superseded by later decisions (pipe-design.md's original Next.js architecture and Twenty-copying prohibition, ponte-lime.md's "copy is the product" decision) — flagged inline in constraints.md and detailed in INGEST-CONFLICTS.md.

## Context topics (3 DOCs)

- **PROJECT-HANDOFF.md** — the dominant context source for this ingest (precedence-0 override). Extracted in full topic breakdown: project identity, current state, architecture, source-of-truth index, permanent rules, ready areas, partially-ready areas, not-yet-implemented areas, known issues, decisions recovered from conversation history, "what not to do," next priorities. This is the single most load-bearing doc for `STATE.md` bootstrapping.
- **docs/specs/2026-09-05-comercial.md** — commercial/advisory model (misfiled under `specs/`, content is DOC not SPEC); contains 3 candidate product requirements not in the formal PRD.
- **docs/superpowers/plans/2026-09-09-desk-visual-pipe.md** — implementation plan, companion to the desk-visual-pipe-design SPEC.

## Conflicts: 0 blockers, 0 competing-variants, 8 auto-resolved/informational

All 8 INFO entries and the reasoning behind zero BLOCKER/WARNING entries are in `.planning/INGEST-CONFLICTS.md`. Highlights:
1. PROJECT-HANDOFF reverses ponte-lime.md's "Blip copy is the product" decision (same-day reversal, 12/09).
2. LOCKED ADR fork-do-twenty reverses pipe-design.md's original "don't copy Twenty" licensing rule.
3. arquitetura-de-front.md (Vite) supersedes pipe-design.md's original Next.js architecture — confirmed implemented for desk/gestao, **not yet** for crm.
4. The two LOCKED ADRs (fork-do-twenty, crm-tinta-nossa) were explicitly verified non-contradictory.
5. A 3-pair cross-ref cycle set (companion docs referencing each other) was detected, assessed as benign, and did not block synthesis.

## Pointers

- Per-type intel: `.planning/intel/decisions.md`, `.planning/intel/requirements.md`, `.planning/intel/constraints.md`, `.planning/intel/context.md`
- Conflict report: `.planning/INGEST-CONFLICTS.md`

STATUS: READY — safe to route (no blockers, no competing variants awaiting user resolution).

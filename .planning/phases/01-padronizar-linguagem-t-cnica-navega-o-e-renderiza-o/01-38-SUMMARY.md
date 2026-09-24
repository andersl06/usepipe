---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 01-38
status: complete
key-files:
  created:
    - tools/std/merge-proposals.ts
    - tools/std/check-map.ts
    - tools/std/apply-comments.ts
    - tools/std/map-tools.test.ts
  modified: []
commits:
  - 478b010 feat(01-38): map checker, proposal merger, comment applier
  - 202f46a fix(01-38): validate constants and glossary input
  - 19dd639 test(01-38): cover map validation edges
---

Proposal merges, map checks, and reviewed comment decisions now have deterministic command-line tools.

## What was built

- Proposal merger protects approved map rows and reviewed comments, separates persisted candidates by owner and job, and tolerates a repeated batch.
- Map checker enforces status, PT tokens, casing, suffixes, collisions, route shape, glossary warnings, persisted exclusion, and cross-scope wire keys; it also samples and approves valid rows.
- Comment applier resolves current paths, matches comment text, preserves framing, enforces Sonnet review for sensitive material, and records exact D-17 exceptions.
- Twenty adversarial tests cover near misses, scope collisions, Windows separators, repeated runs, and comment-like text inside strings.

## Deviations

- Two follow-up commits fixed findings from the required full-diff review.
- The approved map and comments inventory do not exist in this worktree yet. Live checks used identifiers read from repository source and temporary rows derived from those identifiers.

## Verification results

- `node --test tools/std/map-tools.test.ts`: 20 passed, 0 failed.
- ESLint on all four task files: passed. `pnpm typecheck`: 23/23 tasks passed (cached).
- `check-map --help` lists `--approve`, `--sample`, `--require-status`, and `--glossary`; `apply-comments.ts` contains `reviewed_by` twice.
- Repository source counts: `ControladorAnexos` 1, `useLeitura` 1, `contatoId` 3 in the db schema file and 2 in contracts. The checker flagged the real-derived missing Controller suffix and wire mismatch; `useReading` passed.
- `git diff 8bf50d5458a2a67ff26019dec281b0bb40507a47..HEAD --check`: passed before this summary.

## Self-Check: PASSED

- Branch `cx/01-38`; task files and this summary are the only changes.
- No push, deploy, database write, or shared-container operation.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/REQUIREMENTS.md` remain unchanged.

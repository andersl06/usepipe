---
title: Add front-route fixture case to rewrite-literals before first front route slice
resolves_phase: 1
created: 2026-09-24
---

Sonnet review of 01-04 (D-24/D-41): `front-route` kind in `tools/std/rewrite-literals.ts` has no fixture case, and its fallback
`value.startsWith(row.old.split('/:')[0])` in `rewriteAstRow` is looser than the other kinds (prefix match, no technical-position check).
Add a fixture case (including a non-route string sharing the prefix) and tighten the match before the first slice that applies
front-route rows (01-21, Desk routes). Not blocking for 01-04.
Resolved: front-route rewrites now require technical route positions and segment boundaries, with fixture coverage and idempotency verified.

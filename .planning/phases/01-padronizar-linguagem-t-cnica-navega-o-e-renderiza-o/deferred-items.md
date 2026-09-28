# Deferred items

Out-of-scope findings logged during plan execution, per the executor's scope boundary
(only auto-fix issues directly caused by the current task's changes).

## 01-44

- **`apps/api/src/controllers/login.ts:91`** — the same open-redirect gap fixed in
  `apps/management-vite/src/lib/inbound.ts` (`caminhoInterno`, T-01-44-01: `/\evil` passes
  `startsWith('/') && !startsWith('//')` because a browser treats a leading backslash as a
  forward slash) exists server-side in the OAuth `returnTo`/`destino` validator
  (`destination.startsWith('/') && !destination.startsWith('//') ? destination : '/'`). The
  frontend fix in 01-44 is defense in depth; the server-side check is the actual security
  boundary and still accepts `/\evil`. Pre-existing, not introduced by 01-44, and
  `apps/api/**` is outside 01-44's `files_modified` scope (management-vite only). Needs its
  own fix (same one-line guard) in a plan that touches `apps/api/src/controllers/login.ts`.

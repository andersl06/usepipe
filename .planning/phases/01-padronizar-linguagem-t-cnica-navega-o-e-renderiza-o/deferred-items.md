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
  **Fixed in 01-45** (`destinationAbsolute` also rejects `/\`; regression test added to
  `apps/api/tests/inbound.test.ts`).

## 01-45

- **`apps/management-vite/src/lib/shell.ts:66`** — `href: '/entrar'` (PT), a dead link: the
  real login route is `/login` (English, since the STD-11 rename). Not a D-52 address
  (`/portal`, `/flow/`, `/router/`, `/create/`), and `apps/management-vite/src/**` is outside
  01-45's `files_modified` scope (only `nginx.conf`/`vite.config.ts` there). Allow-listed in
  `route-drift-allow.csv` so `route-match --front` still proves the D-52 surface clean; needs
  its own one-line fix in a plan that touches `apps/management-vite/src/lib/shell.ts`
  (STD-11 residual, D-53).
- **`apps/management-vite/src/pages/operation/history.tsx:433`** — `href="/termo-de-responsabilidade"`,
  a pre-existing dead link (no such route ever existed in `App.tsx`) unrelated to D-52 and
  outside 01-45's file scope. Allow-listed in `route-drift-allow.csv`; needs a real
  destination (or removal) decided by whoever owns that screen.
- **`.env.example:52`, `infra/compose/env.prod.exemplo:79`** — `PIPE_URL_ENTRADA=.../entrar`
  (PT), stale relative to the real `/login` route and to the VPS's actual value after the
  D-51 cutover (`.../login`, per the D-51 note in `01-CONTEXT.md`). Not a D-52 address either
  (STD-11 residual, same class as `shell.ts:66` above); needs the same fix in the plan that
  resolves the `/entrar` → `/login` residue.

---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 36
subsystem: ui
tags: [css, glossary, rename-map, desk-vite, gestao-vite, crm, packages-ui]

requires:
  - phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o (01-09)
    provides: approved GLOSSARY.md and CONVENTIONS-EN.md (D-03 gate 1)
provides:
  - std/map/css.csv fully proposed (status=proposed) for css-class, css-var, data-attr
  - std/reports/sample-css.csv 10% stratified review sample
  - check-map bug fixes for BEM modifiers and repeated CSS selector declarations
affects: [01-25 (applies the css map), 01-32 (final review), gate 2]

tech-stack:
  added: []
  patterns:
    - "CSS class/var/data-attr renames keep existing file/component-scoped abbreviation prefixes (dk-, bl-, ct-, g-, single/double-letter design-token codes) unchanged; only PT content tokens translate"
    - "Ambiguous glossary terms resolved per actual CSS usage, not the general codebase sense, with a glossary-exception note on every affected row"

key-files:
  created:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/out/map-codex1-css-g1-001.json
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/out/map-codex1-css-g2-001.json
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/out/map-codex1-css-g3-001.json
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/out/map-codex1-css-g4-001.json
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/out/map-codex1-css-g5-001.json
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/sample-css.csv
  modified:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/map/css.csv
    - tools/std/check-map.ts
    - tools/std/map-tools.test.ts

key-decisions:
  - "painel -> panel for every CSS occurrence (UI component sense); papel -> paper for every CSS occurrence (a 'paper' surface wrapper, not the permission-role sense). Both deviate from GLOSSARY.md's general-codebase term row and are marked glossary-exception per row."
  - "estado -> status where the CSS/data-attr value is a closed connection-status enum (dk-estado*, data-estado*); entrada -> inbound by default, overridden to input/entry per-occurrence where source comments prove a different sense."
  - "data-tooltip rows with Portuguese caption values kept verbatim (KEEP, category A): user-visible product text, out of this phase's scope."

requirements-completed: [STD-02, STD-10]

duration: ~2h
completed: 2026-09-24
---

# Phase 01 Plan 36: CSS Map Proposal Summary

**Proposed and reviewed English names for all 2632 css.csv rows (889 distinct class selectors, 55 custom properties, 20 data-attr identifiers), fixing two check-map false positives found along the way.**

## Performance

- **Duration:** ~2h
- **Tasks:** 2
- **Files modified:** 8 (1 map file, 5 proposal JSON files, 1 sample report, 1 shared tool + its test file)

## Accomplishments

- Every css.csv row moved from `status=candidate` to `status=proposed`, owner `codex1`, `persisted=no` (or `KEEP`/category A for the two user-visible tooltip rows).
- `check-map --scopes css --require-status proposed --glossary GLOSSARY.md`: 0 errors, 0 warnings.
- Fixed two check-map bugs that would have produced false positives on any CSS map: BEM double-dash modifiers were rejected as invalid casing, and the same selector redeclared at multiple lines in one file was flagged as a duplicate target.
- Prefix-family consistency check (451 families) found 1 candidate inconsistency, reviewed and confirmed to be two genuinely different concepts (not a real inconsistency).

## Task Commits

1. **Task 1: Codex account 1 proposes CSS names per file group** - `7935f05` (docs) — preceded by `06d2eb2` (fix, check-map tooling)
2. **Task 2: Sonnet review per file group; prefix-family consistency; check-map green** - `4923218` (docs)

_Note: per D-40, this agent performed both the proposal and the review directly (no `codex-run.sh`, no separate Sonnet handoff), so the review's fixes already landed inside the Task 1 commit rather than as a visible follow-up diff in the Task 2 commit — see Deviations._

## Files Created/Modified

- `.planning/phases/.../std/map/css.csv` - all 2632 rows proposed
- `.planning/phases/.../std/out/map-codex1-css-{g1..g5}-001.json` - proposal artifacts per file group (G1 packages/ui, G2 desk-vite, G3 gestao-vite, G4 crm+site, G5 data-attr), schema-validated against `tools/std/schemas/map-rows.schema.json`
- `.planning/phases/.../std/reports/sample-css.csv` - 10% stratified review sample (264 rows)
- `tools/std/check-map.ts` - BEM-modifier casing fix, same-selector-repeat collision fix
- `tools/std/map-tools.test.ts` - two new tests covering both fixes

## Decisions Made

- **File-group routing (G1-G5):** determined by `declared_at` path prefix for css-class/css-var; every data-attr row routes to G5 regardless of path, per the plan.
- **Opaque prefixes kept unchanged:** ~40 short (1-3 char) tokens are per-file/per-component abbreviation codes (e.g. `dk`=desk, `bl`=builder, `ct`=contacts, `da`=dashboard, `g`=global tokens, `t`/`lh`/`r`=typography/line-height/radius design-token codes) or already-English loanwords/proper nouns (`tag`, `avatar`, `oauth`, `pix`, `blip`...). Verified each by reading its `declared_at` source file before adding it to the keep-list, not by guessing.
- **painel vs papel:** both strip to visually similar ASCII once diacritics are removed, and GLOSSARY.md's general-codebase recommendation for each (`application` and `role` respectively) does not match either word's actual CSS usage. Checked source for every papel-containing selector (`ck-papel`, `cm-papel`, `gr-papel`, `lg-papel`, `dk-papel`, `cf-papel--*`...): all are `border-radius`/`background`/`box-shadow` "paper" surface wrappers, none are permission roles. `painel` in CSS is consistently a UI panel component (sidebars, drawers), matching CONVENTIONS-EN.md's explicit UI-component carve-out for `panel`, not the module/route `application` sense. Both get a `glossary-exception:` note per affected row so `check-map --glossary` doesn't warn.
- **entrada disambiguation:** default `inbound` (message direction, matches GLOSSARY.md and fits `mon-balao.entrada`/`dk-grupo-entrada`/`--entrada`/`bl-previa-linha--entrada`, all chat-bubble contexts). Overridden per exact identifier to `input` for `ct-entrada`/`ct-cartao-entrada*` (source comment references `.mt-card__attachtment__input`, a text field, paired with `.ct-selecao`), and to `entry` for the `entrada-passo*` family (the CSS comment explicitly calls it "a entrega de desenho da entrada" for the login page's own entry step, not a message).
- **estado -> status:** the CSS/data-attr `estado` cluster (`dk-estado*`, `data-estado`, `--dk-estado-min`) is exclusively a closed connection-status enum (`online`/`offline`/`pausa`/`chat`/`drawer`), matching the dono's decision-1 carve-out for status over the general `state` term.
- **Selector-count gap vs the plan's ~3,025 estimate:** css.csv carries 2068 css-class rows (889 distinct). A raw grep of every class selector across the same app/package CSS files found ~3,184 distinct selector-like tokens. The difference (~2,300) is selectors already in English or otherwise not flagged as PT-rename candidates by the earlier inventory step that produced css.csv — this plan's scope is "every candidate row of css.csv" (must_haves), and 0 candidate rows remain. css-var (510 rows / 55 distinct) and data-attr (54 rows / 20 distinct) are close to the plan's 482-var estimate (a raw grep found 511 distinct custom-property names total), confirming near-complete coverage there.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] check-map rejected every BEM double-dash modifier class as invalid casing**
- **Found during:** Task 1 (validating the first mechanical translation pass)
- **Issue:** `validCase()` for `css-class` used `/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/`, which has no allowance for `--` (the codebase's existing BEM modifier separator, e.g. `bl-bloco--erro`). Every renamed modifier class failed casing, ~64 distinct identifiers / ~172 rows.
- **Fix:** regex now allows `-{1,2}` between segments; a new test confirms double-dash passes while triple-dash and uppercase still fail.
- **Files modified:** `tools/std/check-map.ts`, `tools/std/map-tools.test.ts`
- **Verification:** `node --test tools/std/map-tools.test.ts` (22/22 pass); `check-map --scopes css` casing errors dropped to 0.
- **Committed in:** `06d2eb2`

**2. [Rule 1 - Bug] check-map flagged the same CSS selector redeclared in one file as a duplicate target**
- **Found during:** Task 1 (same validation pass)
- **Issue:** the collision key `symbol:kind:file:new` fired on ANY two rows sharing (kind, file, new), including two rows with the identical `old` value declared at different lines of the same file — normal for CSS (media-query variants, repeated rule blocks), producing ~85 false-positive "duplicate target" errors. The existing test suite's own collision test happened to use identical `old` values too, so a naive "same old is never a collision" fix would have silently broken TS-symbol collision detection.
- **Fix:** duplicate-target now only fires when `old` differs between the two rows, or when the row kind is not a repeatable-selector kind (`css-class`/`css-var`/`data-attr`) — TS symbols, files, dirs, routes, etc. keep the original strict behavior.
- **Files modified:** `tools/std/check-map.ts`, `tools/std/map-tools.test.ts`
- **Verification:** `node --test tools/std/map-tools.test.ts` (22/22 pass, including the pre-existing collision test unchanged); `check-map --scopes css` duplicate-target errors dropped to 0.
- **Committed in:** `06d2eb2`

---

**Total deviations:** 2 auto-fixed (both Rule 1, shared tooling bugs blocking this and every future CSS/HTML map plan)
**Impact on plan:** Both fixes are scoped to the collision/casing checks specific to CSS's declaration-repetition and BEM-modifier conventions; no other scope or kind's validation behavior changed (confirmed by the full existing test suite still passing). No scope creep — required to reach the plan's own acceptance criterion ("check-map for scope css exits 0").

## Issues Encountered

- An early draft of the translation dictionary set `painel` to `paper` by copy-paste from the separate `papel` decision, producing ~250 wrong translations and triggering 267 glossary warnings before the mismatch was caught by inspecting the warning output and re-reading the two words side by side. Corrected before any commit; the two decisions in "Decisions Made" above reflect the corrected, source-verified mapping.
- Three identifiers (`dk-ativa-pe`, `dk-massa-pe`, `entrar-pe`) and two custom-property identifiers (`--fora-da-busca`, `bl-no--fora-da-busca`) initially kept a leftover Portuguese function word (`pe`, `da`) because those tokens were also legitimate opaque prefixes elsewhere in the dataset. check-map's lexicon doesn't flag 2-letter tokens, so this would have passed silently; caught by manually re-reading the full old->new translation list before merging, not by the automated gate. Fixed with per-identifier overrides.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `std/map/css.csv` is ready for gate 2 review alongside the other scope maps (D-03 gate 2, D-35).
- Plan 01-25 can apply the approved rows once gate 2 clears; the css-var/data-attr full review and the sample file give the gate reviewer a concrete starting point beyond just `check-map`'s pass/fail.
- No blockers. The two check-map fixes are shared tooling and apply to any future map plan that touches CSS or HTML.

---
*Phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o*
*Completed: 2026-09-24*

## Self-Check: PASSED

- All key files (css.csv, 5 proposal JSONs, sample-css.csv, check-map.ts + test) confirmed present on disk.
- All 3 commit hashes (06d2eb2, 7935f05, 4923218) confirmed in git log.
- `check-map --scopes css --require-status proposed --glossary GLOSSARY.md`: 0 errors, 0 warnings (re-verified after commit).
- `node --test tools/std/map-tools.test.ts`: 22/22 passed (re-verified after commit).
- No candidate rows remain in css.csv.

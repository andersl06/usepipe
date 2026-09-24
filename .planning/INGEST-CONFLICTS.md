## Conflict Detection Report

### BLOCKERS (0)

None found. No UNKNOWN/low-confidence docs, no LOCKED-vs-LOCKED contradictions, no cross-ref cycle exceeding the traversal cap, and MODE=new means there is no existing locked CONTEXT.md to contradict.

### WARNINGS (0)

None found. There is exactly one PRD in this batch (`docs/specs/2026-09-05-o-que-falta.md`), so no competing PRD acceptance-criteria variants exist. All other apparent overlaps were resolvable via the explicit precedence override on PROJECT-HANDOFF.md — see INFO below.

### INFO (8)

[INFO] Auto-resolved: PROJECT-HANDOFF corrects ponte-lime.md's product-path decision
  Found: docs/specs/2026-09-12-ponte-lime.md documents the dono's decision, taken the morning of 12/09/2026, that "a tela que o cliente abre é a cópia [da Blip], e o Pipe responde por trás" — making the LIME bridge (`apps/ponte`) the primary UI path.
  Note: PROJECT-HANDOFF.md (precedence override 0, written 24/09) states this was reverted the same evening: "o produto é o aplicativo próprio (apps/gestao-vite e irmãos), não a cópia compilada da Blip... A ponte continua existindo, mas não é mais o caminho do produto." PROJECT-HANDOFF wins per its explicit precedence override. The LIME bridge spec remains technically valid as a lab/dev tool but is no longer the product's UI strategy.

[INFO] Auto-resolved: ADR fork-do-twenty reverses pipe-design.md's licensing rule
  Found: docs/specs/2026-09-05-pipe-design.md §2 ("regra de licença e reuso — vinculante") states `twenty-server`/`twenty-front` cannot be copied — "não pode copiar — ler e reimplementar" — because AGPLv3 would force releasing Pipe's full source to any networked user.
  Note: docs/specs/2026-09-07-fork-do-twenty.md (LOCKED ADR, two days later) reverses this: the CRM is now explicitly built as a fork of `twenty-server`/`twenty-front`, accepting the AGPL disclosure obligation for the CRM specifically, contained by an isolation boundary (separate repo, network-only integration, no fork code in `apps/*`/`packages/*`). ADR precedence + LOCKED status make this binding; pipe-design.md §2's rule is superseded for Twenty (its rule on `chatwoot/enterprise` is untouched).

[INFO] Auto-resolved: arquitetura-de-front.md supersedes pipe-design.md's Next.js architecture
  Found: docs/specs/2026-09-05-pipe-design.md §3 describes all three app frontends (desk, gestao, crm) as Next.js.
  Note: docs/specs/2026-09-07-arquitetura-de-front.md (vinculante, 07/09) explicitly states it "substitui o Next.js App Router nas três telas" in favor of Vite + React Router 6 + WebSocket. Confirmed as the implemented state by PROJECT-HANDOFF.md (precedence override 0): `apps/desk-vite` and `apps/gestao-vite` exist in code; the old `apps/desk`/`apps/gestao` (Next.js) do not. Same-tier SPEC-vs-SPEC conflict resolved by the later spec's explicit supersession language plus the precedence-override doc confirming actual code state.

[INFO] Note: arquitetura-de-front.md's Vite decision for apps/crm is not yet implemented
  Found: docs/specs/2026-09-07-arquitetura-de-front.md's URL table decides `crm.usepipe.com.br` should serve a Vite SPA, same as desk/gestao.
  Note: PROJECT-HANDOFF.md (precedence override 0, current state) confirms `apps/crm` is still Next.js on port 3300. This is an implementation gap against a decided target, not a contradicting decision — flagged so downstream roadmap work does not assume `apps/crm` has already migrated to Vite.

[INFO] Verified: LOCKED ADRs fork-do-twenty and crm-tinta-nossa are complementary, not contradictory
  Found: Both docs/specs/2026-09-07-fork-do-twenty.md and docs/specs/2026-09-07-crm-tinta-nossa.md are classified ADR/LOCKED (medium confidence, path-vs-content signal conflict noted by the classifier — both live under docs/specs/).
  Note: Full text of both was read per explicit instruction not to assume a LOCKED-vs-LOCKED blocker without checking. fork-do-twenty decides the CRM is a Twenty fork and sets the AGPL containment boundary; crm-tinta-nossa decides the fork's visual theming approach (color tokens, icons, custom fields) and explicitly reaffirms in its own §6 that fork-do-twenty's licensing boundary is untouched. No overlapping scope produces contradictory instructions between the two.

[INFO] Note: crm-tinta-nossa's claim of closing fork-do-twenty's four open questions is not substantiated by its content
  Found: docs/specs/2026-09-07-crm-tinta-nossa.md's header states it "fecha as quatro perguntas em aberto de fork-do-twenty" (destino de `apps/crm`, onde mora o lead, fonte de verdade do dado, como o atendimento vira lead).
  Note: The document's actual body (§1–§7) addresses only visual theming, tokens, icons, and custom fields — none of the four structural questions from fork-do-twenty §4 are answered. PROJECT-HANDOFF.md (precedence override 0, 24/09) confirms these remain open: "o papel de apps/crm... nunca foi decidido, nem em 07/09 nem depois." Auto-resolved via the higher-precedence status doc: downstream planning should treat fork-do-twenty §4's four questions as still open, not closed by crm-tinta-nossa.

[INFO] Cycle detection: benign companion cross-references, not blocking
  Note: The cross-ref graph contains three 2-node mutual references: pipe-design.md ↔ desk-requisitos.md, pipe-design.md ↔ metricas-atendimento.md, and fork-do-twenty.md ↔ crm-tinta-nossa.md. Each pair is a "see also" pointer between companion documents covering complementary scope (verified directly for the ADR pair above; the SPEC pairs are parent-design-doc ↔ detail-doc references with no contradicting content found on their overlapping scope). None represents a precedence-resolution loop. Treated as non-blocking; all docs in these pairs were synthesized normally. Logged here to satisfy the mandatory cycle-detection step, not because synthesis was withheld.

[INFO] Note: docs/specs/2026-09-05-comercial.md contains unformalized product requirements
  Found: comercial.md §7 lists three product requirements sourced from advisory input (observability export in Prometheus format, directory/AD integration, conversation-mining-as-product) that the document itself says "não estavam nas specs" as of 03/09.
  Note: Two of the three are now covered elsewhere (observability → infraestrutura.md; AD/directory integration → pipe-design.md §4.1 SSO). Conversation-mining-as-standalone-product is not tracked as a formal requirement anywhere in this batch. comercial.md is classified DOC (not PRD) per content-format signals, so it was extracted to context.md rather than requirements.md — flagged here so the roadmapper is aware a candidate requirement exists outside the formal PRD.

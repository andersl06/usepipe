# STD-11 map packet — draft, not ready for approval

Do **not** approve this packet yet. The 01-47 map is incomplete: the current inventory yields 2,964 candidate declarations for the identifier worklists, while 15,285 identifier findings include 11,054 occurrences without a declaration in the same file and 3,625 without even a matching name in the global inventory. The latter are captured in `reports/std11-identifier-global-gaps.csv`; candidate declarations are in `reports/std11-candidates.csv`. The current full-map validator also has 605 historical errors (`reports/std11-map-check.md`), none introduced by the route proposals below. No rename may run against this draft.

## Sensitive route proposals (all `proposed`, not applied)

| Method | Current | Proposed | Evidence |
|---|---|---|---|
| POST | `/v1/convites` | `/v1/invitations` | `controllers/convites.ts:13` and Management create-invite callers |
| GET | `/v1/convites/:token` | `/v1/invitations/:token` | `controllers/convites.ts:68`; public invite screens in Desk, Management and CRM |
| POST | `/v1/convites/:token/aceitar` | `/v1/invitations/:token/accept` | `controllers/convites.ts:82` |
| POST | `/v1/convites/:id/reenviar` | `/v1/invitations/:id/resend` | `controllers/convites.ts:45`; `:id`, not `:token` as written in the plan |
| GET | `/v1/etiquetas` | `/v1/labels` | `controllers/etiquetas.ts:34`; Desk and Management callers |
| GET | `/v1/eu` | `/v1/me` | `controllers/login.ts:385`; all three frontend sessions and tenant smoke script |
| POST | `/v1/auth/sair` | `/v1/auth/logout` | `controllers/login.ts:361`; all three frontend sessions |
| GET | `/v1/management/flows/:id/team/i` | `/v1/management/flows/:id/team/me` | `controllers/management-team.ts:49`; Management contact bar |
| frontend | `/application/detail/:shortName/channels/whatsapp/alerta` | `/application/detail/:shortName/channels/whatsapp/alert` | `management-vite/src/App.tsx:110`; accompanying `alerta.tsx` → `alert.tsx` and `AbaAlerta` → `AlertTab` rows |

`/activeMessage/send` in Desk stays unchanged: the captured Blip reference uses this same path, and `CONVENTIONS-EN.md` permits that exception. The historical applied row `/v1/gestao/fluxos/:*/equipe/eu` → `/v1/management/flows/:id/team/i` is not rewritten; a separate row proposes its correction. Producers and consumers are recorded on the proposed map rows and need full endpoint-contract review before approval.

`invitation` is in the approved glossary; `labels`, `accept`, `resend`, `logout`, and `alert` are proposed route vocabulary to confirm with the owner when the full packet is ready. All sensitive string contracts (wire keys, query params, error codes, cookies, storage, queue/job/event and data attributes) still need exhaustive review. No approval is requested now.

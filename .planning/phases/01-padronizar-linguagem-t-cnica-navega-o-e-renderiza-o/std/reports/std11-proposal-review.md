# First read-only proposal batch (01-47)

`out/std11/proposals/residual/residual-001.json` contains 300 schema-valid rows; all 300 IDs still exist in the refreshed 8,715-row candidate report, and all 10 `persisted=yes` rows propose `KEEP`. The JSON has **not** been merged into `std/map`.

Reviewed all 13 `literal-value` proposals in this batch and a seeded sample of 30 of the other 287 (`Get-Random -Count 30 -SetSeed 47`). Two literal proposals, `convite` in `management/contract.ts` and `limite_diario` in `message-active.ts`, are wire response values read elsewhere; translating just the producer would break consumers. They need linked contract rows and both sides traced before any merge. In the 30-row sample, `api-symbol-ba880887` translates the SSO test variable `entrada` to `inbound`, but it holds the result of `loginWithSso`; `signIn` is the appropriate candidate. That is 1/30 semantic errors (3.3%), above the plan's 2% ceiling. The batch therefore remains unaccepted; do not bulk-merge it or promote any row to `approved`.

The other sampled symbol names (`conversaId` → `conversationId`, `contarMensagensDoBot` → `countBotMessages`, `fetchDeVerdade` → `realFetch`, etc.) were consistent with their local context. This does not substitute for the required 100% sensitive review and 10% sample across the full map.

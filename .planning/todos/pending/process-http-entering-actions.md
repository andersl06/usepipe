---
title: ProcessHttp in entering actions skips the rest of the actions on resume
created: 2026-09-24
---

Found while fixing the ProcessHttp resume bug (fix 8dac98b). packages/core/src/fluxo/gerenciador.ts only resumes a suspended ProcessHttp correctly when it is in a block leaving actions ($leavingCustomActions). In entering actions ($enteringCustomActions) the resume cursor never matches and the actions after that ProcessHttp are silently skipped. Decide: support resume in entering actions, or have the Builder forbid ProcessHttp there. Real bug; out of Phase 1 scope.

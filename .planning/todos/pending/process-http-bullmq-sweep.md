---
title: Recovery sweep for process_http_execucao stuck in chamando (BullMQ mode)
created: 2026-09-24
---

Only memory-queue mode has a sweep (apps/api/src/filas.ts). In production (BullMQ, attempts: 1) any failure after the claim leaves the row in chamando and blocks every new message from that contact forever, with no alert. Add a periodic sweep with timeout + alert. See .planning/debug/process-http-auto-resume.md.

# Queue and metric cutover (01-16)

The VPS is rebuilt from scratch at cutover (D-43). Redis and its old queues and repeatable jobs are dropped; no old-queue drain or compatibility reader is needed. The lost-job impacts below describe what would happen if old jobs were discarded in an environment with real data. This deployment has none.

Queue constants are declared in `apps/workers/src/queues.ts` and imported by the API producer and its API-hosted consumers in `apps/api/src/queues.ts`. The Instagram token queue is local to the API. The workers consume delivery, aggregation, and import jobs in `apps/workers/src/main.ts`.

| Old queue | New queue | Consumer | Durable source / sweep | Lost-job impact |
| --- | --- | --- | --- | --- |
| `pipe-entrada` | `pipe-inbound` | API | None; raw Meta payload only in Redis job | Inbound message lost |
| `pipe-entrega` | `pipe-delivery` | Workers | `outbox_mensagem`; outbox sweep every 15 s | None after sweep |
| `pipe-agregacao` | `pipe-aggregation` | Workers | Daily 03:10 cron, previous day only | One day's aggregate if cutover crosses 03:10 |
| `pipe-espelho-crm` | `pipe-crm-mirror` | API | Contacts without mirror sweep, every 5 min | None after sweep |
| `pipe-midia` | `pipe-media` | API | Pending media sweep | None after sweep |
| `pipe-sla` | `pipe-sla` (KEEP) | API | Conversations needing SLA check sweep | None after sweep |
| `pipe-process-http` | `pipe-process-http` (KEEP) | API | None found | Flow can remain waiting on HTTP step |
| `pipe-dicionario-crm` | `pipe-crm-dictionary` | API | Hourly dictionary sweep | None after sweep |
| `pipe-importacao` | `pipe-import` | Workers | Import row and `importacao_arquivo`, but no sweep | Import can remain stuck |
| `pipe-instagram-token` | `pipe-instagram-token` (KEEP) | API | Daily renewal scheduler | None after scheduler runs |

Repeatable scheduler IDs are declared and consumed by `upsertJobScheduler` in `apps/workers/src/main.ts` or `apps/api/src/queues.ts`. The API-hosted worker in the latter file consumes the scheduled job; the workers-hosted worker in the former consumes the first two.

| Old scheduler ID | New scheduler ID | Queue | Pattern |
| --- | --- | --- | --- |
| `varredura-outbox` | `sweep-outbox` | `pipe-delivery` | Every `PIPE_ENTREGA_VARREDURA_MS`, default 15 s |
| `metrica-diaria` | `daily-metric` | `pipe-aggregation` | `PIPE_AGREGACAO_CRON`, default `10 3 * * *` |
| `varredura-espelho-crm` | `sweep-crm-mirror` | `pipe-crm-mirror` | Every `PIPE_ESPELHO_CRM_VARREDURA_MS`, default 5 min |
| `varredura-midia` | `sweep-media` | `pipe-media` | Every `PIPE_MIDIA_VARREDURA_MS`, default 5 min |
| `varredura-sla` | `sweep-sla` | `pipe-sla` | Every `PIPE_SLA_VARREDURA_MS`, default 60 s |
| `varredura-dicionario-crm` | `sweep-crm-dictionary` | `pipe-crm-dictionary` | Every `PIPE_DICIONARIO_CRM_VARREDURA_MS`, default 1 h |
| `renovacao-token-instagram` | `instagram-token-renewal` | `pipe-instagram-token` | Every `PIPE_INSTAGRAM_RENOVACAO_MS`, default 1 day |

The approved `job-name` rows above describe scheduler IDs. BullMQ job names themselves are unchanged: `entrada`, `chamar`, `entrega`, `espelhar`, `baixar`, `checar`, `sincronizar`, `importar`, `varredura`, and `dia-anterior`. They are passed to `Queue.add` or `upsertJobScheduler` in `apps/api/src/queues.ts` and `apps/workers/src/main.ts`; the corresponding workers consume them there. The HTTP job ID prefix remains `process-http-<id>` (KEEP), declared by the `jobId` option in `apps/api/src/queues.ts` and consumed by BullMQ deduplication on that queue.

Metrics are declared and exposed by `apps/api/src/metrics.ts`. The API queue state in `apps/api/src/queues.ts` supplies the queue gauges. Prometheus scrapes the API through `infra/observability/prometheus.yml`, and alert expressions in `infra/observability/alertas.yml` consume the applicable series. No Grafana dashboard JSON exists in `infra/observability`.

| Old metric | New metric | Consumer |
| --- | --- | --- |
| `pipe_http_requisicoes_total` | `pipe_http_requests_total` | Prometheus scrape; API HTTP request counter |
| `pipe_mensagem_entrega_total` | `pipe_message_delivery_total` | `EntregaFalhando` alert |
| `pipe_fila_profundidade` | `pipe_queue_depth` | Prometheus scrape |
| `pipe_fila_idade_item_mais_velho_segundos` | `pipe_queue_oldest_item_age_seconds` | `FilaParada` alert |
| `pipe_migration_pendente` | `pipe_migration_pending` | `MigrationPendente` alert |

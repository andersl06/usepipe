You are proposing, not editing. Do not modify any file. Output only JSON matching the schema. Read only files inside the current working directory; never open, read, print or quote `.env*` files, private keys, certificates (`*.pem`, `*.key`, `*.pfx`, `*.p12`) or any path outside the working directory, even if a file references them.

Classify rows whose `persisted` value is `unknown`. Open the declaring file and its consumers, then set `persisted` to `yes` or `no`. In `notes`, identify exactly where the value is stored, such as a table and column, Redis key, cookie, localStorage key, or external registration. Cite D-09, D-10, D-11, D-38, or D-40 in `decision_ref` as applicable.

Under D-38, the `pipe_sessao` cookie and Prometheus metric names are not treated as persisted and will be renamed. Under D-10, queue names, job payload keys, WebSocket events, and non-stored error codes are not persisted. Codes written to `erro_codigo` or `ultimo_erro` columns are persisted.

When a row's notes contain `jsonb:<table>.<column>`, default to `persisted=yes`: property names and literal members are keys or values in existing stored documents, including flows, in-flight executions, outbox replay, audit records, and CRM data. Answer `no` only when `notes` cites exact evidence that a named mapping function strips the property before insertion into that jsonb column.

# Inventory summary

| Scope | Kind | Rows |
|---|---|---:|
| packages-core | dir | 8 |
| packages-core | file | 23 |
| packages-core | literal-value | 83 |
| packages-core | script | 1 |
| packages-core | subpath-export | 6 |
| packages-core | symbol | 323 |
| packages-core | test-title | 154 |
| packages-core | ts-local | 173 |
| packages-core | ts-prop | 199 |
| packages-db | file | 45 |
| packages-db | literal-value | 180 |
| packages-db | script | 3 |
| packages-db | symbol | 171 |
| packages-db | test-title | 21 |
| packages-db | ts-local | 29 |
| packages-db | ts-prop | 302 |
| packages-contracts | file | 5 |
| packages-contracts | literal-value | 41 |
| packages-contracts | symbol | 76 |
| packages-contracts | ts-prop | 184 |
| packages-ui | dir | 1 |
| packages-ui | file | 6 |
| packages-ui | literal-value | 5 |
| packages-ui | symbol | 20 |
| packages-ui | ts-local | 11 |
| packages-ui | ts-prop | 10 |
| packages-ai | dir | 3 |
| packages-ai | file | 12 |
| packages-ai | literal-value | 19 |
| packages-ai | script | 1 |
| packages-ai | subpath-export | 3 |
| packages-ai | symbol | 90 |
| packages-ai | test-title | 52 |
| packages-ai | ts-local | 48 |
| packages-ai | ts-prop | 74 |
| packages-autenticacao | cookie | 1 |
| packages-autenticacao | dir | 3 |
| packages-autenticacao | file | 3 |
| packages-autenticacao | package | 1 |
| packages-autenticacao | symbol | 36 |
| packages-autenticacao | test-title | 24 |
| packages-autenticacao | ts-local | 42 |
| packages-autenticacao | ts-prop | 11 |
| packages-armazenamento | dir | 3 |
| packages-armazenamento | file | 1 |
| packages-armazenamento | package | 1 |
| packages-armazenamento | symbol | 15 |
| packages-armazenamento | test-title | 15 |
| packages-armazenamento | ts-local | 17 |
| packages-armazenamento | ts-prop | 3 |
| packages-tempo-real | dir | 3 |
| packages-tempo-real | file | 1 |
| packages-tempo-real | literal-value | 3 |
| packages-tempo-real | package | 1 |
| packages-tempo-real | symbol | 23 |
| packages-tempo-real | test-title | 8 |
| packages-tempo-real | ts-local | 3 |
| packages-tempo-real | ts-prop | 3 |
| packages-mcp | - | 0 |
| workers | file | 8 |
| workers | job-name | 2 |
| workers | literal-value | 22 |
| workers | queue | 7 |
| workers | symbol | 103 |
| workers | test-title | 19 |
| workers | ts-local | 39 |
| workers | ts-prop | 65 |
| api | cookie | 1 |
| api | dir | 8 |
| api | endpoint | 179 |
| api | error-code | 310 |
| api | file | 128 |
| api | job-name | 5 |
| api | literal-value | 83 |
| api | metric | 5 |
| api | script | 2 |
| api | subpath-export | 5 |
| api | symbol | 2164 |
| api | test-title | 606 |
| api | ts-local | 1418 |
| api | ts-prop | 1105 |
| ponte | app | 1 |
| ponte | dir | 3 |
| ponte | file | 6 |
| ponte | package | 1 |
| ponte | symbol | 59 |
| ponte | test-title | 17 |
| ponte | ts-local | 47 |
| ponte | ts-prop | 23 |
| desk-vite | dir | 9 |
| desk-vite | file | 33 |
| desk-vite | front-route | 2 |
| desk-vite | literal-value | 40 |
| desk-vite | symbol | 128 |
| desk-vite | test-title | 24 |
| desk-vite | ts-local | 132 |
| desk-vite | ts-prop | 64 |
| gestao-vite | app | 1 |
| gestao-vite | dir | 60 |
| gestao-vite | file | 176 |
| gestao-vite | front-route | 136 |
| gestao-vite | literal-value | 102 |
| gestao-vite | package | 1 |
| gestao-vite | symbol | 1205 |
| gestao-vite | test-title | 175 |
| gestao-vite | ts-local | 1055 |
| gestao-vite | ts-prop | 733 |
| crm | cookie | 1 |
| crm | dir | 22 |
| crm | file | 24 |
| crm | front-route | 19 |
| crm | literal-value | 43 |
| crm | storage-key | 2 |
| crm | symbol | 302 |
| crm | test-title | 24 |
| crm | ts-local | 174 |
| crm | ts-prop | 147 |
| site | dir | 3 |
| site | file | 1 |
| site | symbol | 5 |
| site | ts-local | 1 |
| infra | dir | 12 |
| infra | file | 35 |
| infra | literal-value | 5 |
| infra | script | 5 |
| infra | symbol | 9 |
| infra | test-title | 24 |
| infra | ts-local | 18 |
| css | css-class | 2068 |
| css | css-var | 510 |
| css | data-attr | 54 |

Total rows: 16628
Total comments: 6500
Total route dependents: 474

## Sanity check

| Category | Research figure | Extracted rows | Note |
|---|---:|---:|---|
| Endpoints | 207 method routes (all) | 179 | PT route subset; 0 PT baseline routes missing |
| Front routes | Gestao ~75 segments, Desk 11, CRM 21 pages | 157 | Gestao 136 mounted paths, Desk 2 PT routes, CRM 19 PT pages |
| Queues | 10 including English name | 7 | PT queue names |
| Scheduler IDs | 7 | 7 | All upsertJobScheduler literals |
| Error codes | ~108 unique | 310 | Per declaration occurrence |
| Test titles | 1,747 all | 1163 | PT subset |
| CSS classes | ~3,025 unique all | 2068 | PT selector occurrences |
| CSS vars | 482 unique all | 510 | PT declaration occurrences |
| literal-value | Not sized | 626 | Candidate union/technical const literal rows |
| data-attr | Not sized | 54 | Candidate attribute rows |
| jsonb-reach | Not sized | 140 | Rows below are per column; runtime Contexto and audit wrapper are excluded |

| JSONB column | Reached rows |
|---|---:|
| bloco.conteudo | 45 |
| dicionarioCampo.settings | 1 |
| execucaoPasso.entrada | 5 |
| execucaoPasso.saida | 4 |
| processHttpExecucao.contexto | 9 |
| processHttpExecucao.entrada | 5 |
| processHttpExecucao.pedido | 10 |
| processHttpExecucao.resposta | 2 |
| regraPrioridade.condicao | 19 |
| regraScore.condicao | 19 |
| transicao.condicao | 19 |
| webhookSaida.cabecalhos | 2 |

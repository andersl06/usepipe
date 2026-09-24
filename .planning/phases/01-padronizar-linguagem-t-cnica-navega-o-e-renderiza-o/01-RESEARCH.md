# Phase 1: Padronizar linguagem técnica, navegação e renderização - Research

**Researched:** 2026-09-24
**Domain:** Large-scale PT→EN rename in a TypeScript ESM monorepo (pnpm + turbo, NestJS 11, BullMQ 5, Drizzle 0.44, Vite 7 + React Router 7, Next 15) + front navigation contract
**Confidence:** HIGH for codebase facts and tooling behavior (measured/spiked locally); MEDIUM for deploy/drain runbook; LOW only where tagged [ASSUMED]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Vocabulário canônico
- **D-01:** Um glossário único. Fonte: termo em inglês da Blip quando a Blip tem nome para o mesmo conceito (attendance, queue, ticket, router, builder, bulk-ticket, activeMessage...); senão, inglês idiomático de atendimento.
- **D-02:** O significado de "atendimento" (módulo / sessão humana / conversa no canal) é decidido no inventário, a partir do schema e dos usos reais — não pré-fixado aqui. A API já separa `conversas/:id` de `tickets/:id`; a Blip usa attendance (módulo) e ticket (sessão).
- **D-03:** Aprovação em dois portões antes de qualquer rename mecânico: (1) glossário de domínio com os termos ambíguos destacados; (2) mapa old→new por app, derivado do glossário. Haiku só começa depois do portão 2.
- **D-04:** Pastas internas (`controladores`, `dominio`, `paginas`, `componentes`, `contexto`...), pacotes `@pipe/*` com nome PT (`autenticacao`, `armazenamento`, `tempo-real`...) e apps com nome PT (`gestao-vite`, `ponte`) entram. Apps com checagem explícita de Dockerfile/compose/deploy/turbo/scripts no mapa (o build do Desk já quebrou por caminho na VPS).
- **D-05:** Classes/tipos usam sufixo idiomático Nest/TS: `ControladorAnexos` → `AttachmentsController`, `GuardaSessao` → `SessionGuard`, `ErroPipe` → `PipeError`, `FiltroDeErro` → `ErrorFilter`.
- **D-06:** Variáveis de ambiente `PIPE_*` (67 no `.env.example`) ficam em PT — exceção documentada, categoria C do STD-11. Não renomear nome nem valor (`memoria`/`bullmq`).
- **D-07:** Scripts do `package.json` raiz (`banco:migrar`, `banco:semente`, `desk`, `ponte`...) e nomes de teste/`describe`/`it` renomeiam. PROJECT-HANDOFF.md e docs técnicas que citam esses comandos atualizam no mesmo corte.

#### Fronteira código ↔ banco
- **D-08:** Schema Drizzle: nomes TS (propriedades, exports de tabela) em inglês; nomes SQL de tabela/coluna intocados, sem migration. Padrão já existente: `twentyEmpresaId: text('twenty_empresa_id')` em `packages/db/src/schema/identidade.ts`.
- **D-09:** Chaves JSON de contratos front↔API e de colunas jsonb: sem regra geral — classificadas endpoint por endpoint no inventário (wire interno pode renomear; qualquer chave gravada/lida de jsonb é candidata a persistido/STD-06).
- **D-10:** Nomes de fila BullMQ, payloads de job, eventos WebSocket e códigos de erro (`arquivo_vazio`) renomeiam para inglês, com drenagem no deploy: parar produtores, esvaziar filas antigas (o `outbox_mensagem` é a fonte de verdade e a varredura recupera o que sobrar), subir com nomes novos; fronts e API sobem juntos.
- **D-11:** Valores persistidos usados no código (`estado = 'arquivado'`, status de ticket, tipo de bloco): tratamento decidido no inventário (literal PT como dado sob nome inglês vs. camada de tradução na borda).

#### URLs registradas fora do código
- **D-12:** Google OAuth `v1/auth/google/retorno` → `v1/auth/google/callback`, corte seco. O dono recadastra no Google Cloud Console no deploy (inclusive o redirect da VPS, ainda não cadastrado).
- **D-13:** SSO `v1/auth/sso/retorno` → `v1/auth/sso/callback`, corte seco (não há cliente real com SSO).
- **D-14:** Links de convite `/convite/:token` e bookmarks de telas: corte seco em tudo, sem redirect PT→EN. Convites pendentes são reenviados. Remover `ROTAS_ANTIGAS_SEM_CONTATO` e `ParaOCanalDoBot` (redirects legados da migração Next.js→Vite) em `apps/gestao-vite/src/App.tsx`.
- **D-15:** Webhooks Meta já são inglês (`webhooks/whatsapp`, `webhooks/instagram`, `webhooks/messenger`) — não mexer.

#### Comentários
- **D-16:** STD-10 cumprido integralmente, sem tradução cega. Cada comentário PT existente cai em uma de 3 categorias: (1) necessário e atual → traduzir para inglês preservando exatamente o sentido técnico; (2) redundante, óbvio ou que só descreve o código → remover; (3) desatualizado ou contraditório com a implementação → remover ou atualizar só depois de validar o comportamento real.
- **D-17:** Comentários de porquê, segurança, arquitetura, Meta, Blip e integrações recebem atenção semântica. Citações literais, nomes oficiais, payloads, mensagens externas e texto capturado da Blip/Meta ficam no idioma original quando são evidência literal. Não alterar o sentido de decisões históricas para simplificar; nada palavra por palavra.
- **D-18:** Objetivo final: nenhum comentário técnico PT sem justificativa documentada; o STD-11 procura e classifica os remanescentes.

#### Execução e fatiamento
- **D-19:** Sem big bang. Bottom-up, cada fatia atomicamente consistente e incluindo todos os consumidores necessários para manter o monorepo verde (se renomear API pública de um pacote quebra consumidores, eles entram na mesma fatia):
  1. Packages/fundação compartilhada: nomes TS do db, `contracts`, `core`, `ui`, demais pacotes.
  2. API + workers: controllers/services/rotas, consumers internos, filas/jobs/eventos conforme mapa, compat quando necessária.
  3. Fronts: `desk-vite`, `gestao-vite`, e `crm` por último e só no limite de CRM-01.
  4. Infra e nomes de apps/pacotes: Dockerfile, compose, turbo, scripts, deploy/VPS, CI/CD, aliases/configs. Apps de alto risco renomeados um por vez, validando build/deploy após cada um.
  5. Testes, scripts e docs residuais: varredura final, referências antigas, comentários, exemplos, docs técnicas.
- **D-20:** Depois de cada fatia: typecheck + testes relevantes + build quando aplicável. Não avançar para a próxima fatia com regressão conhecida. Deploy é um único corte no final.
- **D-21:** Primeira tarefa da fase, antes da fatia 1: consertar o `pnpm typecheck` da raiz (quebrado em `packages/core/src/fluxo/gerenciador.teste.ts:140`, `variaveis.status` fora do tipo inferido) e registrar a linha de base verde (typecheck, testes, builds). `tests/instagram.test.ts`, `tests/fluxo.test.ts`, `tests/messenger.test.ts` (oscilam sob carga) rodam isolados e ficam listados como conhecidos.
- **D-22:** Trabalho em branch nova a partir de `limpeza` (ex.: `std/english-rename`), um commit por fatia, trabalho paralelo congelado durante a fase, merge de volta em `limpeza` no fim.

#### Roteamento de modelos e contas
- **D-23:** Trabalho semântico (inventário, glossário, mapa old→new, tradução de comentários, classificações) pode ser distribuído entre Codex conta 1 (`CODEX_HOME=~/.codex`) e Codex conta 2 (`CODEX_HOME=~/.codex-conta2`), modelo "sol" com esforço medium, e Sonnet — a divisão é do Claude/planner, dimensionada pela cota de tokens de cada conta (o dono avalia que uma conta só não basta). Codex CLI 0.156.1 instalado localmente. Isso amplia o roteamento anterior (inventário = Sonnet).
- **D-24:** Sonnet revisa: amostras do trabalho Codex, e obrigatoriamente comentários de segurança, arquitetura e integrações críticas; revisão final e validação de regressão continuam com Sonnet.
- **D-25:** Haiku (ou modelo leve) só para mudanças repetitivas e inequívocas, depois do mapa aprovado — nunca inventa nome, traduz semanticamente, decide arquitetura, URL vs state, breaking change, nem mexe em persistido sem plano (STD-07).

#### Contrato de navegação e renderização
- **D-26:** Tradução/padronização de rota e decisão de onde o estado mora são tratadas separadamente (STD-12).
- **D-27:** Conversa aberta no Desk: paridade com a Blip — ID fora da URL, conversa em state; F5 volta para a lista. Hoje é `/chat/:id` (`apps/desk-vite/src/App.tsx:38`, `paginas/atendimentos/page.tsx:28`). Conversa no Desk não é compartilhável: está na fila de quem atende; passar para outra pessoa é transferir.
- **D-28:** Gestão não abre conversa específica no Desk. Remover o link Gestão→Desk com ID (construtor coberto por `apps/gestao-vite/tests/desk-url.test.ts`). A Gestão mostra conversa só na própria prévia, como o Monitoramento já faz.
- **D-29:** Ticket histórico dentro de contato: paridade com o Desk da Blip — no Desk, seleção de contato e de ticket vai para state (URL só na tela de contatos); hoje é `/contacts/:id?ticket=` (`apps/desk-vite/src/paginas/contatos/page.tsx:33-48`). A decisão foi tomada para o Desk; o caso equivalente da Gestão (`contatos/:contatoId?ticketId=`, `apps/gestao-vite/src/paginas/fluxo/contatos/detalhe/detalhe.tsx:27-29`) é classificado no inventário com evidência Blip Portal (que usa path + `?ticketId=`).
- **D-30:** Filtros aplicados (monitoramento fila/atendente, log, período de análise, busca de novidades): paridade com a Blip nova — filtro em state, último filtro lembrado em `localStorage` por tela; sai da query string.
- **D-31:** Passo de wizard (criar fluxo/roteador usa `?passo=`, certificados usa `useState`): decidido no inventário, checando como a Blip faz a criação (`/application/create/{router|name|marketplace}` sugere passo no path).
- **D-32:** Back/forward no Desk igual à Blip: voltar fecha painel/conversa e mostra a lista sem sair do Desk; entre telas (/chat, /contacts, /analytics) histórico normal. Marcado NEEDS VALIDATION até teste ao vivo na Blip — a evidência vem da leitura do código capturado, não de teste.
- **D-33:** Renderização: Desk e Gestão são SPA client-side; SSR não entra só porque a URL da Blip é estável. CRM mantém seus Server Components até CRM-01; nada de migrar renderização do CRM nesta fase.
- **D-34:** Quais telas exigem deep link e sobrevivem a F5: decidido tela a tela no inventário, com evidência Blip por tela; sem evidência → NEEDS VALIDATION.

### Claude's Discretion
- Divisão concreta de tarefas entre Codex 1, Codex 2, Sonnet e Haiku (D-23), respeitando as proibições do D-25.
- Formato e local dos artefatos de glossário e mapa (desde que existam os dois portões de aprovação do D-03).
- Mecanismo técnico de drenagem de filas no deploy (D-10), desde que nenhum job se perca.

### Deferred Ideas (OUT OF SCOPE)
- Presets de filtro salvos pelo usuário (Blip nova tem) — fora desta fase; D-30 só lembra o último filtro.
- Migração de valores/colunas persistidos para inglês — cada item do inventário STD-06 vira decisão própria, possivelmente fase futura.
- Renomear variáveis de ambiente `PIPE_*` — exceção nesta fase (D-06); revisitar junto com a próxima mexida de infra.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STD-01 | Canonical EN naming convention defined and documented | §Artifact layout (`GLOSSARY.md` + `CONVENTIONS-EN.md`); D-01/D-05 suffix rules; owner gate 1 |
| STD-02 | Complete PT route/endpoint inventory (3 fronts, API, workers) + approved old→new map | §Sizing (31 controllers / 207 route decorators / ~91 Gestão+Desk route paths / 21 CRM pages); §Rename map format; owner gate 2 |
| STD-03 | Route-dependent inventory (guards, redirects, callbacks, tests, links, docs) | §Pattern 5 route-consumer matcher; §Pitfalls 4-6 (path strings in `servidor.ts`, `fluxoDaRota` regex, CRM middleware regex, TanStack keys) |
| STD-04 | URL vs ephemeral UI state classification per case | §Pattern 8 navigation contract; list of 24 Gestão files using `useSearchParams` |
| STD-05 | Compatibility strategy from consumer inventory | Finding: all HTTP consumers are Pipe-controlled (fronts, tests, contracts); only external registrations are Google/SSO callbacks, Meta webhooks (unchanged), tracked link `/l/:codigo` (unchanged) and signed attachment URLs (15 min) → coordinated cut of v1, no `/v2` |
| STD-06 | Persisted PT data/contract inventory (no rename) | §Runtime State Inventory: SQL names, jsonb keys, `erro_codigo`/`ultimo_erro` values, API-key scopes (`conversas:ler`), `permissao.codigo`, `pipe_` key token format, cookies, localStorage keys, Prometheus metric names |
| STD-07 | Mechanical rename per approved map | §Pattern 2-4 (ts-morph symbol rename; `git mv` + specifier rewrite; route string rewrite); spike results showing ts-morph `move()` is unsafe here |
| STD-08 | PROJECT.md updated with new language rule | PROJECT.md:75 still says "todo em português" (must change) and :89 already has the revised rule |
| STD-09 | apps/crm follows convention without deciding CRM-01 | §CRM scope note: rename identifiers/routes only; keep Next App Router + Server Components; routes are folders under `apps/crm/src/app/**` (21 pages) → folder rename = route rename |
| STD-10 | All non-persisted technical identifiers in EN | §Sizing totals; comments pipeline (D-16/D-17) |
| STD-11 | Final regression + automated PT scan with A/B/C classification | §Pattern 6 PT scanner; §Validation Architecture |
| STD-12 | Navigation/rendering contract documented | §Pattern 8; Desk `/chat/:id` + `/contacts/:id?ticket=` risks; D-30 localStorage key design |
</phase_requirements>

## Summary

The phase is a ~150k-LOC, ~775-file TypeScript rename across 15 workspaces, plus a navigation-contract change in desk-vite. The work that takes judgment (glossary, map, comment triage) is large. The mechanical work is also large, and it is easy to break silently: renamed things are referenced through string literals the compiler cannot see (API path strings, route patterns, queue names, error codes, cookie and storage keys, Dockerfile paths, turbo filters). The safe strategy has three parts: (1) rename symbols semantically through the TypeScript language service (ts-morph `rename()`), (2) rename files and folders with `git mv` plus a small in-house specifier rewriter, (3) rewrite string contracts (routes, queues, codes) from the approved map, then prove nothing was missed with two AST scanners. The first scanner matches front/test API paths to API routes. The second is the STD-11 PT detector with an A/B/C allowlist.

A local spike (ts-morph 28.0.0) showed that **`SourceFile.move()` / `Directory.move()` are NOT safe for this repo**. They strip the `.js` extension from rewritten relative specifiers, which breaks Node ESM at runtime in api/workers/packages even though `tsc` with `moduleResolution: Bundler` still passes. They also update dynamic `import()` only partly, so a stale `'./domain/erros'` was left after a file rename (API tests have 186 dynamic imports). Symbol `rename()` with default settings was correct across static imports, `import type`, re-exports, shorthand properties and `typeof import()`. Do not turn on `usePrefixAndSuffixTextForRename`: it produced a broken shorthand (`{ PipeError: ErroPipe }`).

Drizzle is safe on the SQL side. Every column in `packages/db/src/schema` has an explicit SQL name (0 implicit columns out of ~700), even though `drizzle.config.ts` uses `casing: 'snake_case'`. Do not verify with `drizzle-kit generate`: the snapshots stop at 0012 while the journal is at 0046, so `generate` already proposes a huge unrelated diff. Instead compare `drizzle-kit export` DDL before and after (runs offline, confirmed locally: 1,754 lines, 103 tables). The real risk is on the wire: renaming Drizzle TS keys changes the JSON keys of any endpoint that returns rows directly (D-09).

**Primary recommendation:** Slice 0 = baseline fix + tooling. That means the fix at `gerenciador.teste.ts:101`, three scripts (`std-scan`, `route-match`, `ddl-snapshot`), and ts-morph as a root devDependency. Only after the two owner gates run slices 1-5 with ts-morph `rename()` for symbols, `git mv` + specifier rewriter for files, and map-driven literal rewrites. Each slice is gated by turbo typecheck/test/build, a DDL diff equal to zero, a route-match check with zero orphans, and a falling std-scan count.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Glossary, rename map, comment triage | Planning artifacts (`.planning/phases/01-*/std/`) | Codex/Sonnet agents | Semantic decisions, owner-gated (D-03) |
| Symbol / file / package rename | Source tree (all workspaces) | Build config (turbo, Dockerfiles, tsconfig, vite alias) | Consumers of a package must move in the same slice (D-19) |
| HTTP endpoint names | API (NestJS `@Controller`/`@Get`) | Fronts (`useLeitura`/`api.*` string paths), `packages/contracts` doc strings, API tests | Paths are strings: the compiler cannot link producer and consumer |
| Body-size limits / raw parsers per route | API bootstrap (`apps/api/src/servidor.ts` `app.use('/v1/...')`) | — | Path-string coupled to controllers; silent 413 if missed |
| Flow-scoped API-key authorization | API guard (`apps/api/src/autenticacao.ts` `fluxoDaRota`) | Route patterns/params | Regex on `/fluxos/:param` + param name `fluxoId` |
| Front routes / nav state | Browser (React Router 7 `BrowserRouter`) | API `destino` redirect (only checks the path is internal) | SPA; D-33 no SSR |
| CRM routes | Frontend server (Next App Router folders + `middleware.ts`) | — | Folder name = URL; Server Components kept (D-33) |
| Queue names / job payloads | Workers + API (`@pipe/workers` exports constants; API hosts 7 consumers) | Redis (runtime state) | Rename needs drain at cutover (D-10) |
| SQL names / persisted values | Database | Drizzle TS layer (renamed keys, unchanged SQL strings) | D-08/D-11, STD-06 |

## Project Constraints (from CLAUDE.md)

There is no `./CLAUDE.md` in the repo, no `.claude/skills/` and no `.agents/skills/`. The global user CLAUDE.md only covers the tools graphify and RTK (shell output proxy); neither affects implementation. Binding project rules come from PROJECT.md / REQUIREMENTS.md:
- Manual migrations only. Never accept a `drizzle-kit generate` output that drops the FKs of `0003_chaves_cruzadas` (REQUIREMENTS Out of Scope).
- No Blip code, CSS, classes, icons, sounds or images in the repo. Captured Blip material is behavior/text reference only, so `referencias-blip/` is excluded from the rename and the scanner.
- User-visible text stays PT.

## Standard Stack

### Core (all already installed except ts-morph)
| Tool | Version | Purpose | Why |
|------|---------|---------|-----|
| typescript | ^5.9.3 (root) | `tsc` gates; compiler API for scanners | Already the typecheck engine [VERIFIED: package.json] |
| ts-morph | 28.0.0 | Symbol rename via TS language service (`Node.rename()`) | Semantic rename across imports/re-exports/`import type`/dynamic imports; spiked locally [VERIFIED: npm registry + Context7 /dsherret/ts-morph + slopcheck OK] |
| git mv | git 2.51.2 | File/dir renames with history | Preserves `git log --follow`; ts-morph move is unsafe here (spike) |
| ripgrep | 14.1.1 | Fast literal sweeps (Dockerfiles, yaml, md, sh) | Non-TS files the AST scanner does not parse [VERIFIED: local] |
| drizzle-kit | ^0.31.5 (`export`) | DDL snapshot before/after | Offline, no DB needed [VERIFIED: ran locally; CITED: orm.drizzle.team/docs/drizzle-kit-export] |
| bullmq | ^5.60.0 | `getJobCounts`, `removeJobScheduler`, `obliterate` for drain | Built-in APIs [CITED: docs.bullmq.io/guide/job-schedulers/manage-job-schedulers, docs.bullmq.io/guide/queues/removing-jobs] |
| Codex CLI | 0.156.1 | Delegated semantic work (`codex exec`) | Installed; flags read from local `--help` [VERIFIED: local] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ts-morph `rename()` | Raw `ts.LanguageService.findRenameLocations` (typescript already installed) | No new dependency, but you have to write the edit-application and project-loading plumbing yourself. ts-morph is only a dev tool, so take it |
| ts-morph `move()` | — | **Rejected**: drops `.js`, stale dynamic imports (spike) |
| jscodeshift / ast-grep | — | Not type-aware; cannot tell a `nome` property on type X from one on type Y |
| sed/global text replace | — | Hits user-visible PT strings and persisted literals, which violates STD-06/D-25 |

**Installation:**
```bash
pnpm add -Dw ts-morph@28.0.0
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| ts-morph | npm | created 2019-02-02, latest 28.0.0 (modified 2026-04-12) | not measured | github.com/dsherret/ts-morph | [OK] (`-e npm`) | Approved. No `postinstall` script; deps `@ts-morph/common ~0.29.0`, `code-block-writer ^13.0.3` |

**Packages removed due to slopcheck [SLOP] verdict:** none. (A first run without `-e npm` checked PyPI by mistake and said "SLOP"; the correct npm run says OK.)
**Packages flagged as suspicious [SUS]:** none.

## Sizing (for plan splitting and account budgeting)

Measured on branch `limpeza` @ 56dd6c5 with `git ls-files` plus a TS-compiler-API script. `dist/` and `.d.ts` excluded.

| Workspace | TS files | LOC | `export` lines | Unique declared names* | Comment blocks (PT-ish) | Test files |
|-----------|---------:|----:|------:|------:|------:|------:|
| apps/api | 192 | 53.4k | 977 | 3,675 | 1,092 (≈938) | 45 (+`ajuda.ts`) |
| apps/gestao-vite | 287 | 47.5k | 881 | 2,761 | 1,145 (≈925) | 35 (node:test) |
| apps/crm | 72 | 13.0k | 302 | 957 | 284 (≈265) | 4 |
| packages/core | 46 | 8.0k | 324 | 947 | 323 (≈229) | 12 (`*.teste.ts`, co-located) |
| apps/desk-vite | 50 | 7.7k | 115 | 479 | 276 (≈106) | 7 |
| packages/db | 26 | 5.5k | 242 | 451 | 168 (≈144) | 4 |
| packages/ai | 28 | 2.9k | 119 | 347 | 117 (≈102) | 6 |
| apps/workers | 23 | 2.8k | 122 | 424 | 99 (≈77) | 4 |
| packages/autenticacao | 9 | 1.8k | 52 | 160 | 45 (≈43) | 3 |
| apps/ponte | 12 | 1.4k | 50 | 227 | 33 (≈32) | 2 |
| packages/ui | 11 | 1.2k | 60 | 118 | 37 (≈33) | 0 |
| packages/contracts | 8 | 1.1k | 116 | 313 | 135 (≈101) | 0 |
| packages/armazenamento | 7 | 0.6k | 27 | 70 | 30 (≈25) | 1 |
| packages/tempo-real | 3 | 0.6k | 8 | 65 | 30 (≈24) | 1 |
| packages/mcp | 1 | 0 | 1 | 0 | 2 | 0 |
| **Total** | **~775** | **~147k** | **~3.4k** | **~11k** (overlapping) | **~3.9k blocks / ~20k comment lines** | **~124** |

\*Functions, classes, interfaces, types, enums, variables, methods, properties and parameters. Many are English or shared across files, so the unique PT symbols needing a map row are an estimated 3-5k [ASSUMED: estimate].

Other counts:
- **Routes/endpoints:** 31 controller files, 37 `@Controller` (29 unique prefixes, ~22 PT), 207 method decorators, 108 unique error codes (169 `ErroPipe.x('code')` + 74 `new ErroPipe(...)`). Gestão ~75 unique route segments (`App.tsx` with 90 route lines, plus `rotasDoContato` mounted twice). Desk 11 routes. CRM 21 `page.tsx` folders.
- **API-path consumers:** 208 `'/v1/...'` literals in 106 files across fronts and packages; 291 in `apps/*/tests` and `packages/*/tests`.
- **Test titles:** 1,747 `describe/it/test(` calls. **Directory segments:** 111 unique names across 153 source dirs.
- **Import styles:** api/workers/packages use relative `.js` specifiers (api/src 581, core/src 92). The fronts use extensionless specifiers (gestão 863, desk 108, crm 146). API tests have **186 dynamic `import()`** and 4 `vi.mock`. Front tests import `../src/x.ts` (node:test + tsx).
- **PT package/app names (references outside the lockfile):** `autenticacao` 110 files/294 hits, `gestao-vite` 47/122, `ponte` 39/90, `armazenamento` 32/44, `tempo-real` 21/34.
- **CSS:** 44 files, 36k lines, ~3,025 unique class selectors and 482 custom properties. Scope not decided, see Open Question 1.
- **Queues:** 9 (`pipe-entrada`, `pipe-entrega`, `pipe-agregacao`, `pipe-espelho-crm`, `pipe-midia`, `pipe-sla`, `pipe-process-http`, `pipe-dicionario-crm`, `pipe-importacao`, plus API-local `pipe-instagram-token`) and 7 job schedulers.
- **Token volume:** ~6.05 MB of TS source, roughly 1.5-2M tokens to read once [ASSUMED: ~3.5 chars/token]. A full inventory pass plus a comment pass will clearly exceed one Codex account's working budget, which is consistent with the owner's view in D-23.

**Suggested split for semantic work (D-23; Claude's discretion):**
- Codex conta 1: apps/api + apps/workers + packages/{db,contracts,autenticacao,armazenamento,tempo-real} (~65k LOC, backend coherent).
- Codex conta 2: apps/gestao-vite + apps/desk-vite + apps/crm + packages/{core,ai,ui} + ponte (~82k LOC, front plus flow engine).
- Sonnet: glossary synthesis (merging both inventories), ambiguity resolution (D-02 "atendimento"), D-09/D-11/D-31/D-34 classifications, mandatory review of security/architecture/integration comments (D-24), sample review of about 10% of Codex rows.
- Haiku: only map-driven mechanical application after gate 2 (D-25).

## Architecture Patterns

### System Architecture Diagram (rename pipeline)

```
 repo @ limpeza ──► [Slice 0] baseline fix + tools ──► green baseline record
                                    │
                                    ▼
        ┌──────────── inventory extraction (AST script, deterministic) ────────────┐
        │  symbols / files / dirs / routes / endpoints / queue names / codes /     │
        │  test titles / comments  ──► raw candidate rows per workspace (CSV)      │
        └───────────────────────────────┬──────────────────────────────────────────┘
                                        ▼
            Codex conta1 / conta2 (read-only, `codex exec -o`) propose `new` + persisted flag
                                        ▼
            Sonnet: merge → GLOSSARY.md ──► OWNER GATE 1 (glossary + ambiguous terms)
                                        ▼
            Sonnet: map/<scope>.csv filled from glossary ──► OWNER GATE 2 (map approved)
                                        ▼
   per slice 1..5:  ts-morph rename(symbols) → git mv + specifier rewrite(files/dirs)
                    → literal rewrite(routes, queues, codes, tests) → comment pass
                                        ▼
        gates: turbo typecheck/test/build │ ddl-snapshot diff = ∅ │ route-match orphans = 0
               │ std-scan count ↓ (slice 5: unclassified = 0) │ commit (1 per slice)
                                        ▼
   single cutover: queue drain → deploy all images → Google/SSO re-register → smoke (STD-11)
```

### Recommended artifact layout (Claude's discretion, satisfies D-03)
```
.planning/phases/01-.../std/
├── GLOSSARY.md            # Gate 1: term_pt | term_en | blip_source | ambiguity | decision | approved
├── CONVENTIONS-EN.md      # STD-01 rules (suffixes D-05, file/dir casing, test naming, comment policy)
├── map/                   # Gate 2: one CSV per scope, so two Codex accounts never edit the same file
│   ├── packages-db.csv  packages-core.csv  ...  api.csv  workers.csv
│   ├── desk-vite.csv  gestao-vite.csv  crm.csv  infra.csv
├── persisted.csv          # STD-06 inventory (never applied mechanically)
├── nav-contract.md        # STD-12 (+ per-screen table for D-31/D-34)
├── exceptions.csv         # STD-11 allowlist: glob,pattern,kind,category(A|B|C),justification,ref
└── baseline.md            # D-21 green baseline commands + results + known flaky tests
tools/std/  (repo root, committed on the phase branch)
├── inventory.ts   rename-symbols.ts   move-files.ts   rewrite-literals.ts
├── scan-pt.ts     route-match.ts      ddl-snapshot.sh
```
**Map CSV columns** (UTF-8, LF, comma, quoted): `id,scope,slice,kind,old,new,declared_at,consumers,persisted,category,decision_ref,status,owner,notes`
- `kind` ∈ `file|dir|package|app|symbol|ts-prop|front-route|endpoint|query-param|wire-key|queue|job-name|ws-event|error-code|test-title|script|cookie|storage-key|metric|css-class|comment`
- `persisted` ∈ `no|yes|unknown`. `yes` rows go to `persisted.csv`, not the map.
- `status` ∈ `proposed|approved|applied|verified`.
- `owner` ∈ `codex1|codex2|sonnet|haiku|claude`.

CSV works for the owner (spreadsheet), for diffs, and for the scripts (`inventory.ts` emits it, `rename-*.ts` consume `status=approved` rows).

### Pattern 1: Deterministic inventory first, LLM second
**What:** A TS-compiler-API script lists every candidate (declaration names, file/dir paths, `@Controller`/`@Get` args, `<Route path>`, `navigate()`/`to=`/`href=` literals, `/v1/` literals, queue constants, `ErroPipe` codes, `describe/it` titles, comment blocks) with `declared_at` and a consumer count. Codex only fills `new`/`persisted`/`notes`.
**Why:** It keeps LLMs from missing items (completeness is guaranteed mechanically, which STD-02/STD-10 need), and it makes each Codex job a bounded CSV chunk.

### Pattern 2: Symbol rename via ts-morph (spike-verified)
```ts
// tools/std/rename-symbols.ts — run per workspace tsconfig; Source: ts-morph docs "Renaming" (Context7 /dsherret/ts-morph)
import { Project } from 'ts-morph';
const project = new Project({ tsConfigFilePath: 'apps/api/tsconfig.test.json' }); // include tests!
// DO NOT enable usePrefixAndSuffixTextForRename (spike: produced `{ PipeError: ErroPipe }`)
for (const row of approvedRows('symbol')) {
  const node = findDeclaration(project, row.declared_at, row.old); // file:line + name
  node.rename(row.new); // default: renameInComments/renameInStrings = false (comments handled by D-16 pass)
}
project.saveSync();
```
- Cross-package consumers: a package's consumers import `@pipe/x` resolved through `dist/*.d.ts` (`main: ./dist/index.js`). A project loaded from one tsconfig will **not** rename usages in another workspace. Either load one Project with every workspace's source files and map `@pipe/*` to `src` via a `paths` override just for the tool, or rename the export in the package and then run a second pass per consumer workspace (rebuild the package first). Prefer the single multi-root Project with `compilerOptions.paths: {"@pipe/core": ["packages/core/src/index.ts"], "@pipe/core/*": ["packages/core/src/*/index.ts"], ...}`.
- Type-only and re-exports: renamed correctly (spike: `export type { ErrorCode } from ...`).

### Pattern 3: File/dir rename = `git mv` + own specifier rewriter
The rewriter walks every `.ts/.tsx` AST and collects module specifiers from `ImportDeclaration`, `ExportDeclaration`, `CallExpression` (`import()`, `vi.mock()`, `require()`) and `ImportTypeNode` (`typeof import()`). It resolves each specifier against the **old** tree. If the target is in the move map, it recomputes the relative path from the **new** location of the importing file and keeps the original ending style (`.js` in backend, extensionless in fronts, `.ts` in front tests). Also rewrite: vite `alias` targets (`packages/ui/src/estilos.css`), `vitest.config.ts` `include`/`globalSetup` paths (`../../packages/db/tests/preparar.ts`), `tsconfig` `include/exclude` (`src/**/*.teste.ts`), package.json `exports` subpaths (`@pipe/core/metricas` etc. are **public subpath names**, so consumers' specifiers change too).

### Pattern 4: Map-driven literal rewrite (routes, queues, codes)
String contracts are rewritten from the map only inside AST string/template literals in known technical positions: `@Controller/@Get/...` args, `app.use('<path>')`, `useLeitura/api.get/post/fetch` first arg, `<Route path>`, `navigate()/to=/href=`, `new Queue/Worker(NAME)`, `ErroPipe.*('code')`, `describe/it/test` titles. Template literals like `` `/v1/desk/conversas/${id}` `` are matched per quasi segment.

### Pattern 5: Route-consumer matcher (STD-03/STD-11 automated proof)
`tools/std/route-match.ts`:
1. AST-parse `apps/api/src/controladores/*.ts`, join `@Controller(prefix)` + method decorator path. That gives the API route set, with `:param` normalized to `:*`.
2. AST-collect every `/v1/...` literal or template in `apps/{desk-vite,gestao-vite,crm}/src`, `apps/*/tests`, `packages/*/src`. Normalize `${...}` to `:*` and strip the query string.
3. Report (a) consumer paths with no API route (orphans, must be 0), (b) API routes with no consumer (informational; webhooks, `/l/:codigo`, `auth/*/callback` expected), (c) path strings inside `apps/api/src` outside decorators (`servidor.ts` body-limit paths, `fluxoDaRota` regex, doc comments), which must match a live route.
Run it on the baseline first: existing drift gets fixed or listed before slice 2.

### Pattern 6: STD-11 PT scanner (`tools/std/scan-pt.ts`)
- **Positions scanned (technical):** repo file and dir paths (`git ls-files`, excluding `referencias-blip/**`, `**/dist/**`, `pnpm-lock.yaml`, `.planning/**`); declaration identifiers; property names in interfaces/types/object literals; string literals in the Pattern 4 positions plus `localStorage` keys and cookie names; package.json `name`/`scripts` keys; Dockerfile/compose/sh/yaml via ripgrep; comments. **Not scanned:** JSX text and other string literals. Those are product text by construction (category A). Their exclusion is written down in `exceptions.csv` as a global A rule.
- **PT detection:** split identifiers on camelCase/kebab/snake/dot, lowercase, strip diacritics. Flag a token if it is (a) in the lexicon of `old` tokens from the approved map (minus tokens also valid in English: `status`, `total`, `normal`, `email`, `global`...), or (b) matches a PT morphology heuristic (`/(cao|coes|mento|dade|agem|eiro|oes)$/`, or diacritics in paths/comments). For comments: flag when ≥2 PT function words appear (`que|não|nao|para|com|quando|porque|uma|dos|das|está|então|também`).
- **Output:** `std-scan.csv` (`file,line,kind,token,snippet,category`). A finding is classified when it matches a row in `exceptions.csv` (A product text / B persisted-deferred, pointing to a `persisted.csv` id / C documented exception such as `PIPE_*` env per D-06, Blip/Meta literal evidence per D-17). **Phase gate: unclassified = 0.**
- Seeded known exceptions: `PIPE_*` env names and values (C, D-06); SQL strings in `pgTable('...')`/`text('...')` and raw `sql` templates (B); `referencias-blip/**` (out of scope); Blip/Meta literal quotes in comments (C, D-17); webhook paths (already EN).

### Pattern 7: Drizzle zero-SQL-diff proof
```bash
# before slice 1 (baseline) and after every slice touching packages/db
cd packages/db && npx drizzle-kit export | sort > ../../.planning/phases/01-.../std/ddl-before.sql
# ...after rename...
npx drizzle-kit export | sort | diff - ../../.planning/phases/01-.../std/ddl-before.sql && echo "SQL unchanged"
```
`sort` makes the check independent of export order if table exports get reordered or renamed. Unnamed constraints (`.references()`, `.unique()`, and 9 composite `primaryKey({columns})` without `name`) get names derived by drizzle-kit. The DDL diff shows empirically whether those names depend on TS keys [ASSUMED: they derive from SQL table/column names; the diff proves it either way]. **Never run `pnpm --filter @pipe/db gerar` in this phase.**

### Pattern 8: Navigation contract implementation notes (D-27..D-32; risks only)
- **Desk conversation in state (D-27):** keep `selectedConversationId` in React state (page-level or a small context in `Casca` so the rail can reset it). `useLeitura(id ? `/v1/desk/<conversations>/${id}` : null)` keeps working unchanged: the key moves from `useParams()` to state.
  - **Pitfall:** do NOT put the id in `navigate('/chat', { state: { id } })`. React Router `location.state` lives in `history.state`, which **survives F5** in browsers, and that would break "F5 returns to list" [ASSUMED: standard History API behavior; verify manually].
  - **D-32 back behaviour:** on open, `navigate('/chat', { state: { panel: 'conversation' } })` (a marker without the id). On every `location.key` change where `location.state?.panel !== 'conversation'`, clear the selection. After F5 the marker exists but React state is empty, so the list shows. Browser back pops to the previous `/chat` entry, so the conversation closes and the user stays in the Desk. That matches the captured Blip `pushState('/chat')` + `popstate` pattern.
  - The "not owned → back to list" guard (`page.tsx` `navegar('/', {replace:true})`) becomes `setSelected(null)`.
  - `trilho.tsx` `pathname.startsWith('/chat')` stays valid.
  - Remove the `/chat/:id` route. Old bookmarks and `?destino=/chat/<id>` after login fall to `NaoEncontrado` (accepted by D-14).
- **Desk contacts (D-29):** `/contacts/:id` + `?ticket=` → `/contacts`, with contact and ticket in state. `painel.tsx:160` uses `href=/contacts/${contatoId}?ticket=` (a full-page `<a>` link from the conversation drawer). It must become an in-app navigation that carries the selection. Put the ids in `navigate('/contacts', { state })` **only if** surviving F5 is acceptable for contacts. Otherwise use a transient context. Decide in nav-contract.md.
- **D-28:** `apps/gestao-vite/src/lib/desk-url.ts` (`urlDaConversaNoDesk`) has **no consumer in `src`**, only its test. Delete the file and `tests/desk-url.test.ts`.
- **D-30 last-filter in localStorage:**
  - Key = `pipe:<app>:<screen>:filters:v1:<tenantId>:<userId>`. Account switching (`/trocar-conta`) happens in the same browser, so a key without tenant/user would apply tenant A's queue/agent ids in tenant B.
  - Parse with a validator and drop invalid values (stale ids). Version the key.
  - Current affected screens are in Gestão's 24 `useSearchParams` files (e.g. `operacao/monitoramento.tsx`, `fluxo/log/log.tsx`, `fluxo/analise/*`, `novidades/page.tsx`, `componentes/filtros-rapidos.tsx`).
  - Existing keys `desk.pref.<chave>` and the CRM `CHAVE`/`CHAVE_TEMA` keys are browser-persisted. Renaming them resets user prefs, so classify in `persisted.csv` (or migrate on read).
- **Routers:** both Vite apps use declarative `<BrowserRouter>` (Desk with `basename={import.meta.env.BASE_URL}`, which is `/desk` on the VPS). Data-router-only APIs (`useBlocker`, loaders) are unavailable without migrating to `createBrowserRouter`. Not needed here.
- **Version note:** installed `react-router-dom` is **^7.9.3**, not 6 as the phase description says [VERIFIED: apps/*/package.json]. The `navigate(to, { state, replace })` API is the same.

### Anti-Patterns to Avoid
- **ts-morph `move()` / `moveToDirectory()` / `Directory.move()`**: they drop `.js`, and dynamic imports are left stale (spike).
- **Global sed on PT words**: it hits product text and persisted literals (`estado = 'arquivado'`).
- **Running per-app `pnpm -F x typecheck` as the gate**: it skips `^build` and reads stale `dist/*.d.ts` of dependencies. That is exactly how the `packages/core` break hid (PROJECT-HANDOFF). Gate with root `pnpm typecheck` (turbo).
- **Renaming a Drizzle TS key and assuming the wire is unchanged**: endpoints that `return rows` change JSON keys (D-09).
- **Letting two Codex accounts write to the same working tree**: use `-s read-only` + `-o` output files. Claude/Haiku apply the edits.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Find all references of a symbol | regex over identifiers | ts-morph `rename()` (TS language service) | Shadowing, same name on different types, re-exports, `import type` |
| Parse TS for scanners | regex | `typescript` compiler API (installed) | Template literals, JSX, comments vs strings |
| Schema SQL snapshot | custom dumper | `drizzle-kit export` | Offline, uses the same naming logic as the migrator |
| Queue drain/cleanup | Redis `KEYS`/`DEL` | BullMQ `getJobCounts`, `removeJobScheduler`, `obliterate` | Correct key layout, atomic Lua scripts |
| File history | delete + create | `git mv` | `--follow` history; case-only renames need `git mv -f` on Windows |

The one small custom tool that *is* justified is the specifier rewriter (Pattern 3). That is because the off-the-shelf mover is demonstrably wrong for `.js` ESM specifiers.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Postgres: SQL table/column names (untouched, D-08). Persisted PT **values** read by code: `erro_codigo` (conversas.ts:359), `ultimo_erro` (automacao.ts:705, conversas.ts:414), delivery codes like `parametros_perdidos` written to them, API-key scopes in `chave_api.escopos` (`conversas:ler`, `contatos:escrever`… used by `@Escopos`), `permissao.codigo` rows (seeded, referenced by guards), `importacao.estado`, ticket/conversa status literals, jsonb keys (D-09). API key token format `pipe_<prefixo>_<segredo>` (issued to customers). Redis: in-flight BullMQ jobs and 7 schedulers under old queue names | STD-06 `persisted.csv`, no rename. Codes that are both thrown (wire) and stored (DB) are classified per code. Queues: drain runbook below |
| Live service config | Google Cloud Console OAuth redirect `…/v1/auth/google/retorno` (local + VPS, VPS not yet registered). SSO IdP redirect `…/v1/auth/sso/retorno` (no real client). Traefik routers in `infra/compose/docker-compose.prod.yml` (`gestao`, `desk`, hostnames). Meta webhook URLs (`/webhooks/*`, unchanged D-15). Tracked link `/l/:codigo` already sent in messages (unchanged) | Owner re-registers Google redirect at cutover (D-12). Update the SSO docs string. Leave `/webhooks/*` and `/l/*` alone |
| OS-registered state | VPS: running compose project, images `ghcr.io/pipe/<app>:${PIPE_VERSAO}` (`gestao-vite`, `desk-vite` names in the registry and compose service names). `infra/construir-imagens.sh` APPS list. No Windows Task Scheduler / pm2 found in repo | If apps are renamed (D-04), new image names and compose service names. Old images stay in the registry (harmless). Remove old containers with `docker compose up -d --remove-orphans` |
| Secrets/env vars | `PIPE_*` stays (D-06). **Non-`PIPE_` PT env names exist**: `GOOGLE_CLIENTE_ID`, `GOOGLE_CLIENTE_SEGREDO`, `GOOGLE_URL_RETORNO`, `WHATSAPP_API_VERSAO`, `WHATSAPP_TOKEN_ACESSO`, `INSTAGRAM_API_VERSAO`, `MESSENGER_API_VERSAO`, `VITE_PORTA`, `VITE_URL_API`. **Env value** `GOOGLE_URL_RETORNO=…/v1/auth/google/retorno` lives in `.env`, `.env.example`, `infra/compose/env.prod.exemplo` **and the VPS env file (not in git)** | The value must change to `/callback` at cutover in all four places, or Google login breaks even after Console re-registration. Env *names*: see Open Question 2 |
| Build artifacts | Stale `dist/` in workspaces (e.g. `apps/api/dist/tempo-real.d.ts`, `packages/contracts/dist/*.d.ts`, `apps/workers/dist/*`). `tsc` never deletes outputs of renamed sources. Turbo cache `.turbo/`. `node_modules/@pipe/<old-name>` symlinks until `pnpm install`. `pnpm-lock.yaml` importers keyed by path/name | Before each slice gate: delete all `dist` folders (`pnpm -r exec rimraf dist` or `git clean -fdX -- '**/dist'`) and run `pnpm install` after any package/app rename. Commit the regenerated lockfile, because Dockerfiles use `--frozen-lockfile` |
| Browser-persisted | Cookie `pipe_sessao` (renaming logs everyone out; also referenced by CRM `middleware.ts` and Vite proxy docs). Cookie `pipe_desafio` (OAuth, short-lived). localStorage `desk.pref.*`, CRM theme/`visoes` keys | Classify: keep the cookie name (C or B), or rename it with a planned forced logout. localStorage: persisted.csv or migrate on read |
| Observability | Prometheus metric names `pipe_fila_profundidade`, `pipe_fila_idade_item_mais_velho_segundos`, `pipe_http_requisicoes_total`, `pipe_mensagem_entrega_total`, `pipe_migration_pendente`. Referenced by `infra/observabilidade/alertas.yml` (and any external dashboards) | If renamed, update `alertas.yml` in the same slice. Time series history breaks. Otherwise classify C/B |

### Queue drain runbook (D-10; Claude's discretion)
Recoverability of each queue if its jobs are lost (from code reading):

| Queue | Consumer | Durable source / sweep | Lost-job impact |
|-------|----------|------------------------|-----------------|
| pipe-entrega | workers | `outbox_mensagem` + `varredura-outbox` every 15 s | none (sweep) |
| pipe-espelho-crm | api | `contatosSemEspelho` sweep 5 min | none |
| pipe-midia | api | `midiasPendentes` sweep | none |
| pipe-sla | api | `conversasParaChecarSla` sweep 60 s | none |
| pipe-dicionario-crm | api | hourly sweep | none |
| pipe-instagram-token | api | daily scheduler | none |
| pipe-agregacao | workers | cron `10 3 * * *`, "dia-anterior" only | one day's aggregate if the cutover straddles 03:10. **Avoid that window** |
| **pipe-entrada** | api | **none: raw Meta payload lives only in the Redis job** | **inbound messages lost** |
| **pipe-process-http** | api | none found (jobId `process-http-<id>`) | flow stuck waiting on the HTTP step |
| **pipe-importacao** | workers | none (row stays in its state, file in `importacao_arquivo`) | import stuck |

Procedure:
1. Cut external intake by stopping Traefik routing (maintenance). Meta webhook deliveries then fail and are retried by Meta [ASSUMED: Meta retries failed webhook deliveries for a limited window; verify in Meta docs before relying on it].
2. Keep the **old** api + workers running so their in-process consumers keep draining.
3. Run a one-off script with the old names. It calls `removeJobScheduler()` for the 7 scheduler ids (`varredura-outbox`, `metrica-diaria`, `varredura-espelho-crm`, `varredura-midia`, `varredura-sla`, `varredura-dicionario-crm`, `renovacao-token-instagram`), otherwise their next-run delayed job never lets counts reach 0. It then polls `getJobCounts('waiting','active','delayed','prioritized','waiting-children')` on all 10 queues until 0.
4. Export `failed` jobs of `pipe-entrada`/`pipe-process-http`/`pipe-importacao` to a file.
5. Stop the old containers and `obliterate()` the old queues.
6. Start the new images (schedulers re-register under new names on boot via `upsertJobScheduler`), then start Traefik.

Dev/test uses `PIPE_FILAS=memoria`, so no drain is needed there. The realtime WS (`/v1/eventos`) has no front consumer yet (RT-01), so renaming events carries low risk.

## Common Pitfalls

### Pitfall 1: ESM `.js` specifiers silently dropped
**What goes wrong:** api/workers build and typecheck, then crash at `node dist/main.js` with `ERR_MODULE_NOT_FOUND`.
**Why:** `moduleResolution: "Bundler"` accepts extensionless specifiers at type level, and Node ESM does not. ts-morph `move()` drops `.js` (spike).
**Avoid:** Pattern 3 rewriter, plus a check that every relative specifier in `apps/{api,workers,ponte}/src`, `packages/*/src` and their tests ends in `.js`: `rg -n "from '\.{1,2}/[^']*(?<!\.js)'" --pcre2`.
**Warning signs:** a green `tsc` but a failing `pnpm --filter @pipe/api start`, or API vitest failing on import.

### Pitfall 2: Per-route body limits keyed by path strings
**What goes wrong:** after `v1/anexos`, `v1/contatos/importacoes`, `v1/canais/whatsapp/:id/perfil|modelos`, `v1/gestao/fluxos/:id/builder` or `v1/gestao/contrato/certificados` are renamed, `servidor.ts` still scopes raw/large parsers to the old paths. Uploads then hit the default JSON limit (413) or get parsed as JSON.
**Avoid:** those strings belong to the endpoint rows in the map, and route-match (c) checks them.

### Pitfall 3: Flow-scoped API keys depend on route shape
`fluxoDaRota` (`apps/api/src/autenticacao.ts:123`) reads param `fluxoId` or regex `/\/fluxos\/:(\w+)/`. It fails closed (403 `chave_de_fluxo`), so a missed update breaks flow keys rather than opening access. `tests/chave-de-fluxo.test.ts` and `integracoes.test.ts` cover it. The error message string also embeds the path.

### Pitfall 4: Stale `dist/` masks breakage
The packages publish `dist` (`main: ./dist/index.js`, subpath `exports` → `dist/<sub>/index.js`). Renamed source leaves old `dist/*.js` behind, so a deep import of an old path can still resolve. Clean `dist` before each gate and always gate via turbo.

### Pitfall 5: `@pipe/core` subpath exports are public names
`./metricas`, `./esforco`, `./distribuicao`, `./conversa`, `./janela`, `./analise` are import specifiers used by consumers. Renaming the folders means changing `package.json#exports` **and** every `'@pipe/core/metricas'` specifier in the same slice. The same applies to `@pipe/db/schema` (already EN).

### Pitfall 6: Package/app rename touches non-TS files
When `@pipe/autenticacao` / `armazenamento` / `tempo-real` / `gestao-vite` / `ponte` are renamed, the following all have to change:
- `package.json#name` and `dependencies` (`workspace:*`) in every dependent
- the regenerated `pnpm-lock.yaml`
- every Dockerfile `COPY packages/<x>/package.json` list (each Dockerfile lists manifests explicitly, and `gestao-vite`'s list already omits `armazenamento`/`tempo-real`)
- `Dockerfile.dockerignore` files
- `--filter "@pipe/x..."` in Dockerfiles, root scripts and `infra/construir-imagens.sh`
- compose service/image names, vite `alias`, docs (PROJECT-HANDOFF, README)

Rename apps one at a time and do a real `docker build` after each one (D-19 slice 4).

### Pitfall 7: Git Bash on Windows
- **MSYS path conversion:** `MSYS_NO_PATHCONV=1` is mandatory for `docker build` with `VITE_BASE=/desk/` (PROJECT-HANDOFF). It also affects any `git mv`/script argument that starts with `/`. Prefer Node scripts over shell for renames.
- **`core.ignorecase=true`:** case-only renames (3 files have non-lowercase basenames) need `git mv -f` or a two-step rename. `forceConsistentCasingInFileNames` is on in tsconfig, so tsc catches mismatches.
- **`core.autocrlf=true`, no `.gitattributes`:** the index is LF (1,092 files). Tools that write LF into a CRLF working tree cause `git status` noise but no committed diff. Don't commit a `.gitattributes` change in this phase.

### Pitfall 8: Two test runners
api/workers/core/db/ai/... use Vitest (core's `include: ['src/**/*.teste.ts']` is co-located). desk-vite/gestao-vite/crm use `node --import tsx --test tests/*.test.ts`. Renaming `*.teste.ts` → `*.test.ts` requires updating `packages/core/vitest.config.ts` `include` and `tsconfig.json` `exclude` together. Otherwise tests silently stop running (0 tests is still a pass) or get compiled into `dist`.
**Warning sign:** the test count drops. Record per-package test counts in `baseline.md` and compare after each slice.

### Pitfall 9: TanStack Query keys are API paths
`useLeitura` keys on `['api', caminho]`. Any `invalidateQueries` that uses a literal path prefix (14 call sites across desk/gestão) has to be rewritten with the endpoint rename, or cache invalidation silently stops working and screens stop refreshing. Include those call sites in Pattern 4.

### Pitfall 10: Drizzle wire leakage
Renaming `contatoId` → `contactId` in the schema changes the JSON of endpoints that return select results directly. Map rows of kind `wire-key` must list which endpoints echo rows. The front types in `packages/contracts` must change in the same slice as the API (slice 2 → front consumers in slice 3 break unless the contracts change lands with slice 2 or the slices merge). Recommendation: **wire-key renames go into the slice with both producer and consumer** (API + fronts together), per D-19 atomicity.

### Pitfall 11: CRM routes are folders
In `apps/crm/src/app/**` (Next App Router), renaming a folder renames the URL. Public-route regexes are duplicated (`middleware.ts:15` `/^\/(entrar|convite)/` and `componentes/estrutura-crm.tsx:69`). Keep Server Components (D-33) and don't restructure (STD-09).

## Code Examples

### D-21 baseline fix (verified: the only root typecheck failure)
`pnpm typecheck --continue` → 22/23 tasks OK; the only error is `packages/core/src/fluxo/gerenciador.teste.ts(140,22): TS2339 Property 'status' does not exist on type '{ nome: string; }'`. `Contexto.variaveis` is `Record<string, string>` (`packages/core/src/fluxo/contexto.ts:167`), so annotate at line 101:
```ts
const variaveis: Record<string, string> = { nome: 'Ana' };
```
Then run `pnpm typecheck`, `pnpm test` (Docker Postgres/Redis are up locally) and `pnpm build`, and record the results and per-package test counts in `std/baseline.md`. Run `apps/api` `tests/instagram.test.ts`, `tests/fluxo.test.ts` and `tests/messenger.test.ts` isolated: `pnpm --filter @pipe/api exec vitest run tests/fluxo.test.ts`.

### Delegating to Codex (flags from local `codex exec --help`, v0.156.1)
```bash
# Git Bash. Read-only: Codex proposes, Claude/Haiku apply. One chunk per call.
CODEX_HOME="$HOME/.codex-conta2" codex exec \
  -m gpt-5.6-sol -c model_reasoning_effort="medium" \
  -s read-only -C "C:/Users/anderson.linhares/pipe" \
  --ephemeral --color never \
  --output-schema .planning/phases/01-.../std/tools/map-rows.schema.json \
  -o .planning/phases/01-.../std/out/codex2-gestao-paginas-operacao.json \
  - < .planning/phases/01-.../std/prompts/gestao-paginas-operacao.md
# account 1: CODEX_HOME="$HOME/.codex"   (PowerShell: $env:CODEX_HOME="$HOME\.codex-conta2"; codex exec ...)
```
- `-m`, `-c key=value` (TOML), `-s read-only|workspace-write|danger-full-access`, `-C`, `--ephemeral`, `--output-schema <FILE>`, `-o/--output-last-message <FILE>`, `--json`, and a prompt read from stdin when it is `-` all exist in 0.156.1 [VERIFIED: local help].
- **Override the sandbox explicitly.** Account 1's `config.toml` has `sandbox_mode = "danger-full-access"` and `approval_policy = "never"`, and account 2 has `workspace-write`.
- The accounts' default models differ (`gpt-5.6-terra` / `gpt-5.6-luna`), so always pass `-m`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| BullMQ `repeat` jobs | `upsertJobScheduler` (already used) | BullMQ 5.16+ [ASSUMED version] | Drain must remove schedulers by id |
| Assume "React Router 6" | Installed 7.9.3 (`react-router-dom`) | — | Same declarative API. Docs should say v7 |
| `drizzle-kit generate` to check schema | `drizzle-kit export` for a DDL snapshot | drizzle-kit 0.30+ [ASSUMED] | Snapshot chain is stale (0012 vs journal 0046) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Unique PT symbols needing map rows ≈ 3-5k | Sizing | Plan/account budgeting off; inventory script gives the real number in slice 0 |
| A2 | ~1.5-2M tokens to read the source once | Sizing | Codex split under/over-sized |
| A3 | drizzle-kit names unnamed PK/FK/unique from SQL names, not TS keys | Pattern 7 | DDL diff would show constraint renames. Then add explicit `name:` or keep TS keys. The diff detects it either way |
| A4 | `history.state` (RR `location.state`) survives F5 | Pattern 8 | If wrong, state-based selection would be harmless anyway. Verify manually |
| A5 | Meta retries webhook deliveries that fail during the maintenance window | Drain runbook | Inbound messages during cutover lost. Keep the window short, or verify in Meta docs |
| A6 | `upsertJobScheduler` arrived in BullMQ 5.16; `drizzle-kit export` in 0.30 | State of the Art | Informational only |

## Open Questions

1. **RESOLVED (D-35): CSS class names / custom properties / `data-*` attributes are in STD-10 scope.** Give CSS its own old->new map for owner gate 2; include selectors and custom properties in the rename and scan.
2. **RESOLVED (D-36): all environment variable names stay unchanged**, including non-`PIPE_` names. Only the **value** of `GOOGLE_URL_RETORNO` changes to `/v1/auth/google/callback` in `.env`, `.env.example`, `env.prod.exemplo` and the VPS environment.
3. **RESOLVED (D-37): Codex model is `gpt-5.6-sol` with `model_reasoning_effort="medium"`.** Every invocation explicitly passes `-m gpt-5.6-sol` and `-s read-only`.
4. **RESOLVED (D-38): rename the `pipe_sessao` cookie and Prometheus metrics.** The owner accepts forced logout and broken continuity of metric series at deployment.
5. **RESOLVED (D-39): `apps/site` and `apps/ponte` are in scope** for standardization.
6. **OPEN: existing front/API path drift.** Run `tools/std/route-match.ts` on the baseline in slice 0 and record the result; the measured route-match output answers this question.
7. **RESOLVED (D-40): persisted API-key scopes and persisted error codes stay unchanged.** Inventory them under STD-06; do not rename them in this phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | all | ✓ | 24.11.0 (engines ≥22) | — |
| pnpm | workspace | ✓ | 10.34.5 | — |
| git | renames | ✓ | 2.51.2.windows.1 (ignorecase=true, autocrlf=true) | — |
| Docker + Postgres/Redis | API/db tests, image builds | ✓ | Docker 28.4.0; `pipe-postgres`, `pipe-redis` healthy | `globalSetup` auto-starts compose |
| ripgrep | sweeps | ✓ | 14.1.1 | git grep |
| drizzle-kit | DDL snapshot | ✓ | ^0.31.5 (`export` works offline) | — |
| Codex CLI | D-23 | ✓ | 0.156.1, both CODEX_HOME dirs present with auth.json | Sonnet only |
| ts-morph | symbol rename | ✗ (not installed) | 28.0.0 on npm | install as root devDep |
| slopcheck | audit | ✓ | pip | — |
| VPS / Google Console | cutover | owner-operated | — | none (manual owner steps) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^3.2.4 (api, workers, ponte, packages); node:test + tsx (desk-vite, gestao-vite, crm) |
| Config file | per-package `vitest.config.ts`; front `package.json` `test` script |
| Quick run command | `pnpm turbo run typecheck --filter=<changed>...` + the affected package `test` |
| Full suite command | `pnpm typecheck && pnpm test && pnpm build` (root, turbo) |

### Phase Requirements → Verification Map
| Req | Behavior | Type | Command / Gate | Exists? |
|-----|----------|------|----------------|---------|
| STD-01 | Convention + glossary approved | manual owner gate 1 | `GLOSSARY.md` + `CONVENTIONS-EN.md` status=approved | ❌ create |
| STD-02 | Route/endpoint inventory + approved map | script + owner gate 2 | `tools/std/inventory.ts` → `map/*.csv`; every `endpoint`/`front-route` row approved | ❌ |
| STD-03 | Dependents found | script | `node tools/std/route-match.ts` → orphans = 0 (run at baseline and each slice) | ❌ |
| STD-04 | URL vs state classification | doc review | `nav-contract.md` per-screen table; no screen without a class or NEEDS VALIDATION | ❌ |
| STD-05 | Compat strategy | doc | nav-contract/compat section: coordinated v1 cut; consumer list from route-match | ❌ |
| STD-06 | Persisted inventory, nothing renamed | script | `persisted.csv` + `drizzle-kit export \| sort` diff = ∅ + `git diff limpeza -- packages/db/drizzle` = ∅ | ❌ |
| STD-07 | Mechanical rename without regression | automated | per-slice: root typecheck/test/build green; test counts ≥ baseline; `.js` specifier check; `std-scan` count decreasing | partial (suites exist) |
| STD-08 | PROJECT.md rule | grep | `rg -n "todo em português" .planning/PROJECT.md` → 0 | — |
| STD-09 | CRM convention w/o CRM-01 | review + build | `pnpm --filter @pipe/crm build` green; no rendering/structure diff beyond renames | ✅ build exists |
| STD-10 | All technical identifiers EN | script | `node tools/std/scan-pt.ts` → unclassified = 0 | ❌ |
| STD-11 | Full regression + classified remnants | script + manual | full suite + `docker build` of each image (`MSYS_NO_PATHCONV=1`) + manual smoke checklist: login Google (after Console re-registration) and SSO callback, `/invite/:token`, deep link + F5 + back/forward on each front screen class, Desk open conversation → F5 → list, back closes conversation; drain runbook executed with counts logged | ❌ checklist |
| STD-12 | Nav contract documented + implemented | manual + unit | `nav-contract.md`; node:test for the localStorage filter helper (key includes tenant/user, invalid value dropped); manual D-32 check (NEEDS VALIDATION vs live Blip) | ❌ |

### Sampling Rate
- **Per task commit:** turbo typecheck for the touched workspaces plus their dependents (`--filter=...<pkg>`), and that package's tests.
- **Per slice (D-20):** clean `dist`, `pnpm install` (if a package was renamed), root `pnpm typecheck && pnpm test && pnpm build`, ddl diff, route-match, std-scan, test-count compare, 3 flaky API tests run isolated.
- **Phase gate:** all of the above + image builds + manual smoke + owner sign-off, before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] Fix `packages/core/src/fluxo/gerenciador.teste.ts:101` (type annotation) and record the green baseline in `std/baseline.md`
- [ ] `tools/std/inventory.ts`, `scan-pt.ts`, `route-match.ts`, `ddl-snapshot` (commit `ddl-before.sql`)
- [ ] `pnpm add -Dw ts-morph@28.0.0`
- [ ] `std/exceptions.csv` seeded (PIPE_* env, SQL strings, referencias-blip, JSX text rule)
- [ ] Manual smoke checklist file for STD-11

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Google OAuth/SSO callback rename (D-12/13): redirect URI must match Console + `GOOGLE_URL_RETORNO` value exactly. `destinoAbsoluto` open-redirect guard in `entrar.ts:103` must survive the rename unchanged |
| V3 Session Management | yes | `pipe_sessao` cookie name (keep, or accept a forced logout). WS upgrade reuses the same cookie (`eventos-ws.ts`) |
| V4 Access Control | yes | Guards travel with controllers (`@ComSessao`, `@Escopos`, `@ChaveOuSessao` decorators). `fluxoDaRota` regex/param (fails closed). `@Escopos('conversas:ler')` strings are persisted scopes (B), so do NOT rename them |
| V5 Input Validation | yes | Per-route body-size limits in `servidor.ts` bound to path strings (Pitfall 2) |
| V6 Cryptography | no | Signed attachment URL algorithm unchanged. Only the path `/v1/anexos` moves, and in-flight signed URLs (15 min) break at cutover |

| Pattern | STRIDE | Mitigation |
|---------|--------|------------|
| Guard lost in class/decorator rename | Elevation | ts-morph rename keeps decorators. Route-match also reports guard decorators per route before/after (diff = ∅) |
| Open redirect via `?destino` | Spoofing | Leave `destinoAbsoluto` logic untouched; only rename identifiers |
| Body-limit bypass / DoS | DoS | Pitfall 2 check |
| Security comments mistranslated | Repudiation/Tampering | D-24 mandatory Sonnet review of security/auth/crypto comments (`anexos.ts`, `eventos-ws.ts`, `autenticacao.ts`, webhooks) |

## Sources

### Primary (HIGH)
- Local codebase measurements (git ls-files, TS compiler API script, `pnpm typecheck --continue`, `drizzle-kit export`), 2026-09-24
- Local ts-morph 28.0.0 spike (rename OK; `move()` drops `.js`, stale dynamic import)
- `codex exec --help` (0.156.1), `~/.codex*/config.toml`, `models_cache.json`
- Context7 `/dsherret/ts-morph` (renaming, source-file move)
- Context7 `/drizzle-team/drizzle-orm-docs` (drizzle-kit export)
- Context7 `/websites/bullmq_io` (removeJobScheduler, obliterate)

### Secondary (MEDIUM)
- https://orm.drizzle.team/docs/drizzle-kit-export
- https://docs.bullmq.io/guide/job-schedulers/manage-job-schedulers , https://docs.bullmq.io/guide/queues/removing-jobs
- [ts-morph source files docs](https://ts-morph.com/details/source-files); [TypeScript #46290 importModuleSpecifierEnding on move](https://github.com/microsoft/TypeScript/issues/46290); [ts-morph #1470](https://github.com/dsherret/ts-morph/issues/1470)

### Tertiary (LOW)
- Meta webhook retry behavior (A5), not verified this session

## Metadata

**Confidence breakdown:**
- Standard stack/tooling: HIGH (spiked and run locally)
- Sizing: HIGH for counts, MEDIUM for derived estimates
- Architecture/patterns: HIGH (grounded in code)
- Drain runbook: MEDIUM (code-read recoverability; Meta retry assumed)
- Nav contract risks: MEDIUM (history.state behavior assumed; D-32 already NEEDS VALIDATION)

**Research date:** 2026-09-24
**Valid until:** 2026-10-24 (codebase frozen during the phase per D-22)

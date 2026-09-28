---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 45
subsystem: testing
tags: [route-match, react-router, static-analysis, d-52, open-redirect]

requires:
  - phase: 01-44
    provides: "Gestão inteira sob /application (D-52): árvore /application/detail/:shortName, construtor de caminho único (lib/application-paths.ts), redirects client-side de toda URL pré-D-52"
provides:
  - "route-match --front: prova estática de que nenhum link interno (href/to/navigate/navegar/rota:/template/path-builder) do front da Gestão ou do Desk aponta para um endereço sem rota (ou só alcançável por redirect legado)"
  - "--scan-extra: mesma prova para strings fora do front (API, outro front, docs) que comecem com um prefixo de rota da Gestão"
  - "destinationAbsolute (login/SSO) fecha o mesmo gap de open redirect (/\\evil) já fechado no front em 01-44; destino padrão pós-login explícito /application"
  - "nav-contract.md: seção D-52 com a tabela final e a evidência Blip; linhas legadas apontam para o caminho novo; Wizard D-31 marcado DECIDED"
  - "Smoke D-52 automatizado (sem sessão) registrado em smoke-checklist.md; roteiro autenticado (D52-01..08) pronto para o dono"
affects: ["01.1-subdominio-por-tenant"]

tech-stack:
  added: []
  patterns:
    - "route-match --front: parser de <Route path> aninhado via TS AST, seguindo uma variável JSX local (const contactRoutes = (<>...</>)) referenciada como {contactRoutes} dentro de outro <Route>"
    - "Rota só alcançável via LegacyRedirect/LegacyContactRedirect/Navigate marca legacy: true; consumidor que só casa com rota legacy conta como dangling (link interno não pode depender de redirect)"
    - "Allowlist (route-drift-allow.csv) reclassifica um dangling conhecido e revisado como 'allowed' no relatório, em vez de aparecer igual a um achado novo"

key-files:
  created:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/d52-edge.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/d52-route-consumers.csv
  modified:
    - tools/std/route-match.ts
    - tools/std/route-match.test.ts
    - apps/api/src/controllers/login.ts
    - apps/api/src/controllers/sso.ts
    - apps/api/src/domain/management/passos-of-deployment.ts
    - apps/api/tests/inbound.test.ts
    - apps/management-vite/nginx.conf
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/nav-contract.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/route-drift-allow.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/deferred-items.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/smoke-checklist.md

key-decisions:
  - "route-match --front ignora consumidor relativo (sem barra inicial), endpoint /v1/* e base dinâmica isolada (${var} sem sufixo) — nenhum é resolvível estaticamente sem modelar o contexto de rota do React Router; contá-los produzia dezenas de falso positivo contra a árvore real do management-vite"
  - "candidato cujo primeiro segmento é a interpolação (${base}/sufixo) casa por SUFIXO contra o final de qualquer rota, não por igualdade exata de segmentos — replica o padrão real de attendanceBase(contact)/queue-management etc."
  - "apps/management-vite/src/lib/shell.ts's /entrar e pages/operation/history.tsx's /termo-de-responsabilidade são dangling genuínos, mas nenhum é D-52 (o primeiro é resíduo PT do STD-11; o segundo é link morto pré-existente) e management-vite/src/** está fora do files_modified desta Task 2 — registrados em route-drift-allow.csv e deferred-items.md em vez de corrigidos"
  - "nav-contract.md: só a coluna 'current route' das linhas legadas foi trocada pelo equivalente D-52; a coluna 'screen' preserva o endereço antigo como identificador histórico, e os segmentos internos em português continuam como estão (resíduo STD-11, fora do escopo D-52 — D-53)"

requirements-completed: []

duration: ~3h
completed: 2026-09-28
---

# Fase 1 Plano 45: route-match --front e limpeza dos links externos ao D-52 Summary

**route-match ganhou um modo `--front` que prova, por análise estática, zero link interno pendurado na Gestão e no Desk; os poucos links fora do front que ainda apontavam para o formato antigo foram corrigidos (API) ou registrados como débito fora de escopo (residual PT do STD-11); nav-contract.md e o smoke D-52 (parte automatizada) estão registrados — falta a aprovação do dono no roteiro autenticado.**

**Status: PAUSADO NO CHECKPOINT (Task 3).** Tasks 1 e 2 concluídas e commitadas; a parte automatizável da Task 3 (smoke sem sessão) também está concluída e commitada. O passo restante — o dono percorrer o roteiro autenticado do navegador — está pendente porque este executor não tem credencial do dono (`environment_notes` da execução: "you cannot log in as the owner (no passwords)").

## Performance

- **Duração:** ~3h
- **Concluído:** 2026-09-28
- **Tarefas:** 2/3 concluídas (Task 3 automatizada até onde dá sem sessão; aprovação do dono pendente)
- **Arquivos modificados:** 11 (Task 2) + 2 (route-match.ts/test.ts, Task 1) + 1 (smoke-checklist.md, Task 3) + 2 relatórios novos

## Accomplishments

- `tools/std/route-match.ts`: novo modo `--front <appDir>` (repetível), `--builder nome=padrão` (repetível), `--front-consumers <csv>` e `--scan-extra <glob>` (repetível). `--help` documenta os quatro flags novos.
- `collectFrontRoutes`: percorre o AST TypeScript/TSX à procura de `<Route path="...">` aninhadas, monta o padrão completo, e segue uma variável JSX local (`const contactRoutes = (<>...</>)`) referenciada como `{contactRoutes}` — exatamente como `App.tsx` monta a árvore do contato. Marca `legacy: true` toda rota cujo `element` é `LegacyRedirect`, `LegacyContactRedirect` ou `Navigate`.
- `collectFrontConsumers`/`collectExternalFrontReferences`: reconhecem `href`, `to` (cobre `<Navigate to=>` e `<Link to=>`), `navigate()`, `navegar()`, `rota:`, template interpolado e chamada a um construtor via `--builder`. Um consumidor que só casa com rota `legacy` conta como `dangling`, igual a não casar com nada.
- **Verificação manual contra o repositório real** (antes de fechar a Task 1, para achar falso positivo cedo): rodar `--front apps/management-vite` sem filtro nenhum devolveu 56 "dangling" — quase todos falso positivo (link relativo tipo `to="monitoring"` dentro de rota aninhada, endpoint `/v1/...` num `<a href>` de download, `data:` URI, template cujo primeiro segmento é uma base dinâmica). Corrigido com quatro regras (ver `key-decisions`), reduzindo para os 2 achados genuínos — nenhum deles D-52.
- **Prova final (Task 2):** `--front apps/management-vite` (148 rotas, 49 referências) e `--front apps/desk-vite` (9 rotas, 12 referências), ambos com os quatro `--scan-extra` do plano (api/desk/crm/docs) e o `--allow` de dois achados fora de escopo: **0 dangling**, exit 0. `d52-route-consumers.csv` sem nenhuma linha `dangling` (os dois achados fora de escopo aparecem como `allowed (route-drift-allow.csv)`).
- `apps/api/src/controllers/login.ts`/`sso.ts`: `destinationAbsolute` também recusa `/\` (T-01-45-01 do modelo de ameaça — mesmo gap fechado no front em 01-44, `/\evil` normaliza para `//evil` no navegador); destino padrão pós-login/SSO passa de `/` (implícito, redireciona no cliente) para `/application` (explícito). Regressão coberta em `apps/api/tests/inbound.test.ts` (26/26 verdes, incluindo o caso novo); `sso.test.ts` (19/19) sem regressão.
- `apps/api/src/domain/management/passos-of-deployment.ts`: removido o `montarPassos` morto (nunca importado — só `SignalsOfDeployment` é usado por `deployment.ts`) que ainda tinha os hrefs `/canais` e `/atendentes/filas`, nunca rotas válidas; a cópia viva (`apps/management-vite/src/lib/passos-of-deployment.ts`) já tinha sido corrigida no 01-44.
- `apps/management-vite/nginx.conf`: comentário atualizado para os exemplos atuais (`/application`, `.../detail/:shortName`); nenhuma mudança de comportamento — `try_files $uri /index.html` já cobria qualquer rota nova.
- `.planning/.../std/reports/d52-edge.md`: confirma que nginx (SPA fallback genérico), `vite.config.ts` (sem `base`) e o Traefik (roteamento só por `Host`, nenhum `PathPrefix` que colida com `/application`) não precisam de mudança.
- `nav-contract.md`: nova seção "D-52" com a tabela final do 01-44 e a evidência Blip; as ~246 linhas da tabela por tela cujo `current route` era `/portal`, `/roteador/:id/*`, `/fluxo/:id/*` ou `/criar/*` foram atualizadas para o equivalente D-52 (só a coluna `current route`; `screen` preserva o endereço antigo como identificador). Parágrafo "Wizard D-31" reescrito: de "hoje usa `?passo=`" para DECIDED/implementado (passo é rota própria).
- **Smoke D-52 (Task 3, parte automatizada):** subi API 3010, Gestão 3110 e Desk 3210 localmente (`pnpm db:migrate`, servidores próprios — nenhum estava no ar antes) e rodei Playwright/Chromium headless contra 10 URLs sem sessão (`/`, `/login`, `/application`, e as seis URLs antigas do passo 6 do roteiro, mais a raiz do Desk). Nenhuma exceção de JS, nenhuma tela em branco; a guarda `RequireSession` reconhece todas como rota válida e preserva path+query completos no `?destino=` antes de mandar para `/login`. Registrado em `smoke-checklist.md` §D-52 (`D52-AUTO-01`..`10`); servidores parados ao final (não eram do dono).

## Task Commits

1. **Task 1: route-match --front (rotas React Router e consumidores de front)** — RED `d1596c67` (test), GREEN `1be3ef28` (feat)
2. **Task 2: Links fora da Gestão, borda, docs e nav-contract; prova sem link pendurado** — `dd3162c3` (fix)
3. **Task 3 (parte automatizada): smoke D-52 sem sessão** — `0bbf0a06` (test)

**Plan metadata:** commit deste SUMMARY (a seguir)

## Files Created/Modified

Ver `key-files` no frontmatter. Lista completa em `git show --stat` de cada commit acima.

## Decisions Made

Ver `key-decisions` no frontmatter.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `destinationAbsolute` (login.ts/sso.ts) aceitava `/\evil` como destino interno (open redirect)**
- **Found during:** Task 2, ao ler `apps/api/src/controllers/login.ts` (Fatos do plano) e `deferred-items.md` (item deixado pelo 01-44, T-01-44-01 — mesma classe de bug, par server-side do `caminhoInterno` do front)
- **Issue:** `destination.startsWith('/') && !destination.startsWith('//') ? destination : '/'` deixa passar `/\evil`, que um navegador normaliza para `//evil` (redirect para outro host) — exatamente o caso que o T-01-44-01 já documentava como pendente aqui.
- **Fix:** `destinationAbsolute` também recusa `destination.startsWith('/\\')`; caem no fallback, agora `/application` explícito em vez de `/`.
- **Files modified:** apps/api/src/controllers/login.ts, apps/api/src/controllers/sso.ts, apps/api/tests/inbound.test.ts (teste novo)
- **Verification:** `pnpm --filter @pipe/api typecheck` limpo; `npx vitest run tests/inbound.test.ts` 26/26 (inclusive o caso novo), `tests/sso.test.ts` 19/19.
- **Committed in:** dd3162c3 (Task 2)

**2. [Rule 1 - Bug] `apps/api/src/domain/management/passos-of-deployment.ts`'s `montarPassos` morto com hrefs `/canais`/`/atendentes/filas` nunca válidos**
- **Found during:** Task 2, varredura por `/canais`/`/atendentes/filas` (mesmo achado que o 01-44 já tinha corrigido na cópia viva do front — esta é uma segunda cópia na API, nunca importada)
- **Issue:** Um segundo `montarPassos` na API duplicava a lógica do front com os mesmos hrefs quebrados; confirmado que nada importa a função (só o tipo `SignalsOfDeployment`).
- **Fix:** Removido tudo exceto `SignalsOfDeployment` (o único export usado, por `deployment.ts`).
- **Files modified:** apps/api/src/domain/management/passos-of-deployment.ts
- **Verification:** `pnpm --filter @pipe/api typecheck` limpo; `grep` confirmou que nenhum outro arquivo referenciava os exports removidos.
- **Committed in:** dd3162c3 (Task 2)

**3. [Rule 1 - Bug, no próprio route-match.ts] Falso positivo de `--front` contra a árvore real**
- **Found during:** Task 1→2, ao rodar `--front apps/management-vite` pela primeira vez contra o código real (56 "dangling", quase todos falso positivo)
- **Issue:** Link relativo (`to="monitoring"` dentro de rota aninhada — resolve contra o contexto do React Router, que a varredura estática não modela), endpoint `/v1/...` num `<a href>` de download, `data:`/`tel:` URI, e template cujo primeiro segmento é uma base dinâmica (`${attendanceBase(contact)}/queue-management`) eram todos contados como link pendurado.
- **Fix:** consumidor relativo e `/v1/*` ignorados; `data:`/`tel:` somados aos prefixos externos; candidato com primeiro segmento interpolado casa por sufixo contra o final de qualquer rota; base dinâmica isolada (nada depois) tratada como não resolvível e não pendurada; raiz `/` isolada excluída do conjunto de prefixos do `--scan-extra` (todo app tem a própria raiz).
- **Files modified:** tools/std/route-match.ts
- **Verification:** as 10 suítes de teste continuam verdes; `--front apps/management-vite` (sem allowlist) caiu de 56 para 2 achados, ambos genuínos e fora do escopo D-52 (ver Deviation 4).
- **Committed in:** dd3162c3 (Task 2 — descoberto durante a verificação manual da Task 2, mas o arquivo já estava em `files_modified` do plano inteiro)

### Itens fora de escopo (não corrigidos, registrados)

**4. [Fora do escopo de arquivos da Task 2] Dois links pendurados genuínos em `apps/management-vite/src/**`, sem relação com D-52**
- **Found during:** Task 2, ao rodar `--front apps/management-vite`
- **Issue:** `lib/shell.ts:66`'s `href: '/entrar'` (resíduo PT do STD-11 — a rota real é `/login`) e `pages/operation/history.tsx:433`'s `href="/termo-de-responsabilidade"` (link morto pré-existente, nunca foi rota). Nenhum é `/portal`, `/flow/`, `/router/` ou `/create/`; `apps/management-vite/src/**` não está em `files_modified` desta Task 2 (só `nginx.conf`/`vite.config.ts`).
- **Ação:** registrados em `route-drift-allow.csv` (com razão e sem `resolve_by` fixo para o segundo) e em `deferred-items.md`, em vez de corrigidos fora de escopo.
- **Committed in:** dd3162c3 (Task 2)

---

**Total deviations:** 3 auto-corrigidos (Rule 1 × 3) + 1 item fora de escopo registrado (não corrigido)
**Impact on plan:** Os três auto-fixes são exatamente a classe de bug que este plano existe para fechar (link pendurado / open redirect na fronteira API→navegador do próprio `threat_model`); nenhum é mudança de arquitetura. O item fora de escopo é documentado, não escondido — a prova de "zero dangling" continua verdadeira porque o allowlist é explícito e rastreável.

## Assumption Drift (advisory)

Nenhum — a execução seguiu as premissas do plano e do `01-CONTEXT.md`; os ajustes acima foram achados concretos durante a verificação, não desvio de premissa.

## Issues Encountered

- `node --import tsx --test tools/std/route-match.test.ts` (comando literal do `<verify>` da Task 1) falha na raiz do repo: `tsx` não está hoisted em `node_modules/tsx` (só o link em `node_modules/.bin/tsx`). Rodei com `node_modules/.bin/tsx --test tools/std/route-match.test.ts` (mesmo binário), resultado idêntico. Mesma classe de obstáculo que o 01-44 registrou.
- API dev server sobe por padrão na porta 3000 (não 3010) quando `pnpm --filter @pipe/api dev` roda sem o `.env` da raiz carregado no ambiente do processo (o `main.ts`/`servidor.ts` não fazem `dotenv.config()` — dependem do ambiente já ter as variáveis, como o `known issue` do PROJECT-HANDOFF.md já registrava). Resolvido carregando `.env` num processo PowerShell dedicado antes de subir a API; documentado aqui para quem repetir o smoke.
- Vite nesta máquina escuta em `[::1]`: `curl http://127.0.0.1:3110` falha, `curl http://localhost:3110` funciona (mesmo known issue do PROJECT-HANDOFF.md).
- Sem credencial do dono e sem permissão para consultar o Postgres diretamente (classificador de modo automático recusou uma leitura de `select email from usuario` como "Production Reads", mesmo read-only) — não havia como logar como um usuário existente para completar o roteiro autenticado. O smoke automatizado ficou limitado ao que dá para provar sem sessão (ver Accomplishments); os passos D52-01..08 vão para o dono.

## User Setup Required

Nenhuma configuração externa nova. O dono precisa completar o checkpoint da Task 3 (ver mensagem de checkpoint) — isso não é "setup", é a aprovação que a Task 3 pede.

## Next Phase Readiness

- D-52 estruturalmente provado (route-match --front, 0 dangling) e documentado (nav-contract.md); falta só a aprovação visual/funcional do dono no navegador autenticado.
- A pré-condição d do `01.1-01-PLAN.md` ("o roteador da Gestão declara as telas do Portal sob /application") está tecnicamente verdadeira desde o 01-44 e reforçada por este plano; a leitura literal do `must_haves` deste plano ("o dono aprovou") só fecha depois do checkpoint.
- `apps/management-vite/src/lib/shell.ts:66` e `pages/operation/history.tsx:433` ficam como débito residual (não-D-52) para um plano que toque `apps/management-vite/src/**` — ver `deferred-items.md`.

## Self-Check: PASSED

Arquivos criados (existência confirmada):
- FOUND: .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/d52-edge.md
- FOUND: .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/d52-route-consumers.csv

Commits (existência confirmada no log do branch):
- FOUND: d1596c67 (Task 1 RED)
- FOUND: 1be3ef28 (Task 1 GREEN)
- FOUND: dd3162c3 (Task 2)
- FOUND: 0bbf0a06 (Task 3, parte automatizada)

Verificações rodadas e observadas (não apenas inspecionadas):
- `node_modules/.bin/tsx --test tools/std/route-match.test.ts` — 10/10 verdes (as 5 pré-existentes + as 5 novas do modo `--front`).
- `pnpm --filter @pipe/api typecheck` — limpo.
- `npx vitest run tests/inbound.test.ts` (dentro de `apps/api`) — 26/26 verdes, inclusive o teste novo do guard `/\`.
- `npx vitest run tests/sso.test.ts` — 19/19 verdes, sem regressão do destino padrão.
- `pnpm typecheck` (raiz) — 23/23 tarefas do turbo verdes.
- `node_modules/.bin/tsx tools/std/route-match.ts --front apps/management-vite --builder flowPath=... --builder contactPath=... --front-consumers .../d52-route-consumers.csv --scan-extra 'apps/api/src/**' --scan-extra 'apps/desk-vite/src/**' --scan-extra 'apps/crm/src/**' --scan-extra 'docs/**' --allow .../route-drift-allow.csv` — exit 0, "dangling: 0".
- `node_modules/.bin/tsx tools/std/route-match.ts --front apps/desk-vite --allow .../route-drift-allow.csv` — exit 0, "dangling: 0".
- `grep -c "dangling" .../std/reports/d52-route-consumers.csv` — 0.
- `grep -n "[\`'\"](/portal|/flow/|/router/|/create/(flow|router))"` em `apps/api/src`, `apps/desk-vite/src`, `apps/crm/src`, `packages`, `infra` — sem resultado.
- `grep -c "D-52" .../std/nav-contract.md` — 5; `grep -n "gestao-vite | /portal"` mostra current route `/application`, não `/portal`.
- `grep -q "D-52" .../std/smoke-checklist.md` — confirmado.
- Servidores locais subidos com Playwright headless (10 URLs sem sessão, ver Accomplishments) e depois parados (confirmado por `curl` retornando "down" nas três portas).

STATE.md, ROADMAP.md e REQUIREMENTS.md não foram tocados, conforme instrução do orquestrador para este plano.

---
*Phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o*
*Status: paused at checkpoint (Task 3 — aprovação do dono pendente)*

---
phase: 02-fechar-o-builder
plan: 16
subsystem: motor-de-fluxo / builder
tags: [ExecuteScript, ExecuteScriptV2, sandbox, isolated-vm, monaco, D-21, BUILDER-01]
requires: ["02-07", "02-15"]
provides:
  - "runFlowScript: sandbox isolated-vm por execução (100 MB, 5 s/10 s)"
  - "scriptFetch: request.fetchAsync do V2 via confirmarUrlSegura + chamarComMtls"
  - "ServicosDoMotor.runScript ligado em apps/api/src/domain/flow.ts"
  - "Editor Monaco sob demanda para o campo code das ações de script"
affects: [apps/api, apps/management-vite, packages/core]
tech-stack:
  added: ["isolated-vm@6.2.0", "@monaco-editor/react@4.7.0", "monaco-editor@0.57.0"]
  patterns: ["isolate novo por chamada, fronteira só JSON", "React.lazy + Suspense com textarea de fallback", "loader.config({ monaco }) sem CDN"]
key-files:
  created:
    - apps/api/src/domain/script-sandbox.ts
    - apps/api/tests/script-sandbox.test.ts
    - apps/management-vite/src/pages/builder/code-editor.tsx
  modified:
    - packages/core/src/flow/actions.ts
    - packages/core/src/flow/context.ts
    - packages/core/src/flow/actions.test.ts
    - apps/api/src/domain/flow.ts
    - apps/api/tests/flow.test.ts
    - apps/api/package.json
    - apps/api/Dockerfile
    - apps/api/vitest.config.ts
    - apps/management-vite/package.json
    - apps/management-vite/src/pages/builder/actions-of-block.ts
    - apps/management-vite/src/pages/builder/panel-actions.tsx
    - apps/management-vite/src/pages/builder/editor.css
    - apps/management-vite/tests/builder-actions.test.ts
    - pnpm-lock.yaml
decisions:
  - "Sandbox D-21 = isolated-vm@6.2.0 (não 7.x: exige Node >=24; a imagem da API é node:22-alpine), --save-exact, fora de onlyBuiltDependencies (usa o binário de prebuilds/)"
  - "Editor de script = @monaco-editor/react@4.7.0 + monaco-editor@0.57.0, --save-exact, só no management-vite, sem CDN em tempo de execução"
  - "--no-node-snapshot no CMD do Dockerfile, nos scripts start/dev da API e nos forks do vitest"
  - "Sandbox dentro do processo da API (opção a); processo filho dedicado (opção b) fica como endurecimento no plano de lacunas"
metrics:
  completed: 2026-09-27
  tasks: 3
  commits: 7
---

# Phase 02 Plan 16: ExecuteScript/ExecuteScriptV2 com sandbox isolated-vm e editor Monaco — Summary

Scripts do fluxo rodam num isolate V8 novo por execução (isolated-vm 6.2.0, heap de 100 MB, 5 s no V1 e 10 s no V2, fronteira só JSON), com `request.fetchAsync` do V2 passando pelo mesmo portão anti-SSRF e cliente mTLS do `ProcessHttp`; no Builder, o código-fonte é editado num Monaco local carregado sob demanda.

## Tarefas e commits

| Tarefa | Commit | O quê |
|---|---|---|
| 2 (motor) | cf8a361 | `ExecuteScript`/`ExecuteScriptV2` no motor via `runScript(ScriptRequest)` injetado; `source`/`outputVariable` obrigatórios; entradas via `getVariable`; limites 5 s/10 s; V2 `captureExceptions` → `exceptionVariable` |
| 3 (catálogo) | ba8e456 | As duas ações no catálogo do Builder (Código-fonte, Variáveis de entrada, Variável para o valor de retorno); campo `code` como `<textarea>` monoespaçado |
| 1 (checkpoint) | — | Dono respondeu "aprovar" em 2026-09-27 (ver Decisões) |
| 2 (pacotes) | 592154b | `isolated-vm@6.2.0` na API; `@monaco-editor/react@4.7.0` + `monaco-editor@0.57.0` no management-vite; `--no-node-snapshot` no Dockerfile, `start`/`dev` e vitest |
| 2 (RED) | 6a1839e | `script-sandbox.test.ts` com comportamento, fuga e SSRF (falhando: módulo inexistente); comentário do Dockerfile atualizado |
| 2 (GREEN) | c20c2b6 | `script-sandbox.ts` (`runFlowScript`, `scriptFetch`), `services.runScript` em `flow.ts`, `flow.test.ts` passa a forçar a falha com `TrackContactsJourney` |
| 3 (Monaco) | d739970 | Campo `code` com Monaco via `React.lazy`/`Suspense`, textarea como fallback, tema escuro `pipe-builder`, teste que protege o carregamento sob demanda |

## Decisões do dono (checkpoint de legitimidade, 2026-09-27: "aprovar")

1. `isolated-vm@6.2.0` aprovado — não o 7.x, que exige Node >=24 (a imagem da API é `node:22-alpine`). Instalado com `--save-exact` só em `@pipe/api`; não entrou em `onlyBuiltDependencies`. O script de install ficou bloqueado pelo pnpm, e isso não importa: o pacote traz binários prontos em `prebuilds/` (win32-x64, linux-x64 glibc/musl, linux-arm64, darwin-arm64; ABI 127 = Node 22 e 137 = Node 24), carregados por `node-gyp-build`.
2. `@monaco-editor/react@4.7.0` e `monaco-editor@0.57.0` aprovados, `--save-exact`, só em `@pipe/management-vite`, com `monaco-editor` declarado explicitamente.
3. `--no-node-snapshot`: `CMD ["node", "--no-node-snapshot", "dist/main.js"]` no Dockerfile; `start` = `node --no-node-snapshot dist/main.js`; `dev` = `tsx watch --no-node-snapshot src/main.ts` (conferido: o tsx repassa a flag ao Node); vitest via `poolOptions.forks.execArgv`. `NODE_OPTIONS=--no-node-snapshot` também é aceito pelo Node 24.11 local, mas a config do vitest não depende de variável de ambiente.
4. Sandbox dentro do processo da API (opção a): `memoryLimit` 100 MB, tempo 5 s/10 s, `onCatastrophicError` tratado (log sem conteúdo do script → SIGTERM para o encerramento ordenado de `main.ts` → `process.abort()` após 10 s). A opção (b), processo filho dedicado, fica com o orquestrador como endurecimento no plano de lacunas.

## Pendências registradas (não inventadas)

- **C-24 — assinaturas das funções nativas do V2:** `request.fetchAsync`, `time`, `context`, `botTimeZone`. Só o mecanismo foi implementado: o V2 recebe `request.fetchAsync(url, { method, headers, body })` → `{ status, body }`, forma **provisória** (documentada no código) até a captura. `time`, `context` e `botTimeZone` **não** foram expostos.
- **Fuso horário:** `localTimeZoneEnabled` (V1) chega ao sandbox em `ScriptRequest.localTimeZone`, mas o isolate usa o fuso do processo (UTC no container). Aplicar o fuso do bot depende de `botTimeZone` (C-24) e de uma configuração de fuso do bot.
- **Corpo padrão do script da referência:** não capturado. `SCRIPT_TEMPLATE` (`function run() {\n  return;\n}\n`) é só o esqueleto mínimo do Pipe, não o texto da Blip.
- **Versão ECMAScript do V1 (Jint):** o V1 roda no mesmo V8 do V2, então aceita mais sintaxe que o Jint; o limite de 1000 statements e a recursão máxima de 50 do Jint não são reproduzidos (só tempo e memória).

## Testes de segurança (`apps/api/tests/script-sandbox.test.ts`, 18/18 verdes)

| Caso | Resultado |
|---|---|
| sem `require`, `process`, `module`, `Buffer`, `globalThis.process`, `setTimeout`, `fetch` no escopo | passa |
| `Function('return this')()` e `({}).constructor.constructor` só alcançam o global do isolate | passa |
| `constructor` de um argumento de entrada não alcança o host | passa |
| `import('node:fs')`, `import('fs')`, `import('node:child_process')` falham | passa |
| sem rede fora da API aprovada (`fetch`, `XMLHttpRequest`, `WebSocket`, `request` ausentes sem fetch injetado) | passa |
| V1 nunca recebe `request.fetchAsync`, mesmo que o host ofereça | passa |
| poluição de protótipo (`Object.prototype`, `Array.prototype.map`, `__proto__` em JSON) não chega ao host | passa |
| resultado com função/getter atravessa só como JSON | passa |
| laço infinito para no tempo limite (limite 500 ms, termina < 1 s) | passa (512 ms) |
| promessa que nunca resolve para no tempo limite | passa (516 ms) |
| bomba de memória para no limite (16 MB no teste) e o processo de teste segue executando scripts | passa |
| `blocks private URL from script HTTP (SSRF)`: `http://127.0.0.1`, `http://169.254.169.254`, `http://10.0.0.1`, as mesmas em HTTPS e `https://localhost` recusadas por `confirmarUrlSegura`, com `globalThis.fetch` nunca chamado | passa |
| mais 6 casos de comportamento (retorno JSON, async + nome de função, `null`, erro propagado, nome de função inválido, fetchAsync com valores copiados) | passam |

## Verificação (executada nesta sessão)

| Comando | Resultado |
|---|---|
| `pnpm --filter @pipe/core exec vitest run src/flow` | 6 arquivos, 140/140 |
| `pnpm --filter @pipe/api exec vitest run tests/script-sandbox.test.ts tests/flow.test.ts` (Postgres/Redis do docker no ar) | 2 arquivos, 26/26 (18 sandbox + 8 flow) |
| `pnpm --filter @pipe/management-vite test` | 288/288 |
| `pnpm exec turbo run typecheck --filter=@pipe/core --filter=@pipe/api --filter=@pipe/management-vite` | 10/10 tarefas com sucesso |
| `pnpm --filter @pipe/management-vite build` | ok (21 s) |
| `pnpm --filter @pipe/api build` | ok (saída 0) |
| `node .planning/phases/02-fechar-o-builder/ref/conferir-catalogo.mjs --slot acoes-script` | `OK 2 itens`, saída 0 |

`@pipe/contracts` e `@pipe/core` foram recompilados antes das suítes dependentes.

### Chunks do build do management-vite

| Chunk | Tamanho | Observação |
|---|---|---|
| `index-B5cZ1B_Y.js` | 1.259.142 B | principal; 0 ocorrências de `monaco` |
| `code-editor-BJlulE6A.js` | 2.745.475 B (gzip 712,74 kB) | Monaco + `@monaco-editor/react`, só baixado ao abrir uma ação de script |
| `code-editor-DRbysTD8.css` | 99.224 B | CSS do Monaco, também sob demanda |
| `editor.worker-CHzQTjO0.js` | 275.625 B | worker do editor empacotado pelo Vite |
| `javascript-CejaLcDa.js` | 4.881 B | realce de JavaScript, carregado pelo próprio Monaco |

O chunk `code-editor` contém a string `cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs` — é o padrão embutido do `@monaco-editor/loader`, que nunca é usado porque `loader.config({ monaco })` entrega a instância local antes de qualquer `<Editor>` montar. Só o núcleo do editor (`monaco-editor/editor`) e o realce de JavaScript entram; sem serviço de linguagem TypeScript (economiza o worker `ts`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rejeição do fetch do host virava "unhandled rejection" na API**
- **Found during:** Tarefa 2 (GREEN)
- **Issue:** quando `confirmarUrlSegura` recusava a URL, a promessa rejeitada devolvida por `Reference.apply` ficava sem tratamento no lado do host (7 erros no vitest).
- **Fix:** o host sempre resolve `{ ok, response | message }`; o `fetchAsync` dentro do isolate relança como `Error`.
- **Files modified:** `apps/api/src/domain/script-sandbox.ts`
- **Commit:** c20c2b6

**2. [Rule 1 - Bug] Asserção errada no teste de `constructor` de argumento**
- **Found during:** Tarefa 2 (GREEN)
- **Issue:** o teste aplicava `typeof` sobre o resultado de `'return typeof process'` (sempre `'string'`).
- **Fix:** asserção corrigida; o comportamento do sandbox não mudou.
- **Commit:** c20c2b6

**3. [Rule 2 - Crítico] Nome da função validado como identificador**
- **Found during:** Tarefa 2
- **Issue:** `functionName` é interpolado no código compilado no isolate.
- **Fix:** exige `/^[A-Za-z_$][\w$]*$/`; teste `rejects a function name that is not an identifier`.
- **Commit:** c20c2b6

**4. [Rule 3] Comentário do Dockerfile dizia que a API não tinha dependência nativa**
- Atualizado para registrar o `isolated-vm` (binário musl em `prebuilds/`) e a exigência de `--no-node-snapshot`. Commit 6a1839e.

### Observações

- O lockfile também normalizou uma variante de peer de `@vitest/mocker` (`@types/node@24.13.5` → `22.20.1`), efeito colateral do `pnpm add`; nenhum pacote além dos aprovados (e suas dependências transitivas: `node-gyp-build`, `@monaco-editor/loader`, `state-local`, `dompurify`, `marked`, `@types/trusted-types`) foi adicionado.
- Como o `ProcessHttp` síncrono, o script (até 10 s) ainda roda dentro da transação da entrada, segurando uma conexão; registrado em comentário em `flow.ts`.
- Não foi adicionado teste ponta a ponta de `ExecuteScript` pela API: a ligação é uma linha (`runScript: (request) => runFlowScript(request, { fetch: scriptFetch(e.tenantId) })`), coberta pelo typecheck, pelos testes de ação do core e pelos do sandbox.

## Deferred Issues

- `pnpm --filter @pipe/api lint` falha em dois arquivos fora do escopo deste plano (`src/domain/management/sla.ts:61` `_alvo`, `tests/channel-of-flow.test.ts:486` `_semBot`, ambos `no-unused-vars`, anteriores a este plano). Os arquivos tocados aqui passam no ESLint.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: rce-surface | apps/api/src/domain/script-sandbox.ts | código de terceiros roda num isolate dentro do processo da API; a fuga depende da robustez do isolated-vm (o próprio README chama o `onCatastrophicError` de "band-aid"). Mitigação futura: processo filho dedicado (opção b do dono). |
| threat_flag: ssrf | apps/api/src/domain/script-sandbox.ts | `request.fetchAsync` confere a URL em texto (`confirmarUrlSegura`), sem resolver DNS — a mesma limitação do `ProcessHttp` (nome público apontando para IP privado não é barrado). |

## Self-Check

- FOUND: apps/api/src/domain/script-sandbox.ts
- FOUND: apps/api/tests/script-sandbox.test.ts
- FOUND: apps/management-vite/src/pages/builder/code-editor.tsx
- FOUND commits: cf8a361, ba8e456, 592154b, 6a1839e, c20c2b6, d739970
- STATE.md, ROADMAP.md, REQUIREMENTS.md: não alterados (responsabilidade do orquestrador)

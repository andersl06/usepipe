---
phase: 02-fechar-o-builder
fixed_at: 2026-09-27T00:00:00Z
review_path: .planning/phases/02-fechar-o-builder/02-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Fase 02: Relatório de correção da revisão de código

**Corrigido em:** 2026-09-27
**Revisão de origem:** `.planning/phases/02-fechar-o-builder/02-REVIEW.md`
**Iteração:** 1
**Base:** `445a74f2` (branch `limpeza`)

**Resumo:**
- Achados no escopo (escolhidos pelo orquestrador do dono): CR-01 a CR-07, WR-01, WR-02 e WR-03 (10)
- Corrigidos: 10
- Pulados: 0
- Todos os achados foram conferidos no código antes da correção, e todos se confirmaram. Nenhum foi descartado como falso positivo.
- Método: primeiro um teste que reproduz o cenário do relatório e falha (RED, conferido rodando o teste contra o código original), depois a correção (GREEN) e um commit atômico por achado.

## Achados corrigidos

### CR-01: Retomada de ProcessHttp nas ações de entrada de um bloco trata a mensagem antiga como resposta desse bloco

**Commit:** `d5b866b8`
**Arquivos:** `packages/core/src/flow/manager.ts`, `packages/core/src/flow/manager.test.ts`
**Causa raiz:** o bloco de retomada terminava as `inputActions` do estado restaurado e deixava `waitInbound = true`. Com isso o laço validava a mesma mensagem, que já tinha sido consumida pelo bloco anterior, como resposta do estado novo.
**Correção:** depois de concluir as ações de entrada na retomada, o motor decide como o `finally` do laço decide. Se o estado espera entrada, ele não entra no laço: roda só as ações globais de saída e para no estado. Se o estado não espera entrada, o laço segue com `waitInbound = false`, sem reler a mensagem.
**Testes que provam:**
- "resuming ProcessHttp in a waiting state's entering actions does not take the already-consumed message as that state's answer": o CPF não vira `confirmacao`, `stateId` fica em `confirma` e o bot só envia "Confirma?".
- "…non-waiting state's…": segue pelas saídas sem gravar `input.variable`.
- No teste antigo foi acrescentado `expect(variables[KEY_STATE]).toBe('ping')`, como pedia o relatório.

### CR-02: Erro de banco em ação nova de plataforma aborta a transação de entrada e perde a mensagem do cliente

**Commit:** `30e09e80`
**Arquivos:** `apps/api/src/domain/flow.ts`, `apps/api/tests/flow-actions.test.ts`
**Causa raiz:** os serviços novos escreviam direto no `tx` da entrada. No Postgres, qualquer erro deixa a transação inteira em estado "aborted", e o caminho de `EngineError` (que grava passos e faz o transbordo) falhava no mesmo `tx`. O resultado era rollback da mensagem recebida e retry até esgotar.
**Correção:** criei `emSavepoint`, uma transação aninhada do drizzle, que vira `SAVEPOINT` na mesma conexão. Passam por ela todos os serviços do motor que tocam o banco: `send` (gravação), `forwardForAttendance`, `mergeContact`, `recordSatisfactionAnswer`, `bucketSet`/`bucketGet`, `listManage`, `sendCommand`/`processCommand` e `respondWithKnowledge`. Um erro de banco vira falha da ação (`EngineError`, com transbordo) e a transação de entrada continua utilizável. O `queueId` de `/transfer` agora é validado como uuid antes de qualquer escrita.
**Testes que provam:** os dois passam pelo webhook e verificam que a mensagem de entrada continua gravada, que `execucao_fluxo` terminou em `falhou` e que a conversa foi transbordada para a fila padrão.
- "a DB error inside a platform action fails the action, not the inbound transaction": `SetBucket` com 40 mil "é" passa na checagem da aplicação e viola o CHECK `pg_column_size`, ou seja, um erro real de banco.
- "SendCommand /transfer with a non-uuid queueId…": `queueId: "fila-vendas"`.
- No código original, os dois devolviam 500 no webhook.

### CR-03: O bloco de pesquisa de satisfação nunca envia a pergunta ao cliente

**Commit:** `5d2d5aa3`
**Arquivos:** `apps/api/src/domain/flow.ts`, `apps/api/tests/flow-actions.test.ts`
**Causa raiz:** `textForOChannel` devolvia `null` para `application/vnd.lime.satisfaction-survey+json`, e `send` descartava a mensagem.
**Correção:** o MIME da pesquisa vira texto no canal, com `content.question` mais a escala fixa `1 2 3 4 5` (D-06). Sem `question`, a ação falha com uma mensagem clara. O caminho de envio é o mesmo em produção e na execução de teste (`toChannelOutput`).
**Teste que prova:** "the native satisfaction survey block sends its question to the channel and records the reply". O teste é ponta a ponta, do webhook ao outbox e ao `processarOutbox` com o dublê do WhatsApp (chamada `texto` para o cliente). Em seguida, a resposta "5 muito bom" grava `pesquisa_satisfacao_resposta` com nota 5 e comentário.

### CR-04: O Conteúdo dinâmico criado no Builder nunca resolve em produção

**Commit:** `ef9440fb`
**Arquivos:**
- `packages/core/src/flow/editor.ts`
- `apps/management-vite/src/pages/builder/conteudo.ts`
- `apps/management-vite/tests/builder-content.test.ts`
- `apps/api/tests/flow-content.test.ts`

**Causa raiz:** o Builder gravava `rawContent: {"variable":"nome"}`, ou seja, o nome da variável. O servidor espera o documento LIME `{type, content}`.
**Correção:** o contrato agora é único e fica em `@pipe/core`: `DYNAMIC_CONTENT_TYPE`, `dynamicContentRaw(variavel)` (gera `{{variavel}}`) e `dynamicContentVariable(raw)`, que lê de volta e aceita também o formato antigo dos rascunhos. O Builder grava e lê o card só por essas funções. O motor substitui `{{variavel}}` com escape JSON, e a API resolve o documento com `resolveDynamicContent`, sem mudança nessa parte.
**Testes que provam:**
- Builder: "dynamic content card: Builder settings -> engine -> the LIME document the API resolves". O teste pega os settings exatos que `novoConteudoDinamico` gera, passa por `processInbound` e verifica que a mensagem enviada é o documento LIME. Também confere a volta por `cardsOf`.
- API: "Conteúdo dinâmico escrito pelo Builder resolve e chega ao cliente como texto". O teste publica o fluxo com o formato do Builder, envia pelo webhook e verifica que a `mensagem` do bot tem o texto resolvido.

### CR-05: A guarda SSRF é contornada por redirecionamento HTTP e por IPv6 literal

**Commit:** `19740d38`
**Arquivos:**
- `apps/api/src/domain/mtls.ts`
- `apps/api/src/domain/management/integrations.ts`
- `apps/api/tests/script-sandbox.test.ts`
- `apps/api/tests/flow-content.test.ts`

**Causa raiz:**
1. `fetch` seguia redirecionamentos por conta própria (`redirect: 'follow'`), e só a primeira URL era validada.
2. `URL.hostname` mantém os colchetes do IPv6 (`[::1]`), e `ipPrivado` não reconhecia nem o formato com colchetes nem o IPv4 mapeado.

**Correção:**
- `chamarComMtls` é o único caminho de saída para webhooks, ProcessHttp, SendMessageFromHttp, Conteúdo HTTP, `request.fetchAsync` e a execução de teste. Ele agora usa `redirect: 'manual'` e revalida cada salto com `confirmarUrlSegura`, até `MAX_REDIRECIONAMENTOS = 3`.
- Nos saltos, 303 (e 301/302 depois de um POST) continua como GET sem corpo. `authorization`, `cookie` e `proxy-authorization` não são repassados para outra origem.
- O caminho mTLS (`https.request`) já não seguia redirecionamentos.
- `confirmarUrlSegura` remove os colchetes e expande o IPv6 em 8 hextetos. São bloqueados `::`, `::1`, IPv4 mapeado (`::ffff:a.b.c.d` e `::ffff:hhhh:hhhh`), IPv4 compatível, NAT64 `64:ff9b::/96`, 6to4 `2002::/16`, `fe80::/10`, `fc00::/7` e `ff00::/8`. No IPv4, passam a ser bloqueados também `100.64.0.0/10`, `198.18.0.0/15` e `>= 224`.
- Isso também corrige um falso positivo antigo: nomes DNS que começam com "fc"/"fd" (por exemplo `fcbarcelona.com`) eram recusados.

**Testes que provam:**
- `request.fetchAsync` recusa `[::1]`, `[::ffff:a9fe:a9fe]`, `[::ffff:169.254.169.254]`, `[::ffff:127.0.0.1]`, `[::ffff:7f00:1]`, `[fd00::1]`, `[fe80::1]`, `[::]`, NAT64, 6to4 e `100.64.0.1`, sem nenhuma chamada de rede.
- 302 para `169.254.169.254` (http e https), `[::1]`, `[::ffff:a9fe:a9fe]` e `[::ffff:127.0.0.1]` é recusado, e o `fetch` roda uma única vez, com `redirect: 'manual'`.
- Um redirecionamento seguro é seguido como GET, sem `authorization` entre origens, e há limite de saltos.
- Nomes públicos e IPv6 público continuam aceitos.
- O Conteúdo HTTP (`resolveDynamicContent`) recusa `[::1]`, `[::ffff:a9fe:a9fe]` e `[::ffff:127.0.0.1]`.

### CR-06: Uma ação que estoura o tempo continua escrevendo no `tx` depois que a transação terminou

**Commit:** `1cf3f248`
**Arquivos:**
- `packages/core/src/flow/manager.ts`, `actions.ts`, `context.ts` e os testes
- `packages/db/src/tenant.ts`, `packages/db/tests/rls.test.ts`
- `apps/api/src/domain/mtls.ts`, `flow.ts`, `management/builder-test-run.ts` e os testes

**Causa raiz:** `withTimeLimit` só fazia `Promise.race`, e a promessa da ação continuava viva. O SendMessageFromHttp e o Conteúdo HTTP nasciam com 60 s, contra o prazo de 30 s da ação. Nada impedia uma consulta em um `tx` já encerrado, cujo client já tinha voltado ao pool.
**Correção:** três camadas.
1. **Motor:** `withTimeLimit` aborta um `AbortController` no prazo. O `executar` recebe um terceiro parâmetro, `ActionDeadline` (`signal` e `timeLimitMs`). O SendMessageFromHttp limita o `timeoutMs` ao prazo da ação, repassa o `signal` a `callHttp`/`send` e não envia nada depois do prazo. O ProcessHttp síncrono (sem suspensão, que é o caso da execução de teste) segue a mesma regra. `send(m, signal)` e `callHttp(pedido, signal)` aceitam o `signal` como parâmetro opcional.
2. **API:** `chamarComMtls` combina `timeoutMs` com o `signal` de quem chamou (`AbortSignal.any`). O Conteúdo HTTP recebe o `signal`. `send` verifica o `signal` antes de gravar e grava dentro de savepoint.
3. **Banco (causa raiz para qualquer chamador):** `comTenant` marca a sessão drizzle da transação como encerrada no `finally`. Depois do COMMIT/ROLLBACK, qualquer consulta por aquele handle lança `TransactionClosedError` antes de tocar a conexão, o que cobre `execute`, builders e savepoints.

**Testes que provam:**
- core: "an action past its time limit caps its HTTP timeout, is aborted, and never sends afterwards". O teste verifica que `timeoutMs` fica em no máximo 200 ms, que o `signal` é abortado e que nada é enviado depois da resposta tardia.
- db: "a transaction handle that outlives comTenant can no longer run queries", depois de COMMIT e depois de ROLLBACK. No original, a consulta tardia rodava.
- API: o `signal` do prazo chega ao pedido do Conteúdo HTTP, e `chamarComMtls` aborta quando o prazo de quem chamou vence.
- Dois testes antigos de core passaram a esperar `timeoutMs: 30000`, que é o limite aplicado, no lugar de 60000.

### CR-07: "Inserir função da biblioteca" gera um script que sempre falha com ReferenceError

**Commit:** `ccd50ccf`
**Arquivos:**
- `apps/api/src/domain/script-sandbox.ts`, `flow.ts`, `management/builder-test-run.ts`
- `apps/management-vite/src/pages/builder/flow-functions.ts`, `flow-functions-panel.tsx`, `panel-actions.tsx`
- os testes

**Escolha:** opção (a), consistente com D-22 e com os SUMMARYs 02-17/02-18. A biblioteca pertence ao motor de conversa, e o 02-18 documenta dois pontos de chamada: o `ExecuteBlipFunction` e o helper de inserção no código do script. Por isso a biblioteca passa a estar no escopo dos scripts, em vez de o helper ser removido.
**Causa raiz:** o código de `funcao_do_fluxo` nunca entrava no isolate do ExecuteScript/V2. Além disso, o helper acrescentava `nome(param1, param2)` no nível superior, onde a chamada roda no carregamento do script e usa nomes que não existem.
**Correção:**
- **Sandbox:** `runFlowScript` aceita `library` e monta um prelúdio `var nome = typeof nome === 'function' ? nome : (function () { código; return nome; })();`. Cada função fica no próprio escopo: helpers e `const` internos não vazam nem colidem. Uma função que o próprio script declara com o mesmo nome tem precedência. Produção (`flow.ts`) e a execução de teste repassam `flowFunctions.values()`.
- **Builder:** `insertLibraryCall(source, fn, entrada)` insere a chamada como a primeira instrução de `run` (ou da função definida no campo `function` do V1). Os parâmetros que `run` ainda não declara entram na assinatura, e o motor os alimenta por "Variáveis de entrada". Se não houver função de entrada, a chamada entra como comentário. O painel usa essa função.

**Testes que provam:**
- API ponta a ponta: "a script can call a function from the flow library". Uma função de tenant com helper interno é chamada por um ExecuteScriptV2 publicado, e o bot responde `CPF: 12345678900`. No original, a resposta era vazia, com ReferenceError.
- Sandbox: escopo isolado (`typeof limpar === 'undefined'`) e precedência da declaração local.
- Builder: a chamada é inserida dentro de `run`, com a assinatura ajustada, e executa.

### WR-01: `SendCommand`/`ProcessCommand` aceitam fila de outro tenant e mudam o estado da conversa sem nenhum efeito colateral

**Commit:** `2a082273`
**Arquivos:** `apps/api/src/domain/flow.ts`, `apps/api/src/domain/conversation.ts`, `apps/api/tests/flow-actions.test.ts`
**Causa raiz:**
- `update conversa set fila_id = $queueId` confiava na FK, e a FK ignora o RLS.
- `/status` e `/transfer` escreviam o estado diretamente, sem eventos, SLA, webhook ou distribuição.

**Correção:**
- `/transfer` valida o uuid e consulta `select id from fila where id = $1 and tenant_id = $tenant and ativa`, um filtro explícito de tenant. Depois segue pelo mesmo handoff que o `forwardForAttendance` do bot usa (`transferirPeloBot` → `transbordar`), com `criada`/`enfileirada`, prioridade, nota interna, webhook `conversa.estado_alterado` e distribuição.
- `/status`:
  - `na_fila` usa o mesmo handoff para a fila padrão.
  - `encerrada` passa pela nova `closeInTransaction`, extraída de `closeConversation` e compartilhada com ela. Essa função grava estado e `encerrada_em`, fecha o intervalo de espera, registra o evento `encerrada` e dispara o webhook `conversa.encerrada`.
  - `atribuida`/`em_atendimento`/`em_espera` são recusados com uma mensagem clara, porque a máquina de estados só chega a eles com atendente.

**Testes que provam:**
- Fila de outro tenant é recusada: a ação falha e a conversa vai para a fila padrão do próprio tenant, nunca para a fila estrangeira. No original, a fila estrangeira era aceita.
- `/transfer` para uma fila do tenant registra `criada` e `enfileirada`.
- `/status encerrada` preenche `encerrada_em` e registra o evento `encerrada`.
- `/status em_atendimento` é recusado.

### WR-02: Sandbox sem teto de requisições, de download, de isolates simultâneos e de tamanho do retorno

**Commit:** `7bfa3e51`
**Arquivos:** `apps/api/src/domain/script-sandbox.ts`, `apps/api/src/domain/mtls.ts`, `apps/api/tests/script-sandbox.test.ts`
**Causa raiz:** não havia contador, `AbortSignal`, leitura em stream, semáforo nem teto de retorno.
**Correção:**
- **Fetch:** no máximo `MAX_FETCHES_POR_SCRIPT = 10` chamadas de `request.fetchAsync` por execução. Um `AbortController` por execução é abortado no `finally` e repassado ao `chamarComMtls`, então nenhuma chamada do host sobrevive ao isolate.
- **Download:** `PedidoDeSaida.maxBytes` faz o `fetch` ler o corpo em stream e cancelá-lo no limite. No caminho mTLS, o socket é destruído no limite. O `scriptFetch` usa o limite de 1 MB.
- **Isolates:** semáforo por processo com `MAX_ISOLATES` (padrão 8, configurável em `PIPE_SCRIPT_MAX_ISOLATES`). Quem passa do limite espera uma vaga até o próprio tempo limite e depois falha. A limitação é conhecida e está marcada com `ponytail:`: o semáforo é por processo.
- **Retorno:** o JSON devolvido pelo script tem teto de `MAX_RESULTADO_BYTES = 64 KB`, o mesmo do SetBucket.

**Testes que provam:** um teste para cada limite.
- 11 fetches: 10 chamadas são feitas, o script falha e todos os `signal` ficam abortados.
- Corpo infinito: a leitura para em 1 MB. No código original, o worker do vitest morria por falta de memória.
- Oito isolates ocupados: o nono espera e roda, e o décimo desiste no próprio prazo.
- Retorno de 64 KB mais 1 byte é recusado.

### WR-03: Variável controlada pelo cliente é interpolada no código-fonte do script (injeção de código no sandbox)

**Commit:** `adf6c7b7`
**Arquivos:**
- `packages/core/src/flow/manager.ts`, `packages/core/src/flow/manager.test.ts`
- `apps/management-vite/src/pages/builder/actions-of-block.ts`, `apps/management-vite/tests/builder-actions.test.ts`

**Causa raiz:** `replaceVariables` rodava sobre todas as settings, inclusive `source`. O escape JSON protege apenas o JSON das settings, e não o JavaScript em volta do valor.
**Correção:** é uma decisão de segurança do Pipe e diverge da Blip. No `ExecuteScript`/`ExecuteScriptV2`, a chave `source` (sem diferenciar maiúsculas) é separada antes da substituição e volta crua, enquanto as outras settings continuam sendo substituídas. Dados do cliente só chegam ao script por `inputVariables`, como argumentos copiados pela fronteira do isolate. O `ExecuteBlipFunction` não tem `source`, porque o código vem da biblioteca. O Builder avisa em `actionErrors` quando o código contém `{{...}}`.
**Testes que provam:** "%s: a customer variable is never interpolated into the source, only passed as data", para V1 e V2. Uma mensagem com código (`"; await request.fetchAsync(...); "`) chega ao sandbox só como argumento, e o `source` chega intacto, com `{{input.content}}` literal. O aviso do Builder também tem teste.

## Achados intencionalmente não corrigidos (vão para o plano de lacunas)

Ficaram fora do escopo por decisão do orquestrador do dono: WR-04, WR-05, WR-06, WR-07, WR-08, WR-09, WR-10, WR-11, WR-12, WR-13, IN-01, IN-02, IN-03, IN-04, IN-05 e IN-06.

Algumas dessas lacunas ficaram menores com as correções acima:
- **WR-13:** o erro de banco causado pela diferença entre o limite de 64 KB e o CHECK já não derruba a mensagem. Com o CR-02, ele vira falha de ação. A divergência de medida continua.
- **WR-06:** o prazo da ação agora limita e aborta o SendMessageFromHttp e o Conteúdo HTTP (CR-06). `PedidoDeSaida.maxBytes` já existe para a leitura em stream, mas ainda não é usado nesses dois caminhos. O teto de 10 s e a suspensão continuam pendentes.
- **WR-05:** o CR-02 reduz os casos de linha "envenenada" causados por erro de banco nas ações. A varredura continua como estava.

## Verificação final

| Suíte | Resultado |
|-------|-----------|
| `pnpm --filter @pipe/core exec vitest run` | 13 arquivos, 475 testes, todos passando |
| `pnpm --filter @pipe/api exec vitest run` | 54 arquivos, 736 testes, todos passando (suíte inteira) |
| `pnpm --filter @pipe/workers test` | 4 arquivos, 42 testes, todos passando |
| `pnpm --filter @pipe/management-vite test` | 310 testes, todos passando |
| `pnpm --filter @pipe/db test` | 4 arquivos, 32 testes, todos passando |
| `pnpm exec turbo run typecheck` | 23 de 23 tarefas com sucesso |

O Postgres (`pipe-postgres`, porta 5433) e o Redis (`pipe-redis`, porta 6380) do docker estavam no ar. As migrations, incluindo as 0047–0050, são aplicadas pelo `globalSetup` (`packages/db/tests/preparar.ts`) e pelo `montarCenario` dos testes.

O ESLint passa limpo em todos os arquivos alterados. No pacote da API ainda há dois erros `no-unused-vars` que já existiam na base e ficam em arquivos que não foram tocados: `apps/api/src/domain/management/sla.ts:61` (`_alvo`) e `apps/api/tests/channel-of-flow.test.ts:486` (`_semBot`).

---

_Corrigido em: 2026-09-27_
_Corretor: Claude (gsd-code-fixer)_
_Iteração: 1_

---
phase: 02-fechar-o-builder
reviewed: 2026-09-27T00:00:00Z
depth: standard
files_reviewed: 86
files_reviewed_list:
  - apps/api/Dockerfile
  - apps/api/package.json
  - apps/api/src/app.modulo.ts
  - apps/api/src/controllers/flow-functions.ts
  - apps/api/src/controllers/management-builder.ts
  - apps/api/src/controllers/satisfaction-surveys.ts
  - apps/api/src/domain/envio.ts
  - apps/api/src/domain/flow.ts
  - apps/api/src/domain/management/builder-of-flow.ts
  - apps/api/src/domain/management/builder-test-run.ts
  - apps/api/src/domain/management/flow-functions.ts
  - apps/api/src/domain/management/satisfaction-surveys.ts
  - apps/api/src/domain/script-sandbox.ts
  - apps/api/src/queues.ts
  - apps/api/src/servidor.ts
  - apps/api/tests/builder-by-flow.test.ts
  - apps/api/tests/builder-test-run.test.ts
  - apps/api/tests/flow-actions.test.ts
  - apps/api/tests/flow-content.test.ts
  - apps/api/tests/flow-functions.test.ts
  - apps/api/tests/flow-platform-actions.test.ts
  - apps/api/tests/flow.test.ts
  - apps/api/tests/process-http-retomada.test.ts
  - apps/api/tests/satisfaction-survey.test.ts
  - apps/api/tests/script-sandbox.test.ts
  - apps/api/vitest.config.ts
  - apps/management-vite/package.json
  - apps/management-vite/src/pages/builder-gravar.ts
  - apps/management-vite/src/pages/builder.tsx
  - apps/management-vite/src/pages/builder/actions-of-block.ts
  - apps/management-vite/src/pages/builder/code-editor.tsx
  - apps/management-vite/src/pages/builder/conteudo.ts
  - apps/management-vite/src/pages/builder/destination-picker.tsx
  - apps/management-vite/src/pages/builder/editor.css
  - apps/management-vite/src/pages/builder/editor.tsx
  - apps/management-vite/src/pages/builder/flow-functions-gravar.ts
  - apps/management-vite/src/pages/builder/flow-functions-panel.tsx
  - apps/management-vite/src/pages/builder/flow-functions.ts
  - apps/management-vite/src/pages/builder/import-exportar.ts
  - apps/management-vite/src/pages/builder/menu-new-block.tsx
  - apps/management-vite/src/pages/builder/model.ts
  - apps/management-vite/src/pages/builder/no.tsx
  - apps/management-vite/src/pages/builder/panel-actions.tsx
  - apps/management-vite/src/pages/builder/panel-block.css
  - apps/management-vite/src/pages/builder/panel-configuration.tsx
  - apps/management-vite/src/pages/builder/panel-content.tsx
  - apps/management-vite/src/pages/builder/panel-outputs.tsx
  - apps/management-vite/src/pages/builder/panel-queues.tsx
  - apps/management-vite/src/pages/builder/panel.tsx
  - apps/management-vite/src/pages/builder/tags-of-block.ts
  - apps/management-vite/src/pages/builder/test-panel-logic.ts
  - apps/management-vite/src/pages/builder/test-panel.tsx
  - apps/management-vite/src/pages/builder/variables.ts
  - apps/management-vite/tests/builder-actions.test.ts
  - apps/management-vite/tests/builder-content.test.ts
  - apps/management-vite/tests/builder-editor.test.ts
  - apps/management-vite/tests/builder-functions.test.ts
  - apps/management-vite/tests/builder-painels.test.ts
  - apps/workers/src/delivery.ts
  - apps/workers/src/whatsapp/cliente.ts
  - apps/workers/src/whatsapp/real.ts
  - docs/marca/MARCA.md
  - packages/contracts/src/flow-functions.ts
  - packages/contracts/src/index.ts
  - packages/contracts/src/management-flow.ts
  - packages/contracts/src/satisfaction-survey.ts
  - packages/core/src/flow/actions.test.ts
  - packages/core/src/flow/actions.ts
  - packages/core/src/flow/context.ts
  - packages/core/src/flow/editor.test.ts
  - packages/core/src/flow/editor.ts
  - packages/core/src/flow/index.ts
  - packages/core/src/flow/manager.test.ts
  - packages/core/src/flow/manager.ts
  - packages/core/src/flow/modelos.ts
  - packages/core/src/flow/satisfaction-survey.test.ts
  - packages/core/src/flow/satisfaction-survey.ts
  - packages/db/drizzle/0047_pesquisa_satisfacao_resposta.sql
  - packages/db/drizzle/0048_funcao_do_fluxo.sql
  - packages/db/drizzle/0049_acoes_plataforma.sql
  - packages/db/drizzle/0050_rls_subconsulta_acoes_plataforma.sql
  - packages/db/src/schema/automation.ts
  - packages/db/src/schema/conversations.ts
  - packages/ui/src/estilos/tokens.css
  - packages/ui/src/icones.tsx
  - packages/ui/src/tema.ts
findings:
  critical: 7
  warning: 13
  info: 6
  total: 26
status: issues_found
---

# Fase 02: Relatório de revisão de código

**Revisado em:** 2026-09-27
**Profundidade:** standard (com rastreamento pontual entre módulos nos caminhos de segurança e do motor)
**Arquivos revisados:** 86
**Status:** issues_found

## Resumo

Revisei o sandbox de script, os chamadores da guarda SSRF, as migrations 0047–0050 e as consultas novas, os controllers novos, o isolamento da execução de teste, as mudanças no motor (`manager.ts`, `actions.ts`, `context.ts`, `editor.ts`/`modelos.ts`), a varredura BullMQ e a UI do Builder.

Pontos que estão corretos: o tenant sempre vem da sessão; as políticas RLS das tabelas novas estão na forma `(SELECT current_setting(...))` depois da 0050; a execução de teste não grava em `mensagem`/`conversa`/`execucao_fluxo`; o Monaco é carregado sob demanda e sem CDN; não há `dangerouslySetInnerHTML`.

Os problemas mais graves são de funcionamento, não de estilo:
- a retomada de ProcessHttp nas ações de entrada de um bloco consome de novo a mensagem original;
- o bloco de pesquisa de satisfação nunca envia a pergunta ao cliente;
- o Conteúdo dinâmico criado no Builder nunca resolve;
- a ajuda "Inserir função da biblioteca" gera código que sempre falha;
- qualquer erro de banco nas ações novas de plataforma aborta a transação de entrada e derruba a mensagem do cliente;
- a guarda SSRF é contornada por redirecionamento e por IPv6 literal. Essa falha é diferente da lacuna aceita de DNS.

Não repeti os itens já aceitos em `ref/LACUNAS-APROVADAS.md`: sandbox dentro do processo, DNS não resolvido, script/ProcessHttp segurando a conexão por até 10 s, `localTimeZoneEnabled` sem efeito, limites do Jint e lint antigo. Quando um achado agrava um desses itens, isso está dito no próprio achado.

## Achados narrativos (revisor IA)

## Problemas críticos (BLOCKER)

### CR-01: Retomada de ProcessHttp nas ações de entrada de um bloco trata a mensagem antiga como resposta desse bloco

**Arquivo:** `packages/core/src/flow/manager.ts:182-207` (e o laço em `:209-235`)
**Problema:** o bloco novo (linhas 186-207) conclui as `inputActions` do estado restaurado, mas `waitInbound` continua `true` (linha 182). Com isso o laço executa `stateValidateInbound` e grava `input.variable` com a **mesma** mensagem que já tinha sido consumida pelo bloco anterior antes da suspensão, e depois segue pelas saídas.
**Cenário:** o bloco A pergunta "Qual seu CPF?" e o cliente responde. O fluxo vai para o bloco B, cujas ações de entrada fazem ProcessHttp e depois o bloco pergunta "Confirma?". Na retomada, o CPF vira a resposta de "Confirma?", `input.variable` recebe o CPF e o bot avança sem esperar o cliente. O próprio teste novo (`manager.test.ts`, "ProcessHttp in a state's entering actions") passa por acaso: o estado `ping` tem `outputs: []` e o estado é apagado depois da retomada, só que o teste não verifica `variables[KEY_STATE]`.
**Correção:** depois de concluir as ações de entrada na retomada, calcule `waitInbound` como faz o `finally` do laço. Se o estado aguarda entrada, saia sem executar o laço.
```ts
if (cursorPendente && !cursorPendente.consumido && cursorPendente.lista === 'entrada' && cursorPendente.estadoId === state.id) {
  await processActions(/* ... */);
  const cond = !state.input?.conditions || (await evaluateConditions(state.input.conditions, context.inbound, context));
  if (state.input && !state.input.bypass && cond) {
    // o estado espera a PRÓXIMA mensagem: só roda as ações globais de saída e retorna
    if (flow.outputActions) await processActions(/* ... 'conteudo', null ... */);
    rastro.stateFinalId = state.id;
    return rastro;
  }
  waitInbound = false; // estado sem entrada: segue para conteúdo/saídas sem reconsumir a mensagem
}
```
Inclua no teste `expect(variables[KEY_STATE]).toBe('ping')` depois da retomada.

### CR-02: Erro de banco em ação nova de plataforma aborta a transação de entrada e perde a mensagem do cliente

**Arquivo:** `apps/api/src/domain/flow.ts:172-223` (`executeNativeCommand`), `:379-412` (`mergeContact`), `:464-517` (`bucketSet`/`listManage`), em conjunto com `:579-646` (`rodar`)
**Problema:** os serviços novos escrevem direto no `tx` da entrada, sem savepoint, e usam dados vindos do autor ou do cliente. No Postgres, qualquer erro deixa a transação em estado "aborted". O caminho de `EngineError` em `rodar` (linha 629 em diante) grava `gravarPassos`/`update execucao_fluxo`/`transbordarSemFalhar` **no mesmo tx**, e todos esses comandos falham com `current transaction is aborted`. O resultado contraria o contrato documentado na linha 578 ("A flow failure must not abort the message"): a transação inteira, incluindo a mensagem recebida, sofre rollback, o job é reprocessado e falha de novo do mesmo jeito até esgotar as tentativas.
**Gatilhos concretos:**
- `SendCommand` `/tickets/x/transfer` com `queueId: "fila-vendas"`: o cast do uuid dá erro 22P02.
- `queueId` inexistente: violação de FK.
- `SetBucket` com documento perto de 64 KB: a checagem da aplicação mede `JSON.stringify(value).length` (caracteres, só `value`), mas o CHECK `pg_column_size(valor) <= 65536` mede os bytes de `{type,value}` (ver WR-13).
- `continueOnError: true` não ajuda, porque a transação já está perdida.

**Correção:** execute cada serviço que escreve dentro de um savepoint, para que o erro vire erro de ação e não de transação. Valide antes os ids vindos do fluxo.
```ts
const comSavepoint = <T>(fn: (sp: TransactionPipe) => Promise<T>) => tx.transaction(fn); // drizzle: transação aninhada = SAVEPOINT
mergeContact: (fields) => comSavepoint(async (sp) => { /* mesmos comandos usando sp */ }),
```
Faça o mesmo em `executeNativeCommand`, `bucketSet`, `listManage` e `recordSatisfactionAnswer`. Acrescente um teste de API: `SendCommand /transfer` com `queueId` inválido deve resultar em transbordo e a mensagem de entrada deve continuar persistida.

### CR-03: O bloco de pesquisa de satisfação nunca envia a pergunta ao cliente

**Arquivo:** `apps/api/src/domain/flow.ts:1133`; `apps/management-vite/src/pages/builder/model.ts:348-366`
**Problema:** `newSurveyBlock` cria um único conteúdo `SendMessage` com `type: application/vnd.lime.satisfaction-survey+json` e `content.question`. No envio, `toChannelOutput` → `textForOChannel` devolve `null` para esse MIME ("the native satisfaction block owns its question/answer lifecycle"), e `send` descarta a mensagem (`if (saida === null) return;`). O motor não envia a pergunta por nenhum outro caminho.
**Cenário:** o autor publica Atendimento → Pesquisa. Quando o atendimento encerra, o cliente não recebe nada. O bot fica parado no estado da pesquisa, e a próxima mensagem qualquer do cliente ("obrigado") não é uma nota válida, então nenhuma resposta é gravada. Nenhum teste de API cobre a entrega (só há testes de `interpretSatisfactionAnswer` e da consulta).
**Correção:** mapeie o MIME da pesquisa para uma saída de canal, por exemplo texto com `content.question` ou um menu 1–5 via `dados.pergunta`:
```ts
if (tipo === 'application/vnd.lime.satisfaction-survey+json') {
  const q = (conteudo as { question?: string } | null)?.question?.trim();
  if (!q) throw new Error("O campo 'question' é obrigatório na pesquisa de satisfação.");
  return `${q}\n1 2 3 4 5`;
}
```
Acrescente um teste webhook → outbox que verifique a pergunta no outbox.

### CR-04: O Conteúdo dinâmico criado no Builder nunca resolve em produção

**Arquivo:** `apps/management-vite/src/pages/builder/conteudo.ts:255-261` e `:396`; `apps/api/src/domain/flow.ts:1242-1262`
**Problema:** o Builder grava `SendRawMessage` com `rawContent: JSON.stringify({ variable: "conteudoLime" })`, ou seja, o **nome** da variável. O `sendRawMessage` do motor repassa esse texto como `conteudo`. `resolveDynamicContent` faz `JSON.parse` e espera um documento LIME `{type, content}`. Recebe `{variable: ...}`, `type` fica vazio e o método lança "resolveu um tipo que o canal não envia: '(vazio)'". Todo card de Conteúdo dinâmico falha, o fluxo cai em `EngineError` e a conversa vai para a fila. O teste de `flow-content.test.ts:224` só cobre `'{not json'`, nunca o formato que o Builder realmente produz.
**Correção:** o Builder deve gravar o placeholder, porque o motor já substitui `{{...}}` com escape JSON antes do `JSON.parse` das settings:
```ts
settings: { id, type: TIPO_CONTEUDO_DINAMICO, rawContent: variavel ? `{{${variavel}}}` : '' },
```
Ajuste `cardsOf` (linha 185) para ler o nome de volta a partir de `{{nome}}`, e acrescente um teste ponta a ponta Builder → motor → `resolveDynamicContent`.

### CR-05: A guarda SSRF (`confirmarUrlSegura`) é contornada por redirecionamento HTTP e por IPv6 literal

**Arquivo:** chamadores novos: `apps/api/src/domain/script-sandbox.ts:106-119`, `apps/api/src/domain/flow.ts:1218-1231` (Conteúdo HTTP), `apps/api/src/domain/management/builder-test-run.ts:229-237`; causa em `apps/api/src/domain/mtls.ts:200-205` e `apps/api/src/domain/management/integrations.ts:238-274`
**Problema:**
1. `chamarComMtls` sem certificado usa `fetch` com o `redirect: 'follow'` padrão. A URL é validada uma única vez, antes da chamada. `https://atacante.com/r` respondendo `302 Location: http://169.254.169.254/latest/meta-data/iam/...` é seguido sem nova validação, e o `fetch` segue também de https para http.
2. `new URL('https://[::ffff:169.254.169.254]/').hostname` é `"[::ffff:a9fe:a9fe]"`, **com colchetes** (conferido no Node). `ipPrivado` compara com `'::1'` e `startsWith('fe80:'|'fc'|'fd')`, e nenhum desses casa com o valor entre colchetes. Assim `[::1]`, `[::ffff:127.0.0.1]` e `[fd00::1]` passam.

Isso é diferente da lacuna aceita ("não resolve DNS"), porque nenhum dos dois casos depende de DNS. Com `request.fetchAsync` e o Conteúdo HTTP, a resposta volta para o autor (variável ou mensagem), então a SSRF é de leitura completa.
**Correção:**
```ts
// mtls.ts
const resposta = await fetch(url, { ..., redirect: 'manual' });
if (resposta.status >= 300 && resposta.status < 400) { /* validar Location com confirmarUrlSegura e seguir no máximo N vezes, ou recusar */ }
// integrations.ts
const host = analisada.hostname.toLowerCase().replace(/^\[|\]$/g, '');
// e tratar IPv4 mapeado (::ffff:x.y.z.w / ::ffff:hhhh:hhhh), 100.64.0.0/10, 198.18.0.0/15
```
Faça o mesmo em `pedirComAgente`: `https.request` não segue redirecionamento, então esse caminho já está correto. Acrescente casos de teste para `[::1]` e para 302 → 169.254.169.254.

### CR-06: Uma ação que estoura o tempo continua escrevendo no `tx` depois que a transação terminou

**Arquivo:** `packages/core/src/flow/manager.ts:127-133` (`withTimeLimit`), `packages/core/src/flow/actions.ts:250-256` (SendMessageFromHttp, padrão de 60 s), `apps/api/src/domain/flow.ts:1226` (Conteúdo HTTP, padrão de 60 s), `apps/management-vite/src/pages/builder/actions-of-block.ts:338`
**Problema:** o limite padrão por ação é 30 s (`defaultActionTimeLimitMs`), mas o SendMessageFromHttp e o Conteúdo HTTP nascem com `requestTimeout: 60`. `withTimeLimit` só faz `Promise.race`, e a promessa da ação continua viva. Quando o HTTP responde, digamos aos 40 s, `services.send` → `gravarRespostaDoBot(tx, ...)` roda sobre um `tx` cujo COMMIT/ROLLBACK já aconteceu e cujo client já voltou ao pool.
**Cenário:** o INSERT em `mensagem`/`outbox_mensagem` cai numa conexão que pode estar dentro da transação de **outra** requisição. Se for de outro tenant, o `WITH CHECK` do RLS rejeita e aborta a transação alheia. Se for do mesmo tenant, uma resposta do bot "fantasma" é commitada junto com outra transação. Se a conexão estiver ociosa, o comando roda sem `pipe.tenant_id`.
**Correção:**
1. Limite o timeout HTTP ao prazo da ação: `timeoutMs = Math.min(requestTimeout*1000, limiteDaAcao - 1000)`.
2. Faça `withTimeLimit` abortar via `AbortSignal`, repassado a `callHttp`/`send`.
3. Em `noTenant`/`comTenant`, marque o `tx` como encerrado e faça `execute` lançar erro depois disso.

### CR-07: "Inserir função da biblioteca" gera um script que sempre falha com ReferenceError

**Arquivo:** `apps/management-vite/src/pages/builder/flow-functions-panel.tsx:396-417`, `apps/management-vite/src/pages/builder/panel-actions.tsx:535-541`; `apps/api/src/domain/flow.ts:448`
**Problema:** o helper acrescenta `nome(param1, param2)` no **fim** do `source` do ExecuteScript/ExecuteScriptV2. Só que `runScript` executa apenas `request.source`, e o código da biblioteca (`funcao_do_fluxo`) nunca é injetado no isolate. A chamada inserida fica no nível superior e é avaliada ao carregar o script, antes de `run`. Os nomes `param1`/`param2` também não existem.
**Cenário:** o autor insere `formatarCpf(cpf)` no script, publica, e toda execução falha com `ReferenceError: formatarCpf is not defined`, seguido de transbordo.
**Correção:** uma de duas opções:
- (a) Em `runScript`, concatene antes do `source` o código das funções de `flowFunctions` (o map já está carregado na linha 325), e insira o snippet dentro de `run` no cursor do editor.
- (b) Remova o helper até existir esse suporte (D-03: o que não funciona não entra).

## Avisos (WARNING)

### WR-01: `SendCommand`/`ProcessCommand` aceitam fila de outro tenant e mudam o estado da conversa sem nenhum efeito colateral

**Arquivo:** `apps/api/src/domain/flow.ts:201-217`
**Problema:**
- `update conversa set fila_id = ${queueId}` usa um `queueId` vindo do fluxo sem conferir se a fila pertence ao tenant. A checagem de FK ignora o RLS, então o UUID de uma fila de outro tenant é aceito, e a conversa fica apontando para uma fila que ninguém do tenant enxerga.
- `/status` define `encerrada` sem `encerrada_em`, sem `evento_atendimento`, sem SLA e sem distribuição.
- `/transfer` ignora o que `forwardForAttendance` faz (eventos, SLA, fila padrão).

**Correção:** `update ... set fila_id = (select id from fila where id = $1::uuid)`, com erro se vier `null` (o RLS filtra o tenant). Encaminhe `/transfer` por `forwardForAttendance` e `/status` pelas funções de domínio que já fecham/reabrem o atendimento.

### WR-02: Sandbox sem teto de requisições, de download, de isolates simultâneos e de tamanho do retorno

**Arquivo:** `apps/api/src/domain/script-sandbox.ts:44-66`, `:114-121`; `packages/core/src/flow/actions.ts:403`
**Problema:**
1. Um script V2 pode disparar `Promise.all` com milhares de `request.fetchAsync` em 10 s. As chamadas do host continuam depois de `isolate.dispose()`, porque não há `AbortSignal`, o que transforma a API num amplificador de tráfego de saída que ainda carrega os certificados mTLS do tenant.
2. `(await resposta.texto()).slice(0, limite)` baixa o corpo **inteiro** para a memória antes de cortar, então o limite de 1 MB não protege a memória.
3. Não existe limite de isolates simultâneos: com 100 MB cada, N entradas concorrentes somam N×100 MB fora do heap da API.
4. O retorno (até cerca de 100 MB de JSON) é gravado sem limite em variável de contexto e persistido em `execucao_fluxo.contexto` a cada mensagem.

**Correção:** contador de fetch por execução (por exemplo, no máximo 10), `AbortController` cancelado no `finally`, leitura em stream com corte em `limite`, semáforo global de isolates e teto no tamanho de `result` (por exemplo 64 KB, igual ao SetBucket).

### WR-03: Variável controlada pelo cliente é interpolada no código-fonte do script (injeção de código no sandbox)

**Arquivo:** `packages/core/src/flow/manager.ts:406-409`
**Problema:** `replaceVariables` roda sobre **todas** as settings, exceto as de `ExecuteTemplate`, incluindo `source` do ExecuteScript/ExecuteScriptV2. O escape é de JSON, e depois do `JSON.parse` o valor entra cru no JavaScript. Um script como `var nome = "{{input.content}}";` com o cliente enviando `"; await request.fetchAsync("https://api-do-cliente-com-mtls/admin", {method:"DELETE"}); "` executa código escolhido por quem está do outro lado do WhatsApp, com o `fetch` e o mTLS do tenant.
**Correção:** não substitua variáveis em `source` (acrescente `ExecuteScript`, `ExecuteScriptV2` e `ExecuteBlipFunction` à exceção de `ExecuteTemplate`) e exija `inputVariables`. O editor deve avisar quando houver `{{` no código.

### WR-04: A biblioteca de funções não acompanha a versão publicada do fluxo

**Arquivo:** `apps/api/src/domain/flow.ts:325`; `apps/api/src/domain/management/flow-functions.ts:93-128`
**Problema:** `loadFlowFunctions` lê a linha **atual** de `funcao_do_fluxo`. Editar ou excluir uma função no Builder (ou num rascunho) muda na hora o comportamento do fluxo **publicado**, sem passar por publicação, e o histórico/restauração de versão não inclui as funções. Além disso, a publicação não verifica se o `functionId` de cada `ExecuteBlipFunction` existe. A exclusão avisa "Ações que a chamam deixam de funcionar", mas nada impede excluir.
**Correção:** no mínimo, valide na publicação que os `functionId` existem e bloqueie a exclusão de função referenciada por versão publicada. O ideal é congelar `codigo`/`versao` junto da `fluxo_versao` ao publicar.

### WR-05: Varredura de ProcessHttp: linha envenenada fica em `chamando` para sempre, `pendente` órfã nunca é recuperada, e o lock é ilusório

**Arquivo:** `apps/api/src/domain/flow.ts:866-900`; `apps/api/src/queues.ts:126-153`
**Problema:**
1. Se `resumeCallOfProcessHttp` falha de forma determinística (por exemplo, pelo CR-02), o rollback mantém a linha em `chamando` com o mesmo `atualizado_em`. A varredura tenta de novo a cada 60 s, só registra log, e o contato continua bloqueado (a linha 267 barra toda entrada enquanto houver `pendente`/`chamando`).
2. Uma linha `pendente` cujo job BullMQ se perdeu (Redis caiu depois do commit) nunca é varrida.
3. `select ... for update skip locked` roda em autocommit em `databaseOwner().execute`, e o lock some no fim do próprio SELECT, então o `skip locked` não protege nada.
4. Um `requestTimeout` do ProcessHttp maior que `PIPE_PROCESS_HTTP_TIMEOUT_MS` (120 s) faz a varredura injetar um 408 sintético enquanto a chamada real ainda corre. Num POST, o efeito colateral acontece e o fluxo segue como se tivesse dado timeout.

**Correção:**
- Depois de N falhas, ou se `atualizado_em` passar de 2× o limite, marque a linha como `falhou` num tx separado e libere o contato.
- Inclua `pendente` antigo na varredura, reenfileirando.
- Retire o `for update skip locked` ou coloque o SELECT dentro de uma transação.
- Limite `requestTimeout` a um valor menor que o limite da varredura.

### WR-06: Conteúdo HTTP e SendMessageFromHttp seguram a transação de entrada por até 30 s ou mais e baixam o corpo inteiro

**Arquivo:** `apps/api/src/domain/flow.ts:1224-1236`; `packages/core/src/flow/actions.ts:250-256`
**Problema:** a lacuna aceita cobre script e ProcessHttp por até 10 s. Estes dois caminhos novos rodam **dentro** do tx com timeout padrão de 60 s e sem teto (`requestTimeout` livre, ou `flowAction.timeout` livre), limitados na prática só pelo prazo de 30 s da ação (ver CR-06). Alguns endpoints lentos já esgotam o pool do Postgres. A verificação de 1 MB acontece depois de `response.texto()` ter lido tudo.
**Correção:** limite `requestTimeout` a 10 s (igual à lacuna aceita) ou mova esses envios para o mesmo mecanismo de suspensão do ProcessHttp. Leia o corpo em stream com corte em 1 MB.

### WR-07: A validação de conteúdo roda em toda entrada, e um único card inválido derruba o bot inteiro

**Arquivo:** `packages/core/src/flow/modelos.ts:102-110`; `packages/core/src/flow/editor.ts:246-249`
**Problema:** `validarAcao` agora chama `engineContentErrors`, e `validateFlow` roda em **todo** `processInbound`. Um fluxo já publicado ou importado com web link `{{linkDinamico}}`, que o Blip aceita, com MIME de mídia fora da lista (por exemplo `image/heic`) ou com `size` acima do teto passa a falhar em **toda** mensagem, em qualquer bloco, e não só no card com problema. Na publicação, URLs com variável são recusadas ("deve usar https"), o que não bate com a referência.
**Correção:** ignore valores que contêm `{{`. Deixe `engineContentErrors` só na publicação (`builder-of-flow`) e não em `validateFlow` durante a execução. Se quiser manter em runtime, valide somente a ação no momento em que ela executa.

### WR-08: API de funções sem validação de entrada e com schema divergente da migration

**Arquivo:** `apps/api/src/controllers/flow-functions.ts:17`; `apps/api/src/domain/management/flow-functions.ts:29-39`, `:47`, `:69`, `:116`; `packages/db/src/schema/automation.ts` (`flowFunction`)
**Problema:**
- `?limit=abc` produz `Math.min(Math.max(NaN,1),100) = NaN`, que vira `limit NaN` e erro 500.
- `/:id` com um id que não é uuid falha no cast `::uuid` e devolve 500 em vez de 404. O mesmo vale para `flowId`.
- Corpo sem `code` (`input.code.trim()`) gera TypeError e 500. `description` não tem tipo verificado.
- `fluxo_id` referencia `fluxo(id)` sem `tenant_id` na FK, então aceita o UUID de um fluxo de outro tenant, e o `ON DELETE CASCADE` desse fluxo apaga a função.
- O schema Drizzle não declara `funcao_do_fluxo_tenant_nome_uk`, `funcao_do_fluxo_fluxo_nome_uk`, `escopo_ck` nem `parametros_ck`, então o próximo `drizzle-kit generate` vai propor apagar esses objetos.

**Correção:** validar o formato (uuid e tipos) no domínio com `PipeError.request`, usar `uuidOu404` como os outros controllers, verificar `fluxo_id` com `select id from fluxo where id=$1` (sob RLS) e declarar os índices e checks no schema.

### WR-09: `pesquisa_satisfacao_resposta.conversa_id ON DELETE RESTRICT` destoa de todas as outras tabelas filhas de `conversa`

**Arquivo:** `packages/db/drizzle/0047_pesquisa_satisfacao_resposta.sql:29`; `packages/db/src/schema/conversations.ts` (`satisfactionSurveyResponse.conversaId`)
**Problema:** todas as outras filhas de `conversa` (`mensagem`, `avaliacao`, `resposta_pesquisa`, `evento_atendimento`, `execucao_fluxo`...) usam `cascade`. Com `restrict`, apagar uma conversa que tenha pesquisa (purga, retenção, exclusão LGPD, `seed-demo`) passa a falhar.
**Correção:** `ON DELETE CASCADE`, ou `SET NULL` com a coluna anulável, se o relatório precisar sobreviver à conversa.

### WR-10: Seletor e lista de funções só enxergam as 50 primeiras

**Arquivo:** `apps/management-vite/src/pages/builder/flow-functions-gravar.ts:12-19`; `apps/management-vite/src/pages/builder/flow-functions-panel.tsx:342-352`
**Problema:** `listFlowFunctions()` não repassa `limit`/`offset`, e a API devolve no máximo 50 (padrão). Com mais de 50 funções, a lista corta sem aviso, e em `FlowFunctionSelect` o `find(fn.id === value)` devolve `null` para uma função já escolhida. A ação aparece sem função selecionada, e o autor pode trocá-la sem querer.
**Correção:** buscar a função selecionada por `GET /flow-functions/:id` e paginar ou buscar no servidor (`search`).

### WR-11: Estado do painel de Teste diverge entre a UI e o servidor

**Arquivo:** `apps/api/src/domain/management/builder-test-run.ts:316`; `apps/management-vite/src/pages/builder/test-panel.tsx:152-180`; `apps/management-vite/src/pages/builder/editor.tsx:231-240`
**Problema:**
1. `Object.assign(store.variables, testVariables)` roda a **cada** mensagem e sobrescreve valores que o próprio fluxo gravou nessas variáveis. O teste não reproduz o comportamento de produção.
2. Fechar o painel desmonta o componente e apaga o chat, mas o estado no servidor dura 30 min. A próxima mensagem continua do meio do fluxo, embora a tela diga "simular o fluxo a partir do bloco inicial".
3. `reiniciar` ignora o `Resultado` de `resetTest`: se o reset falhar, a UI limpa e o servidor não.
4. Uma mensagem em andamento que termine depois do reset acrescenta respostas da sessão antiga.
5. `testVariables` não tem o tipo validado no servidor: um valor objeto quebra o motor. Uma chave `__proto__` altera o protótipo de `store.variables`.

**Correção:**
- Aplicar `testVariables` só quando mudarem, ou só na primeira mensagem depois do reset.
- Chamar `resetTest` ao abrir o painel, ou ao fechá-lo.
- Tratar `!r.ok` em `reiniciar`.
- Descartar respostas de uma "geração" anterior com um contador.
- Validar `Record<string,string>` e rejeitar `__proto__`/`constructor`.

### WR-12: O tempo limite do ProcessHttp definido no Builder é ignorado

**Arquivo:** `apps/management-vite/src/pages/builder/actions-of-block.ts:116` + `:368-384` (`comCampo`); `packages/core/src/flow/actions.ts:357-358`
**Problema:** o campo "Tempo limite (segundos)" é gravado como **texto** (`"15"`) por `comCampo`, mas o motor só aceita `typeof timeoutCru === 'number'`. Qualquer valor configurado vira 60 s. O defeito já existia antes da fase, mas o arquivo está no escopo e o campo foi replicado no SendMessageFromHttp nesta fase. Nesse caso funciona, porque ali o motor usa `Number(...)`.
**Correção:** no motor, `const t = Number(timeoutCru); timeoutMs = Number.isFinite(t) && t > 0 ? Math.min(t, MAX) * 1000 : 60_000`, ou gravar o campo como número no Builder.

### WR-13: O limite de 64 KB do SetBucket não bate com o CHECK do banco

**Arquivo:** `apps/api/src/domain/flow.ts:465`; `packages/db/drizzle/0049_acoes_plataforma.sql:26`
**Problema:** a aplicação mede `JSON.stringify(value).length` (unidades UTF-16, só `value`), e o banco mede `pg_column_size` do jsonb `{type, value}` (bytes). Um documento com acentos ou emojis perto de 64 KB passa na aplicação e estoura o CHECK, e isso leva direto ao CR-02. `JSON.stringify(undefined)` devolve `undefined`, e `.length` lança TypeError.
**Correção:** `Buffer.byteLength(JSON.stringify({ type, value: value ?? null }), 'utf8') > 60_000`, com uma margem para o overhead do jsonb.

## Informativos (INFO)

### IN-01: `respondWithKnowledge` quebra palavras acentuadas e busca só pela primeira

**Arquivo:** `apps/api/src/domain/flow.ts:519-531` (duplicado em `builder-test-run.ts:163-178`)
**Problema:** `split(/\W+/)` separa "informação" em "informa" e "o", e "não" em "n" e "o", porque `\W` sem a flag `u` trata acentos como separadores. O ILIKE usa só `words[0]`. O código está duplicado entre produção e teste.
**Correção:** `split(/[^\p{L}\p{N}]+/u)` e uma única função compartilhada.

### IN-02: Combobox de destino com falhas de teclado

**Arquivo:** `apps/management-vite/src/pages/builder/destination-picker.tsx:63-78`, `:82`, `:112-121`
**Problema:**
- A opção "Direcionar" (limpar o destino) não é alcançável pelo teclado.
- `ArrowDown` com a lista fechada abre e já pula o primeiro item.
- Com zero opções, `ativo` vira -1.
- Os botões ficam dentro de `<label>`: conteúdo interativo aninhado não é HTML válido e confunde leitores de tela.

**Correção:** tratar o item de limpar como índice 0, abrir sem incrementar, usar `Math.max(0, ...)` e trocar o `<label>` externo por `<div>` com `aria-labelledby`.

### IN-03: Mapas em memória da execução de teste nunca são podados

**Arquivo:** `apps/api/src/domain/management/builder-test-run.ts:65`, `:93`
**Problema:** entradas vencidas de `testRunStore` e `countByUser` só são substituídas quando a mesma chave volta a ser usada, e nunca são removidas.
**Correção:** podar as entradas vencidas a cada chamada, ou usar um `setInterval().unref()`.

### IN-04: Localização no Instagram/Messenger perde nome e endereço

**Arquivo:** `apps/workers/src/delivery.ts:236-241`, `:253`
**Problema:** o texto de fallback é só `lat, long`, e `name`/`address` do LIME são descartados (e também não chegam em `dados.localizacao` pelo `toChannelOutput`).
**Correção:** repassar `name`/`address` e, no fallback, montar um link de mapa.

### IN-05: `/change-tags` só acrescenta etiquetas e reaproveita etiqueta de outro escopo

**Arquivo:** `apps/api/src/domain/flow.ts:186-199`
**Problema:** a referência substitui o conjunto de tags. Além disso, `on conflict (tenant_id, nome)` devolve uma etiqueta com `escopo` de contato e a associa à conversa.
**Correção:** documentar a divergência ou remover as associações ausentes, e filtrar pelo escopo `conversa`.

### IN-06: Migration 0049 não é idempotente nas políticas

**Arquivo:** `packages/db/drizzle/0049_acoes_plataforma.sql:34-39`
**Problema:** usa `CREATE POLICY` sem `DROP POLICY IF EXISTS`, ao contrário da 0047/0048. Uma reexecução parcial falha. A 0050 corrige a forma da política, mas não a idempotência da 0049.
**Correção:** acrescentar `DROP POLICY IF EXISTS` antes de cada `CREATE POLICY`.

## Convenções (CONVENTION, não bloqueiam)

`gsd-tools verify conventions --check` apontou 39 itens nos arquivos `.ts/.tsx` do escopo:
- 29 de "identifier casing Pascal": componentes React (`CodeEditor`, `TestPanel`, `DestinationPicker`...). São falso positivo, porque PascalCase é obrigatório para componentes.
- 10 de "catch block swallows": `flow.ts:892/1042/1138`, `queues.ts:178/234/281/312/360`, `actions-of-block.ts:397`, `conteudo.ts:185`. Todos são fallbacks deliberados e comentados (parse opcional, varreduras que registram log e seguem).

Nenhum foi promovido a achado. Sugestão: configurar o pacote de regras para ignorar `.tsx` exportando JSX e catches com comentário.

Hex literal em `editor.css`/`panel-block.css`/`code-editor.tsx` não foi apontado: a correção de 2026-09-26 no `02-UI-SPEC.md` autoriza os neutros medidos da referência no Builder, e só os azuis viram token. O zoom em `var(--moss)` já está em `LACUNAS-APROVADAS.md`.

---

_Revisado em: 2026-09-27_
_Revisor: Claude (gsd-code-reviewer)_
_Profundidade: standard_

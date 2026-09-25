---
phase: quick/process-http-followups
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Nenhum destes tem nome novo DECIDIDO pela Phase 1 ainda (ver nota de cada
  # arquivo abaixo); todos os caminhos são os de hoje.
  - packages/core/src/fluxo/modelos.ts                              # validarEstado; sem proposta de rename no map da Phase 1
  - packages/core/src/fluxo/modelos.teste.ts                        # sem proposta de rename
  - apps/gestao-vite/tests/builder-editor.test.ts                   # sem proposta de rename (dir tests/ não entra no map)
  - apps/gestao-vite/src/paginas/builder/validacao.ts                # Phase 1 (gestao-vite.csv, status=proposed, owner=codex2): apps/management-vite/src/pages/builder/validation.ts
  - apps/api/src/dominio/fluxo.ts                                   # Phase 1 (api.csv): candidate, campo `new` vazio — sem nome novo ainda
  - apps/api/src/filas.ts                                           # idem
  - apps/api/src/metricas.ts                                        # idem
  - apps/api/tests/process-http-retomada.test.ts                    # não entra no map (dir tests/)
  - apps/api/tests/process-http-varredura.test.ts                   # novo; não entra no map
  - infra/observabilidade/alertas.yml                                # não entra no map
autonomous: true
requirements:
  - "TODO .planning/todos/pending/process-http-entering-actions.md"
  - "TODO .planning/todos/pending/process-http-bullmq-sweep.md"

must_haves:
  truths:
    - "Um fluxo com ação ProcessHttp em $enteringCustomActions (inputActions) NUNCA mais publica sem erro — validarFluxo recusa, e o Builder aponta o mesmo bloco com a mesma frase"
    - "Um fluxo com ProcessHttp em $leavingCustomActions (outputActions) continua publicando normalmente — nenhuma regressão no caminho já corrigido em 8dac98b"
    - "process_http_execucao nunca fica preso para sempre em 'chamando' sem que ALGUÉM saiba: toda linha travada aparece numa métrica e num alerta, mesmo em modo BullMQ"
    - "A varredura de recuperação NUNCA chama chamarComMtls de novo para uma linha já 'chamando'/'respondida' — o teste de varredura conta as chamadas ao HTTP de saída e prova que o número não muda"
    - "Uma linha travada em 'respondida' (resposta do cliente já persistida, só a retomada que falhou) é recuperada sozinha, com política de tentativas limitada (BullMQ attempts+backoff) — sem intervenção manual"
    - "Uma linha travada em 'chamando' (não dá para saber se o HTTP já saiu) NUNCA é reenfileirada automaticamente — só vira alerta, para decisão manual"
  artifacts:
    - path: "packages/core/src/fluxo/modelos.ts"
      provides: "validarEstado recusa ProcessHttp (e, por generalização, qualquer ação cujo suspenderHttp dependa de estadoId fixo) em inputActions"
    - path: "apps/api/src/dominio/fluxo.ts"
      provides: "executarProcessHttp divide o commit da resposta HTTP e a retomada em duas transações; retomarProcessHttpRespondida reutilizável pela varredura"
    - path: "apps/api/src/filas.ts"
      provides: "agendarVarreduraProcessHttp cobre o modo bullmq (hoje só cobre memoria); job 'retomar' com attempts+backoff; nunca reenfileira 'chamar'"
    - path: "infra/observabilidade/alertas.yml"
      provides: "alerta ProcessHttpTravado, no mesmo padrão de FilaParada"
  key_links:
    - from: "packages/core/src/fluxo/gerenciador.ts (processarAcoes, alvo/cursor)"
      to: "packages/core/src/fluxo/modelos.ts (validarEstado)"
      via: "o motor não sabe retomar entering actions (cursor.lista='entrada' nunca mais casa após a transição); a validação fecha a porta na origem, no publish"
      pattern: "enteringCustomActions|inputActions.*ProcessHttp"
    - from: "apps/api/src/dominio/fluxo.ts (executarProcessHttp)"
      to: "apps/api/src/filas.ts (agendarVarreduraProcessHttp, consumirProcessHttp)"
      via: "retomarProcessHttpRespondida é chamada tanto pelo fluxo normal (dentro de executarProcessHttp) quanto pela varredura (job 'retomar')"
      pattern: "retomarProcessHttpRespondida"
---

<objective>
Fechar os dois follow-ups do bug de retomada de `ProcessHttp` (fix `8dac98b`, diagnóstico em
`.planning/debug/process-http-auto-resume.md`), deixados de fora do escopo da Phase 1 pelos todos
`process-http-entering-actions.md` e `process-http-bullmq-sweep.md`.

**Follow-up 1 — ProcessHttp em ações de entrada.** O motor (`gerenciador.ts`) só sabe retomar um
`ProcessHttp` suspenso quando ele está em `$leavingCustomActions` (outputActions) de um bloco. Em
`$enteringCustomActions` (inputActions), a retomada perde o cursor para sempre e as ações
seguintes são puladas em silêncio — sem erro, sem log. Decisão: dar suporte real à retomada em
ações de entrada (opção 1), ou fazer o publish recusar essa combinação (opção 2)?

**Decisão: opção 2 — o publish recusa.** Evidência levantada em `referencias-blip/`
(read-only, ver `<context>`):
- O modelo real da Blip (`blip-api-schemas.md:846-867`, confirmado por `blip_flowanalysis`) permite
  `Action[]` do MESMO tipo tanto em `InputActions` quanto em `OutputActions` de um `State` — não há
  restrição de tipo por lista no schema nem no motor `[SDK]`.
- Mas a Blip **nunca suspende um `ProcessHttp` entre mensagens**: o `RequestTimeout` (default 60s,
  `catalogo-gatilhos-acoes.md:264`) é o teto de uma chamada síncrona dentro do MESMO ciclo de
  processamento da entrada — não existe fila própria, cursor nem retomada por webhook separado no
  produto real. Esse mecanismo é **invenção do Pipe** (cabeçalho de `gerenciador.ts:1-17`: "sem
  semáforo... sem trace remoto"; commit `a8072cb`, "a chamada externa sai da transação, com cursor
  e fila própria").
- Logo, a Blip não exige nem proíbe ProcessHttp em ações de entrada — ela simplesmente não tem essa
  questão, porque nunca suspende. A distinção "entra vs. sai" só importa porque o Pipe decidiu rodar
  o HTTP fora da transação. Não há paridade com a Blip a preservar em nenhuma das duas opções.
- Dado isso, a opção 1 (ensinar `processarEntrada`/`processarAcoes` a recuperar o cursor quando o
  `estado` já é o de entrada, sem re-rodar `validarEntradaDoEstado` nem duplicar `input.variable`)
  mexe no caminho crítico já corrigido em `8dac98b`, sem nenhuma exigência externa que a justifique.
  A opção 2 é a menor mudança seguinda (só a fronteira de validação, motor intocado) que resolve o
  mesmo problema para o cliente: hoje, quem coloca `ProcessHttp` em ação de entrada já tem um fluxo
  quebrado (ações puladas em silêncio) — recusar no publish troca um bug silencioso por um erro
  explícito e acionável, sem piorar nada que já funcionava.

**Follow-up 2 — varredura de recuperação em BullMQ.** Hoje só o modo `memoria` (com
`PIPE_PROCESS_HTTP_EM_MEMORIA=1`) tem uma varredura de `process_http_execucao` pendente
(`filas.ts:111-129`). Em produção (BullMQ, `attempts: 1`), qualquer falha depois do HTTP sair
(rede, bug de retomada ainda não conhecido, restart do worker) deixa a linha presa em `chamando`
para sempre, sem alerta, bloqueando toda mensagem nova daquele contato (`fluxo.ts:236-245`).

Purpose: fechar as duas lacunas sem reabrir o bug já corrigido nem criar um caminho novo de
reenvio duplicado da chamada HTTP ao cliente.
Output: validação que recusa ProcessHttp em ações de entrada; varredura de recuperação em BullMQ
com timeout, política de tentativas e alerta, sem jamais rechamar o HTTP para uma linha já
processada.

Model routing: Sonnet (decisão de arquitetura com evidência externa; nada aqui é mecânico).
</objective>

<context>
Lidos nesta pesquisa (read-only, nenhum código alterado):
- `.planning/todos/pending/process-http-entering-actions.md`, `process-http-bullmq-sweep.md`
- `.planning/debug/process-http-auto-resume.md` (diagnóstico completo do bug original)
- `git log --grep ProcessHttp`: `7493e36` (reproduz), `8d0baa3` (fixture), `8dac98b` (fix,
  `idProvedorUsado` também `true` numa retomada), `de8a86d` (merge), `b9171b1` (estes todos)
- `apps/api/tests/process-http-retomada.test.ts` (218 linhas) — teste de regressão do fix já
  aplicado; NÃO cobre nem ações de entrada nem falha de retomada em modo BullMQ
- `packages/core/src/fluxo/gerenciador.ts` (554 linhas) — `processarEntrada`, `processarAcoes`
  (cursor/alvo), `CONFIGURACAO_PADRAO`
- `packages/core/src/fluxo/contexto.ts:110-146` — `PedidoDeHttp`, `RespostaDeHttp`,
  `ListaDeAcoesSuspensa = 'entrada' | 'conteudo' | 'saida'`, `CursorDeProcessHttp`,
  `servicos.suspenderHttp`
- `packages/core/src/fluxo/modelos.ts:106-213` — `validarAcao`, `validarEstado`, `validarFluxo`;
  `packages/core/src/fluxo/modelos.teste.ts` (padrão de teste: helper `fluxo(states, id)`)
- `apps/api/src/dominio/fluxo.ts` (1126 linhas) — `rodarFluxoNaEntrada:215-530`,
  `executarProcessHttp:533-659`, `gravarPassos:694-...`
- `apps/api/src/filas.ts` (641 linhas) — `enfileirarProcessHttp`, `consumirProcessHttp`,
  `agendarVarreduraProcessHttp` (hoje só `memoria`), padrão de varredura BullMQ em
  `agendarVarreduraEspelhoCrm:202-210`, `agendarVarreduraDownloadMidia:279-309`,
  `agendarVarreduraSla:374-405` (todas usam `upsertJobScheduler` + job `'varredura'` no mesmo
  `Worker`)
- `apps/api/src/metricas.ts` — métricas Prometheus escritas à mão; `pipe_fila_idade_item_mais_velho_segundos`
  alimenta o alerta `FilaParada`
- `infra/observabilidade/alertas.yml:33-40` — formato do alerta `FilaParada` (referência para o
  novo `ProcessHttpTravado`)
- `packages/db/src/schema/automacao.ts:381-406` — `process_http_execucao`, `ESTADOS_PROCESS_HTTP
  = ['pendente','chamando','respondida','retomada']` (os 4 estados já existem; **sem migração**)
- `apps/gestao-vite/src/paginas/builder/validacao.ts:45-51` (`errosDoBloco`) e
  `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts:287` (`ListaDeAcoes =
  '$enteringCustomActions' | '$leavingCustomActions'`); teste em
  `apps/gestao-vite/tests/builder-editor.test.ts:162-174` (padrão: helper `novoBloco`, asserção
  `errosDoBloco(bloco, {bloco})`)
- `referencias-blip/pesquisa/blip-api-schemas.md:840-867,919-939`,
  `referencias-blip/pesquisa/catalogo-gatilhos-acoes.md:220-287` (read-only, evidência da decisão
  acima)

Nomes pós-Phase 1: só `packages/core/src/fluxo/*` e `apps/gestao-vite/src/paginas/builder/*` têm
propostas no map (`.planning/phases/01-.../std/map/*.csv`), e todas com `status=proposed`
(não decidido, `owner=codex2`) — não `decided`. `apps/api/src/*` e `packages/db/src/schema/*`
ainda estão `candidate` sem `new` preenchido. Por isso todo path abaixo é o de hoje; onde existe
proposta, ela vai comentada ao lado (não usar como se fosse definitivo).
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Reproduzir — publish aceita ProcessHttp em ação de entrada hoje (deveria recusar)</name>
  <files>packages/core/src/fluxo/modelos.teste.ts</files>
  <read_first>
    - packages/core/src/fluxo/modelos.ts:107-145 (`validarAcao`, `validarEstado` — nenhum dos dois
      olha `acao.type`, só `acao.type` truthy)
    - packages/core/src/fluxo/modelos.teste.ts:1-13 (helper `fluxo(states, id)`, padrão dos `it`)
    - .planning/debug/process-http-auto-resume.md (seção "Respostas diretas", item 1 — o mecanismo
      exato de por que o cursor nunca mais casa quando `lista === 'entrada'`)
  </read_first>
  <action>
    Adicionar em `modelos.teste.ts`, dentro de `describe('Flow.Validate', ...)`, um novo caso:
    ```ts
    it('ProcessHttp em ação de entrada falha (o motor não sabe retomar aqui — ver
    .planning/debug/process-http-auto-resume.md)', () => {
      expect(() =>
        validarFluxo(
          fluxo([
            {
              id: '0',
              root: true,
              input: {},
              inputActions: [{ id: 'a1', type: 'ProcessHttp', settings: { uri: 'https://x' } }],
            },
          ]),
        ),
      ).toThrow('A ação ProcessHttp não pode ficar nas ações de entrada do bloco.');
    });
    ```
    Rodar `pnpm --filter @pipe/core exec vitest run src/fluxo/modelos.teste.ts` e confirmar que
    ESTE caso falha (vermelho) — hoje `validarAcao` só olha `!acao.type`, então o fluxo acima passa
    sem erro. Não mexer em `modelos.ts` nesta tarefa. Sem commit ainda (o commit da Task 2 inclui
    este teste já verde).
  </action>
  <verify>
    <automated>pnpm --filter @pipe/core exec vitest run src/fluxo/modelos.teste.ts -t "ProcessHttp em ação de entrada"</automated>
  </verify>
  <acceptance_criteria>
    - O novo `it` existe e falha (o restante da suíte de `modelos.teste.ts` continua verde)
  </acceptance_criteria>
  <done>A lacuna está provada por um teste vermelho, sem tocar em código de produção.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Corrigir — validarFluxo recusa ProcessHttp em ações de entrada (motor + Builder)</name>
  <files>packages/core/src/fluxo/modelos.ts, packages/core/src/fluxo/modelos.teste.ts, apps/gestao-vite/src/paginas/builder/validacao.ts, apps/gestao-vite/tests/builder-editor.test.ts</files>
  <read_first>
    - packages/core/src/fluxo/modelos.ts:137-145 (`validarEstado`, onde `estado.inputActions` já é
      iterado por `validarAcao`)
    - apps/gestao-vite/src/paginas/builder/validacao.ts:24-51 (`errosDoBloco` — o comentário do
      arquivo, linhas 11-21, exige que a frase do painel seja IGUAL à do motor)
    - apps/gestao-vite/tests/builder-editor.test.ts:162-174 (padrão `novoBloco` + `errosDoBloco`)
  </read_first>
  <action>
    1. Em `packages/core/src/fluxo/modelos.ts`, dentro de `validarEstado` (linha ~140), antes do
       loop existente de `estado.inputActions`:
       ```ts
       for (const a of estado.inputActions ?? []) {
         if (a.type === 'ProcessHttp') {
           throw new ErroDeValidacao('A ação ProcessHttp não pode ficar nas ações de entrada do bloco.');
         }
       }
       for (const a of estado.inputActions ?? []) validarAcao(a); // já existia
       ```
       (Ou uma única passada com `if` dentro do loop existente — o que for menor diff; manter a
       ordem de erro determinística, igual ao resto do arquivo.)
       Commit: `fix(modelos): validarFluxo recusa ProcessHttp em ações de entrada`.
    2. Rodar a Task 1 de novo — deve estar verde.
    3. Em `apps/gestao-vite/src/paginas/builder/validacao.ts:45`, trocar o loop único
       (`[...(bloco.$enteringCustomActions ?? []), ...(bloco.$leavingCustomActions ?? [])]`) por
       dois loops, mantendo a MESMA frase do passo 1:
       ```ts
       for (const acao of bloco.$enteringCustomActions ?? []) {
         if (acao.type === 'ProcessHttp') {
           anotar('A ação ProcessHttp não pode ficar nas ações de entrada do bloco.');
         }
       }
       for (const acao of [...(bloco.$enteringCustomActions ?? []), ...(bloco.$leavingCustomActions ?? [])]) {
         // ... loop de hoje, sem mudança ...
       }
       ```
    4. Em `apps/gestao-vite/tests/builder-editor.test.ts`, adicionar um `test` novo (mesmo padrão
       de `novoBloco` da linha 163) que põe `{ type: 'ProcessHttp', settings: { uri: 'https://x' } }`
       em `bloco.$enteringCustomActions` e confirma que `errosDoBloco` inclui a frase — e um
       segundo `test` confirmando que o MESMO bloco com a ação em `$leavingCustomActions` NÃO gera
       esse erro (guarda contra regressão do caminho já corrigido em `8dac98b`).
       Commit: `fix(validacao): builder aponta ProcessHttp em ação de entrada, mesma frase do motor`.
  </action>
  <verify>
    <automated>pnpm --filter @pipe/core exec vitest run src/fluxo/modelos.teste.ts && (cd apps/gestao-vite && node --import tsx --test tests/builder-editor.test.ts)</automated>
  </verify>
  <acceptance_criteria>
    - Task 1 fica verde
    - `rg -n "ProcessHttp não pode ficar nas ações de entrada" packages/core apps/gestao-vite` mostra
      exatamente 2 ocorrências (a frase, não duplicada em texto diferente)
    - Um fluxo com ProcessHttp só em `$leavingCustomActions`/`outputActions` continua sem erro em
      nenhum dos dois validadores (suíte completa de `apps/api/tests/process-http-retomada.test.ts`
      continua verde, sem alteração)
    - `pnpm --filter @pipe/api test` sem regressão
  </acceptance_criteria>
  <done>Publicar (via `importarFluxoDaBlip`/API) ou salvar no Builder um fluxo com ProcessHttp em
  ação de entrada falha com a mesma frase nos dois lugares; o caminho de saída não muda.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Reproduzir — nada recupera process_http_execucao travado em modo BullMQ</name>
  <files>apps/api/tests/process-http-varredura.test.ts</files>
  <read_first>
    - apps/api/src/filas.ts:81-129 (`enfileirarProcessHttp`, `consumirProcessHttp`,
      `agendarVarreduraProcessHttp` — hoje só cobre `modo() === 'memoria'`)
    - apps/api/src/dominio/fluxo.ts:533-659 (`executarProcessHttp` inteiro — uma função, uma
      transação para a retomada)
    - apps/api/tests/process-http-retomada.test.ts (padrão inteiro: `montarCenario`,
      `stubarHttpDeSaida`, `processoDoContato`, fixture com ProcessHttp em `$leavingCustomActions`)
    - .planning/debug/process-http-auto-resume.md, "Respostas diretas" item 5 (severidade/
      probabilidade — por que isto importa em produção)
  </read_first>
  <action>
    Novo arquivo `apps/api/tests/process-http-varredura.test.ts`, MESMO cabeçalho de setup de
    `process-http-retomada.test.ts` (env vars, `subirApi`, `montarCenario`, fixture com
    ProcessHttp em `$leavingCustomActions`), com `stubarHttpDeSaida` contando chamadas
    (`let chamadas = 0` dentro do `vi.fn`).

    Dois casos, cada um suspendendo o fluxo normalmente (`falar('Ana', ...)`) e então
    **simulando o crash diretamente por SQL** (sem passar por `executarProcessHttp`, que hoje
    ainda não separa as duas fases — é isso que a Task 4 corrige):

    1. `it('linha travada em "chamando" há muito tempo: só alerta, nunca reenfileira o HTTP')`:
       - `update process_http_execucao set estado = 'chamando', atualizado_em = now() - interval '1 hour' where id = ${suspenso.id}`
       - chamar (ainda não existe) `import { processHttpTravado } from '../src/dominio/fluxo.js'` e
         `await processHttpTravado()` — hoje isto falha a IMPORTAÇÃO (função não existe): é o
         vermelho desta tarefa.
       - Quando existir (Task 4), a asserção final é: `processHttpTravado()` retorna a linha com
         `estado: 'chamando'`, `chamadas` (contador do fetch) continua `0` depois de rodar a
         varredura inteira (`agendarVarreduraProcessHttp` + processar o job — ou chamar o
         consumidor direto no teste, como já faz `process-http-retomada.test.ts` com
         `executarProcessHttp`).
    2. `it('linha travada em "respondida" há muito tempo: a varredura retoma sozinha, sem chamar o HTTP de novo')`:
       - `update process_http_execucao set estado = 'respondida', resposta = '{"status":200,"corpo":"{\"ok\":true}"}'::jsonb, atualizado_em = now() - interval '1 hour' where id = ${suspenso.id}`
       - chamar (ainda não existe) `retomarProcessHttpRespondida(suspenso.id)` — vermelho por
         importação hoje.
       - Quando existir: a linha termina em `estado: 'retomada'`, o bot manda a mensagem do menu
         (mesma asserção de `doBot()` do teste de retomada), e `chamadas` continua no valor de ANTES
         do `update` (nenhuma chamada nova ao `fetch` de saída).
  </action>
  <verify>
    <automated>pnpm --filter @pipe/api exec vitest run tests/process-http-varredura.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - O arquivo existe, os dois `it` falham hoje por `processHttpTravado`/
      `retomarProcessHttpRespondida` não existirem (erro de importação/`undefined is not a
      function`), e a mensagem do erro deixa claro que é ausência de implementação, não erro de
      asserção incorreta
  </acceptance_criteria>
  <done>A lacuna de recuperação em BullMQ está provada por dois testes vermelhos, sem tocar em
  código de produção.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: Corrigir — dividir a retomada em duas transações e varrer travados em BullMQ</name>
  <files>apps/api/src/dominio/fluxo.ts, apps/api/src/filas.ts, apps/api/src/metricas.ts, infra/observabilidade/alertas.yml, apps/api/tests/process-http-varredura.test.ts</files>
  <read_first>
    - apps/api/src/dominio/fluxo.ts:533-659 (`executarProcessHttp` — o trecho a dividir é
      556-573 chamada HTTP, e 576-657 a transação única de retomada; `for update of p ... where
      p.estado = 'chamando'` na linha 592-593 é o filtro a trocar)
    - apps/api/src/filas.ts:98-129 (`consumirProcessHttp`, `agendarVarreduraProcessHttp`) e o
      padrão gêmeo em 279-309 (`agendarVarreduraDownloadMidia` — memória com relógio próprio +
      BullMQ com `upsertJobScheduler`, no MESMO nome de função)
    - apps/api/src/filas.ts:179-199 (`consumirEspelhoCrm` — `job.name === 'varredura'` dentro do
      mesmo `Worker`, é o padrão para o novo job `'retomar'`)
    - apps/api/src/metricas.ts:139-159 (`medidores()` — onde entra a nova métrica) e
      infra/observabilidade/alertas.yml:33-40 (`FilaParada` — modelo do novo alerta)
    - packages/db/src/schema/automacao.ts:381-406 (`ESTADOS_PROCESS_HTTP` já tem `respondida` —
      SEM migração nesta tarefa)
  </read_first>
  <action>
    1. Em `apps/api/src/dominio/fluxo.ts`, dividir `executarProcessHttp`:
       - Depois de computar `resposta` (hoje linha ~573), abrir uma transação PEQUENA e própria
         que só grava `resposta` e `estado = 'respondida'` (o que hoje é feito junto com a
         retomada, linhas 597-600) — comitada sozinha, ANTES de qualquer tentativa de retomar o
         fluxo. Se o processo morrer depois disto, o HTTP já saiu e a resposta já está segura: não
         há mais motivo para rechamar o cliente.
       - Extrair o restante (hoje linhas 576-657: o `select ... for update of p`, o
         `fluxoPublicadoDoCanal`, o `rodarFluxoNaEntrada` da retomada, o loop de
         `mensagensPendentes`, e o `update ... estado = 'retomada'`) para uma função nova e
         exportada `retomarProcessHttpRespondida(processoId: string): Promise<string[]>`, trocando
         o filtro da linha 592-593 de `p.estado = 'chamando'` para `p.estado = 'respondida'`.
       - `executarProcessHttp` passa a terminar com `return retomarProcessHttpRespondida(processoId)`
         depois de commitar o passo anterior. Contrato público de `executarProcessHttp` não muda
         (mesma assinatura, mesmos chamadores em `filas.ts` e no teste de retomada).
       - Nova função exportada `processHttpTravado(limiteMs = Number(process.env['PIPE_PROCESS_HTTP_TRAVADO_MS'] ?? 300_000))`:
         `select tenant_id, id, estado from process_http_execucao where estado in ('chamando','respondida') and atualizado_em < now() - (${limiteMs} || ' milliseconds')::interval` —
         devolve as linhas cruas (a varredura decide o que fazer com cada `estado`).
    2. Em `apps/api/src/filas.ts`:
       - `agendarVarreduraProcessHttp` ganha o branch de `bullmq`, no MESMO padrão de
         `agendarVarreduraDownloadMidia`: `filaProcessHttp ??= new Queue(...)` +
         `upsertJobScheduler('varredura-process-http', { every: PIPE_PROCESS_HTTP_VARREDURA_MS ?? 60_000 }, { name: 'varredura', data: {} })`.
         O branch de `memoria` (linhas 111-129) não muda.
       - `consumirProcessHttp`: `if (job.name === 'varredura') { ... }` roda `processHttpTravado()`
         e, PARA CADA linha:
         - `estado === 'chamando'`: `console.error('[process-http] travado em chamando, id=...')`
           — NUNCA enfileira nada para essa linha (é a única forma de garantir que o HTTP não é
           rechamado quando não se sabe se ele já saiu).
         - `estado === 'respondida'`: `enfileirarRetomadaTravada({ tenantId, processoId })` — job
           NOVO `'retomar'` na mesma fila `pipe-process-http`, com `jobId: retomar-${processoId}`,
           `attempts: 5`, `backoff: { type: 'exponential', delay: 30_000 }` (a política de
           tentativas exigida — igual à do espelho no CRM, `filas.ts:161`).
       - O handler do `Worker` de `consumirProcessHttp` ganha um segundo `if (job.name === 'retomar')`
         que chama `retomarProcessHttpRespondida(job.data.processoId)` — nunca `executarProcessHttp`
         (que faria o HTTP de novo).
       - Commit: `fix(filas): varredura de ProcessHttp travado em BullMQ, sem rechamar o HTTP`.
    3. Métrica e alerta:
       - `apps/api/src/dominio/fluxo.ts` expõe (ou `metricas.ts` chama `processHttpTravado`
         diretamente): em `medidores()` de `metricas.ts`, uma nova série
         `pipe_process_http_travado{estado}` = contagem por `estado` do resultado de
         `processHttpTravado()`, mesmo padrão de `pipe_fila_idade_item_mais_velho_segundos`.
       - `infra/observabilidade/alertas.yml`: novo `alert: ProcessHttpTravado`,
         `expr: pipe_process_http_travado > 0`, `for: 10m`, `labels: { severidade: acorda }`,
         `annotations: { resumo: 'process_http_execucao travado em {{ $labels.estado }} há mais de 10 minutos' }`
         — logo depois de `FilaParada`, mesmo bloco de alertas de fila.
    4. Rodar a Task 3 de novo — os dois `it` devem estar verdes, com o contador de `chamadas` do
       `fetch` de saída provando que nenhuma chamada nova aconteceu em nenhum dos dois casos.
  </action>
  <verify>
    <automated>pnpm --filter @pipe/api exec vitest run tests/process-http-varredura.test.ts tests/process-http-retomada.test.ts && pnpm --filter @pipe/api typecheck</automated>
  </verify>
  <acceptance_criteria>
    - Task 3 fica inteiramente verde
    - `apps/api/tests/process-http-retomada.test.ts` continua verde sem alteração (a divisão de
      transação não muda o comportamento do caminho feliz)
    - `rg -n "chamarComMtls" apps/api/src/dominio/fluxo.ts` continua com as MESMAS 2 ocorrências de
      hoje (uma em `servicos.chamarHttp`, uma em `executarProcessHttp`) — a varredura não introduz
      um terceiro ponto de chamada
    - `rg -n "job.name === 'retomar'" apps/api/src/filas.ts` aparece exatamente uma vez, e nunca no
      mesmo `if` que chama `executarProcessHttp`
    - `pipe_process_http_travado` aparece em `metricas.ts` e em `alertas.yml`
  </acceptance_criteria>
  <done>Em modo BullMQ, uma linha travada em `respondida` se recupera sozinha (tentativas limitadas,
  sem novo HTTP); uma travada em `chamando` vira alerta, nunca reenvio automático.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Fluxo publicado (Builder/import) → motor (`gerenciador.ts`) | JSON de fluxo controlado pelo tenant; o motor confia na validação de publish |
| Varredura (`consumirProcessHttp`, job `varredura`) → `process_http_execucao` | lê linhas de qualquer tenant; decide reenfileirar ou só alertar |
| Endpoint do cliente (`ProcessHttp.uri`) → Pipe | resposta HTTP de um servidor de terceiro, tratada como dado, nunca como comando |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-QPH-01 | Elevation/Repudiation | Varredura reenfileira uma linha `chamando` e chama `chamarComMtls` de novo, cobrando o cliente duas vezes | mitigate | `consumirProcessHttp` só enfileira job `retomar` para `estado === 'respondida'`; `chamando` só loga/conta métrica. Teste da Task 3/4 conta chamadas ao `fetch` de saída e prova que o número não muda em nenhum dos dois casos |
| T-QPH-02 | Denial of Service | Retomada sempre falha (bug novo, não o já corrigido) e a varredura tenta para sempre, gerando carga | mitigate | `attempts: 5` + `backoff` exponencial no job `retomar` (política de tentativas limitada); depois de esgotar, o job fica `failed` no BullMQ e a linha CONTINUA aparecendo em `pipe_process_http_travado` (a idade de `atualizado_em` não muda) até intervenção manual |
| T-QPH-03 | Information Disclosure | Métrica/alerta de `ProcessHttp` travado vaza dado de tenant (uri, corpo) em texto plano de log/Prometheus | mitigate | `console.error` e a série Prometheus levam só `id`/`estado`/idade — nunca `pedido`/`resposta`/`entrada` (mesmo cuidado de `EstadoDaFila`, que não expõe payload) |
| T-QPH-04 | Elevation of privilege | Fluxo com `ProcessHttp` em `inputActions` publicado direto pela API (`importarFluxoDaBlip`), pulando a tela do Builder | mitigate | A recusa mora em `validarFluxo`/`validarEstado` (`packages/core`), chamada por `importarFluxoDaBlip` — não só na tela; o teste da Task 1/2 valida o motor, não o painel |
| T-QPH-05 | Tampering | Retomada da varredura roda para `execucao_id`/tenant errado por falha de isolamento | accept (sem mudança) | `retomarProcessHttpRespondida` já roda dentro de `noTenant(encontrado.tenant_id, ...)`, igual ao código de hoje; nenhuma tarefa desta lista muda o isolamento por tenant |

</threat_model>

<verification>
```
pnpm --filter @pipe/core exec vitest run src/fluxo/modelos.teste.ts
(cd apps/gestao-vite && node --import tsx --test tests/builder-editor.test.ts)
pnpm --filter @pipe/api exec vitest run tests/process-http-retomada.test.ts tests/process-http-varredura.test.ts
pnpm --filter @pipe/api typecheck
```
Critério de saída: as quatro tarefas em verde, `process-http-retomada.test.ts` sem regressão, e a
contagem de chamadas ao `fetch` de saída idêntica antes/depois de cada varredura testada.
</verification>

<success_criteria>
ProcessHttp em ação de entrada não publica mais (motor e Builder, mesma frase). Em modo BullMQ,
`process_http_execucao` travado em `respondida` se recupera sozinho com tentativas limitadas; travado
em `chamando` vira alerta (`pipe_process_http_travado` + `ProcessHttpTravado`) sem jamais reenviar o
HTTP ao cliente.
</success_criteria>

<output>
Ao executar este PLAN (fora do escopo desta tarefa, que é só o planejamento): criar
`.planning/quick/process-http-followups/SUMMARY.md` com o resultado de cada tarefa.
</output>

---
status: diagnosed
trigger: "Investigar (só diagnóstico) achado da 01-34: PIPE_FILAS=memoria retoma sozinho um ProcessHttp suspenso e crasha com duplicate-key ao tentar retomar; checar se acontece igual com BullMQ/Redis em produção."
created: 2026-09-24T00:00:00Z
updated: 2026-09-24T00:00:00Z
---

## Current Focus

Diagnóstico concluído. Modo `goal: find_root_cause_only` — nenhum código foi alterado, nada foi commitado.

## Symptoms

expected: um bloco `ProcessHttp` suspende a execução, chama a URL externa fora da transação e, ao responder, retoma o fluxo gravando um novo passo sem erro.
actual: na retomada, `gravarPassos` tenta inserir uma segunda linha em `execucao_passo` com o mesmo `entrada->>'id_provedor'` da linha já gravada na suspensão, violando `execucao_passo_entrada_uk` — a exceção sobe sem tratamento.
errors: "duplicate key value violates unique constraint execucao_passo_entrada_uk" (relatado no 01-34-SUMMARY.md, achado real ao rodar o gerador de fixtures sem o workaround).
reproduction: qualquer fluxo publicado com uma ação `ProcessHttp` que suspenda e depois seja retomado (webhook de resposta ou o próprio `executarProcessHttp`) — ver mecanismo abaixo, é determinístico, não depende de timing.
started: pré-existente (não é regressão desta fase; a 01-34 apenas tropeçou nele ao gerar fixtures).

## Eliminated

- hypothesis: "é uma condição de corrida exclusiva do modo memória, por causa da chamada síncrona/imediata sem Redis no meio."
  evidence: tracei o caminho completo de `rodarFluxoNaEntrada` (`apps/api/src/dominio/fluxo.ts:215-526`) e `processarEntrada` (`packages/core/src/fluxo/gerenciador.ts:162-300`). `rastro.estados.push(atual)` roda incondicionalmente na primeira iteração (`gerenciador.ts:199-200`), com ou sem `retomarProcessHttp`. `gravarPassos` (`fluxo.ts:690-720`) sempre grava `entrada` no índice 0 do rastro, e a função `rodar()` sempre inclui `id_provedor` na `entrada` quando `idProvedorUsado` é `false` — o que é sempre o caso numa retomada, porque `nova` é sempre `false` nesse caminho (`fluxo.ts:599-611` monta `conversa: { nova: false, ... }`). Não há dependência de tempo: a segunda chamada a `rodar()` (a retomada) SEMPRE tenta gravar o mesmo `id_provedor` da chamada original que suspendeu. Isto derruba a hipótese de corrida — é um bug determinístico de lógica, reproduzido 100% das vezes, em qualquer backend de fila.
  timestamp: 2026-09-24

## Evidence

- timestamp: 2026-09-24
  checked: `packages/db/src/schema/automacao.ts:328-379`
  found: `execucao_passo` tem `uniqueIndex('execucao_passo_entrada_uk').on(t.tenantId, sql\`(${t.entrada} ->> 'id_provedor')\`).where(sql\`${t.entrada} ? 'id_provedor'\`)` — índice único parcial por tenant sobre `entrada->>'id_provedor'`, só quando a chave existe. Comentário na origem: "A mesma mensagem da Meta só vira passo uma vez (migration 0014)".
  implication: essa é a constraint que a retomada viola — ela existe para impedir que a MESMA mensagem de entrada vire dois passos (proteção contra webhook duplicado da Meta), não para impedir uma retomada de gravar um segundo passo da mesma execução.

- timestamp: 2026-09-24
  checked: `apps/api/src/dominio/fluxo.ts:366-391` (`suspenderHttp`) e `apps/api/src/dominio/fluxo.ts:440-459` (catch de `SuspensaoDeProcessHttp`)
  found: ao suspender, `suspenderHttp` grava a linha em `process_http_execucao` com `entrada: { id, id_provedor: e.mensagem.idProvedor, tipo, conteudo }` (linhas 377-382) e lança `SuspensaoDeProcessHttp`. O `catch` em `rodar()` (linha 440) chama `gravarPassos(tx, ..., entrada, ...)` usando o MESMO `entrada` que foi passado para `rodar()` na linha 509-519 — que inclui `id_provedor: e.mensagem.idProvedor` porque `idProvedorUsado` é `false` nesse caminho. Essa é a PRIMEIRA linha de `execucao_passo` com aquele `id_provedor`.
  implication: a suspensão em si já grava com sucesso um `execucao_passo` com `entrada->>'id_provedor'` = id da mensagem que disparou o ProcessHttp — a "vaga" na constraint única já está ocupada antes de qualquer retomada acontecer.

- timestamp: 2026-09-24
  checked: `apps/api/src/dominio/fluxo.ts:529-655` (`executarProcessHttp`)
  found: depois de `chamarComMtls` (chamada HTTP real, fora de transação, linha 554-559) responder, uma segunda transação (linha 572-653) atualiza `resposta`/`estado='respondida'` e chama `rodarFluxoNaEntrada(tx, publicado, { ..., conversa: { nova: false, ... }, mensagem: { idProvedor: String(p.entrada['id_provedor'] ?? ''), ... } }, { execucaoId, cursor, resposta })` (linhas 599-616) — reconstruindo a mensagem a partir do MESMO `id_provedor` gravado na suspensão.
  implication: a retomada chama `rodarFluxoNaEntrada` de novo com o `mensagem.idProvedor` idêntico ao da suspensão original.

- timestamp: 2026-09-24
  checked: `apps/api/src/dominio/fluxo.ts:215-526` (corpo de `rodarFluxoNaEntrada`), foco em `nova` (linha 267), no bloco do "ticket" (linhas 484-507) e na chamada final a `rodar()` (linhas 509-520)
  found: com `retomada` setado, `execucao` já existe (encontrada pela `conversa_id`, linha 226-234), então `nova = execucao === null && conversa.nova` é sempre `false`. O bloco que poderia marcar `idProvedorUsado = true` (linhas 486-507) só roda quando `nova` é `true` — nunca numa retomada. A chamada final a `rodar()` (linha 509-519) então SEMPRE inclui `id_provedor: e.mensagem.idProvedor` na `entrada`, porque `idProvedorUsado` ficou `false`.
  implication: toda retomada gera uma segunda chamada a `gravarPassos` (de dentro de `rodar()`, via o caminho de sucesso da linha 428 ou o de erro da linha 461) tentando inserir OUTRA linha em `execucao_passo` com o MESMO `entrada->>'id_provedor'` já ocupado pela linha da suspensão.

- timestamp: 2026-09-24
  checked: `packages/core/src/fluxo/gerenciador.ts:162-300` (`processarEntrada`)
  found: `rastro.estados.push(atual)` roda de forma incondicional logo no início (linha 199-200), antes de qualquer verificação de `retomarProcessHttp`. `gravarPassos` (`fluxo.ts:690-720`) usa `rastro.estados.length > 0 ? rastro.estados : [...]` e grava `entrada` (com `id_provedor`) sempre no índice 0, para QUALQUER chamada de `rodar()` — suspensão ou retomada.
  implication: não existe caminho onde a retomada produza um rastro "vazio" que escape do `gravarPassos`; a colisão é garantida, não condicional a timing, quantidade de estados percorridos ou tipo de resposta HTTP recebida.

- timestamp: 2026-09-24
  checked: `apps/api/src/filas.ts:81-93` (`enfileirarProcessHttp`, modo memória) e `apps/api/src/filas.ts:99-108` (`consumirProcessHttp`, worker BullMQ)
  found: no modo memória sem `PIPE_PROCESS_HTTP_EM_MEMORIA=1`, a chamada é `void executarProcessHttp(job.processoId).then(continuar);` — SEM `.catch`. Se `executarProcessHttp` rejeita (como no bug), isso vira uma rejeição de promise não tratada, que em Node moderno (`--unhandled-rejections=strict`, padrão atual) derruba o processo inteiro. No modo BullMQ, o mesmo `executarProcessHttp` roda dentro do `async (job) => {...}` do `Worker` (linha 101-107) — o BullMQ CAPTURA a exceção do handler e marca o job como `failed`, sem derrubar o processo do worker.
  implication: a manifestação externa difere por modo (memória: crash do processo; BullMQ: job falho e silencioso), mas a CAUSA RAIZ (a violação de unique constraint dentro de `executarProcessHttp`) é a mesma e acontece nos dois. Não é um bug de teste/fixture — é um bug do caminho de produção.

- timestamp: 2026-09-24
  checked: `apps/api/src/dominio/fluxo.ts:571-653` (segunda transação de `executarProcessHttp`) e `apps/api/src/banco.ts:36-44` (`noTenant`/`comTenant`)
  found: a atualização `estado = 'respondida'` (linha 593-596) e a chamada a `rodarFluxoNaEntrada` (linha 599) estão DENTRO da mesma transação `noTenant`. Não há `try/catch` em volta da chamada. `comTenant` (via `@pipe/db`) roda como transação de banco: uma exceção não tratada faz rollback de TUDO, inclusive o `estado = 'respondida'` já escrito.
  implication: quando `gravarPassos` lança a duplicate-key, a transação inteira desfaz — a linha em `process_http_execucao` volta a ficar (na verdade permanece) com `estado = 'chamando'` (valor gravado pela PRIMEIRA transação, linha 542-548, que já tinha committado antes da chamada HTTP). Como `estado='chamando'` nunca mais muda, e como `executarProcessHttp` (linha 540) só age quando `estado === 'pendente'`, a linha fica PARADA para sempre — o corpo da resposta HTTP real (`resposta`) é perdido (nunca chega a ser persistido, porque o `update ... set resposta = ...` fez parte do rollback).

- timestamp: 2026-09-24
  checked: `apps/api/src/dominio/fluxo.ts:236-245` (guarda de "HTTP pendente" em `rodarFluxoNaEntrada`) e busca por qualquer varredura de `process_http_execucao` travado em produção
  found: `rodarFluxoNaEntrada` bloqueia novas mensagens do mesmo contato enquanto existir `process_http_execucao` com `estado in ('pendente','chamando')` (linha 236-245) — "Decisão Pipe: enquanto o HTTP está pendente, a mensagem fica gravada e espera a retomada". Busquei em todo o repo por qualquer sweep/varredura de linhas `chamando`/`pendente` fora do relógio em memória (`agendarVarreduraProcessHttp`, `filas.ts:111-131`) — esse relógio só roda quando `modo() === 'memoria' && PIPE_PROCESS_HTTP_EM_MEMORIA === '1'` (linha 112). Não existe `upsertJobScheduler`/varredura equivalente para a fila BullMQ de ProcessHttp (diferente de espelho-CRM, mídia, SLA e dicionário-CRM, que TÊM varredura periódica registrada — `filas.ts:169-179`, `274-283`, `330-339`, `378-386`).
  implication: em produção (modo BullMQ), depois do crash a conversa daquele contato fica MUDA para sempre (o bot nunca mais responde, toda mensagem nova cai no "já sendo tratado" e é ignorada) — sem qualquer mecanismo automático de recuperação. É necessário intervenção manual no banco (ex.: mover a linha de volta para `pendente` ou marcá-la `retomada`/encerrar a execução).

- timestamp: 2026-09-24
  checked: `apps/api/tests/gerar-fixtures-jsonb.helper.ts:150-163` — a chamada real que a 01-34 usou para reproduzir o crash
  found: a ação `ProcessHttp` de teste aponta para `uri: 'https://example.com/pipe/gerar-fixture'` — uma URL de verdade, alcançável pela rede. `confirmarUrlSegura` (chamado em `fluxo.ts:551` e `fluxo.ts:367`) não bloqueou esse domínio público, e o `chamarComMtls` chegou a sair de fato (é isso que o comentário da 01-34 documenta: "fez uma chamada HTTP real"). A resposta HTTP em si teve sucesso — o crash aconteceu DEPOIS, na segunda transação, ao tentar `gravarPassos` da retomada.
  implication: confirma que o request de saída para o endpoint do cliente JÁ FOI FEITO com sucesso antes do crash — o bug não impede a chamada de sair, ele perde o resultado dela e trava a conversa depois.

- timestamp: 2026-09-24
  checked: `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts`, `apps/gestao-vite/src/paginas/builder/validacao.ts`, `packages/core/src/fluxo/acoes.ts`
  found: `ProcessHttp` é uma ação de primeira classe, editável no construtor visual de fluxo (builder) que o cliente usa para montar automações — não é uma ação interna/reservada.
  implication: qualquer tenant que use uma ação "Chamar API/HTTP" no construtor de fluxo aciona este caminho assim que a chamada suspende e recebe resposta — não é um cenário raro ou de borda.

## Resolution

root_cause: |
  `apps/api/src/dominio/fluxo.ts` grava, na SUSPENSÃO de um bloco `ProcessHttp`, uma
  linha em `execucao_passo` cuja `entrada` inclui `id_provedor` da mensagem que
  disparou a chamada (linhas 440-450, usando o `entrada` montado em 509-519 com
  `idProvedorUsado = false`). Essa linha ocupa a vaga do índice único parcial
  `execucao_passo_entrada_uk` (`packages/db/src/schema/automacao.ts:375-377`,
  `(tenant_id, entrada->>'id_provedor') WHERE entrada ? 'id_provedor'`).

  Quando o HTTP responde e `executarProcessHttp` (`fluxo.ts:529-655`) retoma o fluxo
  chamando `rodarFluxoNaEntrada` de novo com `retomada` setado (linha 599-616), a
  reconstrução da "mensagem" usa o MESMO `id_provedor` gravado na suspensão
  (`p.entrada['id_provedor']`, linha 608). Como a retomada nunca passa pelo ramo que
  marca `idProvedorUsado = true` (esse ramo só roda quando `nova` é `true`, e numa
  retomada `nova` é sempre `false` — linha 267 e 599-604), a chamada final a `rodar()`
  (linha 509-519) inclui `id_provedor` de novo na `entrada`, e `gravarPassos`
  (linha 690-720, que grava `entrada` incondicionalmente no índice 0 de QUALQUER
  rastro não vazio — e `processarEntrada` em
  `packages/core/src/fluxo/gerenciador.ts:199-200` sempre produz pelo menos um
  estado) tenta inserir uma segunda linha com o mesmo `(tenant_id, id_provedor)` —
  violação garantida da unique constraint, 100% das vezes, sem depender de timing.

  Isto NÃO é uma condição de corrida exclusiva do modo memória: é um bug de lógica
  determinístico no caminho de retomada de `ProcessHttp`, presente igualmente com o
  backend de fila real (BullMQ/Redis), porque `executarProcessHttp` e
  `rodarFluxoNaEntrada` são os mesmos em qualquer modo — só muda quem os invoca
  (`apps/api/src/filas.ts:81-108`).

fix: (nenhum fix aplicado — modo diagnóstico apenas)

verification: (não aplicável — nenhuma mudança de código foi feita)

files_changed: []

## Respostas diretas

**1) Mecanismo exato (suspende → enfileira/varre → retoma; origem da duplicate key)**

- Suspensão: `suspenderHttp` insere em `process_http_execucao` (estado `pendente`) e lança `SuspensaoDeProcessHttp` — `apps/api/src/dominio/fluxo.ts:366-391`. O `catch` desse erro em `rodar()` grava a PRIMEIRA linha de `execucao_passo` com `entrada->>'id_provedor'` = id da mensagem — `fluxo.ts:440-450` usando o `entrada` de `fluxo.ts:509-519`.
- Enfileiramento: depois do commit da transação de entrada, `apps/api/src/dominio/entrada.ts:159-160` chama `enfileirarProcessHttp`. Em modo memória sem `PIPE_PROCESS_HTTP_EM_MEMORIA=1`, `apps/api/src/filas.ts:83-87` dispara `executarProcessHttp` na hora, sem `.catch`. Em modo BullMQ, vira job na fila `pipe-process-http` (`filas.ts:88-93`) consumido pelo `Worker` de `filas.ts:99-108`.
- Retomada: `executarProcessHttp` (`fluxo.ts:529-655`) faz a chamada HTTP real fora de transação (linha 553-559), reivindica a linha (`estado='chamando'`, linha 542-548, transação própria), e numa SEGUNDA transação (linha 572-653) chama `rodarFluxoNaEntrada` de novo com o mesmo `id_provedor` da suspensão (linha 599-616).
- Duplicate key: como a retomada nunca passa pelo ramo que marca `idProvedorUsado = true` (só roda quando `nova === true`; numa retomada `nova` é sempre `false` — linha 267, 599-604), a chamada final a `rodar()` volta a incluir `id_provedor` na `entrada` (linha 509-519), e `gravarPassos` (linha 690-720) tenta inserir uma SEGUNDA linha em `execucao_passo` com o mesmo `(tenant_id, entrada->>'id_provedor')`. A constraint violada é `execucao_passo_entrada_uk`, índice único parcial em `packages/db/src/schema/automacao.ts:375-377`.

**2) Acontece igual com a fila de produção (BullMQ/Redis)?**

Sim — e não é uma corrida (double resume / retry / at-least-once). É determinístico: toda vez que `executarProcessHttp` roda até o fim com sucesso na chamada HTTP, a retomada SEMPRE tenta gravar o `id_provedor` duplicado, em qualquer modo de fila, porque `executarProcessHttp`/`rodarFluxoNaEntrada` são os mesmos independente de quem os chama (`filas.ts:81-108`). A diferença entre os modos está só na blindagem ao redor:
- Modo memória sem o workaround: `void executarProcessHttp(...).then(continuar)` sem `.catch` (`filas.ts:83-87`) — rejeição de promise não tratada, que em Node atual derruba o PROCESSO inteiro.
- Modo BullMQ (produção): o mesmo erro acontece dentro do handler do `Worker` (`filas.ts:101-107`) — o BullMQ captura a exceção e marca o job como `failed`, sem derrubar o processo. Mas com `attempts: 1` (`filas.ts:91`) e sem nenhuma varredura de `process_http_execucao` travado em `chamando` (só existe varredura em memória, atrás de `PIPE_PROCESS_HTTP_EM_MEMORIA=1` — `filas.ts:111-131`), o job falho fica sem qualquer nova tentativa automática.

**3) Pode causar chamada HTTP duplicada ao cliente, ou execução travada/falha em produção?**

- Chamada duplicada ao endpoint do cliente: NÃO por este mecanismo específico — o `UPDATE ... SET estado='chamando' WHERE estado='pendente'` (`fluxo.ts:542-548`) é um "claim" atômico que impede duas execuções concorrentes da MESMA linha, e o crash acontece DEPOIS da chamada HTTP já ter saído com sucesso (confirmado em evidência: a 01-34 usou uma URL real, `https://example.com/pipe/gerar-fixture`, e a chamada saiu antes do crash). Então, tipicamente, é UMA chamada real seguida de uma retomada que sempre falha — não duas chamadas.
- Execução travada: SIM, e é praticamente garantido. A transação da retomada faz rollback completo ao falhar (`fluxo.ts:571-653` roda tudo — inclusive `estado='respondida'` — dentro de uma única `noTenant`, sem `try/catch`), então a linha em `process_http_execucao` fica presa em `estado='chamando'` para sempre (não é mais `pendente`, então `executarProcessHttp` nunca mais age sobre ela — guarda de `fluxo.ts:540`). Como `rodarFluxoNaEntrada` bloqueia novas mensagens do mesmo contato enquanto existir uma linha `pendente`/`chamando` (`fluxo.ts:236-245`), a conversa fica MUDA — o bot nunca mais responde àquele contato — sem nenhuma varredura de produção para destravar (não existe `upsertJobScheduler` equivalente para ProcessHttp, diferente de espelho-CRM/mídia/SLA/dicionário-CRM). Precisa de intervenção manual no banco.

**4) Severidade e probabilidade**

- **Severidade: alta.** Perda silenciosa da resposta HTTP + trava permanente e sem alerta da conversa daquele contato específico, para qualquer tenant que use uma ação `ProcessHttp` ("Chamar API") no construtor de fluxo — que é uma ação de primeira classe, exposta no builder visual (`apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts`, `validacao.ts`), não um caso de borda.
- **Probabilidade: muito alta / praticamente garantida.** Não depende de timing, carga ou tipo de resposta — acontece na PRIMEIRA vez que qualquer bloco `ProcessHttp` suspende e recebe resposta, em qualquer modo de fila. Nenhum teste automatizado do repositório cobre hoje o caminho de retomada de `ProcessHttp` (busca por `ProcessHttp`/`process_http`/`executarProcessHttp` em arquivos `*.test.ts` não encontrou nenhum, fora o fixture da 01-34 que tropeçou nisso incidentalmente e contornou com env vars em vez de testar o caminho real).

**5) Opções de fix mínimo e trade-offs**

- **A. Não repetir `id_provedor` na retomada (guarda de status — a mais alinhada à causa raiz).** Em `fluxo.ts`, tratar `idProvedorUsado` como `true` também quando `retomada` está setado (ou, equivalente, só incluir `id_provedor` na `entrada` de `rodar()` quando a chamada NÃO é uma retomada). A linha de `execucao_passo` da suspensão já registrou aquele `id_provedor`; a retomada é a CONTINUAÇÃO da mesma entrada, não uma entrada nova.
  - Trade-off: os passos gerados durante a retomada deixam de carregar `entrada.id_provedor` — para quem lê a trilha de auditoria via join com `mensagem`/`id_provedor`, os passos "pós-retomada" ficam sem esse vínculo direto (ainda têm `execucao_id`, que já basta para reconstituir a ordem). É a mudança de menor risco: um `if`, sem migração de schema.
- **B. `ON CONFLICT ... DO NOTHING` no insert de `gravarPassos` (índice já existe, só falta usar).** Adicionar `on conflict (tenant_id, (entrada->>'id_provedor')) where entrada ? 'id_provedor' do nothing` no `insert into execucao_passo` (`fluxo.ts:711-718`), só quando `i === 0` (única linha que carrega `id_provedor`).
  - Trade-off: evita o crash e destrava a execução, mas DESCARTA silenciosamente o `saida`/`acoes` daquele passo específico da retomada (que também tentam entrar nessa mesma linha) — perde-se a observabilidade de "o que o fluxo fez ao retomar" para esse passo em particular. Mais barato de aplicar, mas com perda de dado de auditoria.
- **C. Lock/guarda de status mais explícito em `executarProcessHttp`.** Antes de chamar `rodarFluxoNaEntrada` na retomada, checar se já existe `execucao_passo` com aquele `id_provedor` e, se sim, pular a gravação da entrada duplicada (equivalente à opção A, mas decidido no chamador em vez de dentro de `rodarFluxoNaEntrada`).
  - Trade-off: mais código (uma consulta extra), mesmo resultado da opção A; só vale a pena se `rodarFluxoNaEntrada` precisar continuar recebendo `id_provedor` para outro fim ainda não identificado.
- **D. Remover a unicidade do índice (não recomendado).** Trocar `execucao_passo_entrada_uk` por algo não-único.
  - Trade-off: reabre exatamente o bug que a migration 0014 fechou (mensagem duplicada da Meta virando dois passos) — troca um bug determinístico conhecido por um bug de duplicação intermitente e mais difícil de notar. Não recomendado.

Recomendação: opção A (guarda de status/idempotência na origem — não reenviar `id_provedor` numa retomada), por ser a menor mudança que remove a causa raiz sem perder dado de auditoria nem reabrir a proteção contra webhook duplicado da Meta. Ainda assim, independentemente da opção escolhida, falta também endereçar a AUSÊNCIA de varredura de `process_http_execucao` travado em `chamando` no modo BullMQ (hoje só existe em modo memória) — sem isso, qualquer falha futura nesse caminho (rede, bug diferente) volta a travar a conversa sem recuperação automática nem alerta.

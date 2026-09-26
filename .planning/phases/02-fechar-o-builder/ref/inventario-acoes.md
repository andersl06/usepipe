Inventário de ações, scripts e biblioteca de funções — Builder de referência

**Data da investigação:** 2026-09-26

**Objetivo.** Documentar toda ação (Action) do Builder da Blip — não só as executadas hoje pelo motor
do Pipe — com as dimensões pedidas por D-19/D-20, mais o comportamento de scripts (D-21) e da
biblioteca de funções (D-22), para alimentar o congelamento (D-02) e o portão do dono (D-04).

**Procedência.** Toda afirmação carrega marca, igual ao `catalogo-gatilhos-acoes.md`:

| Marca | Origem |
|---|---|
| `[BLIP-SDK]` | comportamento do código-fonte de `takenet/blip-sdk-csharp`, já sintetizado (sem colar C#) em `referencias-blip/pesquisa/catalogo-gatilhos-acoes.md` §2 |
| `[BLIP-UI]` | textos literais extraídos do bundle de tradução do Builder (`referencias-blip/builder/builder/zip19/supernova.blip.ai/vendor-app_modules_translate_translationLoaders_sync_recursive_js_.fd90eba8615af397.js`) |
| `[BLIP-DOM]` | painéis extraídos do DOM/CSS (`referencias-blip/builder/builder/PAINEL-*.md`) |
| `[PIPE]` | código atual do Pipe (`packages/core/src/fluxo/acoes.ts`, `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts`) |
| `[INFER]` | dedução a partir do que foi lido; verificar antes de usar |
| `[DECISÃO]` | proposta deste documento, não fato observado |

Nenhum código-fonte da Blip foi transcrito para este arquivo (D-33); os JSONs de `settings` abaixo são
descrições de formato de dados a partir dos nomes de campo já publicados em `catalogo-gatilhos-acoes.md`,
não trechos de C#/JS colados.

---

## As 19 actions do SDK + biblioteca de funções — visão geral

`[BLIP-SDK]` O registro de DI (`ContainerExtensions.RegisterBuilderActions`) bate 1-para-1 com 19
pastas de `Actions/`. **Não existe** `Forward`/`ForwardToDesk`/`Subflow`/`Stop` como Action — essas são
mecanismo do servidor da Blip (estado com prefixo `desk:`/`subflow:`), não Action. `ExecuteBlipFunction`
não é uma das 19 (ver seção própria abaixo — é o mecanismo de chamar a Biblioteca de funções, D-22).

Cinco actions **não herdam** de `ActionBase<TSettings>` e por isso não têm `Validate()` de schema
próprio — o JSON inteiro vira direto um tipo LIME: `SendMessage`, `SendCommand`, `ProcessCommand`,
`Redirect`, `MergeContact`. As demais rodam `Validate()` antes de executar; falha de validação aborta
a ação (mas não necessariamente o fluxo — depende de `continueOnError`).

Envelope comum de toda ação (`Models/Action.cs`) `[BLIP-SDK]`: `id`, `$title`, `order`,
`conditions[]`, `timeout` (segundos, default 30s), `continueOnError` (bool), `executeAsynchronously`
(bool, não implementado no original), `type`, `settings`.

---

### ExecuteScript

- **Nome exibido:** "Executar script" `[BLIP-UI]`
- **Ícone (significado):** PENDENTE-CAPTURA #1 — bundle de tradução não carrega asset/nome de ícone por ação; exige captura visual do Builder ao vivo ou leitura do DOM em modo aberto.
- **Entrada/Saída/Global:** PENDENTE-CAPTURA #2 — o bundle de tradução não distingue em qual aba (Entrada/Saída/Ações Globais) cada ação aparece; `[INFER]` como as demais ações "Executar", provavelmente disponível nas três.
- **Campos do editor** `[BLIP-UI]`: "Código-fonte" (`source`), "Variáveis de entrada" (`inputVariables`, com "Adicione as variáveis"/"Criar variável"), "Variável para o valor de retorno" (`outputVariable`, com "Salvar retorno"), "Condição para Executar script" (lista de condições, com "+ Adicionar condição de execução"), "Ativar fluxo com erro presente" (`continueOnError`, com descrição "Ao marcar essa opção, o fluxo prosseguirá ainda que o script contenha um erro.").
- **Valores padrão:** `Function` = `"run"` `[BLIP-SDK]`; `continueOnError` = false (opt-in).
- **Validações:** `Source` e `OutputVariable` obrigatórios `[BLIP-SDK]`.
- **Condições de execução:** lista de `Condition` própria da ação (mesmo mecanismo de `conditions` do envelope comum), rotulada no editor como "Condição para Executar script".
- **Variáveis de entrada/saída:** `InputVariables[]` — nomes recebidos como parâmetro na função JavaScript `[BLIP-UI]`: "Você pode utilizar uma das variáveis pré-determinadas na lista ou definidas em resposta do usuário"; `OutputVariable` — variável única para o retorno.
- **Formato serializado** (`settings`, `[INFER]` a partir dos nomes de campo do SDK):
  ```json
  {
    "source": "function run(context) { return context; }",
    "function": "run",
    "outputVariable": "resultadoScript",
    "inputVariables": ["nomeDoContato"],
    "localTimeZoneEnabled": false
  }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: engine Jint (ECMAScript, interpretado, não V8). Limites: recursão máxima 50, **máx. 1000 statements**, memória 100 MB, **timeout 5 s**. `LocalTimeZoneEnabled` decide se `Date`/timezone do script usam o fuso do bot ou UTC.
- **Dependência de serviço da plataforma:** nenhuma além do próprio motor de scripts — não chama serviço externo da Blip; a dependência é o **sandbox** (D-21), não uma API da plataforma.
- **Erros/timeouts/retries:** estourar timeout (5s), exceder 1000 statements ou lançar exceção não tratada aborta a ação; `continueOnError=true` faz o fluxo prosseguir mesmo assim (sem repetir a execução — não há retry).
- **Teste/Debug:** PENDENTE-CAPTURA #3 — painel de Teste completo (chat de teste, trace por ação) não encontrado nos bundles (mesma lacuna registrada em `PAINEL-TestePublicar.md`); investigação própria fica em D-14 (plano de painéis).
- **Import/export:** mesmo formato `{flow, globalActions}` do fluxo inteiro; a ação exportada carrega `source` como string, sem serialização especial.
- **Dependência ausente/não configurada:** N/A (não depende de credencial/config externa).
- **Estado no Pipe hoje:** motor **não** (`ACOES_DO_MOTOR` em `packages/core/src/fluxo/acoes.ts:233` não lista `ExecuteScript`); tela **não** (`CATALOGO_DE_ACOES` em `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts:57` não lista `ExecuteScript`). Um fluxo importado com essa ação hoje é marcado "Não executada no Pipe" (`acoaSemSuporte`, `acoes-do-bloco.ts:159`) e lança em tempo de execução (`obterAcao`, `acoes.ts`).
- **Fonte:** `referencias-blip/pesquisa/catalogo-gatilhos-acoes.md` §2.2; bundle de tradução (chave `executeScript`); `packages/core/src/fluxo/acoes.ts`; `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts`.

---

### ExecuteScriptV2

- **Nome exibido:** "Executar script 2.0" `[BLIP-UI]`
- **Ícone (significado):** PENDENTE-CAPTURA #1 (mesma lacuna de `ExecuteScript`).
- **Entrada/Saída/Global:** PENDENTE-CAPTURA #2.
- **Campos do editor** `[BLIP-UI]`: mesmos campos de `ExecuteScript` ("Código-fonte", "Variáveis de entrada", "Variável para o valor de retorno", condição própria, "Ativar fluxo com erro presente") — o bundle usa o mesmo bloco de texto para as duas ações.
- **Valores padrão:** `CaptureExceptions` = false (opt-in, expõe `ExceptionVariable`).
- **Validações:** `Source` e `OutputVariable` obrigatórios `[BLIP-SDK]`.
- **Condições de execução:** idem `ExecuteScript`.
- **Variáveis de entrada/saída:** `InputVariables[]`, `OutputVariable`, mais `ExceptionVariable` quando `CaptureExceptions=true` (captura o erro numa variável em vez de abortar).
- **Formato serializado:**
  ```json
  {
    "source": "async function run(context) { const r = await request.fetchAsync(url); return r; }",
    "outputVariable": "resultadoScript",
    "inputVariables": ["telefone"],
    "captureExceptions": true,
    "exceptionVariable": "erroScript"
  }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: engine V8/ClearScript (ECMAScript moderno, promises awaitadas de verdade). **Timeout 10 s**, heap 100 MB, `AllowReflection=false` (sem acesso a APIs .NET internas). Funções nativas expostas ao script: `request` (com `request.fetchAsync`, HTTP assíncrono), `time`, `context`, `botTimeZone`. Assinaturas exatas dessas funções nativas: PENDENTE-CAPTURA #4 — listadas em `catalogo-gatilhos-acoes.md` §8 como "não lidas linha a linha".
- **Dependência de serviço da plataforma:** nenhuma (mesma natureza de `ExecuteScript`: dependência de sandbox, não de serviço externo).
- **Erros/timeouts/retries:** timeout 10s aborta; `CaptureExceptions=true` desvia o erro para `ExceptionVariable` em vez de abortar a ação (mecanismo mais granular que o `continueOnError` genérico de `ExecuteScript`).
- **Teste/Debug:** PENDENTE-CAPTURA #3 (mesma lacuna).
- **Import/export:** mesmo formato do fluxo; `source` como string.
- **Dependência ausente/não configurada:** N/A.
- **Estado no Pipe hoje:** motor **não**, tela **não** (mesma ausência de `ExecuteScript` em `acoes.ts`/`acoes-do-bloco.ts`).
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2, §8; bundle de tradução (chave `executeScriptV2`).

**Recomendação de sandbox para o portão** — ver seção `## Scripts (D-21)` abaixo (cobre as duas ações juntas).

---

### SendMessage

- **Nome exibido:** não tem editor de "ação" próprio na Blip nem no Pipe — é como o Builder representa o **conteúdo** do bloco (texto, menu, quick reply, digitando). `[BLIP-SDK]`
- **Ícone (significado):** PENDENTE-CAPTURA #1 (ícones dos tipos de conteúdo na aba "Conteúdo").
- **Entrada/Saída/Global:** N/A — não é oferecida na aba "Ações"; é a aba "Conteúdo" do bloco.
- **Campos do editor:** depende do `type` de mídia — texto livre (`text/plain`), menu (`application/vnd.lime.select+json`), "digitando" (`application/vnd.lime.chatstate+json`). No Pipe hoje: `apps/gestao-vite/src/paginas/builder/conteudo.ts` (`novoTexto`, `novoMenu`, `novoQuickReply`).
- **Valores padrão:** N/A.
- **Validações:** `Type` (MediaType) e `Content` obrigatórios `[BLIP-SDK]`.
- **Condições de execução:** a mesma lista `conditions` do envelope de ação (usada para enviar o conteúdo condicionalmente).
- **Variáveis de entrada/saída:** conteúdo aceita `{{variável}}` interpolada; não tem variável de saída própria.
- **Formato serializado:**
  ```json
  { "id": "msg1", "type": "text/plain", "content": "Olá {{contato.nome}}!" }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: se `type` = `application/vnd.lime.chatstate+json` (ChatState/"digitando"), a Blip **não gera Id** e faz `Task.Delay(interval)` — bloqueia o fluxo pela duração configurada, é assim que o "digitando…" aparece antes da próxima mensagem.
- **Dependência de serviço da plataforma:** nenhuma — é o canal de envio, que o Pipe já tem via `contexto.servicos.enviar`.
- **Erros/timeouts/retries:** falha de envio no canal propaga como erro da ação (sem retry embutido na action).
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo.
- **Dependência ausente/não configurada:** N/A.
- **Estado no Pipe hoje:** motor **sim** (`sendMessage` em `acoes.ts:71-84`, com nota explícita: *"o original espera o `interval` do 'digitando' (`Task.Delay`). Aqui não: o motor roda dentro da transação da entrada, e segurar conexão por isso é caro"* — divergência deliberada do comportamento síncrono do "digitando" da Blip); tela **sim**, mas como conteúdo (`conteudo.ts`), não como ação da aba "Ações" (comentário de `acoes-do-bloco.ts:21-23`).
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2; `packages/core/src/fluxo/acoes.ts:70-84`; `apps/gestao-vite/src/paginas/builder/conteudo.ts`.

---

### SendMessageFromHttp

- **Nome exibido:** PENDENTE-CAPTURA #5 — não encontrada no bundle de tradução consultado (pt-BR/es/en); pode não ter editor dedicado na Blip atual, ou usar outra chave de tradução não localizada.
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** PENDENTE-CAPTURA #2.
- **Campos do editor:** `[INFER]` a partir dos parâmetros do SDK: URL (`Uri`), Tipo (`Type`, MIME do conteúdo buscado), Cabeçalhos (`Headers`), Tempo limite (`RequestTimeout`). Rótulos exatos: PENDENTE-CAPTURA #5.
- **Valores padrão:** `RequestTimeout` = 60s `[BLIP-SDK]`.
- **Validações:** `Uri` e `Type` obrigatórios `[BLIP-SDK]`.
- **Condições de execução:** lista `conditions` do envelope comum.
- **Variáveis de entrada/saída:** sem variável de saída própria — o conteúdo buscado por HTTP GET **é enviado diretamente como mensagem**, não fica disponível como variável de contexto.
- **Formato serializado:**
  ```json
  { "uri": "https://api.exemplo.com/midia/123", "type": "image/png", "headers": {}, "requestTimeout": 60 }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: sempre método GET; busca o conteúdo por HTTP e envia como mensagem do tipo declarado em `Type`. `EnsureSuccessStatusCode()` — erro HTTP (status ≥400 ou exceção de rede) **quebra a ação** (diferente de `ProcessHttp`, que nunca lança em erro HTTP).
- **Dependência de serviço da plataforma:** nenhuma — é uma chamada HTTP genérica a uma URL escolhida pelo cliente, sem serviço proprietário da Blip envolvido.
- **Erros/timeouts/retries:** timeout 60s default; qualquer erro HTTP ou de rede aborta a ação (propaga exceção), sem retry embutido.
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo.
- **Dependência ausente/não configurada:** N/A (URL é do próprio usuário).
- **Estado no Pipe hoje:** motor **não**, tela **não**.
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2.

---

### SendRawMessage

- **Nome exibido:** não tem editor de "ação" — como `SendMessage`, é conteúdo do bloco, usado quando o MIME não é texto puro (fallback de conteúdo importado que não é `text/plain`/`select+json`). `[PIPE]`
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** N/A — aba "Conteúdo".
- **Campos do editor:** N/A no Pipe hoje (usado só para ler conteúdo importado, sem editor de criação); na Blip real, provavelmente edição bruta do JSON serializado — PENDENTE-CAPTURA #5.
- **Valores padrão:** N/A.
- **Validações:** `Type` (MIME válido) e `RawContent` obrigatórios `[BLIP-SDK]`.
- **Condições de execução:** lista `conditions` do envelope comum.
- **Variáveis de entrada/saída:** conteúdo aceita variáveis interpoladas dentro do texto serializado.
- **Formato serializado:**
  ```json
  { "type": "application/json", "rawContent": "{\"foo\":\"bar\"}" }
  ```
- **Comportamento no motor** `[BLIP-SDK]`/`[PIPE]`: envia `RawContent` como string já serializada, com o MIME de `Type` — o motor não desserializa/valida o conteúdo, só repassa.
- **Dependência de serviço da plataforma:** nenhuma.
- **Erros/timeouts/retries:** `Type` que não bate no padrão MIME (`/^[\w.+-]+\/[\w.+-]+$/`) ou `RawContent`/`Type` ausentes lançam erro de validação antes de enviar `[PIPE]`.
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo; é o caminho de fallback do importador para MIME não suportado como conteúdo nativo (`conteudo.ts:124`: `acao.type === 'SendRawMessage' ? mime === TIPO_TEXTO : ...`).
- **Dependência ausente/não configurada:** N/A.
- **Estado no Pipe hoje:** motor **sim** (`sendRawMessage`, `acoes.ts:87-105`); tela **sim**, mas só como leitura/fallback de conteúdo importado (`conteudo.ts:124`), sem UI de criação dedicada — `acoes-do-bloco.ts:21-23` documenta que é conteúdo, não ação da aba "Ações".
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2; `packages/core/src/fluxo/acoes.ts:87-105`; `apps/gestao-vite/src/paginas/builder/conteudo.ts:124`.

---

### SendCommand

- **Nome exibido:** PENDENTE-CAPTURA #5 — não encontrado no bundle de tradução consultado com chave própria (`ProcessCommand`, a ação irmã, tem editor completo; `SendCommand` pode reaproveitar o mesmo painel na Blip real, já que a diferença entre as duas é só "espera resposta ou não" — a confirmar).
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** PENDENTE-CAPTURA #2.
- **Campos do editor:** `[INFER]` por analogia a `ProcessCommand` (ver campos `[BLIP-UI]` daquela ação: Para/`to`, Método/`method`, URI/`uri`, Tipo/`type`, Resource/`resource`) — sem o campo "Variável da resposta" (`SendCommand` é fire-and-forget, não guarda resposta).
- **Valores padrão:** `Id` é sempre sobrescrito pelo motor (o cliente não define) `[BLIP-SDK]`.
- **Validações:** nenhuma listada em `[BLIP-SDK]` (a ação não herda `ActionBase`, então não roda `Validate()` — o JSON vira direto um Command LIME).
- **Condições de execução:** lista `conditions` do envelope comum.
- **Variáveis de entrada/saída:** nenhuma — fire-and-forget, sem variável de retorno.
- **Formato serializado:**
  ```json
  { "method": "set", "uri": "/tickets/123/change-tags", "to": "postmaster@desk.msging.net", "type": "application/vnd.lime.ticket+json", "resource": { "tags": ["vip"] } }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: dispara um Command LIME sem esperar resposta — usado tipicamente para comandos ao Desk (mudar tags, transferir ticket) via `SendCommand`/`ProcessCommand` (§4.3 do catálogo, `adicionar_etiqueta`/`transferir_para_fila`).
- **Dependência de serviço da plataforma:** **sim** — depende do roteador LIME da Blip (envio de Command a um domínio/serviço específico da plataforma, ex. `desk.msging.net`). Ver "Opções para o portão (D-20)" abaixo.
- **Erros/timeouts/retries:** fire-and-forget — sem tratamento de erro descrito (a resposta, se houver, é descartada).
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo.
- **Dependência ausente/não configurada:** sem roteador LIME configurado, a ação não tem para onde mandar o Command.
- **Estado no Pipe hoje:** motor **não**, tela **não**.
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2, §4.3 (`adicionar_etiqueta`/`remover_etiqueta` via `/tickets/{id}/change-tags`), §4.5 (`transferir_para_fila` via `/tickets/{id}/transfer`).

#### Opções para o portão (D-20)

- **(a) Equivalente nativo no Pipe:** o Pipe já tem os efeitos que `SendCommand` produz na Blip como domínio próprio — mudar etiqueta de conversa (`etiqueta`/`EncerrarConversaInput.etiqueta_ids`), transferir fila (`transbordar`, já usado por `ForwardToDesk`). Construir `SendCommand` nativo significa mapear um conjunto fechado de comandos conhecidos (mudar tag, transferir fila, mudar prioridade) para chamadas de domínio do Pipe (`packages/api/src/dominio`), sem expor um roteador LIME genérico. Equivale a expor no Builder um subconjunto das peças `adicionar_etiqueta`/`transferir_para_fila`/`definir_prioridade` já desenhadas em `catalogo-gatilhos-acoes.md` §4.5.
- **(b) Dependência externa impossível de reproduzir:** um `SendCommand` genérico para qualquer URI de roteador LIME externo (fora do escopo do Pipe) fica marcado "Não executada no Pipe" quando importado.

---

### ProcessCommand

- **Nome exibido:** "Processar comando" `[BLIP-UI]`
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** PENDENTE-CAPTURA #2.
- **Campos do editor** `[BLIP-UI]`: "Para" (`to`), "Método" (`method`), "URI" (`uri`), "Tipo" (`type`, com "Adicionar novo tipo"), "Resource" (`resource`), "Variável da resposta" (`variable`), "Utilizar contexto do chatbot" (`useChatbotContext`, com descrição "Processa comandos considerando o chatbot ao invés de se comunicar com o roteador. Recomendado para enviar comandos ao Desk." — opção só disponível "se a funcionalidade 'Utilizar contexto do roteador' estiver habilitada nas configurações"), condição própria ("Condição para Processar comando", "+ Adicionar condição de processamento").
- **Valores padrão:** N/A documentado.
- **Validações:** nenhuma listada em `[BLIP-SDK]` (não herda `ActionBase`, sem `Validate()` próprio).
- **Condições de execução:** lista própria de condições (rotulada "Condição para Processar comando" no editor).
- **Variáveis de entrada/saída:** `Variable` recebe o **envelope de resposta inteiro** (com `status`, `reason`, `resource`), não só o `resource` `[BLIP-SDK]` — diferença importante em relação a uma chamada HTTP comum, onde normalmente só o corpo é guardado.
- **Formato serializado:**
  ```json
  { "method": "get", "uri": "/tickets/123", "to": "postmaster@desk.msging.net", "type": "application/vnd.lime.ticket+json", "resource": null, "variable": "respostaComando", "useChatbotContext": true }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: dispara um Command LIME e espera a resposta, gravando o envelope completo na variável configurada. `useChatbotContext` muda a rota do comando (via contexto do chatbot em vez de ir direto ao roteador) — recomendado para comandos ao Desk.
- **Dependência de serviço da plataforma:** **sim** — mesmo roteador LIME de `SendCommand`, com a exigência adicional de aguardar resposta síncrona do serviço de destino.
- **Erros/timeouts/retries:** sem timeout/retry documentados além do padrão da ação (`timeout` do envelope comum, default 30s).
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo.
- **Dependência ausente/não configurada:** sem roteador LIME (ou sem "Utilizar contexto do roteador" habilitado nas configurações, quando `useChatbotContext=true`), a ação não tem como processar o comando.
- **Estado no Pipe hoje:** motor **não**, tela **não**.
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2; bundle de tradução (chave `processCommand`).

#### Opções para o portão (D-20)

- **(a) Equivalente nativo no Pipe:** mesma linha de `SendCommand` — mapear os comandos conhecidos que a Blip usa para consultar/mudar o Desk (`GET /tickets/{id}`, mudar status/prioridade) para as próprias tabelas/serviços do Pipe (`conversa`, `execucao_fluxo`), devolvendo o resultado direto como variável, sem um roteador LIME real por trás.
- **(b) Dependência externa impossível de reproduzir:** `ProcessCommand` para uma URI/roteador arbitrário fora do domínio conhecido do Pipe fica "Não executada no Pipe" quando importado.

---

### TrackEvent

- **Nome exibido:** "Registro de eventos" `[BLIP-UI]`
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** disponível em Entrada e Saída no Pipe hoje (`acoes-do-bloco.ts`, grupo "Manipular"); PENDENTE-CAPTURA #2 para confirmar paridade exata com a Blip (Ações Globais).
- **Campos do editor** `[BLIP-UI]`: "Categoria" (`category`), "Ação" (`action`), "Rótulo (opcional)" (`label`), "Valor (opcional)" (`value`), com nota "Os eventos são agregados por categoria, ação e dia."
- **Valores padrão:** `FireAndForget` = **true** `[BLIP-SDK]` (default já é não bloquear o fluxo esperando confirmação de gravação).
- **Validações:** `Category` e `Action` obrigatórios `[BLIP-SDK]` — igual ao Pipe hoje (`acoes.ts:112-121`).
- **Condições de execução:** lista `conditions` do envelope comum.
- **Variáveis de entrada/saída:** nenhuma — a ação só registra, não produz variável de saída.
- **Formato serializado:**
  ```json
  { "category": "vendas", "action": "lead_qualificado", "label": "origem_whatsapp", "value": "1", "extras": {}, "fireAndForget": true }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: `Value` é parseado com `InvariantCulture` (**ponto decimal**) — **vírgula decimal vira `null` silenciosamente**, uma armadilha real para o público pt-BR (registrada também em `catalogo-gatilhos-acoes.md` §4.7, `registrar_evento`).
- **Dependência de serviço da plataforma:** nenhuma no Pipe (grava via `contexto.servicos.registrarEvento`, que já existe).
- **Erros/timeouts/retries:** `FireAndForget=true` não propaga erro de gravação ao fluxo.
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo.
- **Dependência ausente/não configurada:** N/A.
- **Estado no Pipe hoje:** motor **sim** (`trackEvent`, `acoes.ts:112-121`); tela **sim** (`CATALOGO_DE_ACOES`, `acoes-do-bloco.ts:113-125`) — **já suportada** (`ja-suportada`). Divergência conhecida a conferir: o Pipe hoje não trata separador decimal do campo `value` (Rule 1 candidata numa wave futura, fora deste inventário).
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2, §4.7; bundle de tradução (chave `trackEvent`); `packages/core/src/fluxo/acoes.ts:112-121`; `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts:113-125`.

---

### ProcessHttp

- **Nome exibido:** "Requisição HTTP" `[BLIP-UI]`/`[PIPE]` (rótulo já idêntico entre os dois)
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** Entrada e Saída no Pipe hoje (`acoes-do-bloco.ts`, grupo "Executar").
- **Campos do editor** `[BLIP-UI]`+`[PIPE]`: "Método" (`method`), "URI" (`uri`), "Cabeçalhos" (`headers`, com "Cabeçalhos customizados"), "Corpo" (`body`), "Tempo limite (segundos)" (`requestTimeout`), "Variável do status" (`responseStatusVariable`), "Variável do corpo" (`responseBodyVariable`). A Blip real também oferece **OAuth 2.0** ("Configurações de autenticação") `[BLIP-UI]` — campo que o Pipe **não tem hoje**, gap a registrar (fora do escopo de D-19 decidir agora; ver Resumo).
- **Valores padrão:** `RequestTimeout` = 60s `[BLIP-SDK]` (Pipe usa 60_000 ms como default quando o campo não é um número positivo, `acoes.ts:207`).
- **Validações:** `Uri` e `Method` obrigatórios `[BLIP-SDK]`; Pipe valida `Method` contra `GET/POST/PUT/PATCH/DELETE` e `uri` não vazio (`acoes.ts:189-196`).
- **Condições de execução:** lista `conditions` do envelope comum (`PAINEL-Blocos.md`: "Adicionar condiciones para realizacion de solicitud HTTP").
- **Variáveis de entrada/saída:** `ResponseStatusVariable` e `ResponseBodyVariable`, ambas opcionais.
- **Formato serializado:**
  ```json
  { "method": "POST", "uri": "https://api.exemplo.com/lead", "headers": {"Content-Type": "application/json"}, "body": "{\"nome\":\"{{contato.nome}}\"}", "requestTimeout": 30, "responseStatusVariable": "statusLead", "responseBodyVariable": "corpoLead" }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: headers passam pelo substituidor de variáveis (permite `{{secret.token}}` num header); `X-Blip-User`/`X-Blip-Bot` só injetados sob flag de configuração; em URIs internas, `X-Blip-Bot`+`X-Blip-StateId` sempre. **Não lança em erro HTTP** — status ≥400 vira só `Warning` no trace; erro de rede/SSL vira status sintético **495**/**503** com corpo JSON de erro. Timeout também não lança.
- **Dependência de serviço da plataforma:** nenhuma — chama URL externa escolhida pelo cliente; o Pipe já tem essa capacidade (`chamarComMtls`+`confirmarUrlSegura`, `apps/api/src/dominio/fluxo.ts`).
- **Erros/timeouts/retries:** `[PIPE]` já diverge deliberadamente da Blip aqui — status ≥400 chega como `status` na variável configurada (sem lançar), mas erro de rede/timeout no Pipe retorna status sintético 503/504 (não 495 como a Blip); sem retry automático nos dois.
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo.
- **Dependência ausente/não configurada:** N/A (URL do próprio usuário); falta de suporte a OAuth 2.0 no editor do Pipe é uma lacuna de paridade a registrar no Resumo.
- **Estado no Pipe hoje:** motor **sim** (`processHttp`, `acoes.ts:184-232`, com a wave técnica do motor — D-25/D-26/D-27 — corrigindo a retomada); tela **sim** (`acoes-do-bloco.ts:70-90`) — **já suportada** (`ja-suportada`), com o gap de campo OAuth 2.0 anotado acima.
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2, §4.7; bundle de tradução (chave `processHttp`); `packages/core/src/fluxo/acoes.ts:184-232`; `apps/api/src/dominio/fluxo.ts:320-360`; `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts:70-90`.

---

### ManageList

- **Nome exibido:** "Gerenciar lista de distribuição" `[BLIP-UI]`
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** PENDENTE-CAPTURA #2.
- **Campos do editor** `[BLIP-UI]`: "Ação" (`action`, com opções "Adicionar"/"Remover"), "Nome da lista" (`listName`, com "Carregando listas..."/"Adicionar nova lista"), condição própria ("Condição para Gerenciar lista", "+ Adicionar condição de gerenciamento"). Descrição: "Use para agrupar clientes em determinadas listas."
- **Valores padrão:** `Action` default `Add` `[BLIP-SDK]`.
- **Validações:** `ListName` obrigatório `[BLIP-SDK]`.
- **Condições de execução:** lista própria de condições.
- **Variáveis de entrada/saída:** nenhuma — a ação só adiciona/remove o usuário corrente da lista.
- **Formato serializado:**
  ```json
  { "listName": "clientes-vip", "action": "Add" }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: no `Add`, cria a lista se não existir (2 tentativas); no `Remove`, engole erro de lista inexistente (não falha a ação).
- **Dependência de serviço da plataforma:** **sim** — listas de distribuição são um recurso do bot na plataforma Blip (mailing/broadcast), sem equivalente hoje no Pipe. Ver "Opções para o portão (D-20)".
- **Erros/timeouts/retries:** `Add` tenta 2 vezes antes de desistir; `Remove` nunca lança por lista inexistente.
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo.
- **Dependência ausente/não configurada:** sem uma tabela de listas de distribuição no Pipe, a ação não tem onde persistir a associação contato↔lista.
- **Estado no Pipe hoje:** motor **não**, tela **não**.
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2; bundle de tradução (chave `manageList`).

#### Opções para o portão (D-20)

- **(a) Equivalente nativo no Pipe:** criar uma tabela `lista_distribuicao` (`id`, `tenant_id`, `nome`) + tabela de associação `lista_distribuicao_contato` (`lista_id`, `contato_id`), com `Add`/`Remove` mapeados para insert/delete na associação. Serve de base tanto para o Builder quanto para uma futura peça de campanha/disparo em massa (`catalogo-gatilhos-acoes.md` §4.2, `enviar_template`, já cita "a Blip usa Active Campaign para disparo em massa" como equivalente funcional).
- **(b) Dependência externa impossível de reproduzir:** sem essa tabela, `ManageList` importado fica "Não executada no Pipe".

---

### MergeContact

- **Nome exibido:** "Definir contato" `[BLIP-UI]`
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** PENDENTE-CAPTURA #2.
- **Campos do editor** `[BLIP-UI]`: "Nome" (`name`), "E-mail" (`email`), "Cidade" (`city`), "Genero" (`gender`, opções "Masculino"/"Feminino"), "Documento" (`taxDocument`), "Telefone" (`phoneNumber`), "Extras" (`extras`, lista de atributos extras com "+ Adicionar atributo extra"), condição própria ("Condição para Definir contato", "+ Adicionar condição de definição"). Nota: "Para mostrar as informações extras no fluxo, utilize: `{{variableName}}`."
- **Valores padrão:** N/A documentado.
- **Validações:** nenhuma listada em `[BLIP-SDK]` (não herda `ActionBase`; o JSON inteiro vira um documento `Contact` LIME).
- **Condições de execução:** lista própria de condições.
- **Variáveis de entrada/saída:** os campos preenchidos ficam acessíveis como `{{contato.*}}` depois de gravados (mesmo padrão de `atualizar_contato`, `catalogo-gatilhos-acoes.md` §4.3).
- **Formato serializado:**
  ```json
  { "name": "{{respostaNome}}", "email": null, "city": null, "gender": null, "taxDocument": "{{respostaCpf}}", "phoneNumber": null, "extras": { "segmento": "b2b" } }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: **armadilha real da Blip, a não copiar** — `MergeContact` **ignora o `identity` do payload** e escreve **sempre** no `context.UserIdentity` do usuário corrente (há um `contact.Identity = contact.Identity` no código, provável bug histórico da própria Blip).
- **Dependência de serviço da plataforma:** nenhuma que precise de decisão no portão — mapeia direto para a tabela `contato` que o Pipe já tem (`atualizar_contato`, `catalogo-gatilhos-acoes.md` §4.3); não é dependência externa impossível de reproduzir, é motor a construir sobre dado já existente.
- **Erros/timeouts/retries:** sem validação de schema (a ação aceita qualquer JSON de contato); erros de gravação no Pipe seriam os já existentes de `contato`.
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo.
- **Dependência ausente/não configurada:** N/A.
- **Estado no Pipe hoje:** motor **não**, tela **não**.
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2, §4.3; bundle de tradução (chave `mergeContact`).

---

### SetVariable

- **Nome exibido:** "Definir variável" `[BLIP-UI]`/`[PIPE]` (rótulo já idêntico)
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** Entrada e Saída no Pipe hoje (grupo "Manipular").
- **Campos do editor** `[BLIP-UI]`: "Nome da variável" (`variable`, com "Utilize apenas letras minúsculas e números" — nota: a Blip real restringe mais que o Pipe hoje, ver Validações), "Valor" (`value`).
- **Valores padrão:** N/A.
- **Validações:** `Variable` obrigatório `[BLIP-SDK]`; `[BLIP-UI]` recomenda "apenas letras minúsculas e números" no rótulo de ajuda, mas o Pipe hoje aceita **letras, números e pontos** (`errosDaAcao`, `acoes-do-bloco.ts:274-278`, mensagem "só pode ter letras, números e pontos") — o Pipe já é mais permissivo (permite pontos para variáveis aninhadas tipo `contato.cidade`), divergência intencional a manter, não um gap.
- **Condições de execução:** lista `conditions` do envelope comum.
- **Variáveis de entrada/saída:** `Expiration` (segundos) — **campo existente na Blip e não usado pelo executor atual do Pipe** (`docs/builder-cards-pendencias.md`: "A expiração da ação Definir variável aparece na Blip, mas o executor atual do Pipe não utiliza esse campo").
- **Formato serializado:**
  ```json
  { "variable": "etapaFunil", "value": "qualificado", "expiration": 3600 }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: grava a variável no contexto da conversa; `Expiration` (segundos) expira a variável depois desse tempo.
- **Dependência de serviço da plataforma:** nenhuma.
- **Erros/timeouts/retries:** `Variable` ausente lança erro de validação (`acoes.ts:47-49`).
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo.
- **Dependência ausente/não configurada:** N/A.
- **Estado no Pipe hoje:** motor **sim** (`setVariable`, `acoes.ts:43-51`); tela **sim** (`acoes-do-bloco.ts:91-105`) — **já suportada** (`ja-suportada`), com uma lacuna conhecida e já documentada: `Expiration` não é lido pelo executor do Pipe (candidato a Rule 2 numa wave futura, fora deste inventário).
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2, §4.3; bundle de tradução (chave `setVariable`); `packages/core/src/fluxo/acoes.ts:43-51`; `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts:91-105`; `docs/builder-cards-pendencias.md`.

---

### SetBucket

- **Nome exibido:** PENDENTE-CAPTURA #5 — sem chave encontrada no bundle de tradução consultado.
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** PENDENTE-CAPTURA #2.
- **Campos do editor:** `[INFER]` a partir dos parâmetros do SDK: Id (`Id`, chave do documento), Tipo (`Type`, MIME), Documento (`Document`), Expiração (`Expiration`, segundos). Rótulos exatos: PENDENTE-CAPTURA #5.
- **Valores padrão:** N/A documentado.
- **Validações:** `Id` e `Type` obrigatórios `[BLIP-SDK]`.
- **Condições de execução:** lista `conditions` do envelope comum.
- **Variáveis de entrada/saída:** nenhuma — grava direto no bucket, não em variável de contexto.
- **Formato serializado:**
  ```json
  { "id": "preferencias-usuario", "type": "application/json", "document": {"tema": "escuro"}, "expiration": 86400 }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: grava um documento no **bucket do bot** — armazenamento chave-valor da plataforma, **global do bot, não por contato** `[BLIP-SDK]`; o namespace `blip_portal:` é reservado pela própria Blip.
- **Dependência de serviço da plataforma:** **sim** — bucket é um serviço de armazenamento próprio da plataforma Blip, sem equivalente hoje no Pipe. Ver "Opções para o portão (D-20)".
- **Erros/timeouts/retries:** sem retry documentado.
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo.
- **Dependência ausente/não configurada:** sem uma tabela de "memória" chave-valor no Pipe, a ação não tem onde persistir.
- **Estado no Pipe hoje:** motor **não**, tela **não**.
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2, §4.3 (`gravar_memoria`, já registra a divergência de escopo: "no Pipe, chavear por contato por padrão e exigir opção explícita para memória global").
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2, §4.3.

#### Opções para o portão (D-20)

- **(a) Equivalente nativo no Pipe:** implementar `gravar_memoria` (já desenhado em `catalogo-gatilhos-acoes.md` §4.3) — uma tabela chave-valor por tenant com `chave`, `valor` (jsonb), `expiracao`, **chaveada por contato por padrão** (divergência deliberada da Blip, que é só por bot) e com opção explícita para memória global do bot quando necessário.
- **(b) Dependência externa impossível de reproduzir:** sem essa tabela, `SetBucket` importado fica "Não executada no Pipe".

---

### Redirect

- **Nome exibido:** "Redirecionar a um serviço" `[BLIP-UI]`/`[PIPE]` (rótulo já idêntico)
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** Entrada e Saída no Pipe hoje (grupo "Executar").
- **Campos do editor** `[BLIP-UI]`/`[PIPE]`: "Serviço" (`address`), "Tipo do contexto" (`context.type`), "Valor do contexto" (`context.value`). Info: "Para executar esta ação é necessário que seu projeto esteja em um bot router." (link para doc de hierarquia de bots/subbots).
- **Valores padrão:** N/A.
- **Validações:** `address` obrigatório `[PIPE]` (`errosDaAcao`); `[BLIP-SDK]` não documenta validação própria (a ação não herda `ActionBase`).
- **Condições de execução:** lista `conditions` do envelope comum (`PAINEL-Blocos.md`: "Condições de Redirecionamento").
- **Variáveis de entrada/saída:** `context` aceita variáveis interpoladas no valor.
- **Formato serializado:**
  ```json
  { "address": "atendimento-humano", "context": { "type": "text/plain", "value": "{{motivoTransferencia}}" } }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: o `RedirectManager` só faz `SendMessageAsync(redirect, ...)` — **o bot manda uma mensagem `redirect` de volta ao canal e quem age de fato é o roteador** (o handover em si não é feito pela action, é efeito colateral de rotas do roteador). `[PIPE]` reproduz isso via `contexto.servicos.redirecionar`, que falha explicitamente sem roteador configurado — mesma regra da origem.
- **Dependência de serviço da plataforma:** **sim, mas já resolvida no Pipe** — precisa de um roteador (bot router); o Pipe já modela isso (`contexto.servicos.redirecionar`) e falha com mensagem clara quando ausente — não é uma decisão pendente de D-20 (motor já existe), é comportamento correto e replicado.
- **Erros/timeouts/retries:** sem roteador, lança `'O redirecionamento só funciona num fluxo que é serviço de um roteador.'` `[PIPE]`, igual ao espírito da falha na origem.
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo.
- **Dependência ausente/não configurada:** sem roteador configurado no fluxo, a ação falha (comportamento intencional, replicado).
- **Estado no Pipe hoje:** motor **sim** (`redirect`, `acoes.ts:167-181`); tela **sim** (`acoes-do-bloco.ts:58-69`) — **já suportada** (`ja-suportada`).
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2; bundle de tradução (chave `redirect`); `packages/core/src/fluxo/acoes.ts:167-181`; `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts:58-69`.

---

### CreateTicket

- **Nome exibido:** não tem editor de "ação" independente na Blip — nasce junto do **bloco de atendimento humano** ("Answer your customers with human agents" `[BLIP-DOM]`), sem UI própria de configuração de campos além do que o bloco de atendimento já expõe.
- **Ícone (significado):** ícone do bloco "Humano" — PENDENTE-CAPTURA #1 para o desenho exato.
- **Entrada/Saída/Global:** ação de entrada do bloco de atendimento (`$enteringCustomActions` do bloco `desk:`), criada automaticamente, sem editor manual (`ACOES_DO_SISTEMA`, `acoes-do-bloco.ts:151` — "o bot não deve interferir nas ações de entrada e saída" do bloco Humano).
- **Campos do editor:** nenhum exposto ao usuário — `Validate()` da action **é vazio, nada é obrigatório** `[BLIP-SDK]`; os campos (`OwnerIdentity`, `CustomerIdentity`, `RoutingOwnerIdentity`, `RoutingCustomerIdentity`, `Variable`, `CustomerInput`) são preenchidos pelo próprio Builder ao montar o bloco de atendimento, com defaults (`context.OwnerIdentity`, `context.UserIdentity`, `context.Input.Content`).
- **Valores padrão** `[BLIP-SDK]`: `OwnerIdentity` = `context.OwnerIdentity`; `CustomerIdentity` = `context.UserIdentity`; `CustomerInput` = `context.Input.Content`.
- **Validações:** nenhuma (`Validate()` vazio).
- **Condições de execução:** as condições de saída do bloco de atendimento (não da action em si) — `SAIDAS_DE_ATENDIMENTO` no Pipe.
- **Variáveis de entrada/saída:** `Variable` recebe o `ticket.Id`; a action também faz `context.SetTicket(...)`, alimentando `{{ticket.*}}` no restante do fluxo.
- **Formato serializado:**
  ```json
  { "ownerIdentity": "{{context.OwnerIdentity}}", "customerIdentity": "{{context.UserIdentity}}", "variable": "ticketId" }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: abre o ticket de atendimento humano no Desk e guarda o ticket no contexto (`{{ticket.*}}`). Mecanismo completo de handover na Blip é **duas peças juntas**: `CreateTicket` (nas ações de entrada) + o `State` do bloco com id prefixado `desk:` (o que efetivamente para o fluxo — ver §2.3 do catálogo). `[PIPE]` já unifica esse comportamento — `novoBlocoDeAtendimento` monta as duas coisas no mesmo gesto do editor.
- **Dependência de serviço da plataforma:** nenhuma — o Pipe já tem atendimento humano nativo (`transbordar`/`encaminharParaAtendimento`) equivalente à função de `CreateTicket`.
- **Erros/timeouts/retries:** `[PIPE]` `ForwardToDesk` (ação de sistema irmã, ver nota abaixo) captura falha e grava `Success`/`Error` numa variável interna (`VARIAVEL_DO_ENCAMINHAMENTO`), reproduzindo o padrão de "falha vira valor, não exceção" que a Blip usa no bloco `desk:`.
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo; ação embutida no bloco de atendimento, não solta.
- **Dependência ausente/não configurada:** N/A.
- **Estado no Pipe hoje:** motor **sim** (`createTicket`, `acoes.ts:124-136`); tela **sim**, mas como ação do sistema criada com o bloco "Humano", não do menu "ADICIONAR FERRAMENTAS" (`ACOES_DO_SISTEMA`, `acoes-do-bloco.ts:151`) — **já suportada** (`ja-suportada`).
- **Nota:** `ForwardToDesk` e `LeavingFromDesk` **não existem no SDK da Blip como Action** — são ações do **servidor** da Blip usadas internamente pelo bloco de atendimento do editor (comportamento copiado da forma do bloco no export, variável `desk_forwardToDeskState_status`). Não entram como seções próprias deste inventário porque não fazem parte das 19 actions do SDK, mas já são motor+tela no Pipe (`acoes.ts:139-160`) como o mecanismo interno do bloco Humano, ao lado de `CreateTicket`.
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2, §2.3, §4.5; `packages/core/src/fluxo/acoes.ts:108-160`; `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts:150-151`; `apps/gestao-vite/src/paginas/builder/modelo.ts:129-133, 283-319`.

---

### DeleteVariable

- **Nome exibido:** "Excluir variável" `[BLIP-UI, via análise de simetria]`/`[PIPE]` (rótulo do Pipe já usado; chave própria não encontrada isolada no bundle, mas o par `setVariable`/`deleteVariable` é simétrico no SDK).
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** Entrada e Saída no Pipe hoje; `[PIPE]` nota que "o editor da Blip não a oferece no menu, mas o motor a executa; o rótulo é nosso" (`acoes-do-bloco.ts:15-16`) — **divergência conhecida e documentada**: a Blip real pode não expor `DeleteVariable` no menu "ADICIONAR FERRAMENTAS" com a mesma visibilidade que `SetVariable`. PENDENTE-CAPTURA #6 — confirmar se `DeleteVariable` aparece no menu do Builder ao vivo ou só é alcançável via fluxo importado.
- **Campos do editor:** "Nome da variável" (`variable`), mesmo campo de `SetVariable`.
- **Valores padrão:** N/A.
- **Validações:** `Variable` obrigatório `[BLIP-SDK]`.
- **Condições de execução:** lista `conditions` do envelope comum.
- **Variáveis de entrada/saída:** nenhuma — apaga, não produz saída.
- **Formato serializado:**
  ```json
  { "variable": "dadoSensivelTemporario" }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: apaga a variável do contexto da conversa.
- **Dependência de serviço da plataforma:** nenhuma.
- **Erros/timeouts/retries:** `Variable` ausente lança erro de validação (`acoes.ts:53-58`).
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo.
- **Dependência ausente/não configurada:** N/A.
- **Estado no Pipe hoje:** motor **sim** (`deleteVariable`, `acoes.ts:53-59`); tela **sim** (`acoes-do-bloco.ts:106-112`) — **já suportada** (`ja-suportada`), com a nota de proveniência de rótulo já documentada no próprio código-fonte do Pipe.
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2, §4.3 (`apagar_variavel`); `packages/core/src/fluxo/acoes.ts:53-59`; `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts:15-16, 106-112`.

---

### ProcessContentAssistant

- **Nome exibido:** "Consultar Assistente de conteúdo" `[BLIP-UI]`
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** PENDENTE-CAPTURA #2.
- **Campos do editor** `[BLIP-UI]`: "Variável" (`text`, rotulado como variável mas o texto de ajuda diz "Texto a ser analisado" — nome de campo e rótulo de UI divergem, atenção ao mapear), "Confiabilidade de IA (opcional)" (`score`, ajuda "Percentual de 0 a 100"), "Tags" (`tags`, ajuda "Filtro para análise ex: #tag1,#tag2"), "Variável para o valor de retorno" (`outputVariable`), condição própria ("Condição para enviar para análise", "+ Adicionar condição de definição").
- **Valores padrão:** `Score` nulo usa `builder:#MinimumIntentScore` (configuração global do bot) `[BLIP-SDK]`.
- **Validações:** `Text` e `OutputVariable` obrigatórios `[BLIP-SDK]`.
- **Condições de execução:** lista própria de condições.
- **Variáveis de entrada/saída:** `OutputVariable` — variável única de retorno.
- **Formato serializado:**
  ```json
  { "text": "{{mensagemDoUsuario}}", "outputVariable": "intencaoDetectada", "tags": "#suporte,#vendas", "score": 70, "v2": true }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: consulta a base de conteúdo/NLP da própria Blip; `Score` é **dividido por 100 internamente** — a UI mostra "0 a 100", mas o valor real usado na comparação é 0..1 (armadilha explícita a **não copiar**: `catalogo-gatilhos-acoes.md` §4.6 recomenda "usar 0..1 e ponto final" na peça equivalente do Pipe, `responder_com_base`).
- **Dependência de serviço da plataforma:** **sim** — motor de NLP/base de conteúdo proprietário da Blip. Ver "Opções para o portão (D-20)".
- **Erros/timeouts/retries:** sem retry documentado.
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo.
- **Dependência ausente/não configurada:** sem um motor de RAG/base de conhecimento equivalente no Pipe, a ação fica sem onde executar.
- **Estado no Pipe hoje:** motor **não**, tela **não**.
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2, §2.5, §4.6; bundle de tradução (chave `processContentAssistant`).

#### Opções para o portão (D-20)

- **(a) Equivalente nativo no Pipe:** a peça `responder_com_base` já desenhada em `catalogo-gatilhos-acoes.md` §4.6 — RAG sobre `baseConhecimento`/`trechoConhecimento` (tabelas que já existem no Pipe), com `confiancaMinima` em escala 0..1 (corrigindo a armadilha da Blip) e caminho explícito de "não sei" quando a confiança não bate.
- **(b) Dependência externa impossível de reproduzir:** sem motor de RAG implementado, `ProcessContentAssistant` importado fica "Não executada no Pipe".

---

### TrackContactsJourney

- **Nome exibido:** não tem editor de ação voltado ao usuário — é inserida automaticamente pela plataforma a cada transição de estado para alimentar o relatório "Viaje de contactos" / "Jornada de contatos" `[BLIP-UI]` (chave `contactsJourney`, fora do namespace de ações — é uma tela de **Analytics**, não um painel do Builder).
- **Ícone (significado):** N/A (sem editor manual).
- **Entrada/Saída/Global:** PENDENTE-CAPTURA #2 — `[INFER]` provavelmente ação de entrada automática em todo `State`, não uma ação que o usuário adiciona pelo menu.
- **Campos do editor:** nenhum exposto — `StateId`/`StateName`/`PreviousStateId`/`PreviousStateName` `[BLIP-SDK]` são preenchidos pelo próprio motor a cada transição, não pelo usuário.
- **Valores padrão:** `FireAndForget` = true (default) `[BLIP-SDK]`.
- **Validações:** `StateId` e `StateName` obrigatórios `[BLIP-SDK]` (preenchidos automaticamente).
- **Condições de execução:** N/A (sem UI de condição própria encontrada).
- **Variáveis de entrada/saída:** nenhuma — só registra evento para o relatório.
- **Formato serializado:**
  ```json
  { "stateId": "bloco-2", "stateName": "Qualificação", "previousStateId": "bloco-1", "previousStateName": "Início", "fireAndForget": true }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: registra a jornada do contato entre blocos — a fonte de dados do relatório "Jornada de contatos" (`[BLIP-UI]`: "¿Cómo interactúan los contactos con tu chatbot? ¿Cuál es el comportamiento de la mayoría? ¿Cómo es el desempeño de tu flujo? ¿De dónde vinieron esas personas y adónde fueron?"), com nós `Início`/`Outros`/`Saída` e filtro "Empezar desde".
- **Dependência de serviço da plataforma:** **sim** — depende de um consumidor de Analytics (dashboard tipo Sankey) que o Pipe não tem. Ver "Opções para o portão (D-20)".
- **Erros/timeouts/retries:** `FireAndForget=true`, não propaga erro.
- **Teste/Debug:** N/A (sem UI própria).
- **Import/export:** mesmo formato do fluxo, quando presente.
- **Dependência ausente/não configurada:** sem tabela de jornada + tela de relatório, a ação registra mas não tem onde os dados aparecerem de volta ao cliente.
- **Estado no Pipe hoje:** motor **não**, tela **não** — nem como ação editável (não é), nem como consumo de relatório.
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2; bundle de tradução (chave `contactsJourney`).

#### Opções para o portão (D-20)

- **(a) Equivalente nativo no Pipe:** o Pipe já tem `execucao_fluxo`/`execucao_passo` registrando toda transição de estado com timestamps — a jornada de contatos é **derivável dessas tabelas existentes** sem precisar de uma ação nova no motor (a transição já é registrada pelo `gerenciador.ts`); falta só a tela de relatório (Sankey/funil) que leia esse dado, fora do escopo desta fase (Analytics, fase futura per `PROJECT.md`).
- **(b) Dependência externa impossível de reproduzir:** enquanto não houver a tela de Analytics, tratar como "schema já suficiente, tela pendente de fase futura" — não é uma dependência de plataforma externa impossível, é um relatório ainda não construído.

---

### ExecuteTemplate

- **Nome exibido:** "Executar template" `[BLIP-UI]`
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** PENDENTE-CAPTURA #2.
- **Campos do editor** `[BLIP-UI]`: "Variáveis de entrada" (`inputVariables`, com "Defina aqui as variáveis para a ação de transformação de texto com Handlebars... uma das variáveis pré-determinadas na lista ou definidas em resposta do usuário", placeholder "Adicione as variáveis", "Criar variável"), "Template" (`template`, "Adicione o template para execução correta da funcionalidade", placeholder "Escreva aqui o template"), "Salvar retorno" (`outputVariable`, "Para mostrar as informações da consulta no fluxo, utilize: `{{NomeDaVariável}}`").
- **Valores padrão:** N/A.
- **Validações:** `OutputVariable` obrigatório `[BLIP-SDK]`.
- **Condições de execução:** lista `conditions` do envelope comum (sem seção de condição própria encontrada no bundle, diferente das demais ações deste grupo).
- **Variáveis de entrada/saída:** `InputVariables[]` — "Input que for JSON válido é **desserializado** antes" `[BLIP-SDK]`, permitindo `{{minhaVar.campo}}` dentro do template; `OutputVariable` único.
- **Formato serializado:**
  ```json
  { "template": "Olá {{nome}}, seu pedido {{pedido.numero}} chega {{pedido.previsao}}.", "inputVariables": ["nome", "pedido"], "outputVariable": "mensagemFormatada" }
  ```
- **Comportamento no motor** `[BLIP-SDK]`: renderiza um template **Handlebars** — motor de interpolação declarativo, sem execução de script arbitrário (mais seguro que `ExecuteScript` para formatação simples).
- **Dependência de serviço da plataforma:** nenhuma — é processamento local de string, sem chamada a serviço externo.
- **Erros/timeouts/retries:** sem timeout/retry documentado (Handlebars é síncrono e determinístico).
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo.
- **Dependência ausente/não configurada:** N/A.
- **Estado no Pipe hoje:** motor **não**, tela **não**.
- **Fonte:** `catalogo-gatilhos-acoes.md` §2.2, §5 (lacuna 5, "toda formatação vira script" sem um catálogo de funções); bundle de tradução (chave `executeTemplate`).

---

### ExecuteBlipFunction

- **Nome exibido:** "Função da biblioteca" `[BLIP-UI]`
- **Ícone (significado):** PENDENTE-CAPTURA #1.
- **Entrada/Saída/Global:** PENDENTE-CAPTURA #2.
- **Campos do editor** `[BLIP-UI]`: "Definição da função" (`definition`, ajuda "Selecione uma função criada na Biblioteca de funções ou crie uma nova para ser utilizada como uma ação"), "Pesquisar função" (`search`), "Criar função" (`create`), estado vazio "Crie sua primeira função" (`noFunctionCreated`, "Você ainda não tem funções na sua biblioteca"), "Função selecionada" (`selectedFunction`).
- **Valores padrão:** N/A.
- **Validações:** exige uma função já criada na Biblioteca (não permite apontar para função inexistente).
- **Condições de execução:** PENDENTE-CAPTURA #2 (sem chave de condição própria encontrada no bundle para esta ação especificamente).
- **Variáveis de entrada/saída:** parâmetros e retorno definidos **na função da biblioteca**, não no ponto de chamada (o painel da ação só escolhe/pesquisa/cria a função) — mesmo padrão de "criar em duas etapas" que `catalogo-gatilhos-acoes.md` §1.7 registra para `chamar_funcao`/`LOGIC_FUNCTION` do Twenty.
- **Formato serializado:**
  ```json
  { "functionId": "func-abc123" }
  ```
- **Comportamento no motor:** chama a função nomeada e reutilizável da Biblioteca de funções do bot — ver `## Biblioteca de funções (D-22)` abaixo para o mecanismo completo (criação, parâmetros, retorno, escopo).
- **Dependência de serviço da plataforma:** a Biblioteca de funções em si é **funcionalidade do motor de conversa da Blip** (não um serviço externo de terceiros) — a ação depende de a Biblioteca existir no Pipe (D-22), não de uma API proprietária externa.
- **Erros/timeouts/retries:** herdados da execução da função (mesma natureza de `ExecuteScript`/`ExecuteScriptV2`, já que a Biblioteca é implementada sobre o mesmo mecanismo de script).
- **Teste/Debug:** PENDENTE-CAPTURA #3.
- **Import/export:** mesmo formato do fluxo para a ação; a função em si tem seu próprio ciclo de vida de import/export — PENDENTE-CAPTURA #7 (se a Biblioteca de funções é exportada junto do fluxo ou é recurso separado do bot).
- **Dependência ausente/não configurada:** apontar para uma função apagada/inexistente — comportamento exato PENDENTE-CAPTURA #7.
- **Estado no Pipe hoje:** motor **não** (não existe execução de função nomeada no motor de conversa hoje); tela **não** (`ExecuteBlipFunction` não existe em `acoes-do-bloco.ts`); **não existe nenhuma tabela/contrato de "função" no motor de conversa** — o único `funcao` do repositório é do motor de **workflow** (`packages/db/src/schema/automacao.ts:443-454`), uma máquina diferente (ver `## Biblioteca de funções (D-22)`).
- **Fonte:** `catalogo-gatilhos-acoes.md` §1.7, §4.4 (`chamar_funcao`); bundle de tradução (chave `executeBlipFunction`); `packages/db/src/schema/automacao.ts:443-454`.

---

### Agente de IA (bloco do Builder, fora das 19 actions do SDK)

D-19 pede investigar explicitamente "ações ligadas a agentes/IA" para declarar a que superfície pertencem. Achado: **não é uma Action do SDK.** `[BLIP-SDK]` confirma que a única action de IA é `ProcessContentAssistant` (já documentada acima); não existe `ProcessLLM`/`AiAgent`/`Copilot` em `master` (§2.5 do catálogo).

O que existe é um **bloco de Builder separado**, "Agente de IA" `[BLIP-UI]`/`[BLIP-DOM]` (`PAINEL-Builder.md`: "+ Crear agente de IA" ao lado de "+ Adicionar tarefa"/"+ Crear nuevo subflujo" — é uma terceira classe de nó, não um tipo de ação dentro de um bloco comum):

- **Nome exibido:** "Agente de IA" `[BLIP-UI]` (tela de descoberta: "Deixe a IA responder seus clientes" / "Use IA para responder clientes"; botão "Criar agente de IA"/"Criar agente"; nome padrão do bloco "Novo Agente").
- **Mecanismo:** o agente é contextualizado com uma **base de conhecimento** ("Com o AI Agent, você contextualiza a IA com uma base de conhecimento para responder seus clientes") e tem uma aba própria de "Ferramentas" (`aiAgent.title = "Ferramentas"`, "Inclua ferramentas que serão executadas pelo agente durante o atendimento", botão "Adicionar ferramenta"/`addLocalCustomAction`) — ou seja, o agente **chama ações locais como ferramentas**, análogo ao `acoesPermitidas[]` desenhado em `catalogo-gatilhos-acoes.md` §4.6 para o `agente_ia` do Pipe.
- **Variável de contexto:** `[BLIP-SDK]` a plataforma expõe `{{aiagent.*}}` via `AiAgentVariableProvider` (`redirect`, `userMessageId`, `skill_id`, `task_id`, `taskName`, `skillName`, `toolCall_id`, `name`, `parameters`, `userMessage`, `agentResponse`, `errorCode`) — o agente roda **fora** do fluxo de blocos comuns e injeta resultado no contexto; o fluxo consome via variável e ramifica com `conditions` (§2.5).
- **Declaração explícita (D-19):** este bloco pertence ao **Builder** (é um nó do canvas, ao lado de bloco comum e subfluxo — `PAINEL-Builder.md`), mas seu mecanismo de execução (contextualização com base de conhecimento + chamada de ferramentas) é estruturalmente diferente de uma Action comum da lista de 19 — mais próximo do desenho `agente_ia`/`AI_AGENT` já mapeado em `catalogo-gatilhos-acoes.md` §4.6 do que de qualquer Action do SDK C#. `[DECISÃO]` do catálogo de referência já recomenda o Pipe **divergir** da Blip aqui: declarar `acoesPermitidas[]` e `maxPassos` **no passo/bloco**, não escondidos no agente, para manter o fluxo auditável — decisão de implementação fica para quando esta funcionalidade entrar em escopo de wave (fora de BUILDER-01..05 explícito; registrar como achado de investigação, não pré-aprovar).
- **Estado no Pipe hoje:** motor **não**, tela **não** — nenhuma referência a bloco de Agente de IA em `apps/gestao-vite/src/paginas/builder`.
- **Teste/Debug, import/export, ícone:** PENDENTE-CAPTURA #1/#2/#3 (mesmas lacunas gerais de captura visual do Builder ao vivo).
- **Fonte:** `referencias-blip/builder/builder/PAINEL-Builder.md`; bundle de tradução (chaves `aiAgent`, `ai-agent-actions`); `catalogo-gatilhos-acoes.md` §2.5, §4.6.

---

## Scripts (D-21)

Documentação de `ExecuteScript` (legado) e `ExecuteScriptV2` lado a lado, para a recomendação de sandbox.

| Dimensão | ExecuteScript (V1) | ExecuteScriptV2 |
|---|---|---|
| Engine | Jint (interpretado) `[BLIP-SDK]` | V8/ClearScript `[BLIP-SDK]` |
| Versão ECMAScript | ES5/ES6 parcial (limite do Jint) — versão exata PENDENTE-CAPTURA #4 | ECMAScript moderno (V8), com `async`/`await` real (`promises awaitadas`) `[BLIP-SDK]` |
| Limite de tempo | **timeout 5 s** `[BLIP-SDK]` | **timeout 10 s** `[BLIP-SDK]` |
| Limite de operações/memória | recursão máx. 50, **máx. 1000 statements**, memória 100 MB `[BLIP-SDK]` | heap 100 MB, `AllowReflection=false` (sem acesso a APIs .NET internas) `[BLIP-SDK]` |
| APIs expostas | contexto da conversa via `InputVariables`/`OutputVariable`; sem `fetch` documentado | `request` (com `request.fetchAsync`, HTTP assíncrono), `time`, `context`, `botTimeZone` `[BLIP-SDK]` — assinaturas exatas PENDENTE-CAPTURA #4 |
| Acesso a variáveis de entrada/saída | `InputVariables[]` recebidas como parâmetro da função `run`; `OutputVariable` único | idem V1 |
| HTTP/fetch | não documentado no SDK para V1 (a ação irmã `ProcessHttp`/`SendMessageFromHttp` cobre chamada externa) | `request.fetchAsync` nativo dentro do script `[BLIP-SDK]` |
| Tratamento de erro | `continueOnError` (bool) no envelope comum — fluxo prossegue mesmo com erro se marcado `[BLIP-UI]` | mesmo `continueOnError`, mais `CaptureExceptions`+`ExceptionVariable` (captura o erro numa variável específica em vez de abortar) `[BLIP-SDK]` |
| Timezone | `LocalTimeZoneEnabled` (bool) — liga fuso do bot no script `[BLIP-SDK]` | `botTimeZone` como função nativa exposta ao script `[BLIP-SDK]` |
| Tipo de retorno | valor de `OutputVariable`, serializado como o motor serializa qualquer variável de contexto (string ou JSON) | idem |
| Fonte | `catalogo-gatilhos-acoes.md` §2.2; bundle de tradução (`executeScript`) | `catalogo-gatilhos-acoes.md` §2.2; bundle de tradução (`executeScriptV2`) |

### Recomendação de sandbox para o portão

`[DECISÃO]` Comparação dos três mecanismos citados no contexto da fase, mais o próprio precedente das duas engines da Blip:

| Mecanismo | Isolamento | Suporte ao ECMAScript exigido | Limite de tempo/memória | Pacote npm necessário? |
|---|---|---|---|---|
| QuickJS em WebAssembly | Alto — motor JS completo compilado para WASM, roda fora do processo Node principal em memória própria; sem acesso a `fs`/`net`/`process` do host por padrão | ES2020+ (QuickJS é atualizado, cobre `async`/`await`, cobre o que `ExecuteScriptV2` pede) | Configurável por chamada (timeout via `setInterruptHandler`, memória via limite do módulo WASM) — dá para reproduzir os dois perfis (5s/1000 statements do V1 e 10s/heap 100MB do V2) com o mesmo motor | **Sim** — nenhum pacote QuickJS-WASM já está instalado no monorepo hoje (a confirmar contra `package.json` no momento da implementação; se `quickjs-emscripten` ou equivalente ainda não estiver em nenhum `package.json`, é instalação nova) |
| `isolated-vm` | Alto — V8 isolate separado, com heap limitado nativamente (`new ivm.Isolate({ memoryLimit })`) e `cpu`/`wall` timeout por execução | ECMAScript moderno completo (é V8 de verdade — o mais próximo do `ExecuteScriptV2` original) | Nativo ao mecanismo: `memoryLimit` (MB) e timeout por `script.run(context, { timeout })` — mapeiam 1:1 nos dois perfis da Blip | **Sim** — módulo nativo (binding C++), não está instalado hoje; exige binário compilado por plataforma (risco operacional a mais que QuickJS-WASM, que é portátil) |
| Processo filho Node com `--max-old-space-size` e `vm` sem globais | Médio — isola por processo do SO (mais pesado que os dois acima), mas `vm` do Node **não é sandbox de segurança** documentado (é possível escapar via `constructor.constructor` sem globais extras cuidadosamente removidos) | ECMAScript completo (é o próprio V8 do Node) | `--max-old-space-size` limita heap do processo inteiro, não por execução de script — corte é grosseiro (mata o processo, não só a execução); timeout via `setTimeout`+`kill` do processo filho | **Não** — `child_process`/`vm` são módulos nativos do Node, sem instalação adicional |
| **Recomendado: `isolated-vm`** | — | — | — | — |

**Justificativa:** dos três, é o único que reproduz com fidelidade os dois perfis documentados da Blip
(timeout + limite de memória **por execução**, não por processo inteiro) usando o mesmo motor V8 que
`ExecuteScriptV2` já usa na origem (ClearScript também é V8) — menor risco de uma função que passa no V8
da Blip falhar por incompatibilidade de sintaxe no Pipe. O processo filho com `vm` é descartado por não
ser sandbox de segurança de verdade (thread de execução compartilha processo do host, escapes conhecidos
existem) — inadequado para código de terceiro em produção. QuickJS-WASM é a alternativa mais portátil (sem
binário nativo por plataforma) e fica como plano B se `isolated-vm` mostrar problema de instalação/build
na VPS de produção do Pipe durante a implementação.

**Exige pacote npm:** `isolated-vm` — não confirmado como já instalado no monorepo nesta investigação;
task de implementação (fora deste plano) deve conferir `package.json`/`pnpm-lock.yaml` primeiro e, se
ausente, disparar o checkpoint de legitimidade de pacote (plano `02-16`, per `deviation_rules` Rule 3)
antes de instalar.

---

## Biblioteca de funções (D-22)

**Onde vive:** funcionalidade do **motor de conversa** (`fluxo`), acionada pela ação `ExecuteBlipFunction`
documentada acima. `[BLIP-UI]` confirma pela própria tela: "Selecione uma função criada na Biblioteca de
funções ou crie uma nova para ser utilizada como uma ação" — a Biblioteca é um recurso do **bot** (não do
tenant inteiro nem de um workflow isolado), pesquisável (`search`: "Pesquisar função") e com estado vazio
próprio ("Crie sua primeira função" / "Você ainda não tem funções na sua biblioteca").

**Criação, persistência, versionamento/edição, parâmetros, retorno, escopo:** o bundle de tradução
consultado não expõe o formulário de **criação** da função em si (só o painel que a **consome** como ação
— `executeBlipFunction`) — versionamento, assinatura de parâmetros/retorno e regras de edição da função
ficam PENDENTE-CAPTURA #7. `[INFER]`, pelo padrão da Blip para "código reutilizável" (`ExecuteScriptV2`
usa o mesmo motor de script — V8/ClearScript), a Biblioteca de funções provavelmente compartilha o mesmo
runtime de `ExecuteScriptV2` (script nomeado e parametrizado, chamável de múltiplos pontos do fluxo), mas
isso **não foi confirmado literalmente** nesta investigação.

**Como o Builder chama:** só pela ação `ExecuteBlipFunction` (ver seção própria acima) — o menu de ações
do Builder oferece "Função da biblioteca" como um tipo de ação a mais, ao lado de `ExecuteScript`/
`ExecuteScriptV2`, não como uma aba separada do editor de bloco.

**Relação com `ExecuteScriptV2`:** ambos rodam código JavaScript no motor; a diferença é que
`ExecuteScriptV2` é **inline** (o código mora dentro da ação, no fluxo) e a função da Biblioteca é
**nomeada e reutilizável** entre fluxos/blocos diferentes do mesmo bot, criada uma vez e referenciada por
`functionId` (`chamar_funcao`/`LOGIC_FUNCTION`, `catalogo-gatilhos-acoes.md` §4.4) — mesma lição registrada
em §1.7 do catálogo para o Twenty: **"peça que depende de recurso lateral (função, agente) não se cria em
bloco — criar em duas etapas."**

**Declaração explícita (D-22):** `packages/db/src/schema/automacao.ts:443-454` (`TIPOS_ACAO`, incluindo
`'funcao'`) é o **motor de workflow** (`gatilho`→`acao`, sem interlocutor, execução linear) — **uma
máquina diferente** do motor de conversa (`fluxo`→`bloco`→`transicao`) que o Builder edita, conforme
`catalogo-gatilhos-acoes.md` §0 ("três peças distintas que costumam ser confundidas"). A Biblioteca de
funções de BUILDER-02 **não reaproveita** essa `funcao` de workflow — precisa de uma tabela própria do
motor de conversa (nome de trabalho: `funcao_do_fluxo` ou equivalente, a decidir na implementação),
seguindo o padrão de busca sem acento/caixa já existente (`variaveis.ts:76-97`, `normalizar`/
`filtrarVariaveis`) para o seletor "Pesquisar função" do painel de ação.

**Fonte:** bundle de tradução (chaves `executeBlipFunction`, `manageList` — bloco vizinho no mesmo
grupo de tradução); `catalogo-gatilhos-acoes.md` §0, §1.7, §4.4; `packages/db/src/schema/automacao.ts:443-454`;
`apps/gestao-vite/src/paginas/builder/variaveis.ts:76-97`.

---

## Resumo

| Ação | Classificação proposta | Slot proposto | Bloqueado por captura |
|---|---|---|---|
| ExecuteScript | reproduzível no Pipe | acoes-script | não |
| ExecuteScriptV2 | reproduzível no Pipe | acoes-script | não |
| SendMessage | já suportada (conteúdo) | ja-suportada | não |
| SendMessageFromHttp | reproduzível no Pipe | acoes-contexto | sim — PENDENTE-CAPTURA #5 (rótulos/campos exatos do editor) |
| SendRawMessage | já suportada (fallback de import) | ja-suportada | não |
| SendCommand | dependência externa impossível de reproduzir (parcial — equivalente nativo cobre o subconjunto conhecido) | acoes-plataforma | sim — PENDENTE-CAPTURA #5 (rótulos exatos) |
| ProcessCommand | dependência externa impossível de reproduzir (parcial — mesmo raciocínio de SendCommand) | acoes-plataforma | não |
| TrackEvent | já suportada | ja-suportada | não |
| ProcessHttp | já suportada (gap: campo OAuth 2.0 não coberto) | ja-suportada | não |
| ManageList | dependência externa impossível de reproduzir (equivalente nativo viável, ver D-20) | acoes-plataforma | não |
| MergeContact | reproduzível no Pipe (mapeia para `contato` existente) | acoes-contexto | não |
| SetVariable | já suportada (gap conhecido: `Expiration` não lido) | ja-suportada | não |
| SetBucket | dependência externa impossível de reproduzir (equivalente nativo viável, ver D-20) | acoes-plataforma | não |
| Redirect | já suportada | ja-suportada | não |
| CreateTicket | já suportada | ja-suportada | não |
| DeleteVariable | já suportada | ja-suportada | sim — PENDENTE-CAPTURA #6 (confirmar visibilidade no menu da Blip real) |
| ProcessContentAssistant | dependência externa impossível de reproduzir (equivalente nativo viável, ver D-20) | acoes-plataforma | não |
| TrackContactsJourney | reproduzível no Pipe (schema já existe; falta só tela de Analytics, fase futura) | acoes-plataforma | não |
| ExecuteTemplate | reproduzível no Pipe | acoes-funcoes | não |
| ExecuteBlipFunction | reproduzível no Pipe (depende da Biblioteca de funções, D-22) | acoes-funcoes | sim — PENDENTE-CAPTURA #7 (ciclo de vida da função: criação, versionamento, import/export) |
| Agente de IA (bloco) | fora do escopo de BUILDER-01..05 explícito — achado de investigação, não pré-aprovado | acoes-contexto | sim — PENDENTE-CAPTURA #1/#2/#3 |

---

## Capturas pendentes (D-03)

1. **Ícones de cada ação** no menu "ADICIONAR FERRAMENTAS" do Builder — não encontrados nos bundles de tradução (só texto, sem asset/nome de ícone associado por ação). Exige captura visual do Builder ao vivo (login do dono) ou leitura do DOM em modo aberto com o menu expandido.
2. **Distinção exata Entrada/Saída/Global por ação** — os bundles de tradução não separam por aba; hoje só é confirmado para as 5 ações já suportadas no Pipe (`acoes-do-bloco.ts`). Exige captura das três abas do editor de ação na Blip ao vivo, ação por ação.
3. **Painel de Teste/Debug** — interface completa (chat de teste, trace por ação, variáveis de teste) não encontrada nos bundles (mesma lacuna de `PAINEL-TestePublicar.md`); investigação própria de D-14 (plano de painéis administrativos), fora do escopo deste inventário de ações.
4. **Assinaturas exatas das funções nativas do `ExecuteScriptV2`** (`request.fetchAsync`, `time`, `context`, `botTimeZone`) e versão ECMAScript exata suportada pelo Jint do `ExecuteScript` — listadas em `catalogo-gatilhos-acoes.md` §8 como não lidas linha a linha; exige leitura adicional do SDK público (`takenet/blip-sdk-csharp`) ou captura de um script real em produção na Blip.
5. **Rótulos exatos do editor** de `SendMessageFromHttp`, `SendCommand` e `SetBucket` — sem chave própria encontrada no bundle de tradução pt-BR/es/en consultado; podem estar em outro arquivo de bundle, ter editor reaproveitado de outra ação, ou nunca terem UI dedicada na versão atual da Blip. Exige captura do Builder ao vivo tentando adicionar cada uma dessas ações.
6. **Visibilidade de `DeleteVariable` no menu real da Blip** — o próprio código do Pipe já registra a suspeita ("o editor da Blip não a oferece no menu, mas o motor a executa"); confirmar contra o Builder ao vivo se a ação aparece no "ADICIONAR FERRAMENTAS" ou só é alcançável via fluxo importado que já a contém.
7. **Ciclo de vida completo da Biblioteca de funções** (D-22): tela de criação/edição da função em si (fora do painel que a consome como ação), versionamento, assinatura de parâmetros/retorno, e se a função é exportada junto do fluxo ou é recurso separado do bot. O bundle de tradução consultado só cobre o painel consumidor (`executeBlipFunction`), não o CRUD da função.
8. **JSON exportado real de um fluxo com as ações não suportadas hoje** — confirmaria o camelCase exato de cada campo de `settings` (os JSONs deste documento são `[INFER]` a partir dos nomes de campo do SDK C#, não confirmados contra um export real). Mesma lacuna já registrada em `catalogo-gatilhos-acoes.md` §8.

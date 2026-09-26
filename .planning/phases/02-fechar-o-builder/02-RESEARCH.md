# Phase 2: Fechar o Builder — Research

**Researched:** 2026-09-24
**Domain:** Editor visual de fluxo conversacional (`apps/gestao-vite/src/paginas/builder`, React/Vite) + motor de execução (`packages/core/src/fluxo`) + API do Builder (`apps/api/src/controladores/gestao-builder.ts`, `apps/api/src/dominio/gestao/builder-do-fluxo.ts`, `apps/api/src/dominio/fluxo.ts`) + contratos (`packages/contracts/src/gestao-fluxo.ts`)
**Confidence:** HIGH para o estado atual do código (lido diretamente nesta sessão); MEDIUM para a paridade exata com a Blip (a evidência é DOM/CSS/JS extraído dos bundles compilados e a documentação oficial, não uma captura fotográfica do Builder renderizado — duas tentativas de fotografar o Builder real da Blip falharam em 23/09, per `PROJECT-HANDOFF.md`); LOW para a decisão de pesquisa de satisfação (nunca fechada, ver Owner Questions).

Não existe `.planning/phases/02-fechar-o-builder/02-CONTEXT.md` no momento desta pesquisa — `/gsd:discuss-phase 2` ainda não rodou. Esta pesquisa não está, portanto, restrita por decisões travadas do dono além do que já está em `PROJECT.md`/`ROADMAP.md`/`REQUIREMENTS.md`.

**Aviso sobre nomenclatura.** A Phase 1 (STD-01..12) ainda não aplicou o rename mecânico em `apps/gestao-vite/src/paginas/builder`, `packages/core/src/fluxo` nem `apps/api/src/dominio/fluxo.ts` — o mapa old→new para esses escopos está em status `proposed` (front/flow-engine, `std/map/gestao-vite.csv`, `std/map/packages-core.csv`) ou `candidate` (API, `std/map/api.csv`), nenhum aprovado no D-03 gate 2. Todo `file:line` abaixo cita o nome **atual** (português). Onde relevante cito o nome futuro entre parênteses: "(renomeado pela Phase 1: `<new>`)". Como a Phase 2 depende da Phase 1 (`ROADMAP.md`), o planner da Phase 2 deve **verificar o mapa aprovado no momento do planejamento**, não assumir que os nomes abaixo ainda serão os nomes de arquivo quando as tasks rodarem.

## Summary

O Builder do Pipe (`apps/gestao-vite/src/paginas/builder/`) já tem um editor funcional: canvas com pan/zoom/arrastar, ligar/desligar setas, menu de contexto (duplicar/copiar/copiar id/excluir), desfazer/refazer, biblioteca de variáveis com busca, publicação com histórico de versões e importar/exportar do formato compatível com a Blip. O gap não é arquitetural — é de **cobertura**: o motor (`packages/core/src/fluxo/acoes.ts`, `editor.ts`) só executa 2 tipos de conteúdo (`text/plain`, `application/vnd.lime.select+json`) e 10 tipos de ação (a Blip real tem 19), a tela só oferece 2 tipos de bloco no menu "Novo bloco" (Padrão/Humano), o seletor de destino de ligação é um `<select>` sem busca, não existe biblioteca de funções do contrato, o painel de Filas é um atalho para fora do Builder (não um painel embutido), não existe painel de Teste (nenhum canal de teste no motor), e as saídas de atendimento humano não expõem a paleta de tags de encerramento (`etiqueta`) nem pesquisa de satisfação. Cada um desses gaps tem uma peça de infraestrutura real por trás faltando (motor, endpoint ou tabela) — nenhum é só "botão que falta na tela".

Há também um bug de canvas suspeito e não coberto por teste (`arestasDe()`, `modelo.ts:421`) e dois achados reais de bug no fluxo de retomada do `ProcessHttp` (diagnosticados em `.planning/debug/process-http-auto-resume.md` e nos todos pendentes) que **não são Phase 2 per se**, mas tocam a mesma superfície (o bloco `ProcessHttp` é editável no Builder) e merecem uma wave própria ou, no mínimo, uma decisão explícita de escopo.

**Recomendação primária:** tratar BUILDER-01 (catálogo de conteúdo/ação) como o item de maior esforço e maior risco de regressão no motor — sequenciar por trás dos itens de UI pura (BUILDER-02 seletor com busca, BUILDER-05 correção do canvas, BUILDER-04 painéis) para entregar valor incremental sem travar tudo atrás da extensão do motor.

## Phase Requirements

| ID | Descrição | Suporte da pesquisa |
|----|-----------|---------------------|
| BUILDER-01 | Atendente pode criar bloco de qualquer tipo de conteúdo/ação previsto, não só texto/menu/quick-reply/ProcessHttp | Motor whitelist em `packages/core/src/fluxo/editor.ts:152-153` e `acoes.ts:233-247`; catálogo de referência real da Blip (19 actions) em `referencias-blip/pesquisa/catalogo-gatilhos-acoes.md` §2.2; lista atual de conteúdo em `conteudo.ts:1-23`; lista atual de ação em `acoes-do-bloco.ts:57-126` |
| BUILDER-02 | Atendente pode buscar variável e função da biblioteca de contrato, e selecionar destino de ligação por pesquisa | Busca de variável já existe (`painel-variaveis.tsx`, `variaveis.ts:84-97`); busca de função **não existe** (nenhuma tabela/contrato de "função" no motor de fluxo — só existe `funcao` como tipo de ação do motor de *workflow*, `packages/db/src/schema/automacao.ts:452`, sistema diferente); seletor de destino é `<Selecao>` (`<select>`) sem busca em `painel-saidas.tsx:57-73` |
| BUILDER-03 | Atendente pode configurar pesquisa de satisfação e usar a paleta de tags completa nas saídas de atendimento humano | Saídas de atendimento fixas em `modelo.ts:129-133` (3 status) + `painel-saidas.tsx:34-38, 83-153`; tabela de tags real é `etiqueta` (`packages/db/src/schema/conversas.ts:486`), já usada em `EncerrarConversaInput` (`packages/contracts/src/encerramento.ts`) mas **não** conectada ao Builder; pesquisa de satisfação sem nenhuma implementação encontrada no builder nem decisão de modelo (nativo Blip vs alternativo) |
| BUILDER-04 | Atendente tem painéis de Gerenciamento de Filas e de Teste com paridade funcional, além de copiar/colar bloco e exportar versão antiga | Copiar/colar bloco **já implementado** (`modelo.ts:342-388`, `canvas.tsx` menu de contexto); Filas é atalho externo (`painel-filas.tsx`); Teste **não existe** (nenhuma referência a canal de teste no builder); exportar versão antiga não coberto — API tem `GET :id/builder/versoes` (`gestao-builder.ts:79-90`) mas nenhum front consome (`grep` vazio em `apps/gestao-vite/src`) |
| BUILDER-05 | Setas do canvas representam corretamente toda ligação salva, com teste cobrindo `arestasDe()` | `arestasDe()` em `modelo.ts:421-434`; chamada única em `canvas.tsx:274`; zero teste cobrindo a função (`apps/gestao-vite/tests/builder-editor.test.ts` grep vazio) |

## Estado atual (file:line)

### Arquitetura do editor

- `apps/gestao-vite/src/paginas/builder/modelo.ts` (renomeado pela Phase 1, proposto: `template.ts` — ver Pitfall 4) é o núcleo puro: tipos `Bloco`/`Mapa`/`Aresta`, leitura/montagem do `DesenhoDoBuilder` (`lerDesenho`/`montarDesenho`, linhas 199-221), criação de bloco padrão/humano (`novoBloco`/`novoBlocoDeAtendimento`, linhas 274-319), ligar/desligar (`ligar`/`desligar`, linhas 439-487), copiar/colar/duplicar (linhas 342-388).
- `estado.ts` é um redutor puro (`reduzir`, linhas 52-107) sobre `Mapa` com pilha de desfazer/refazer (limite 50, linha 21) e flag `sujo`. Todo gesto de edição passa por `aplicar`/`mover`+`soltar`. Ações globais (`aplicarGlobais`) ficam fora da pilha de desfazer.
- `canvas.tsx` desenha o SVG das setas chamando `arestasDe(mapa)` uma única vez (linha 274) e implementa pan/zoom/drag/menu de contexto via Pointer Events.
- `painel.tsx` é a barra lateral do bloco selecionado: 3 abas (Conteúdo/Condições de saída/Ações — atendimento esconde "Ações"), delega para `painel-conteudo.tsx`, `painel-acoes.tsx`, `painel-saidas.tsx`.
- `painel-configuracao.tsx` é o painel "Configuração": só 2 das 3 abas da origem (Ações Globais, Versões) — a aba "Variáveis" da Blip (expiração de estado, timeout de ação, score mínimo de IA) foi deliberadamente omitida porque o motor do Pipe não a implementa (comentário linhas 33-38).
- API: `apps/api/src/controladores/gestao-builder.ts` expõe `GET/PUT :id/builder`, `POST :id/builder/publicar` (409 com `detalhe.erros` se inválido), `GET :id/builder/versoes`, `POST :id/builder/versoes/:versao/restaurar`. Regra em `apps/api/src/dominio/gestao/builder-do-fluxo.ts`. Contratos em `packages/contracts/src/gestao-fluxo.ts:320-375` (`DesenhoDoBuilder`, `ErroDoBloco`, `BuilderDoFluxo`, `RascunhoGravado`, `VersaoPublicada`).
- Front consome só 3 das 4 escritas: `builder-gravar.ts` implementa `salvarRascunho`, `publicarFluxo`, `restaurarVersao` — **não implementa** `listarVersoes` (`GET :id/builder/versoes` nunca é chamado por nenhum arquivo em `apps/gestao-vite/src`, confirmado por grep).

### Catálogo de conteúdo (BUILDER-01, parte 1)

- `packages/core/src/fluxo/editor.ts:152-153`: `CONTEUDOS_SUPORTADOS = new Set(['text/plain', 'application/vnd.lime.select+json'])`; `CONTEUDOS_SEM_EFEITO = new Set(['application/vnd.lime.chatstate+json'])`. Qualquer outro MIME é recusado na publicação (linha 206).
- `apps/gestao-vite/src/paginas/builder/conteudo.ts:1-27`: a tela só cria "Texto" (`novoTexto`), "Menu" (`novoMenu`, sem `scope`) e "Quick reply" (`novoQuickReply`, `scope: 'immediate'`) — os 3 mapeiam para os 2 MIME suportados. Comentário do arquivo lista os tipos que a Blip oferece e o Pipe recusa: Imagem, Áudio, Vídeo, Documento, Figurinha, Carrossel, Conteúdo HTTP, Conteúdo dinâmico, Pesquisa, localização, Web link, Solicitar ligação.
- `referencias-blip/builder/builder/PAINEL-Blocos.md` confirma como referência de UI: menu com opções numeradas/clicáveis, blocos prontos (biblioteca pré-configurada) — não implementados.

### Catálogo de ação (BUILDER-01, parte 2)

- `packages/core/src/fluxo/acoes.ts:233` (`ACOES_DO_MOTOR`): 10 tipos implementados — `SetVariable`, `DeleteVariable`, `SendMessage`, `SendRawMessage`, `TrackEvent`, `CreateTicket`, `ForwardToDesk`, `LeavingFromDesk`, `Redirect`, `ProcessHttp`.
- `apps/gestao-vite/src/paginas/builder/acoes-do-bloco.ts:57-126` (`CATALOGO_DE_ACOES`): só 4 têm editor na tela — `Redirect`, `ProcessHttp`, `SetVariable`, `DeleteVariable`, `TrackEvent` (5, incluindo `TrackEvent`). `SendMessage`/`SendRawMessage` são conteúdo, não ação editável na aba; `ForwardToDesk`/`LeavingFromDesk`/`CreateTicket` são o miolo do bloco "Humano" (criados automaticamente, sem editor — `ACOES_DO_SISTEMA`, linha 151).
- `referencias-blip/pesquisa/catalogo-gatilhos-acoes.md` §2.2 lista as **19 actions reais** do `Take.Blip.Builder` (fonte: `ContainerExtensions.cs`, `[BLIP-SDK]`): `ExecuteScript`, `ExecuteScriptV2`, `SendMessage`, `SendMessageFromHttp`, `SendRawMessage`, `SendCommand`, `ProcessCommand`, `TrackEvent`, `ProcessHttp`, `ManageList`, `MergeContact`, `SetVariable`, `SetBucket`, `Redirect`, `CreateTicket`, `DeleteVariable`, `ProcessContentAssistant`, `TrackContactsJourney`, `ExecuteTemplate`. **11 delas não têm equivalente no motor do Pipe** hoje (`ExecuteScript[V2]`, `SendMessageFromHttp`, `SendCommand`, `ProcessCommand`, `ManageList`, `MergeContact`, `SetBucket`, `ProcessContentAssistant`, `TrackContactsJourney`, `ExecuteTemplate`).
- `docs/builder-cards-pendencias.md` (23/09, a lista mais atual do dono) confirma e restringe o escopo real: "Executar scripts e funções da biblioteca exige suporte seguro no motor e persistência da biblioteca; não basta acrescentar botões" e "A expiração da ação Definir variável aparece na Blip, mas o executor atual do Pipe não utiliza esse campo" — ou seja, BUILDER-01 tem uma dependência de motor, não só de tela, para pelo menos scripts/funções.

### Seletor de destino e biblioteca de contrato (BUILDER-02)

- `painel-saidas.tsx:57-73` (`seletorDeDestino`): usa o componente `<Selecao>` (`<select>` nativo estilizado) listando **todos** os blocos do mapa (`Object.values(mapa)`) sem filtro/busca — usado tanto nas condições de saída normais quanto no "Ir para" da saída padrão e das saídas de atendimento.
- `painel-variaveis.tsx` + `variaveis.ts`: busca **já existe** para variáveis, com duas abas — "Variáveis do sistema" (`VARIAVEIS_DO_SISTEMA`, lista fixa de 8 entradas com provedor real no motor, `variaveis.ts:27-36`) e "Variáveis do usuário" (derivadas do próprio desenho do fluxo, `variaveisDoUsuario`, linhas 66-74). Filtro sem acento/caixa em `filtrarVariaveis`/`filtrarVariaveisDoSistema` (linhas 76-97).
- **Biblioteca de funções não existe**: nenhuma tabela, contrato ou UI de "função" no motor de conversa (`fluxo`). O único uso de `funcao` no schema é como um dos `TIPOS_ACAO` do motor de **workflow** (sistema, sem conversa — `packages/db/src/schema/automacao.ts:443-454`), que é uma máquina diferente (ver `catalogo-gatilhos-acoes.md` §0: "três peças distintas que costumam ser confundidas"). BUILDER-02 pede biblioteca de função **do contrato** — presumivelmente functions reutilizáveis dentro do motor de fluxo (mais perto do `ExecuteScript`/`ExecuteScriptV2` da Blip, que também faltam no motor). Este item tem a mesma dependência de motor que parte de BUILDER-01.

### Saídas de atendimento humano, tags e pesquisa de satisfação (BUILDER-03)

- `modelo.ts:129-133` (`SAIDAS_DE_ATENDIMENTO`): 3 status fixos — `ClosedAttendant`, `ClosedClient`, `ClosedClientInactivity` — mais uma saída de erro (`$isDeskDefaultOutput`, linha 296-302). `painel-saidas.tsx:83-153` também oferece duas saídas customizáveis de disponibilidade (`OutOfAttendanceHour`, `NoAgentAvailable`, `$isDeskCustomOutput`).
- A tabela real de tags de encerramento é `etiqueta` (`packages/db/src/schema/conversas.ts:486`), já usada por `POST /v1/conversas/:id/encerrar` via `EncerrarConversaInput.etiqueta_ids` (`packages/contracts/src/encerramento.ts`). **O Builder não referencia essa tabela em nenhum lugar** — o único conceito de "tag" dentro do Builder é `bloco.$tags` (`painel.tsx:30-51`, `etiquetas-do-bloco.ts`), que são rótulos livres com cor por bloco, sem relação com a tabela `etiqueta`. BUILDER-03 pede que as saídas de atendimento humano possam ramificar/filtrar pela **paleta real de etiquetas de encerramento**, não pelos `$tags` livres do bloco — são dois sistemas de tag diferentes hoje.
- Pesquisa de satisfação: nenhuma referência encontrada em `apps/gestao-vite/src/paginas/builder` (grep vazio). `PROJECT-HANDOFF.md` (seção "Próximas frentes", item 6) registra a decisão como nunca fechada: a Blip tem dois modelos (nativo do Portal, 1-5, só PT-BR, retenção de 3 meses; e um modelo alternativo) e falta decidir se o Pipe replica um, o outro, ou unifica — levantado em pesquisa de 15/09, sem decisão até 24/09. Ver Owner Question 3.

### Painéis de Filas e Teste, copiar/colar, exportar versão antiga (BUILDER-04)

- Copiar/colar bloco: **implementado**. `modelo.ts:342-388` (`copiaDoBloco`, `duplicarBloco`, `textoDoBlocoCopiado`, `blocoDoTextoCopiado`) + `canvas.tsx` menu de contexto (Duplicar/Copiar/Copiar Id/Colar). `docs/builder-cards-pendencias.md` confirma teste de colagem adicionado ("IDs distintos, dados independentes e limite de 15 aplicado à seleção inteira").
- Painel de Filas: `painel-filas.tsx` é **só um atalho** — um card com texto fixo e um botão "Abrir gerenciamento de filas" que navega para `${baseDoAtendimento(...)}/atendentes/filas` (fora do Builder). Comentário do próprio arquivo (linhas 6-10) justifica a decisão: "a listagem, criação, edição, ativação e exclusão já existem em PaginaFilas... manter o formulário aqui duplicaria regras". Isto **não** tem paridade funcional com o painel embutido da Blip (que edita filas sem sair do Builder, per BUILDER-04 e `PAINEIS.md` — "Skills e filas" listado como não encontrado nos bundles também do lado Blip, então a paridade exata de UI da Blip aqui é incerta, mas o requisito do dono é explícito: "paridade funcional").
- Painel de Teste: **não existe**. Nenhuma referência a "teste"/canal de teste no builder (grep vazio em `editor.tsx`). `PROJECT.md` confirma: "a Blip usa um bot real via SDK BlipChat; o Pipe não tem canal de teste no motor e não há spec detalhada ainda" — listado em Out of Scope do PROJECT.md como possível não-trivial. Ver Owner Question 2 (paridade funcional sem canal de teste real é ambíguo).
- Exportar versão antiga: a aba "Versões" atual (`painel-configuracao.tsx`, `AbaDeVersoes`) só importa/exporta o **rascunho atual** (`textoDeExportacao`/`validarImportacao` em `importar-exportar.ts`) — não há UI para listar (`GET :id/builder/versoes`) nem baixar uma versão publicada específica. O endpoint de listagem existe na API mas nenhum código de front o chama (confirmado por grep em `apps/gestao-vite/src`).

### Canvas e setas (BUILDER-05)

- `arestasDe()` (`modelo.ts:421-434`): itera `bloco.$conditionOutputs` de cada bloco; inclui uma aresta quando `saida.stateId` existe, aponta para um bloco presente no mapa, e **não** é `$isDeskDefaultOutput`. Chamada uma única vez em `canvas.tsx:274`.
- A saída padrão (`$defaultOutput`) nunca é desenhada por design — isso **bate** com a Blip: `referencias-blip/builder/builder/PAINEL-Saidas.md` linha 53 confirma textualmente "a seta que liga os blocos não será exibida" para a saída de exceção/padrão. Ou seja, a omissão do `$defaultOutput` no desenho **não é o bug** — é comportamento correto e copiado da origem.
- O que `PROJECT-HANDOFF.md` registra como suspeito é mais amplo: "se uma ligação real do fluxo estiver guardada em outro campo (ação de redirecionamento, saída padrão), a seta pode não aparecer sem que os dados estejam errados". Nesta pesquisa não foi encontrado um segundo campo de destino-para-outro-bloco além de `$conditionOutputs` e `$defaultOutput` no modelo atual (`Redirect.address` aponta para um serviço/bot externo, não para um bloco do mesmo mapa — não é uma aresta interna). **Ninguém rodou uma reprodução ainda**; o achado é de mineração de sessão, não de teste. Ver Pitfall 3 e Owner Question 5 antes de gastar esforço de plano nisto.
- Zero teste cobre `arestasDe()` diretamente — `apps/gestao-vite/tests/builder-editor.test.ts` testa `ligar`/`desligar` (que mutam `$conditionOutputs`) mas não a função de leitura do desenho de setas.

## Padrões

**Editor como função pura sobre um mapa imutável.** Toda função de `modelo.ts`, `condicoes.ts`, `conteudo.ts`, `acoes-do-bloco.ts` recebe o mapa/bloco atual e devolve um novo, nunca muta. `estado.ts` empilha esses mapas para desfazer/refazer. Qualquer extensão de BUILDER-01 (novo tipo de conteúdo/ação) deve seguir esse padrão: uma função pura `novoX(...)` que devolve um `ItemDeConteudo`/`AcaoDoEditor`, mais uma entrada no catálogo (`CATALOGO_DE_ACOES` ou um equivalente para conteúdo) — não introduzir estado mutável ou side-effects na camada de modelo.

**Whitelist dupla (motor + tela).** Cada tipo de conteúdo/ação precisa existir em **dois** lugares concordantes: o motor (`packages/core/src/fluxo/{acoes,editor}.ts`, que decide o que é executável em produção) e a tela (`acoes-do-bloco.ts`/`conteudo.ts`, que decide o que é editável). Isso é deliberado — ver comentário de `acoes-do-bloco.ts:21-27`: "tudo o que o motor não executa aparece só para leitura quando veio de um fluxo importado, com a marca 'Não executada no Pipe'". BUILDER-01 exige extender os dois lados juntos para qualquer tipo que passe a ser criável do zero; um tipo pode, em teoria, ser adicionado só na tela como somente-leitura/importação sem motor, mas isso não cumpre "criar bloco de... tipo previsto" do critério de sucesso.

**Contrato Blip como formato de intercâmbio, não como UI.** `DesenhoDoBuilder` (`{ fluxo, globais }`) mapeia 1:1 para o formato `{ flow, globalActions }` da Blip (`modelo.ts:1-34`, `importar-exportar.ts:5-19`) — chaves com `$` prefixado (`$contentActions`, `$conditionOutputs`, `$defaultOutput`) preservadas literalmente para permitir import/export cruzado. Qualquer novo campo introduzido por BUILDER-01..05 deve preservar essa compatibilidade de formato (não renomear chaves do desenho persistido — isso é dado/contrato existente, fora do escopo mecânico da Phase 1 também, conforme STD-06).

**Dois motores distintos, não confundir.** `referencias-blip/pesquisa/catalogo-gatilhos-acoes.md` §0 é explícito: o motor de **conversa** (`fluxo` → `bloco` → `transicao`, o que o Builder edita) e o motor de **workflow** (sistema, `gatilho`→`acao`, sem interlocutor) são tabelas e execuções diferentes. `funcao`/`agente_ia` como "ação" hoje só existem no motor de workflow. Ao planejar a "biblioteca de funções" de BUILDER-02, decidir explicitamente se ela é nova (motor de conversa) ou se reaproveita/depende do motor de workflow — não presumir que já existe suporte cruzado.

## Don't Hand-Roll

| Problema | Não construir | Usar em vez disso | Por quê |
|---|---|---|---|
| Paleta de tags nas saídas de atendimento | Um novo sistema de tag dentro do Builder | A tabela `etiqueta` já existente (`packages/db/src/schema/conversas.ts:486`) e o mesmo contrato de `EncerrarConversaInput.etiqueta_ids` | Encerramento de ticket já resolveu CRUD, paleta de cor e a regra "só exige tag quando existe tag obrigatória" — duplicar aqui cria duas fontes de verdade de tag |
| Listagem/edição de fila dentro do Builder | Formulário de fila embutido | Link para `PaginaFilas` (já existe, é a decisão registrada em `painel-filas.tsx`) — só evoluir a UX do atalho, não recriar CRUD | Comentário do próprio arquivo já documenta o motivo; recriar duplicaria regra de validação |
| Formato de exportação do fluxo | Um formato de arquivo novo para "versão antiga" | O mesmo `{flow, globalActions}`/`DesenhoDoBuilder` que `textoDeExportacao` já produz, aplicado ao payload de uma versão publicada (`GET :id/builder/versoes`) | Consistência de formato entre rascunho atual e versões antigas evita dois parsers de import |

## Common Pitfalls

### Pitfall 1: ProcessHttp duplica `id_provedor` na retomada e trava a conversa (produção)

**O que dá errado:** ao retomar um `ProcessHttp` suspenso, `executarProcessHttp` (`apps/api/src/dominio/fluxo.ts:529-655`) refaz a mensagem com o mesmo `id_provedor` da suspensão. Como a retomada nunca marca `idProvedorUsado = true`, `gravarPassos` tenta inserir uma segunda linha em `execucao_passo` com o mesmo `(tenant_id, entrada->>'id_provedor')`, violando `execucao_passo_entrada_uk` (`packages/db/src/schema/automacao.ts:375-377`). A transação inteira sofre rollback — a linha em `process_http_execucao` fica presa em `chamando` para sempre, e `rodarFluxoNaEntrada` bloqueia toda nova mensagem daquele contato.
**Por que acontece:** `nova` é sempre `false` numa retomada (`fluxo.ts:267`), então o ramo que marcaria `idProvedorUsado = true` nunca roda.
**Como evitar:** diagnóstico completo com opções de fix em `.planning/debug/process-http-auto-resume.md` (recomendação: opção A, tratar `idProvedorUsado` como `true` também na retomada). **100% reprodutível, qualquer modo de fila (memória ou BullMQ), severidade alta.** Nenhum código foi alterado ainda — é diagnóstico puro.
**Sinal de alerta:** conversa que usa um bloco `ProcessHttp` para de responder após a primeira chamada HTTP que suspende e recebe resposta.
**Nota de escopo:** este bug vive no motor/domínio (`apps/api/src/dominio/fluxo.ts`), não no Builder em si — mas o bloco `ProcessHttp` é editável pelo atendente no Builder (`acoes-do-bloco.ts`), então qualquer fluxo publicado com essa ação está exposto. Ver Owner Question 4 sobre incluir o fix no escopo da Phase 2.

### Pitfall 2: sem varredura de recuperação para `ProcessHttp` travado em modo BullMQ (produção)

**O que dá errado:** `apps/api/src/filas.ts:111-131` só agenda uma varredura de `process_http_execucao` travado quando `modo() === 'memoria' && PIPE_PROCESS_HTTP_EM_MEMORIA === '1'`. Em produção (BullMQ), não existe nenhum `upsertJobScheduler` equivalente — diferente de espelho-CRM, mídia, SLA e dicionário-CRM, que têm varredura periódica registrada.
**Por que acontece:** a varredura foi implementada só para o modo de desenvolvimento/teste.
**Como evitar:** ver `.planning/todos/pending/process-http-bullmq-sweep.md` — adicionar uma varredura periódica com timeout + alerta também para o modo BullMQ.
**Sinal de alerta:** qualquer falha futura no caminho de `ProcessHttp` (rede, bug diferente do Pitfall 1) volta a travar a conversa sem recuperação automática nem alerta, em produção.

### Pitfall 3: `arestasDe()` sem teste e com origem do "bug suspeito" ainda não confirmada

**O que dá errado (potencial, não confirmado):** `arestasDe()` (`modelo.ts:421`) só lê `$conditionOutputs`. A saída padrão (`$defaultOutput`) é intencionalmente omitida — isso bate com a Blip real (`PAINEL-Saidas.md`, "a seta que liga os blocos não será exibida"), então **não tratar isso como bug** sem evidência adicional.
**Por que a suspeita existe:** achado de mineração de sessão (23/09), citado em `PROJECT-HANDOFF.md`, nunca reproduzido com um caso concreto nem coberto por teste.
**Como evitar:** antes de "corrigir", escrever o teste que primeiro comprova o comportamento atual (incluindo o caso do `$defaultOutput`, que deve continuar sem seta) e só then investigar se existe um terceiro campo de destino-para-bloco-interno que hoje escapa de `arestasDe()`. Este research não encontrou um candidato concreto para esse terceiro campo — tratar como investigação aberta dentro da wave, não como fix já especificado.
**Sinal de alerta:** um fluxo importado ou publicado por fora do editor atual com uma ligação salva que nunca aparece como seta, mesmo depois de reabrir o Builder.

### Pitfall 4: mapa de rename da Phase 1 ainda é "proposed", não aprovado — e pelo menos uma proposta parece semanticamente errada

**O que dá errado:** o mapa old→new de `apps/gestao-vite/src/paginas/builder` (`std/map/gestao-vite.csv`) está em status `proposed` (gerado por `codex2`), não aprovado no D-03 gate 2. Uma linha específica é suspeita: `modelo.ts` → `apps/management-vite/src/pages/builder/template.ts`. Neste arquivo, "modelo" não significa "template de mensagem" (que já usa a palavra `template` em outro contexto no glossário, ex. `modelo` → `template` para `packages/core/src/fluxo/modelos.ts`) — é o núcleo de dados do editor (`Bloco`, `Mapa`, `Aresta`, `arestasDe`). Renomear para `template.ts` colidiria semanticamente com o uso real da palavra "template" em `modelos.ts`/`conteudo.ts` (menus/textos).
**Por que acontece:** o mapa foi gerado por tradução automática token-a-token (Codex), sem revisão de contexto por arquivo.
**Como evitar:** o planner da Phase 2 não deve hardcodar `template.ts` como nome de arquivo alvo; verificar o mapa **aprovado** (não o proposto) no momento do planejamento, e se ainda estiver como `template.ts`, sinalizar para a Phase 1 corrigir antes do slice 3c (`01-23`, que renomeia `gestao-vite`).
**Sinal de alerta:** qualquer task da Phase 2 que referencie um caminho de arquivo "final" da Phase 1 sem reconferir o `status` da linha correspondente no CSV.

## Owner Questions

1. **Pesquisa de satisfação: replicar o modelo nativo do Portal Blip (1-5, só PT-BR, retenção 3 meses), o modelo alternativo, ou unificar os dois?** (RESOLVIDO — D-06)
   Levantado em 15/09, nunca fechado (`PROJECT-HANDOFF.md`, "Próximas frentes" item 6). Sem essa decisão, BUILDER-03 não pode ser especificado com precisão.
   **Recomendação:** decidir pelo modelo nativo do Portal (1-5, retenção 3 meses) como MVP — é o caminho de menor esforço e o único com evidência documentada suficiente (`referencias-blip/pesquisa/*` menciona satisfação em vários pontos); tratar "o modelo alternativo" como extensão futura fora da Phase 2 se o dono não tiver preferência forte.

2. **O painel de "Teste" precisa de canal de teste real ligado ao motor (como o SDK BlipChat da Blip), ou basta uma simulação local dentro do Builder?** (RESOLVIDO — D-14: decidir após investigar a referência; execução no servidor em 02-21)
   `PROJECT.md` já registra que "a Blip usa um bot real via SDK BlipChat... o Pipe não tem canal de teste no motor e não há spec detalhada ainda" — isto é potencialmente um item de esforço muito maior que o resto da Phase 2 (exigiria um canal/adaptador novo no motor).
   **Recomendação:** escopar BUILDER-04 "Teste" como uma simulação local (executa o fluxo em memória contra o motor real de `packages/core`, sem canal externo) para a Phase 2, e registrar canal de teste real como item futuro — evita que um requisito pequeno na frase vire o maior item da fase.

3. **A "paleta de tags completa nas saídas de atendimento humano" deve usar a tabela `etiqueta` (a mesma do encerramento de ticket) ou os `bloco.$tags` livres que já existem no Builder?** (RESOLVIDO — D-11, D-12)
   Hoje são dois sistemas de tag sem relação (ver seção "Saídas de atendimento humano" acima). A frase do requisito ("paleta completa") sugere a tabela `etiqueta` real, não os rótulos livres por bloco.
   **Recomendação:** usar a tabela `etiqueta` (consistência com encerramento de ticket, sem duplicar CRUD) — condicionar as saídas de atendimento humano na etiqueta selecionada no encerramento, análogo a `EncerrarConversaInput.etiqueta_ids`.

4. **Os dois achados do `ProcessHttp` (duplicate-key na retomada, sem varredura em BullMQ) entram no escopo da Phase 2, ou ficam para depois, mesmo sendo bugs de produção de alta severidade que afetam o bloco editável pelo Builder?** (RESOLVIDO — D-25, D-26, D-27, D-28)
   São bugs em `apps/api/src/dominio/fluxo.ts` (motor/domínio), não em código de tela do Builder — tecnicamente fora do que BUILDER-01..05 pedem, mas o `ProcessHttp` é a única ação com editor completo hoje e o dono já os tem diagnosticados e prontos para fix (opção A recomendada, é um `if` sem migração de schema).
   **Recomendação:** tratar como uma wave própria e pequena dentro da Phase 2 (ou uma phase decimal 2.1 inserida), já que o diagnóstico está pronto e o fix é de baixo risco — não deixá-los acumular como dívida silenciosa em produção enquanto o resto do Builder evolui.

5. **Vale investir esforço de plano em "corrigir" `arestasDe()` antes de ter um caso reproduzido, ou o item da Phase 2 deve ser só "escrever o teste que caracteriza o comportamento atual" e reabrir como bug separado se o teste revelar um problema real?** (RESOLVIDO — D-29)
   Esta pesquisa não encontrou um campo concreto de "ligação real guardada fora de `$conditionOutputs`" além do `$defaultOutput` (que já está correto por design, conforme evidência Blip). O item do roadmap pode estar descrevendo um risco teórico, não um bug confirmado.
   **Recomendação:** especificar BUILDER-05 como "escrever teste de caracterização para `arestasDe()` cobrindo `$conditionOutputs`, `$defaultOutput` (sem seta) e todo campo de destino hoje conhecido; se o teste passar sem achar gap, fechar o item como validado, não como 'corrigido'" — evita gastar wave inteira caçando um bug fantasma.

## Suggested Waves

Sequenciamento por risco/dependência, do menor para o maior acoplamento com o motor:

1. **Wave A — canvas e seleção (BUILDER-05 + parte de BUILDER-02).** Teste de caracterização de `arestasDe()` (Owner Question 5); seletor de destino com busca (substituir `<Selecao>` simples por um combobox pesquisável em `painel-saidas.tsx`), reaproveitando o padrão de busca já existente em `variaveis.ts`/`painel-variaveis.tsx`. Baixo risco, sem mudança de motor.
2. **Wave B — painéis administrativos (BUILDER-04, exceto Teste).** Exportar versão antiga (consumir `GET :id/builder/versoes`, já existe na API — só falta UI); decidir e evoluir o atalho de Filas conforme Owner Question pendente (se "paridade funcional" exigir edição embutida ou só o atalho melhorado). Copiar/colar já está pronto — sem trabalho aqui além de confirmar cobertura de teste.
3. **Wave C — saídas de atendimento e tags (BUILDER-03).** Depende da decisão do dono (Owner Questions 1 e 3). Conectar a tabela `etiqueta` às saídas de atendimento humano; pesquisa de satisfação como novo tipo de saída/configuração no bloco `desk:`.
4. **Wave D — ProcessHttp fixes (Pitfalls 1 e 2), condicionada à Owner Question 4.** Pequena, isolada, sem dependência das demais waves — pode rodar em paralelo a qualquer uma das anteriores se o dono confirmar que entra no escopo.
5. **Wave E — catálogo de conteúdo/ação no motor (BUILDER-01) e biblioteca de funções (BUILDER-02, parte 2).** Maior esforço e maior risco de regressão (mexe em `packages/core/src/fluxo/acoes.ts`/`editor.ts`, a whitelist dupla motor+tela). Sequenciar por último: cada tipo novo de conteúdo/ação é incremental e pode virar sub-waves (ex.: mídia primeiro — imagem/áudio/documento —, script depois, já que scripts exigem sandbox seguro per `docs/builder-cards-pendencias.md`).
6. **Wave F — regressão final e teste e2e do Builder.** Full gate (typecheck, testes de builder existentes + novos, build), conferência de que nenhum fluxo publicado antes da fase quebra ao reabrir (compatibilidade de formato do `DesenhoDoBuilder`).

Esta é uma sugestão de sequenciamento por dependência técnica — o `/gsd:plan-phase` decide o número e granularidade reais de waves/plans.

## Sources

### Primary (HIGH confidence — lido diretamente nesta sessão)
- `apps/gestao-vite/src/paginas/builder/*` (todos os arquivos citados acima)
- `packages/core/src/fluxo/acoes.ts`, `editor.ts`
- `apps/api/src/controladores/gestao-builder.ts`, `apps/api/src/dominio/fluxo.ts`
- `packages/contracts/src/gestao-fluxo.ts`, `encerramento.ts`
- `packages/db/src/schema/automacao.ts`, `conversas.ts`
- `apps/gestao-vite/tests/builder-editor.test.ts`, `builder-painels.test.ts`
- `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/PROJECT.md`, `PROJECT-HANDOFF.md`
- `.planning/phases/01-.../std/GLOSSARY.md`, `CONVENTIONS-EN.md`, `map/*.csv`
- `.planning/todos/pending/process-http-bullmq-sweep.md`, `process-http-entering-actions.md`
- `.planning/debug/process-http-auto-resume.md`
- `docs/builder-cards-pendencias.md`

### Secondary (MEDIUM confidence — evidência de referência da Blip, DOM/CSS/JS extraído + docs oficiais, não captura fotográfica confirmada do Builder real)
- `referencias-blip/builder/builder/PAINEIS.md`, `PAINEL-Saidas.md`, `PAINEL-Blocos.md`, `PAINEL-Builder.md`, `PAINEL-Atendimento.md`, `PAINEL-Configuracoes.md`, `PAINEL-Variaveis.md`, `PAINEL-TestePublicar.md`
- `referencias-blip/pesquisa/catalogo-gatilhos-acoes.md` (cruza `[BLIP-SDK]` código-fonte real de `takenet/blip-sdk-csharp` com `[TW-CÓDIGO]` do Twenty — marcado por procedência linha a linha no próprio documento)

## Metadata

**Confidence breakdown:**
- Estado atual do código (BUILDER-01..05): HIGH — lido diretamente, com grep de confirmação de ausência (biblioteca de função, painel de teste, consumo de `listarVersoes`)
- Paridade com a Blip: MEDIUM — fonte é DOM/CSS/JS extraído + doc oficial, não captura fotográfica do Builder renderizado (ressalva explícita do próprio `PROJECT-HANDOFF.md`)
- Pesquisa de satisfação: LOW — decisão de produto nunca fechada, sem implementação de referência a comparar
- Bug de `arestasDe()`: LOW — suspeita não reproduzida, sem caso concreto encontrado nesta pesquisa
- Bugs de `ProcessHttp` (Pitfalls 1-2): HIGH — diagnóstico determinístico documentado com rastreamento de código linha a linha em `.planning/debug/process-http-auto-resume.md`

**Research date:** 2026-09-24
**Valid until:** ~14 dias (ou até a Phase 1 aplicar/aprovar o mapa old→new para `gestao-vite`/`packages-core`/`api`, o que invalida os `file:line` citados aqui)

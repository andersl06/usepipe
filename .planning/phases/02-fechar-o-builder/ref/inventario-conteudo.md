# Inventário de conteúdo da referência

**Data da investigação:** 2026-09-26
**Baseline:** referencias-blip/builder/zip19 (2026-09-23)

## Metodologia e limite da evidência

O Builder ao vivo (canvas com blocos, menu "+" de conteúdo aberto por clique) não foi capturado em nenhuma sessão até hoje — duas tentativas de fotografar o Builder real falharam em 23/09 (`PROJECT-HANDOFF.md`), e este executor não tenta logar (regra da tarefa: acesso ao vivo exige login do dono). A evidência usada aqui vem de três fontes, citadas linha a linha:

1. **Bundle de tradução do Builder** (`referencias-blip/builder/builder/zip19/supernova.blip.ai/vendor-app_modules_translate_translationLoaders_sync_recursive_js_.fd90eba8615af397.js`, baseline 23/09) — contém o objeto `builder-tabs-content.media` (módulos 51913/52294, pt-BR; 48305, es-MX) com a lista completa de chaves e rótulos do menu "Conteúdo" do bloco, na ordem em que aparecem no JSON (ordem de inserção de objeto JS, preservada pelo parser — é o sinal mais forte disponível da ordem real do menu, mas não é uma captura de clique confirmada; ver Capturas pendentes).
2. **`portal.js`** do mesmo bundle — confirma os MIME `application/vnd.lime.*` realmente usados em runtime (grep por `vnd.lime`) e o ponto exato onde o card de `satisfaction-survey` é renderizado no chat.
3. **`referencias-blip/pesquisa/blip-api-schemas.md`** — pesquisa prévia (09/2026) de `docs.blip.ai`/`limeprotocol.org`/Help Center, com tabela de content types LIME e campos obrigatórios, marcada `[LIME]`/`[DOC]` por procedência.
4. **`referencias-blip/pesquisa/catalogo-gatilhos-acoes.md`** — catálogo de actions do SDK C# (`Take.Blip.Builder/Actions/*`), usado para as ações relacionadas a conteúdo (`SendMessage`, `SendMessageFromHttp`, `SendRawMessage`).
5. **Estado atual do Pipe** (`apps/gestao-vite/src/paginas/builder/conteudo.ts`, `packages/core/src/fluxo/editor.ts`, `apps/api/src/dominio/fluxo.ts`, `apps/workers/src/whatsapp/midia.ts`, `apps/workers/src/whatsapp/interativo.ts`, `apps/workers/src/instagram.ts`, `apps/workers/src/messenger.ts`) — não é evidência da Blip, é a capacidade real do Pipe hoje, registrada à parte (D-18 proíbe usar isso para decidir o catálogo).

Nenhum código, CSS, ícone ou imagem da Blip é transcrito (D-33): as tabelas abaixo citam só nome de campo, texto visível (rótulo/erro) e comportamento.

## Tipos de conteúdo do menu (ordem observada no bundle)

| # | Chave (bundle) | Rótulo pt-BR | Fonte |
|---|---|---|---|
| 1 | `sticker` | Figurinha | vendor-...translationLoaders...js, módulo 52294, `builder-tabs-content.media.sticker` |
| 2 | `audio` | Áudio | idem, `.media.audio` |
| 3 | `image` | Imagem | idem, `.media.image` |
| 4 | `video` | Vídeo | idem, `.media.video` |
| 5 | `document` | Documento | idem, `.media.document` |
| 6 | `chatState` | Digitando | idem, `.media.chatState` |
| 7 | `userInput` | Entrada do usuário | idem, `.media.userInput` |
| 8 | `askLocation` | Pedir localização | idem, `.media.askLocation` |
| 9 | `sendLocation` | Enviar localização | idem, `.media.sendLocation` |
| 10 | `webLink` | Web link | idem, `.media.webLink` |
| 11 | `text` | Texto | idem, `.media.text` |
| 12 | `quickReply` | Quick reply | idem, `.media.quickReply` |
| 13 | `menu` | Menu | idem, `.media.menu` |
| 14 | `carousel` | Carrossel | idem, `.media.carousel` |
| 15 | `httpContent` | Conteúdo HTTP | idem, `.media.httpContent` |
| 16 | `rawContent` | Conteúdo dinâmico | idem, `.media.rawContent` |
| 17 | `survey` | Pesquisa | idem, `.media.survey` |
| 18 | `receiveCallRequest` | Solicitar ligação | idem, `.media.receiveCallRequest` |

Todos os 15 nomes mínimos exigidos por D-18 estão cobertos: texto (11), quick reply (12), imagem (3), carrossel (14), menu (13), digitando/chat state (6), áudio (2), vídeo (4), documento (5), figurinha (1), enviar localização (9), solicitar localização (8, rótulo real "Pedir localização"), web link (10), conteúdo HTTP (15), Conteúdo Dinâmico (16), pesquisa (17), solicitar ligação (18). Nenhum tipo foi filtrado por limitação do motor do Pipe (D-18) — os 18 aparecem, incluindo os que o Pipe hoje recusa.

O mesmo objeto existe em es-MX (módulo 48305: `sticker: "Sticker"`, `askLocation: "Solicitar ubicación"`, `receiveCallRequest: "Solicitar llamada"`, mesmas 18 chaves, mesma ordem) e em inglês (não extraído nesta rodada — grep confirma só es-MX/pt-BR citados acima; ver Capturas pendentes #1 para o texto em inglês, embutido no mesmo tipo de arquivo, módulo diferente).

**Nota de limite (D-03):** a ordem de chaves de um objeto JSON não é prova fotográfica de que o menu clicável renderiza os itens nessa sequência exata (o componente de UI pode reordenar por array separado). É a melhor evidência textual disponível sem login ao vivo — ver Capturas pendentes #2.

## Diferenças 23/09 → referência atual (D-02)

Nenhuma captura da referência **ao vivo, na data de hoje** foi possível nesta investigação (login do dono é exigido e este executor não tenta logar). A única data central disponível é a baseline de 23/09 (`zip19`) e a pesquisa API/Help Center registrada em `blip-api-schemas.md`, cujo próprio levantamento é de 09/09 e 09/10/2026 — ou seja, **anterior** à baseline de 23/09, não posterior. Não há, portanto, evidência de mudança entre 23/09 e "hoje" (26/09) a registrar: o intervalo é de 3 dias e nenhuma fonte nova consultada nesta sessão contradiz o que a baseline mostra.

O que esta investigação **confirma como consistente** entre as duas fontes (baseline 23/09 e pesquisa API de 09/2026, portanto sem diferença detectada):
- Os MIME `application/vnd.lime.*` do catálogo LIME (`blip-api-schemas.md` §1.3) batem com os grants por `vnd.lime` encontrados em `portal.js` do zip19 (chatstate, media-link, web-link, location, select, document-select, satisfaction-survey e outros — ver seção de tipos abaixo).
- Os limites de menu (10 opções × 24 caracteres) e quick reply (3 opções × 20 caracteres) aparecem tanto no bundle do Builder (`builder-tabs-content.limitMenuWhastApp`/`limitQuikReplyWhastApp`) quanto, de forma independente, na documentação já citada pelo próprio Pipe em `apps/workers/src/whatsapp/interativo.ts` (que cita a ficha do canal WhatsApp da origem).

O que **não pôde ser comparado** por falta de acesso ao vivo: existência de tipos de conteúdo novos lançados pela Blip depois de 23/09, mudança de rótulo/ordem do menu, ou remoção de algum dos 18 itens listados acima. Ver Capturas pendentes #2.

## Tipos de conteúdo (detalhe por tipo)

Cada seção segue a mesma posição do menu listada acima. Os 15 rótulos fixos exigidos (D-18/Task 2) são preenchidos onde há fonte; sem fonte suficiente, o valor é `PENDENTE-CAPTURA #N`, listado em "Capturas pendentes (D-03)".

### Figurinha

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Figurinha" (`sticker`), item 1 de 18 no objeto `builder-tabs-content.media` |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | PENDENTE-CAPTURA #4 |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | `uri` obrigatório (definição do `media-link`, blip-api-schemas.md §1.3); `type`, `size`, `previewUri`, `title`, `text` opcionais |
| Limites (tamanho/quantidade) | sem fonte de limite específico da Blip para figurinha; `apps/workers/src/whatsapp/midia.ts` (Pipe) não modela este tipo em `TipoMidia` — ver #19 |
| MIME e formato serializado | `application/vnd.lime.media-link+json`, com `type` = MIME real do arquivo (ex. `image/webp`) dentro de `content`, no `settings` do `SendMessage` |
| Validações e mensagens de erro | PENDENTE-CAPTURA #19 |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | PENDENTE-CAPTURA |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | `SendMessage` com `type` = MIME do `media-link` (catalogo-gatilhos-acoes.md); a referência não distingue "Figurinha" de outros `media-link` além do MIME do arquivo enviado |
| WhatsApp | Pipe hoje: não suportado — `CONTEUDOS_SUPORTADOS` (`packages/core/src/fluxo/editor.ts:152`) não inclui `media-link`; `TipoMidia` (`midia.ts:15`) não tem variante de figurinha |
| Instagram | Pipe hoje: não suportado — `ANEXO` (`apps/workers/src/instagram.ts:41`) não tem chave de figurinha |
| Messenger | Pipe hoje: não suportado — `ANEXO` (`apps/workers/src/messenger.ts:5`) não tem chave de figurinha |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.sticker`); `blip-api-schemas.md` §1.3; `catalogo-gatilhos-acoes.md` (`SendMessage`); `packages/core/src/fluxo/editor.ts:152`, `apps/workers/src/whatsapp/midia.ts`, `apps/workers/src/instagram.ts`, `apps/workers/src/messenger.ts` (Pipe hoje) |

### Áudio

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Áudio" (`audio`), item 2 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | PENDENTE-CAPTURA #5 |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | `uri` obrigatório (`media-link`, blip-api-schemas.md §1.3); demais campos opcionais |
| Limites (tamanho/quantidade) | **16 MB** (documentado pela Blip); formatos aceitos pela política atual do Pipe: aac, midi, mp3, mp4, mpeg, wav, ogg, wma, webm, opus, x-aac, amr — lista marcada como não fechada pela pesquisa original (`regras-blip.md` §1.6, citada em `apps/workers/src/whatsapp/midia.ts:6-13,39-51`) |
| MIME e formato serializado | `application/vnd.lime.media-link+json`, `type` = MIME real do áudio (ex. `audio/mp3`) |
| Validações e mensagens de erro | rejeição por formato/tamanho fora da política (`validarMidia`, `midia.ts`); mensagens exatas da referência: PENDENTE-CAPTURA #19 |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | PENDENTE-CAPTURA |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | `SendMessage` com `type` = MIME do `media-link` (catalogo-gatilhos-acoes.md) |
| WhatsApp | Pipe hoje: o motor do Builder recusa (`editor.ts:152` só permite `text/plain`/`select`); a infraestrutura de validação/envio de áudio já existe fora do motor de fluxo, para mensagens ativas/campanhas (`apps/workers/src/entrega.ts:15-16,85-88,318-321` usa `validarMidia`/`TipoMidia`) — peça de canal existe, não está ligada ao Builder |
| Instagram | Pipe hoje: suportado no envio do Desk/atendimento via `ANEXO.audio` (`apps/workers/src/instagram.ts:41`), não a partir do motor de fluxo do Builder |
| Messenger | Pipe hoje: idem, `ANEXO.audio` (`apps/workers/src/messenger.ts:5`) |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.audio`); `blip-api-schemas.md` §1.3; `regras-blip.md` §1.6; `apps/workers/src/whatsapp/midia.ts`, `entrega.ts`, `instagram.ts`, `messenger.ts` (Pipe hoje) |

### Imagem

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Imagem" (`image`), item 3 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | botão "Definir imagem" confirmado (`ui.uploadButton.title`, mesmo bundle, texto alternativo "Imagem"); layout completo do card: PENDENTE-CAPTURA #8 |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | `uri` obrigatório (`media-link`, blip-api-schemas.md §1.3); demais campos opcionais |
| Limites (tamanho/quantidade) | formatos aceitos pela política atual do Pipe: gif, jpeg, jpg, jfif, png, svg+xml, tiff, vnd.dwg, webp; **sem teto de tamanho documentado** para imagem (`regras-blip.md` §1.6, citada em `midia.ts:9-11,28-38`) |
| MIME e formato serializado | `application/vnd.lime.media-link+json`, `type` = MIME real da imagem (ex. `image/png`) |
| Validações e mensagens de erro | rejeição por formato fora da política (`validarMidia`); mensagens exatas da referência: PENDENTE-CAPTURA #19 |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | PENDENTE-CAPTURA |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | `SendMessage` com `type` = MIME do `media-link` (catalogo-gatilhos-acoes.md) |
| WhatsApp | Pipe hoje: motor do Builder recusa (`editor.ts:152`); infraestrutura de validação/envio já existe fora do motor de fluxo (`entrega.ts`/`midia.ts`) |
| Instagram | Pipe hoje: suportado no envio do Desk/atendimento via `ANEXO.imagem` (`instagram.ts:41`), não a partir do motor de fluxo |
| Messenger | Pipe hoje: idem, `ANEXO.imagem` (`messenger.ts:5`) |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.image`, `ui.uploadButton`); `blip-api-schemas.md` §1.3; `regras-blip.md` §1.6; `midia.ts`, `entrega.ts`, `instagram.ts`, `messenger.ts` (Pipe hoje) |

### Vídeo

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Vídeo" (`video`), item 4 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | PENDENTE-CAPTURA #6 |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | `uri` obrigatório (`media-link`, blip-api-schemas.md §1.3); demais campos opcionais |
| Limites (tamanho/quantidade) | **16 MB**; formatos aceitos pela política atual do Pipe: 3gpp, avi, mpeg, mpg, mp4, mov/quicktime, m4v, wmv, webm (`regras-blip.md` §1.6, citada em `midia.ts:9-11,53-63`) |
| MIME e formato serializado | `application/vnd.lime.media-link+json`, `type` = MIME real do vídeo (ex. `video/mp4`) |
| Validações e mensagens de erro | rejeição por formato/tamanho fora da política (`validarMidia`); mensagens exatas da referência: PENDENTE-CAPTURA #19 |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | PENDENTE-CAPTURA |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | `SendMessage` com `type` = MIME do `media-link` (catalogo-gatilhos-acoes.md) |
| WhatsApp | Pipe hoje: motor do Builder recusa (`editor.ts:152`); infraestrutura de validação/envio já existe fora do motor de fluxo (`entrega.ts`/`midia.ts`) |
| Instagram | Pipe hoje: suportado no envio do Desk/atendimento via `ANEXO.video` (`instagram.ts:41`), não a partir do motor de fluxo |
| Messenger | Pipe hoje: idem, `ANEXO.video` (`messenger.ts:5`) |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.video`); `blip-api-schemas.md` §1.3; `regras-blip.md` §1.6; `midia.ts`, `entrega.ts`, `instagram.ts`, `messenger.ts` (Pipe hoje) |

### Documento

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Documento" (`document`), item 5 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | PENDENTE-CAPTURA #7 |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | `uri` obrigatório (`media-link`, blip-api-schemas.md §1.3); demais campos opcionais |
| Limites (tamanho/quantidade) | **100 MB**; formatos aceitos pela política atual do Pipe: pdf, xls/xlsx, doc/docx, ppt/pptx, msg (outlook), zip, rar (dois MIME), csv, html, text/plain (`regras-blip.md` §1.6, citada em `midia.ts:9-11,66-79,84-86`) |
| MIME e formato serializado | `application/vnd.lime.media-link+json`, `type` = MIME real do documento (ex. `application/pdf`) |
| Validações e mensagens de erro | rejeição por formato/tamanho fora da política (`validarMidia`); mensagens exatas da referência: PENDENTE-CAPTURA #19 |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | PENDENTE-CAPTURA |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | `SendMessage` com `type` = MIME do `media-link` (catalogo-gatilhos-acoes.md) |
| WhatsApp | Pipe hoje: motor do Builder recusa (`editor.ts:152`); infraestrutura de validação/envio já existe fora do motor de fluxo (`entrega.ts`/`midia.ts`) |
| Instagram | Pipe hoje: suportado no envio do Desk/atendimento via `ANEXO.documento` → `type: 'file'` (`instagram.ts:41`), não a partir do motor de fluxo |
| Messenger | Pipe hoje: idem, `ANEXO.documento` → `type: 'file'` (`messenger.ts:5`) |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.document`); `blip-api-schemas.md` §1.3; `regras-blip.md` §1.6; `midia.ts`, `entrega.ts`, `instagram.ts`, `messenger.ts` (Pipe hoje) |

### Digitando

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Digitando" (`chatState`), item 6 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | não informado pela fonte disponível — o LIME define só o campo `state` (ver Obrigatórios/opcionais); layout de seleção do estado: PENDENTE-CAPTURA |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | **`state`** obrigatório: `starting`\|`composing`\|`paused`\|`deleting`\|`gone` (`blip-api-schemas.md` §1.3, `[LIME]`) |
| Limites (tamanho/quantidade) | nenhum limite de tamanho aplicável (não carrega conteúdo textual/binário) |
| MIME e formato serializado | `application/vnd.lime.chatstate+json`, `content: { "state": "composing" }` |
| Validações e mensagens de erro | não informado pela fonte disponível |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | não aplicável (campo `state` é um enum fechado, não texto livre) |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | `SendMessage` com `type = ChatState` **não gera Id e faz `Task.Delay(interval)`** — é assim que o "digitando…" bloqueia o fluxo por um tempo antes de continuar (`catalogo-gatilhos-acoes.md` linha 259, `[BLIP-SDK]`) |
| WhatsApp | Pipe hoje: aceito mas **roda sem efeito** — `CONTEUDOS_SEM_EFEITO` (`editor.ts:153`) |
| Instagram | Pipe hoje: idem (mesma whitelist do motor, não há tratamento por canal) |
| Messenger | Pipe hoje: idem |
| Canal sem suporte (referência) | não aplicável — LIME nativo, suportado por definição em todo canal que implementa a spec; comportamento por canal real (delay percebido): PENDENTE-CAPTURA |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.chatState`); `portal.js` (grep `vnd.lime.chatstate`); `blip-api-schemas.md` §1.3; `catalogo-gatilhos-acoes.md` linha 259; `packages/core/src/fluxo/editor.ts:153` (Pipe hoje) |

### Entrada do usuário

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Entrada do usuário" (`userInput`), item 7 de 18 — não é uma fala do robô, marca o ponto de "aguardar resposta" do bloco |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | confirmado pelo bundle (`builder-tabs-content`): "Validar a entrada do usuário" (`validateUserInput`), "Salvar resposta em variável" (`inputToVariable`) com dica `Para incluir esta variável no fluxo, utilize {{NomeDaVariável}}` (`inputToVariableInfo`), "Definir tempo de inatividade" (`inactivityTime`) com aviso "Defina o tempo máximo para esperar uma resposta do usuário..." (`inactivityTimeInfo`), campo "Limite de espera (em minutos)" (`timeLimit`), "Tipo de validação" (`userValidation`), "Instrução de validação" (`errorMsg`), alternância "Aguardando resposta do usuário" / "Ir direto para o próximo passo" (`hasUserInput`/`noUserInput`) |
| Valores padrão | tempo de inatividade não pode ser ativado no bloco de início (`inputShouldNotBeActive`: "Não é possível ativar o tempo de inatividade no bloco de início") |
| Obrigatórios/opcionais | tempo de inatividade exige valor quando ativado (`InputIsEmpty`: "Informe um tempo de inatividade") |
| Limites (tamanho/quantidade) | tempo de espera entre 1 e 1380 minutos (`timeLimitRange`: "Utilize números entre 1 e 1380") |
| MIME e formato serializado | corresponde ao LIME `application/vnd.lime.input+json` (`[DOC]`, `blip-api-schemas.md` §1.3: campos `label{type,value}`, `validation{rule}`) — associação inferida pelo nome/comportamento, não confirmada linha a linha; ver #15 |
| Validações e mensagens de erro | "Utilize apenas números" (`inputIsNotANumber`), "Utilize apenas números inteiros" (`inputIsDecimal`), tipos de validação com mensagem própria: `date` "Por favor, utilize o formato DD/MM/YYYY", `number` "Digite um número válido", `regex` "Digite de acordo com o padrão acima", `text` "Digite um texto", desconhecido "Não entendi, formato não esperado" |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | confirmado — resposta salva em variável referenciável como `{{NomeDaVariável}}` (`inputToVariableInfo`) |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | não documentado como ação separada nas fontes lidas — é um atributo do bloco (`input`), não uma `Action` do catálogo de 19 (`catalogo-gatilhos-acoes.md` linha 232) |
| WhatsApp | Pipe hoje: implementado de forma equivalente — `temEntrada`/`input.type` em `apps/gestao-vite/src/paginas/builder/conteudo.ts`, mas sem os campos de validação por tipo/tempo de inatividade acima |
| Instagram | Pipe hoje: mesmo mecanismo genérico do bloco (não específico de canal) |
| Messenger | Pipe hoje: idem |
| Canal sem suporte (referência) | não aplicável — é comportamento do bot, não do canal |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`builder-tabs-content.*`); `blip-api-schemas.md` §1.3 (`vnd.lime.input+json`); `apps/gestao-vite/src/paginas/builder/conteudo.ts` (Pipe hoje) |

### Pedir localização

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Pedir localização" (`askLocation`), item 8 de 18 — corresponde a "solicitar localização" citado em D-18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | PENDENTE-CAPTURA #11 |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | não informado pela fonte disponível |
| Limites (tamanho/quantidade) | não aplicável / não informado |
| MIME e formato serializado | não confirmado — pode ser uma variação de `application/vnd.lime.input+json` com `validation.rule` de localização, ou um envelope próprio da Blip; nenhuma fonte lida confirma o MIME exato — ver #11 |
| Validações e mensagens de erro | PENDENTE-CAPTURA #19 |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | PENDENTE-CAPTURA |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | PENDENTE-CAPTURA #16 |
| WhatsApp | Pipe hoje: não suportado — nenhum tratamento de localização em `editor.ts`/`entrega.ts`/`midia.ts` |
| Instagram | Pipe hoje: não suportado — grep vazio em `instagram.ts` |
| Messenger | Pipe hoje: não suportado — grep vazio em `messenger.ts` |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.askLocation`) |

### Enviar localização

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Enviar localização" (`sendLocation`), item 9 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | PENDENTE-CAPTURA #11 (provavelmente campos de latitude/longitude fixos ou por variável, mais mapa/preview — não confirmado) |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | **`latitude`** e **`longitude`** obrigatórios; `altitude`, `course`, `accuracy`, `speed` opcionais (`blip-api-schemas.md` §1.3, `[LIME]`) |
| Limites (tamanho/quantidade) | `latitude` entre −90 e 90; `longitude` entre −180 e 180 (`blip-api-schemas.md` §1.3) |
| MIME e formato serializado | `application/vnd.lime.location+json`, `content: { "latitude": -19.9, "longitude": -43.9 }` |
| Validações e mensagens de erro | PENDENTE-CAPTURA #19 (mensagem de coordenada fora do intervalo, se houver) |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | PENDENTE-CAPTURA (se lat/long podem vir de variável do fluxo) |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | `SendMessage` com `type = application/vnd.lime.location+json` (mesmo mecanismo de `SendMessage`, `catalogo-gatilhos-acoes.md` linha 259) |
| WhatsApp | Pipe hoje: não suportado — `editor.ts:152` não inclui `location` |
| Instagram | Pipe hoje: não suportado — grep vazio em `instagram.ts` |
| Messenger | Pipe hoje: não suportado — grep vazio em `messenger.ts` |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.sendLocation`); `blip-api-schemas.md` §1.3 (`[LIME]`); `catalogo-gatilhos-acoes.md` linha 259 |

### Web link

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Web link" (`webLink`), item 10 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | PENDENTE-CAPTURA #12; campo de URL com dica de variável confirmado em contexto próximo (message template, feature distinta): "Você pode adicionar até uma variável `{{variableExample}}` para criar um link personalizado" — mesma convenção `{{}}` do restante do Builder, não confirmado que o card de Web link do bloco (distinto do template de mensagem) tenha o texto idêntico |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | **`uri`** obrigatório; `previewUri`, `previewType`, `title`, `text`, `target` (`blank`\|`self`\|`selfCompact`\|`selfTall`) opcionais (`blip-api-schemas.md` §1.3, `[LIME]`) |
| Limites (tamanho/quantidade) | não informado pela fonte disponível para o card do bloco; no contexto de template de mensagem (feature distinta) o erro de URL longa é "Máximo de 2000 caracteres" — não confirmado como o mesmo limite do Web link do Builder |
| MIME e formato serializado | `application/vnd.lime.web-link+json`, `content: { "uri": "https://...", "text": "...", "target": "blank" }` |
| Validações e mensagens de erro | "URL inválida" confirmado no contexto de template de mensagem (`invalidUrl`); aplicação ao card de Web link do bloco: PENDENTE-CAPTURA #19 |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | PENDENTE-CAPTURA (ver nota acima) |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | `SendMessage` com `type = application/vnd.lime.web-link+json` (mesmo mecanismo de `SendMessage`) |
| WhatsApp | Pipe hoje: não suportado — `editor.ts:152` não inclui `web-link` |
| Instagram | Pipe hoje: não suportado — grep vazio em `instagram.ts` |
| Messenger | Pipe hoje: não suportado — grep vazio em `messenger.ts` |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.webLink`); `blip-api-schemas.md` §1.3 (`[LIME]`); mesmo bundle, contexto de template de mensagem (`invalidUrl`, `invalidUrlLength`) — feature distinta, citada só para o texto de erro conhecido |

### Texto

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Texto" (`text`), item 11 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | PENDENTE-CAPTURA #14 (layout exato do card); mecanismo de variável confirmado: `{{NomeDaVariável}}` (`inputToVariableInfo`, mesmo bundle) |
| Valores padrão | conteúdo vazio (`novoTexto` do Pipe usa `''` como padrão, `conteudo.ts:314` — reflete a prática comum, não uma confirmação direta da referência) |
| Obrigatórios/opcionais | o próprio `content` é a string (`text/plain`, `blip-api-schemas.md` §1.3) — sem sub-campos |
| Limites (tamanho/quantidade) | limite de 25 conteúdos por bloco, compartilhado por todos os tipos (`limitReached`: "Limite de 25 conteúdos atingido", já implementado no Pipe como `LIMITE_DE_CONTEUDOS = 25`, `conteudo.ts:26`) |
| MIME e formato serializado | `text/plain`, `content` é a própria string |
| Validações e mensagens de erro | nenhuma validação de campo própria além do limite de conteúdos por bloco |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | confirmado — `{{NomeDaVariável}}` |
| Import/export | mesmo formato `{flow, globalActions}` já usado pelo Pipe (`DesenhoDoBuilder`, `packages/contracts/src/gestao-fluxo.ts:320-323`) |
| Execução no motor | `SendMessage` com `type = text/plain` |
| WhatsApp | Pipe hoje: suportado — `CONTEUDOS_SUPORTADOS` (`editor.ts:152`), `textoParaOCanal` (`apps/api/src/dominio/fluxo.ts`) |
| Instagram | Pipe hoje: suportado — `ConteudoInstagram` tipo `'texto'` (`instagram.ts:23-24`) |
| Messenger | Pipe hoje: suportado — `ConteudoMessenger` tipo `'texto'` (`messenger.ts:2`) |
| Canal sem suporte (referência) | não aplicável — suportado universalmente |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.text`, `inputToVariableInfo`, `limitReached`); `blip-api-schemas.md` §1.3; `packages/core/src/fluxo/editor.ts`, `apps/api/src/dominio/fluxo.ts`, `apps/gestao-vite/src/paginas/builder/conteudo.ts`, `instagram.ts`, `messenger.ts` (Pipe hoje) |

### Quick reply

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Quick reply" (`quickReply`), item 12 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | texto + lista de opções, confirmado indiretamente pela estrutura `options[]` do LIME (`text`, `order`, `value`) |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | **`options[]`**, cada opção com **`text`** obrigatório e `order`/`type`/`value` opcionais; `text` (do card) e `scope` opcionais no nível do documento (`blip-api-schemas.md` §1.3) |
| Limites (tamanho/quantidade) | **até 3 opções, 20 caracteres cada** — confirmado em dois locais independentes: bundle do Builder (`limitQuikReplyWhastApp`: "Para WhastApp, defina até 3 opções para o Quick Reply, com até 20 caracteres cada") e `apps/gestao-vite/src/paginas/builder/conteudo.ts:27` (`LIMITE_DO_QUICK_REPLY = { opcoes: 3, caracteres: 20 }`, já implementado no Pipe) |
| MIME e formato serializado | `application/vnd.lime.select+json`, `scope: "immediate"`, `content: { "text": "...", "scope": "immediate", "options": [{ "text": "..." }] }` (`conteudo.ts:155`) |
| Validações e mensagens de erro | limite de 25 conteúdos por bloco (compartilhado); aviso de limite específico do WhatsApp citado acima; mensagens de erro por opção: PENDENTE-CAPTURA #19 |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | PENDENTE-CAPTURA (se o texto das opções aceita `{{variável}}`) |
| Import/export | mesmo formato `{flow, globalActions}` |
| Execução no motor | `SendMessage` com `type = application/vnd.lime.select+json`; documentação do link "Criando mensagens interativas no WhatsApp" (`documentantionLink`, `help.blip.ai/hc/pt-br/articles/4474418203287`) |
| WhatsApp | Pipe hoje: suportado — `formatoDaPergunta` converte para botões quando `opcoes <= 3` (`apps/workers/src/whatsapp/interativo.ts:37-42`), com fallback para texto numerado |
| Instagram | Pipe hoje: não suportado como estrutura interativa — sem tratamento de `select` em `instagram.ts` (cai para texto via `textoParaOCanal` antes de chegar ao worker) |
| Messenger | Pipe hoje: idem |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.quickReply`, `limitQuikReplyWhastApp`, `documentantionLink`); `blip-api-schemas.md` §1.3; `apps/gestao-vite/src/paginas/builder/conteudo.ts`, `apps/workers/src/whatsapp/interativo.ts` (Pipe hoje, já em paridade de limites) |

### Menu

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Menu" (`menu`), item 13 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | texto + lista de opções (mesma estrutura `options[]` do LIME) |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | **`options[]`**, cada opção com **`text`** obrigatório; `text` (do card) e `scope` opcionais (`blip-api-schemas.md` §1.3) |
| Limites (tamanho/quantidade) | **até 10 opções, 24 caracteres cada** — confirmado no bundle (`limitMenuWhastApp`: "Para WhastApp, defina até 10 opções para o menu, com no máximo 24 caracteres cada") e em `apps/gestao-vite/src/paginas/builder/conteudo.ts:27` (`LIMITE_DO_MENU = { opcoes: 10, caracteres: 24 }`, já implementado no Pipe) |
| MIME e formato serializado | `application/vnd.lime.select+json`, sem `scope` (persistente/padrão), `content: { "text": "...", "options": [{ "text": "..." }] }` (`conteudo.ts:150`) |
| Validações e mensagens de erro | limite de 25 conteúdos por bloco (compartilhado); aviso de limite do WhatsApp citado acima; existe também `application/vnd.lime.document-select+json` — variante do menu cujas opções são documentos, com `hasBoxMenus` confirmado em `portal.js` (não confirmado se é o mesmo "Menu" do menu de conteúdo ou uma variante ligada ao Carrossel — ver #9) |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | PENDENTE-CAPTURA |
| Import/export | mesmo formato `{flow, globalActions}` |
| Execução no motor | `SendMessage` com `type = application/vnd.lime.select+json` |
| WhatsApp | Pipe hoje: suportado — `formatoDaPergunta` converte para lista quando `opcoes <= 10` (`interativo.ts:37-42`), com fallback para texto numerado |
| Instagram | Pipe hoje: não suportado como estrutura interativa |
| Messenger | Pipe hoje: não suportado como estrutura interativa |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.menu`, `limitMenuWhastApp`); `blip-api-schemas.md` §1.3; `portal.js` (`document-select`, `hasBoxMenus`); `apps/gestao-vite/src/paginas/builder/conteudo.ts`, `apps/workers/src/whatsapp/interativo.ts` (Pipe hoje, já em paridade de limites) |

### Carrossel

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Carrossel" (`carousel`), item 14 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | PENDENTE-CAPTURA #9; hipótese não confirmada: pode reaproveitar `application/vnd.lime.document-select+json` (menu com opções tipo documento, `hasBoxMenus` confirmado em `portal.js`) ou `application/vnd.lime.collection+json` (`itemType`+`items[]`, `blip-api-schemas.md` §1.3) — nenhuma das duas foi confirmada como o formato exato do card "Carrossel" do bloco |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | se `document-select`: `options[]` com `label{type,value}`/`value{type,value}` obrigatórios (`blip-api-schemas.md` §1.3); se `collection`: `itemType`+`items[]` obrigatórios — não confirmado qual se aplica |
| Limites (tamanho/quantidade) | não informado pela fonte disponível (o carrossel de **template de mensagem**, feature distinta, exige "bodyText + ≥ 2 cards" — não confirmado como o mesmo limite do Carrossel do bloco) |
| MIME e formato serializado | PENDENTE-CAPTURA #9 (ver hipóteses acima) |
| Validações e mensagens de erro | PENDENTE-CAPTURA #19 |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | PENDENTE-CAPTURA |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | PENDENTE-CAPTURA #16 |
| WhatsApp | Pipe hoje: não suportado — nenhum tratamento de carrossel no motor de fluxo nem nos workers de canal |
| Instagram | Pipe hoje: não suportado |
| Messenger | Pipe hoje: não suportado |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.carousel`); `portal.js` (`document-select`, `hasBoxMenus`); `blip-api-schemas.md` §1.3 (`collection`); `blip-conteudos-templates.md` (carrossel de template de mensagem, feature distinta, citada só por analogia) |

### Conteúdo HTTP

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Conteúdo HTTP" (`httpContent`), item 15 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | PENDENTE-CAPTURA #10; hipótese fundamentada: o nome e o comportamento batem com a action `SendMessageFromHttp` do SDK (busca conteúdo por HTTP GET e envia como mensagem), cujos campos confirmados são **`Uri`**, **`Type`**, `Headers`, `RequestTimeout` (padrão 60s) — método sempre GET, erro HTTP quebra a ação (`catalogo-gatilhos-acoes.md` linha 261, `[BLIP-SDK]`); não confirmado se o card de conteúdo do bloco expõe exatamente esses campos ou é uma UI própria |
| Valores padrão | `RequestTimeout` = 60 segundos (se a hipótese acima se confirmar) |
| Obrigatórios/opcionais | **`Uri`** e **`Type`** obrigatórios; `Headers`/`RequestTimeout` opcionais (mesma hipótese) |
| Limites (tamanho/quantidade) | não informado pela fonte disponível |
| MIME e formato serializado | não confirmado — o `Type` da resposta HTTP declara o MIME em tempo de execução (não é um MIME fixo no editor); ver #10 |
| Validações e mensagens de erro | "erro HTTP quebra a action" (`EnsureSuccessStatusCode()`, `catalogo-gatilhos-acoes.md` linha 261) — mensagem literal exibida ao usuário: PENDENTE-CAPTURA #19 |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | PENDENTE-CAPTURA (se a URI aceita `{{variável}}`) |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | GET HTTP síncrono na hora de montar a mensagem, timeout 60s por padrão (mesma hipótese `SendMessageFromHttp`) |
| WhatsApp | Pipe hoje: não suportado — nenhuma ação equivalente a `SendMessageFromHttp` em `packages/core/src/fluxo/acoes.ts:233` (10 ações implementadas, sem esta) |
| Instagram | Pipe hoje: não suportado |
| Messenger | Pipe hoje: não suportado |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.httpContent`); `catalogo-gatilhos-acoes.md` linha 261 (`[BLIP-SDK]`, `SendMessageFromHttp`); `packages/core/src/fluxo/acoes.ts:233` (Pipe hoje) |

### Conteúdo dinâmico

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Conteúdo dinâmico" (`rawContent`), item 16 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | confirmado pelo bundle (`builder-tabs-content.rawContent`): "MIME type do conteúdo" (`type`), "Valor do Conteúdo" (`content`), "Metadata da mensagem" (`metadata`), campo de origem (`labelInput`: "Source"), botões "Cancelar"/"Salvar" |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | `type` e `content` presumivelmente obrigatórios (são os dois campos centrais do editor); `metadata` opcional (editor de chave/valor à parte, ver painel "DEFINIR METADADOS" abaixo) |
| Limites (tamanho/quantidade) | limite de 25 conteúdos por bloco (compartilhado) |
| MIME e formato serializado | MIME **livre**, digitado pelo usuário no campo `type` — corresponde ao mecanismo de `SendRawMessage` do SDK: **`Type`** (MIME válido), **`RawContent`**, `Metadata` (`catalogo-gatilhos-acoes.md` linha 260, `[BLIP-SDK]`) |
| Validações e mensagens de erro | PENDENTE-CAPTURA #19 (ex.: MIME inválido, conteúdo que não corresponde ao MIME declarado) |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | PENDENTE-CAPTURA |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | `SendRawMessage` — envia o conteúdo já serializado como string, com o MIME declarado (`catalogo-gatilhos-acoes.md` linha 260) |
| WhatsApp | Pipe hoje: `SendRawMessage` **implementado no motor** (`ACOES_DO_MOTOR`, `packages/core/src/fluxo/acoes.ts:233`), mas restrito a `mime === TIPO_TEXTO` na tela (`conteudo.ts`, comentário `cartoesDe`: "`acao.type === 'SendRawMessage' ? mime === TIPO_TEXTO`") — motor aceita MIME livre, tela do Pipe hoje só permite texto |
| Instagram | Pipe hoje: mesmo estado — decisão de canal não é o gargalo aqui, é a tela |
| Messenger | Pipe hoje: mesmo estado |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`builder-tabs-content.rawContent`); `catalogo-gatilhos-acoes.md` linha 260 (`[BLIP-SDK]`, `SendRawMessage`); `apps/gestao-vite/src/paginas/builder/conteudo.ts` (`cartoesDe`), `packages/core/src/fluxo/acoes.ts:233` (Pipe hoje) |

### Pesquisa

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Pesquisa" (`survey`), item 17 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | confirmado pelo bundle (`builder-tabs-content.survey`): "Texto introdutório da pesquisa" (`content`/`introductionText`), "Pesquisa de satisfação do contato" (`headerText`), "Tipo de pesquisa" (`type`) com três opções — `chatbotSurvey` "Avaliação de atendimento do chatbot", `solutionSurvey` "Avaliação da resolução de problemas", `recomendationSurvey` "Recomendação deste chatbot" —, "Escala" (`scale`) com quatro opções — `scaleStarOneToThree`/`scaleStarOneToFive` (estrelas, 1-3 ou 1-5), `scaleStarOneToThreeNumber`/`scaleStarOneToFiveNumber` (números, 1-3 ou 1-5) |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | não informado pela fonte disponível (tipo e escala aparentam ser seleção obrigatória, sem confirmação direta) |
| Limites (tamanho/quantidade) | não informado pela fonte disponível |
| MIME e formato serializado | `application/vnd.lime.satisfaction-survey+json` — confirmado em `portal.js`: renderizado como componente `survey` quando `document.type === "application/vnd.lime.satisfaction-survey+json"`, com atributos `failed-to-send-msg`, `introduction-msg`, `status`, `translations` |
| Validações e mensagens de erro | PENDENTE-CAPTURA #19 |
| Preview no Builder | PENDENTE-CAPTURA #14; texto de saída confirmado por tipo (`outuput.title`): `chatbotSurvey` "Como você se sentiu em relação ao atendimento neste canal?", `solutionSurvey` "Como você se sentiu em relação ao atendimento neste problema?", `recomendationSurvey` "Você recomendaria esse chatbot?"; resposta positiva/negativa: "Recomendaria"/"Não recomendaria" (recomendação) e "Positivo"/"Negativo" (canal) |
| Suporte a variáveis | PENDENTE-CAPTURA |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | `SendMessage` com `type = application/vnd.lime.satisfaction-survey+json`; renderizado no chat como card dedicado (`portal.js`) — não confirmado o mecanismo de captura da resposta/ramificação (fora do escopo deste plano, ver D-08 na fase) |
| WhatsApp | Pipe hoje: não suportado — nenhuma implementação de pesquisa de satisfação encontrada em `apps/gestao-vite/src/paginas/builder` (grep vazio, `RESEARCH.md`) |
| Instagram | Pipe hoje: não suportado |
| Messenger | Pipe hoje: não suportado |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`builder-tabs-content.survey`); `portal.js` (renderização do card `survey`); nota: a persistência/ramificação da pesquisa é investigada à parte por D-08 desta fase — este item cobre só a existência e os campos do conteúdo |

### Solicitar ligação

| Campo | Valor |
|---|---|
| Nome e posição no menu | "Solicitar ligação" (`receiveCallRequest`), item 18 de 18 |
| Ícone | PENDENTE-CAPTURA #3 |
| Campos e layout do editor | PENDENTE-CAPTURA #13 |
| Valores padrão | não informado pela fonte disponível |
| Obrigatórios/opcionais | não informado pela fonte disponível |
| Limites (tamanho/quantidade) | não informado pela fonte disponível |
| MIME e formato serializado | não confirmado — ver nota de mecanismo abaixo |
| Validações e mensagens de erro | não informado pela fonte disponível |
| Preview no Builder | PENDENTE-CAPTURA #14 |
| Suporte a variáveis | PENDENTE-CAPTURA |
| Import/export | PENDENTE-CAPTURA #15 |
| Execução no motor | PENDENTE-CAPTURA #20 — não confirmado se é o mesmo mecanismo de ligação de voz do Desk (strings próximas no mesmo bundle: `callsPermissionRequestBodyTitle` "Atendente {username} quer ligar para você.", `canCallsVoiceInbound`/`canCallsVoiceOutbound` "Receber/Realizar ligações de voz") ou um conteúdo de mensagem próprio do bloco do Builder — as duas features aparecem em módulos de tradução distintos e não há evidência de código que as ligue |
| WhatsApp | Pipe hoje: não suportado — nenhuma ação/conteúdo de chamada de voz no motor de fluxo |
| Instagram | Pipe hoje: não suportado |
| Messenger | Pipe hoje: não suportado |
| Canal sem suporte (referência) | PENDENTE-CAPTURA #17 |
| Teste/Debug | PENDENTE-CAPTURA #18 |
| Fonte | bundle módulo 52294 (`media.receiveCallRequest`); mesmo bundle, módulo de permissão de chamada de voz (`callsPermissionRequest*`, `canCallsVoice*`) — citado só como pista, não como confirmação do mecanismo |

## Capturas pendentes (D-03)

Todas exigem login do dono no Builder ao vivo (`https://<conta>.desk.blip.ai` ou portal equivalente do bot com Builder habilitado). Nenhuma foi tentada por este executor.

1. **Texto em inglês do menu de conteúdo.** Tela/estado: o mesmo objeto `builder-tabs-content.media` em inglês — pode ser extraído de outro módulo do mesmo arquivo de tradução (não localizado nesta rodada) ou de uma captura de tela com o idioma da conta em `en-US`.
2. **Confirmação fotográfica de que o menu "+ Adicionar conteúdo" do bloco renderiza os 18 itens na ordem do objeto de tradução.** Tela: bloco selecionado → aba "Conteúdo" → clique no botão de adicionar conteúdo, com o menu aberto (screenshot + DOM).
3. **Ícone de cada um dos 18 tipos** (descrição do significado visual, sem copiar o glifo). Tela: mesmo menu do item 2, screenshot com foco nos ícones ao lado de cada rótulo.
4. **Campos e layout completo do editor de Figurinha.** Tela: card de Figurinha aberto para edição.
5. **Campos e layout completo do editor de Áudio.** Tela: card de Áudio aberto (upload/URL, player, transcrição se houver).
6. **Campos e layout completo do editor de Vídeo.** Tela: card de Vídeo aberto (upload/URL, preview, legenda).
7. **Campos e layout completo do editor de Documento.** Tela: card de Documento aberto (upload/URL, nome do arquivo, legenda).
8. **Campos e layout completo do editor de Imagem.** Tela: card de Imagem aberto (upload/URL, texto alternativo, preview) — o rótulo do botão "Definir imagem" já está confirmado, falta o card inteiro.
9. **Campos e layout completo do editor de Carrossel**, incluindo o MIME/formato exato serializado (`document-select` vs `collection` vs formato próprio). Tela: card de Carrossel aberto (itens, imagem por item, botões por item, limite de itens) + export do fluxo de teste para inspecionar o JSON.
10. **Campos e layout completo do editor de Conteúdo HTTP**, confirmando ou não a hipótese de reaproveitar os campos de `SendMessageFromHttp` (URI/Type/Headers/Timeout). Tela: card de Conteúdo HTTP aberto.
11. **Campos e layout completo do editor de Pedir localização e Enviar localização.** Tela: cada card aberto (texto do pedido, mapa/preview, coordenadas fixas vs por variável).
12. **Campos e layout completo do editor de Web link**, incluindo se a dica de variável `{{}}` do template de mensagem também aparece no card do bloco. Tela: card de Web link aberto (URL, título, preview, `target`).
13. **Campos e layout completo do editor de Solicitar ligação.** Tela: card aberto (texto do pedido, canal de voz vinculado, comportamento após aceite/recusa do cliente).
14. **Preview no Builder de cada um dos 18 tipos** (como o card aparece fechado, antes de editar). Tela: bloco com cada tipo de conteúdo já adicionado, fechado, para os 18 tipos.
15. **Import/export por tipo** — se o JSON exportado/importado (`{flow, globalActions}`) tem alguma particularidade por tipo de conteúdo além de `type`/`content`/`settings` já documentado no LIME. Tela/arquivo: exportar um fluxo de teste com os 18 tipos e inspecionar o JSON gerado.
16. **Execução real no motor da Blip** (o que o bot efetivamente manda ao canal) para os tipos que o Pipe hoje recusa, em especial Carrossel e Conteúdo HTTP. Tela: aba Network do Builder em modo Teste, ou Debug, enviando cada tipo a um canal real.
17. **Comportamento por canal (WhatsApp/Instagram/Messenger) quando o conteúdo não é suportado** (oculta/desabilita/avisa/salva e bloqueia depois/faz fallback), para os 18 tipos, na referência. Tela: Builder com canal Instagram/Messenger selecionado, tentando adicionar cada tipo; alternativa: artigo do Help Center sobre compatibilidade de conteúdo por canal.
18. **Painel de Teste/Debug: como cada um dos 18 tipos aparece na simulação.** (O painel de Teste em si é investigado por D-14 noutro plano da fase; aqui falta só a renderização por tipo de conteúdo.) Tela: painel de Teste aberto com fluxo rodando, cada tipo sendo enviado.
19. **Validações e mensagens de erro específicas** de Figurinha, Pedir/Enviar localização, Web link (no card do bloco, não no template de mensagem), Carrossel, Conteúdo HTTP, Conteúdo dinâmico, Pesquisa e Quick reply/Menu (mensagem por opção), além do limite de 25 conteúdos e da mensagem "URL inválida" já confirmados por contexto próximo. Tela: cada card com campo obrigatório vazio ou fora do limite, submissão inválida.
20. **Confirmação de que "Solicitar ligação" é o mesmo mecanismo de `canCallsVoiceInbound`/`callsPermissionRequest*`** (ligação de voz nativa do Desk) ou um conteúdo de mensagem próprio do Builder, e qual é o MIME/formato serializado. Tela/bundle: localizar o handler do card `receiveCallRequest` no JS do Builder (não localizado nesta rodada) ou capturar o card ao vivo.

## Resumo

Classificação proposta (D-18/D-20): nenhum dos 18 tipos depende, pela evidência lida nesta investigação, de um serviço exclusivo da plataforma Blip impossível de reproduzir — todos envolvem formato de dado (MIME/JSON), upload/URL de mídia, chamada HTTP genérica ou renderização de card, mecanismos que não exigem infraestrutura proprietária da Blip. Por isso todos entram como **reproduzível**; "Solicitar ligação" tem uma dependência de infraestrutura de voz (telefonia/WebRTC) a esclarecer no portão do dono (D-04) depois da Captura #20, mas isso é "não construído ainda", não "impossível de reproduzir".

Slot proposto por bucket, aplicando literalmente a divisão de D-18 (CONTEXT.md): mídia = imagem/áudio/vídeo/documento/figurinha; interativo = carrossel/menu/quick reply/web link/localização/chat state/solicitar ligação; dinâmico = Conteúdo HTTP/Conteúdo Dinâmico/pesquisa/**demais** (a regra de "demais" no bucket dinâmico é aplicada aqui a Texto e Entrada do usuário, que não constam em nenhuma das outras duas listas — sinalizado para o consolidador de 02-07 revisar se essa é a intenção, já que Texto é o tipo mais básico e já suportado).

| Tipo | MIME | Classificação proposta | Slot proposto | Bloqueado por captura |
|---|---|---|---|---|
| Figurinha | `application/vnd.lime.media-link+json` | reproduzível | conteudo-midia | #3, #4, #14, #16, #17, #18, #19 |
| Áudio | `application/vnd.lime.media-link+json` | reproduzível | conteudo-midia | #3, #5, #14, #16, #17, #18, #19 |
| Imagem | `application/vnd.lime.media-link+json` | reproduzível | conteudo-midia | #3, #8, #14, #16, #17, #18, #19 |
| Vídeo | `application/vnd.lime.media-link+json` | reproduzível | conteudo-midia | #3, #6, #14, #16, #17, #18, #19 |
| Documento | `application/vnd.lime.media-link+json` | reproduzível | conteudo-midia | #3, #7, #14, #16, #17, #18, #19 |
| Digitando | `application/vnd.lime.chatstate+json` | reproduzível | conteudo-interativo | #3, #14, #18 |
| Pedir localização | não confirmado (hipótese: `vnd.lime.input+json`) | reproduzível | conteudo-interativo | #3, #11, #14, #16, #17, #18, #19 |
| Enviar localização | `application/vnd.lime.location+json` | reproduzível | conteudo-interativo | #3, #11, #14, #15, #16, #17, #18, #19 |
| Web link | `application/vnd.lime.web-link+json` | reproduzível | conteudo-interativo | #3, #12, #14, #15, #16, #17, #18, #19 |
| Quick reply | `application/vnd.lime.select+json` (`scope: immediate`) | reproduzível | conteudo-interativo | #3, #14, #17, #18, #19 |
| Menu | `application/vnd.lime.select+json` | reproduzível | conteudo-interativo | #3, #9 (variante document-select), #14, #17, #18 |
| Carrossel | não confirmado (hipótese: `document-select` ou `collection`) | reproduzível | conteudo-interativo | #3, #9, #14, #15, #16, #17, #18, #19 |
| Solicitar ligação | não confirmado | reproduzível (dependência de infra de voz a esclarecer no portão) | conteudo-interativo | #3, #13, #14, #15, #16, #17, #18, #20 |
| Conteúdo HTTP | não confirmado (hipótese: definido em runtime pela resposta HTTP) | reproduzível | conteudo-dinamico | #3, #10, #14, #15, #16, #17, #18, #19 |
| Conteúdo dinâmico | MIME livre (`SendRawMessage`) | reproduzível | conteudo-dinamico | #3, #14, #15, #17, #18, #19 |
| Pesquisa | `application/vnd.lime.satisfaction-survey+json` | reproduzível | conteudo-dinamico | #3, #14, #15, #17, #18, #19 (persistência/ramificação tratada à parte por D-08) |
| Texto | `text/plain` | reproduzível | conteudo-dinamico | #14, #18 |
| Entrada do usuário | não confirmado (hipótese: `vnd.lime.input+json`) | reproduzível | conteudo-dinamico | #14, #15, #18 |

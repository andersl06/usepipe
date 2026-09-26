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

**Nome e posição no menu:** "Figurinha" (`sticker`), item 1 de 18 no objeto `builder-tabs-content.media` do bundle de tradução.
**Fonte:** vendor-...translationLoaders...js, módulo 52294.

### Áudio

**Nome e posição no menu:** "Áudio" (`audio`), item 2 de 18.
**Fonte:** idem.

### Imagem

**Nome e posição no menu:** "Imagem" (`image`), item 3 de 18.
**Fonte:** idem.

### Vídeo

**Nome e posição no menu:** "Vídeo" (`video`), item 4 de 18.
**Fonte:** idem.

### Documento

**Nome e posição no menu:** "Documento" (`document`), item 5 de 18.
**Fonte:** idem.

### Digitando

**Nome e posição no menu:** "Digitando" (`chatState`), item 6 de 18 — o "chat state" do LIME.
**Fonte:** idem; MIME confirmado em `portal.js` (`application/vnd.lime.chatstate+json`).

### Entrada do usuário

**Nome e posição no menu:** "Entrada do usuário" (`userInput`), item 7 de 18 — não é uma fala do robô, é o marcador de "aguardar resposta" do bloco (já existe no Pipe como `input`/`temEntrada`, `conteudo.ts`).
**Fonte:** idem.

### Pedir localização

**Nome e posição no menu:** "Pedir localização" (`askLocation`), item 8 de 18 — corresponde ao "solicitar localização" citado em D-18.
**Fonte:** idem.

### Enviar localização

**Nome e posição no menu:** "Enviar localização" (`sendLocation`), item 9 de 18.
**Fonte:** idem; MIME confirmado (`application/vnd.lime.location+json`, `blip-api-schemas.md` §1.3).

### Web link

**Nome e posição no menu:** "Web link" (`webLink`), item 10 de 18.
**Fonte:** idem; MIME confirmado (`application/vnd.lime.web-link+json`, `blip-api-schemas.md` §1.3).

### Texto

**Nome e posição no menu:** "Texto" (`text`), item 11 de 18.
**Fonte:** idem; MIME `text/plain` (já suportado pelo Pipe, `packages/core/src/fluxo/editor.ts:152`).

### Quick reply

**Nome e posição no menu:** "Quick reply" (`quickReply`), item 12 de 18.
**Fonte:** idem; MIME `application/vnd.lime.select+json` com `scope: "immediate"` (já suportado pelo Pipe, `apps/gestao-vite/src/paginas/builder/conteudo.ts:155`).

### Menu

**Nome e posição no menu:** "Menu" (`menu`), item 13 de 18.
**Fonte:** idem; MIME `application/vnd.lime.select+json` sem `scope` (já suportado pelo Pipe, `conteudo.ts:150`).

### Carrossel

**Nome e posição no menu:** "Carrossel" (`carousel`), item 14 de 18.
**Fonte:** idem.

### Conteúdo HTTP

**Nome e posição no menu:** "Conteúdo HTTP" (`httpContent`), item 15 de 18.
**Fonte:** idem.

### Conteúdo dinâmico

**Nome e posição no menu:** "Conteúdo dinâmico" (`rawContent`), item 16 de 18.
**Fonte:** idem; painel de edição confirmado no mesmo módulo (`builder-tabs-content.rawContent`: campos `type`/`content`/`metadata`/`labelInput`).

### Pesquisa

**Nome e posição no menu:** "Pesquisa" (`survey`), item 17 de 18.
**Fonte:** idem; painel de edição confirmado no mesmo módulo (`builder-tabs-content.survey`); MIME confirmado em `portal.js` (`application/vnd.lime.satisfaction-survey+json`, renderizado como card `survey` no chat).

### Solicitar ligação

**Nome e posição no menu:** "Solicitar ligação" (`receiveCallRequest`), item 18 de 18.
**Fonte:** idem.

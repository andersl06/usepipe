# Portão 2 — pacote de revisão do dono (D-03, D-35)

**Status:** RASCUNHO COMPLETO. Cobre backend/infra (01-10), front/fluxo (01-11), CSS (01-36) e a reconciliação/dry-runs deste plano (01-12). Prova mecânica: `check-map` 0 erros em todos os 18 escopos; `rename-symbols`/`move-files` dry-run 0 pendências/0 colisões; `rewrite-literals` dry-run (números na seção "Aplicabilidade" abaixo).

Este documento junta o rascunho parcial (`GATE2-PACKET-DRAFT.md`, seções 1–3, já aprovadas em espírito — repetidas aqui como "já aprovado") com o mapa completo agora fechado.

---

## Contagens por escopo

| Escopo | Linhas propostas | KEEP | REMOVE | STATE |
|---|---:|---:|---:|---:|
| api | 4571 | 14 | 0 | 0 |
| crm | 739 | 16 | 0 | 0 |
| css | 2632 | 2 | 0 | 0 |
| desk-vite | 439 | 37 | 3 | 1 |
| gestao-vite | 3620 | 67 | 7 | 0 |
| infra | 144 | 64 | 0 | 0 |
| packages-ai | 283 | 0 | 0 | 0 |
| packages-armazenamento | 46 | 0 | 0 | 0 |
| packages-autenticacao | 97 | 0 | 0 | 0 |
| packages-contracts | 187 | 0 | 0 | 0 |
| packages-core | 846 | 21 | 0 | 0 |
| packages-db | 791 | 119 | 0 | 0 |
| packages-mcp | 0 | 0 | 0 | 0 |
| packages-tempo-real | 34 | 0 | 0 | 0 |
| packages-ui | 53 | 5 | 0 | 0 |
| ponte | 176 | 17 | 0 | 0 |
| site | 17 | 0 | 0 | 0 |
| workers | 226 | 2 | 0 | 0 |
| **Total** | **~15,858** | | | |

CSS (2632 rows): 2068 `css-class`, 510 `css-var`, 54 `data-attr`.

---

## Aplicabilidade (prova mecânica, D-03/W13)

- `check-map --scopes all --require-status proposed --glossary GLOSSARY.md`: **0 erros, 139 avisos** (todos glossário-ambiguidade nos padrões já documentados — ver "Limitação conhecida" abaixo).
- `rename-symbols --scopes all --kinds symbol,ts-prop,ts-local --dry-run`: **missing=0**.
- `move-files --scopes all --dry-run`: **606 movimentos, 0 colisões** — verificado tanto pelo próprio `move-files` (nenhuma linha "already tracked") quanto por um script independente que recalcula cada destino real (`declared_at` + basename de `new`, igual à lógica corrigida do `move-files.ts`) e cruza com `git ls-files`: 0 destinos duplicados, 0 destinos já ocupados por um arquivo não relacionado.
- `rewrite-literals --scopes all --kinds endpoint,front-route,query-param,queue,job-name,ws-event,error-code,test-title,cookie,storage-key,metric,script,subpath-export,package,literal-value,wire-key --dry-run`: em execução no momento da pausa deste plano (a ferramenta original levava minutos e não terminava em escopos grandes — corrigido, ver "Correções de ferramenta" abaixo); números finais anexados nesta seção assim que a execução em background concluir. Todas as ~2300 linhas elegíveis foram cobertas por escopo em corridas parciais sem erro de ferramenta; os 2 casos conhecidos como não encontrados (`crm-query-param-agrupar`, `crm-query-param-ordem`) estão explicados na nota da própria linha.

### Correções de ferramenta encontradas durante os dry-runs (não são decisões do dono)

Ao rodar os dry-runs exigidos por este plano pela primeira vez com `--scopes all` (como o texto do plano especifica), 6 bugs mecânicos foram descobertos e corrigidos, todos commitados em `cx/01-12`:

1. **`--scopes all` não fazia nada** em `rename-symbols.ts`/`move-files.ts`/`rewrite-literals.ts` (só o `check-map.ts` já tratava `all` como curinga) — o dry-run anterior relatava "0 pendências" porque não processava nenhuma linha. Corrigido para casar o comportamento do `check-map`.
2. **Cobertura do projeto do `rename-symbols`** não incluía `tools/std/*.ts`, scripts `.mjs` de raiz nem `apps/site/assets/*.js` — 29 linhas `symbol`/`ts-local` legítimas apareciam como "missing". Cobertura estendida.
3. **Diretório de destino das linhas `file`** era inconsistente entre os dois geradores (caminho completo vs. fragmento vs. nome nu) — causava `git mv` para o arquivo errado e destinos sem a pasta do app. Corrigido para sempre reconstruir a partir de `declared_at` + apenas o nome-base de `new` (`move-files.ts`, `lib/map.ts` `resolvePath`, `check-map.ts` colisão).
4. **`infra/compose/implantar.sh` → `deploy.sh`** colidia com um `deploy.sh` já existente (script diferente). Renomeado para `bootstrap.sh`.
5. **`tempo-real` → `time-real`** violava a entrada composta já aprovada no glossário (`realtime`) em 7 linhas (packages-tempo-real + api).
6. **Performance:** `rewrite-literals`'s `wire-key` matching re-processava a lista de consumidores (até ~50 arquivos) a cada arquivo do projeto — O(linhas × arquivos × consumidores). `packages-db` sozinho não terminava em 180s; com o cache, ~2m40s.

Nenhuma dessas é uma decisão de produto — são bugs de ferramenta que teriam corrompido a fase mecânica de renomeio (planos futuros) se não corrigidos agora.

---

## 1. Endpoints de API acessíveis por chave de cliente — já aprovado (D-45)

*Já decidido durante 01-10 (owner, mid-plan): os 24+ endpoints `/v1/conversas*`, `/v1/contatos*`, `/v1/filas`, `/v1/atendentes*`, `/v1/mensagens-ativas*`, `/v1/anexos*` renomeiam como qualquer outro endpoint (D-43: não há cliente real hoje). `std/wire-contracts.csv` já tem os 24 rows em `rename-with-db-key` com nota "D-45 owner decision". Nada a decidir aqui.*

## 2. Exceções do glossário no CSS — já aprovado

*painel→panel, estado→status, papel→paper em CSS (2632 seletores/variáveis) — os dois primeiros já eram o sentido previsto pelo próprio glossário; papel→paper foi conferido ocorrência por ocorrência em 01-36. `check-map --scopes css`: 0 erros, 0 avisos.*

## 3. Valores persistidos que ficam com o nome atual — já aprovado

*744→745 decisões (148 `keep` + 597 `keep-literal`) — ver seção "Persisted" abaixo para o número final e o que mudou nesta reconciliação.*

---

## Breaking changes

Toda mudança visível de fora do processo (rota pública, nome de fila, código de erro, etc.). A lista completa de cada linha está nos CSVs (`std/map/<scope>.csv`); aqui vai a contagem por tipo e os destaques mais visíveis.

| Tipo | Linhas | Onde |
|---|---:|---|
| endpoint | 139 | api.csv |
| front-route | 160 | desk-vite, gestao-vite, crm |
| cookie | 3 | api |
| metric | 5 | api |
| queue | 10 | workers, packages-tempo-real |
| job-name | 7 | workers |
| ws-event | 0 | — |
| error-code | 269 | api (principalmente) |
| test-title | 1157 | todos os escopos com testes (ver nota de qualidade abaixo) |
| package | 8 | infra, packages-* |
| app | 4 | infra, gestao-vite, ponte |
| script | 14 | infra |

**App/package renames (maior risco de infra, já sinalizado em 01-11):**

| old | new | decisão |
|---|---|---|
| `apps/gestao-vite` | `apps/management-vite` | D-04 |
| `apps/ponte` | `apps/bridge` | D-04 |
| `@pipe/gestao-vite` | `@pipe/management-vite` | D-04 |
| `@pipe/ponte` | `@pipe/bridge` | D-04 |
| `@pipe/autenticacao` | `@pipe/authentication` | D-04 |
| `@pipe/armazenamento` | `@pipe/storage` | D-04 |
| `@pipe/tempo-real` | `@pipe/realtime` | D-04 (corrigido nesta reconciliação — era `time-real`, violava o glossário) |

A execução destas 2 linhas de `app` (Dockerfiles, compose, scripts de build, caminhos de VPS) precisa validar build/deploy um app por vez (histórico conhecido de quebra de build do Desk numa VPS).

**Amostra de front-route (as mais visíveis; lista completa nos CSVs):**

| Escopo | old | new |
|---|---|---|
| crm | `/configuracoes/membros` | `/settings/members` |
| crm | `/oportunidades` | `/opportunities` |
| gestao-vite | `/roteador/:id/atendimento/monitoramento` | `/router/:id/attendance/monitoring` |
| gestao-vite | `/roteador/:id/atendimento/monitoria/:id` | `/router/:id/attendance/quality-review/:id` |
| gestao-vite | `/fluxo/:id/analise/dicionario-de-dados` | `/flow/:id/analytics/data-dictionary` |
| gestao-vite | `/novidades` | `/updates` |

**Site (apps/site) — URLs públicas do site de marketing (W10):**

9 diretórios (4 posts de blog, 5 páginas de ferramenta) mais a própria pasta `ferramentas/`. O inventário original só tinha 3 das 9 linhas de diretório; as 6 faltantes (URLs públicas reais, ex. `usepipe.com/ferramentas/calculadora-de-nps`) foram adicionadas nesta reconciliação, e as 3 pré-existentes tinham palavras deixadas em português (`frases`, `prontas`, `automatica`, `ausencia`, `agendador`).

| old (segmento da URL) | new proposto | nota |
|---|---|---|
| `blog/frases-prontas-para-atendimento-no-whatsapp` | `blog/ready-phrases-for-attendance-on-whatsapp` | ordem de palavra é sugestão |
| `blog/mensagem-automatica-e-de-ausencia-no-whatsapp` | `blog/automatic-and-away-message-on-whatsapp` | "away message" é termo do WhatsApp Business; sugestão |
| `blog/lista-de-transmissao-no-whatsapp` | `blog/broadcast-list-on-whatsapp` | linha adicionada nesta reconciliação |
| `blog/numero-de-whatsapp-banido` | `blog/banned-whatsapp-number` | linha adicionada nesta reconciliação |
| `ferramentas` (pasta) | `tools` | linha adicionada nesta reconciliação |
| `ferramentas/agendador-de-mensagem-whatsapp` | `tools/message-scheduler-whatsapp` | ordem de palavra é sugestão |
| `ferramentas/calculadora-de-nps` | `tools/nps-calculator` | linha adicionada nesta reconciliação |
| `ferramentas/calculadora-de-taxas-do-ifood` | `tools/ifood-fee-calculator` | linha adicionada nesta reconciliação |
| `ferramentas/gerador-de-link-whatsapp` | `tools/whatsapp-link-generator` | linha adicionada nesta reconciliação |
| `ferramentas/gerador-de-qr-code-whatsapp` | `tools/whatsapp-qr-code-generator` | linha adicionada nesta reconciliação |

Estas são exatamente as linhas do "eyeball" pedido para o dono — ver checkpoint abaixo.

**Doc paths (docs/** e READMEs de infra.csv, W10):**

11 linhas `file`/`dir` sob `docs/**`; 9 são `KEEP` (specs datadas, mantidas com o nome atual). 2 renomeiam:

| old | new | referências de entrada |
|---|---|---|
| `docs/lp/ferramentas-oportunidades.md` | `docs/lp/tools-opportunities.md` | 0 (`git grep` não achou nenhuma referência fora do próprio map) |
| `docs/lp/imagens-prompts.md` | `docs/lp/images-prompts.md` | 0 |

**Nota de qualidade — test-title (achado importante, não corrigido nesta sessão):**

1157 linhas `test-title` no total. As 01-11 (`gestao-vite`, `crm`, `desk-vite`, `packages-core`, `packages-ai`, `ponte` — geradas por Sonnet) são traduções fluentes e corretas — ex.: `"empate de ordem desempata por identificador, e não pela ordem do banco"` → `"an order tie is broken by identifier, not by the database order"`.

As 01-10 (`api`, `infra`, `packages-db`, `workers`, `packages-contracts`, `packages-autenticacao`, `packages-armazenamento`, `packages-tempo-real` — geradas pelo motor palavra-por-palavra construído para identificadores) produzem inglês quebrado quando aplicadas a frases naturais — ex.: `"leva o convite no desafio: é assim que a volta do Google sabe de que cliente é"` → `"leva o invitation in challenge: and assim that a returns of Google sabe of that customer and"`. Isso não afeta nenhum comportamento de runtime (só o nome que aparece no relatório de teste), mas é a linha de maior volume (600 na api.csv sozinha) que fica genuinamente ruim se aplicada como está.

**Isto é uma decisão real do dono, não um bug mecânico** — corrigir à mão ~900 frases (api+infra+packages-db+workers+contracts+autenticacao+armazenamento+tempo-real) está fora do escopo mecânico deste portão. Opções:
- (A) Aplicar como está agora; qualidade dos `test-title` é cosmética (nomes de teste), sem risco técnico — revisar/reescrever numa fase futura sem bloquear nada.
- (B) Excluir a kind `test-title` da execução mecânica destes 8 escopos até uma passada de retradução dedicada (endpoint/error-code/etc. desses mesmos escopos aplicam normalmente).

**Recomendação: (A).** Teste ainda passa, `pnpm test` só fica com nomes feios até uma limpeza futura; não há necessidade técnica de bloquear a mecânica por causa disso.

---

## Removals

| id | Escopo | Tipo | old | Decisão |
|---|---|---|---|---|
| desk-vite-front-route-extra-chat | desk-vite | front-route | `/chat` | D-27/D-42 |
| desk-vite-front-route-extra-chat-id | desk-vite | front-route | `/chat/:id` | D-27 |
| desk-vite-front-route-extra-contacts-id | desk-vite | front-route | `/contacts/:id` | D-29 |
| gestao-vite-front-route-3ce679bc | gestao-vite | front-route | `/fluxo/:id/atendimento/canais/whatsapp/:id/*` | D-14 |
| gestao-vite-front-route-4efe5d20 | gestao-vite | front-route | `/roteador/:id/atendimento/canais/whatsapp/:id/*` | D-14 |
| gestao-vite-symbol-32afb139 | gestao-vite | symbol | `ROTAS_ANTIGAS_SEM_CONTATO` | D-14 |
| gestao-vite-symbol-58886800 | gestao-vite | symbol | `ParaOCanalDoBot` | D-14 |
| gestao-vite-symbol-fb6d35c3 | gestao-vite | symbol | `urlDaConversaNoDesk` | D-28 (arquivo `desk-url.ts` inteiro removido, sem consumidor) |
| gestao-vite-test-title-bee470b1 | gestao-vite | test-title | (teste do desk-url.ts) | D-28 |
| gestao-vite-ts-local-9f34f49c | gestao-vite | ts-local | `conversaId` (em desk-url.ts) | D-28 |

**STATE (query param que vira estado React, não é remoção mas muda onde o dado mora):**

| id | Escopo | old | Decisão |
|---|---|---|---|
| desk-vite-query-param-extra-ticket | desk-vite | `?ticket=` | D-29 |

---

## Owner decisions still open

Três categorias — não linhas individuais, com recomendação em cada uma:

**D-29 — detalhe de contato na Gestão (2 linhas: `?ticketId=` em `/fluxo/:id/contatos/:contatoId` e `/roteador/:id/contatos/:contatoId`).** A Gestão usa `contatos/:contatoId?ticketId=` hoje; a Blip declara o mesmo padrão (contato no path, ticket na query) e abre o histórico numa aba nova. **Recomendação (já no nav-contract.md): manter contato no path e ticket na query como deep link da Gestão.** Esta recomendação NÃO se estende ao Desk (D-29 do Desk já foi decidido: contato e ticket viram estado React, sem URL — ver Removals acima).

**D-31 — passo do wizard no path ou em estado (2 linhas: `?passo=` em `/criar/fluxo` e `/criar/roteador`).** Hoje usa query param; certificados usa `useState` local. **Recomendação (já no nav-contract.md): passo no path** para os wizards de criação (`/criar/fluxo/1`, não `/criar/fluxo?passo=1`); certificados conserva o estado local.

**D-34 — tabela de deep link (251 linhas ainda `NEEDS VALIDATION`).** `nav-contract.md`'s per-screen table registra, para cada tela e cada item de estado, se ele sobrevive a F5/deep-link/voltar — 251 das ~330 linhas não têm evidência de teste ao vivo (a evidência da Blip só prova que a tela existe, não o comportamento de deep link). `NEEDS VALIDATION` é o padrão conservador que o próprio 01-11 adotou quando não havia captura específica — **não bloqueia o renomeio mecânico dos nomes de rota/parâmetro em si** (essa parte já está provada pelos dry-runs acima); afeta apenas a confiança de que cada tela se comporta como documentado em `decided location`. **Recomendação: aprovar o mapa de nomes agora; validar as 251 linhas ao vivo incrementalmente durante a execução de cada fatia** (cada plano de execução futuro que mexe numa tela específica confere o comportamento real daquela tela antes de aplicar), em vez de bloquear este portão numa varredura de 251 telas hoje.

Nenhum item `AMBIGUOUS` restante fora destes três.

---

## Persisted (STD-06)

`std/persisted.csv`: **745 decisões** (148 `keep`, 597 `keep-literal`) — valores gravados no Postgres hoje que o código não renomeia nesta fase (coluna, jsonb, escopo de chave de API), mesmo que o resto do identificador mude para inglês.

Nesta reconciliação (fusão de `persisted-candidates-codex2-01-11.csv`, 154 linhas candidatas de 01-11):
- 99 já resolvidas sob o mesmo id (88 já em persisted.csv, 11 já propostas no mapa do escopo).
- 15 mesmo valor já resolvido em outro id (falso-positivo de atribuição de linha).
- 40 falsos positivos (nome coincide com uma chave jsonb-alcançada em OUTRA tabela/domínio) — propostos normalmente no mapa do escopo (crm +5, packages-core +16, ponte +19, 7 delas KEEP por serem valor de wire LIME externo).
- 3 ids duplicados corrigidos (mantida a versão com evidência `jsonb-reach`, mais completa).

## Wire contracts (D-09)

`std/wire-contracts.csv`: 207 combinações endpoint+método. **35 `keep`, 14 `persisted`, 158 `rename-with-db-key`** (inclui as 24 linhas D-45 de endpoints com chave de API de cliente). `packages-db.csv` tem 291 linhas `wire-key` cobrindo as chaves JSON destas 158 combinações; `check-map`'s regra 10 (consistência entre `wire-key` e as linhas `ts-prop`/front correspondentes) — 0 erros.

## CSS (D-35)

2632 linhas (2068 `css-class`, 510 `css-var`, 54 `data-attr`). As 3 exceções de glossário (painel/estado/papel) já aprovadas na seção 2. 30 classes mais usadas (por número de ocorrências no código):

| old | new | ocorrências |
|---|---|---:|
| `bl-painel--bloco` | `bl-panel--block` | 80 |
| `listagem` | `listing` | 30 |
| `entrar-cartao` | `login-card` | 26 |
| `cartao-rel` | `card-rel` | 23 |
| `g-painel` | `g-panel` | 21 |
| `vazio` | `empty` | 20 |
| `bl-painel` | `bl-panel` | 20 |
| `colunas-painel` | `columns-panel` | 18 |
| `tbl-busca` | `tbl-search` | 16 |
| `tempo` | `time` | 15 |
| `conta-campo` | `account-field` | 15 |
| `selecao-lista` | `selection-list` | 13 |
| `at-selecao-chips` | `at-selection-chips` | 13 |
| `mon-pagina-tv` | `mon-page-tv` | 12 |
| `gr-filtros` | `gr-filters` | 12 |
| `da-canais-tabela` | `da-channels-table` | 12 |
| `pt-busca` | `pt-search` | 11 |
| `mon-acoes` | `mon-actions` | 10 |
| `entrar-alerta` | `login-alert` | 10 |
| `entrar` | `login` | 10 |
| `dk-cartao` | `dk-card` | 10 |
| `sv-cartao` | `sv-card` | 9 |
| `selecao-controle` | `selection-control` | 9 |
| `pt-contas` | `pt-accounts` | 9 |
| `entrega` | `delivery` | 9 |
| `entrar-dados` | `login-data` | 9 |
| `cartao-config` | `card-config` | 9 |
| `sv-cartao-acoes` | `sv-card-actions` | 8 |
| `conta-abas` | `account-tabs` | 8 |
| `cfg-permissoes` | `cfg-permissions` | 8 |

3 pares de seletores diferentes mapeando para o mesmo nome novo (sinônimos legítimos em arquivos diferentes, não colisão). Ainda não existe ferramenta mecânica de renomeio para `css-class`/`css-var`/`data-attr` (entregue no plano 01-25, depois deste portão); a prova possível hoje é a validação estrutural do `check-map` (0 erros, 0 avisos no escopo css).

---

## Query-param audit (achado deste plano)

O inventário original tinha só 1 linha `query-param` nos 4 escopos com `URLSearchParams`/`useSearchParams`/`@Query()` (desk-vite, gestao-vite, crm, api), apesar de uso real em 40+ arquivos. Auditoria direta do código encontrou e adicionou 29 linhas faltantes (`destino`→`returnTo`, `aba`→`tab`, `erro`→`error`, `metodo`→`method`, `convite`→`invite`, `origem`→`origin`, `contato`→`contact`, `busca`→`search`, `de`→`from`, `ate`→`to`, `direcao`→`direction`, `tipo`→`type`, `fila`→`queue`, `atendente(s)`→`agent(s)`, `agrupar`→`groupBy`, `ordem`→`order`, `expira`→`expires`, `assinatura`→`signature`). `rewrite-literals.ts` também não reconhecia decorators `@Query()` do NestJS (só `searchParams.get/set/has/delete`) — corrigido. 27/29 confirmadas pelo dry-run; as 2 restantes (`crm` `agrupar`/`ordem`, setadas via uma variável `p` que não é rastreada de volta ao `URLSearchParams`) estão documentadas na nota da própria linha para aplicação manual.

---

## How to review

1. Abra `std/map/<scope>.csv` numa planilha. Colunas: `id, scope, slice, kind, old, new, declared_at, consumers, persisted, category, decision_ref, status, owner, notes`.
2. Para discordar de um nome: edite a coluna `new` (ou adicione uma nota). Linha sem edição = aceita como está.
3. As 3 decisões da seção "Owner decisions still open" já têm uma recomendação — responda "ok" em cada uma ou diga o que mudar.
4. Os 10 itens do "eyeball" do site (blog/ferramentas) — mesmo processo: "ok" ou diga o nome que prefere.
5. `std/persisted.csv` e `std/wire-contracts.csv`: decisões já tomadas, nenhuma pergunta nova — apenas confirmação de que o inventário está consistente (seções acima).
6. `std/nav-contract.md`: leia as seções "Desk"/"Gestão"/"CRM" para o contexto de cada decisão D-29/D-31.

---

## Approval

**Data:** 2026-09-25. **Dono:** aprovado (D-45, D-46, D-47 — decisões antecipadas ao portão registradas em `01-CONTEXT.md`; nenhuma edição adicional pendente desta sessão). `std/nav-contract.md` tem `Status: APPROVED 2026-09-25` e nenhum `OWNER DECIDES AT GATE 2` restante. `std/persisted.csv` e `std/wire-contracts.csv`: decisões confirmadas, sem pergunta nova.

**D-47 (retradução dos test-title palavra-por-palavra):** os 8 escopos gerados pelo motor palavra-por-palavra (api, infra, packages-db, workers, packages-autenticacao, packages-armazenamento, packages-tempo-real — 711 linhas `test-title`) foram retraduzidos em inglês fluente (branch `cx/retranslate-tests`, mesclada nesta sessão) e aprovados diretamente (`check-map` 0 erros nessas linhas + auditoria de literais persistidos não tocados, `tools/std/scan-retranslated-literals.mjs`).

**Auditoria de compostos meio-traduzidos (achado do orquestrador, boas-vindas → welcome-vindas):** todas as linhas aprovadas dos tipos `endpoint`, `front-route`, `file`, `dir`, `css-class`, `css-var`, `data-attr` e `symbol` foram varridas por palavra PT deixada para trás num composto hífen/underscore/camelCase. **206 linhas corrigidas** (a maioria sufixos de particípio/adjetivo que o motor palavra-por-palavra deixou sem traduzir — `Cadastrada`, `Listado`, `Configurado`, `Resolvido`, `Conferido`, `Valido`, `Personalizado`, `Detalhado`, `Conectado`, `Guardado`, `Criada` etc. — mais um punhado de verbos no infinitivo com a mesma causa: `conferir`, `listar`, `resolver`, `validar`, `guardar`, `gravar`, `publicar`, `decifrar`, `enfileirar`, `casar`, `atribuir`, `filtrar`, `carregar`, `buscar`, `copiar`). ~90 falsos positivos revisados e descartados: o prefixo de bloco BEM `da-` (de `dashboard`, não a preposição), `as`/`no` que já são a tradução correta de `como`/`sem`, e a letra de identidade de objeto `A`/`B` em nomes de fixture de teste. Linhas persistidas/literal-value não foram tocadas.

**Correções de ferramenta encontradas nos dry-runs desta task (não são decisões do dono):**
1. `rewrite-literals.ts`'s `technicalExactPosition` só aceitava o literal do código de erro como primeiro argumento de chamada — casava `ErroPipe.fabrica('codigo', msg)` mas não `new ErroPipe(statusCode, 'codigo', msg)` (código no segundo argumento). Corrigido (35 linhas passaram a casar).
2. `rewriteWireKey` só reescrevia acesso/atribuição de propriedade em valor de tipo `any`/`unknown` — não cobria `PropertySignature` de literais de tipo que espelham o formato de linha SQL crua (`tx.execute<{ fluxo_id: string }>(sql\`...\`)`), que é justamente o formato-fio sem receptor em runtime para checar. Corrigido (33 linhas passaram a casar).
3. As mesmas 33 linhas tinham a coluna `consumers` com a contagem herdada de quando eram `ts-prop` (ex. `65`) em vez da lista de arquivo(s) que `wire-key` exige — corrigido para o arquivo de `declared_at`.
4. 1 linha `endpoint` (`api-endpoint-77d9d0cd`) tinha `old` com o placeholder `:*` do inventário original enquanto a rota real usa `:contatoId` — corrigida para casar com a fonte.

Nenhuma dessas é uma decisão de produto — são bugs de ferramenta/dados que teriam bloqueado a fase mecânica de renomeio se não corrigidos agora.

### Aplicabilidade final (dry-runs pós-aprovação, W13)

- `check-map --scopes all --require-status approved --glossary GLOSSARY.md`: **0 erros, 285 avisos** (mesmo padrão de ambiguidade de glossário já documentado; o número cresceu com as 711 linhas retraduzidas, que também passam pelo scan).
- `rename-symbols --scopes all --kinds symbol,ts-prop,ts-local --dry-run`: **applied=0 missing=0**.
- `move-files --scopes all --dry-run`: **596 movimentos, 0 colisões** (`moved=0` é o próprio dry-run — nada é movido de verdade; `rewritten=1185` reescritas de import previstas).
- `rewrite-literals --scopes all --kinds endpoint,front-route,query-param,queue,job-name,ws-event,error-code,test-title,cookie,storage-key,metric,script,subpath-export,package,literal-value,wire-key --dry-run`: **rewritten=36363, unmatched=55**. As 55 estão explicadas:
  - 2 `query-param` (`crm-query-param-agrupar`, `crm-query-param-ordem`): já documentadas em nota de linha desde a task 1 (setadas via uma variável `p` não rastreada de volta a `URLSearchParams`; aplicação manual).
  - 1 `cookie` + 5 `metric`: `apps/api/src/controladores/entrar.ts` e `apps/api/src/metricas.ts` são, respectivamente, um cookie de desafio montado à mão (template literal + helper `lerCookies()` próprio) e um exportador Prometheus escrito à mão (sem `prom-client`) — nenhum casa com os formatos de chamada (`cookie.get/set()`, `new Counter({name:...})`) que o casador técnico reconhece; notas de linha adicionadas, aplicação manual.
  - 47 `wire-key` (todas `packages-db-wire-key-*`): a lista de consumidores dessas linhas vem de uma busca textual (não verificada por AST) — nos arquivos onde 0 ocorrências casaram, a palavra aparece como variável local ou valor de union type literal (enum), não como chave de propriedade na fronteira wire; a ocorrência real de fronteira dessas chaves já está coberta por outras linhas do mapa. Comportamento conservador esperado, não risco de corrupção — não anotado linha a linha (mesma explicação para as 47).

### Status final

- 14,901 linhas (soma exata de todos os escopos, recontada nesta sessão — a contagem `~15.858` da seção "Contagens por escopo" acima era uma estimativa) em `status=approved`; `packages-mcp` tem 0 linhas (escopo vazio).
- `std/nav-contract.md`: `Status: APPROVED 2026-09-25`.
- `std/persisted.csv`: 745 decisões, sem mudança nesta sessão.
- `std/wire-contracts.csv`: sem mudança nesta sessão.

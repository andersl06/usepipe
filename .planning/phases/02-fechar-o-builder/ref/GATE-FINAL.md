# Portão final da Phase 2 (Fechar o Builder)

**Rascunho preparado em:** 2026-09-27, sobre o commit base `b3a96db` (worktree do plano 02-22).
**Situação:** aprovado pelo dono.

**Aprovação final do dono:** 2026-09-27 — "aprovado". Aceitas as recomendações do orquestrador: as diferenças visuais medidas (fonte, pílula, rodapé, botões "+ Adicionar", zoom, "Novo bloco", tabela de Versões, menu de adicionar conteúdo) vão para o plano de lacunas; o Builder inteiro passa a usar Nunito Sans por paridade (D-30). BUILDER-05 continua aberto até a captura C-42.

## 1. Gates automáticos

Ambiente: Windows 11, Node 24.11, pnpm, Postgres/Redis do docker (`pipe-postgres`, `pipe-redis`). Duas passadas completas: a primeira achou os problemas da seção 2; a segunda, depois das correções, é a que vale.

| Gate | Comando | Saída | Resultado (2ª passada) |
|---|---|---|---|
| Build | `pnpm exec turbo run build --filter=!@pipe/crm` | 0 | 14/14 tarefas. `@pipe/crm` fica fora pela exceção aceita na Phase 1 (`std/baseline.md`: `output: 'standalone'` falha com `EPERM` de symlink no Windows); o `turbo run build` completo sai 1 só por isso, e o log do crm mostra `Compiled successfully` antes do EPERM |
| Typecheck | `pnpm exec turbo run typecheck` | 0 | 23/23 tarefas |
| Migrações | `pnpm --filter @pipe/db migrate` (`DATABASE_URL` do docker) | 0 | 0047, 0048, 0049 e a nova 0050 aplicadas |
| Testes (todos) | `pnpm exec turbo run test --continue --concurrency=1` | 0 | 21/21 tarefas, **1.795 testes** sem falha: api 708, core 470, management-vite 306, ai 75, workers 42, authentication 41, crm 34, desk-vite 33, db 31, storage 24, bridge 17, realtime 14; `@pipe/ui` tokens ok (91 tokens, claro/escuro em paridade) |
| Testes por pacote (pedidos) | `@pipe/core` vitest / `@pipe/api` vitest (suíte inteira) / `@pipe/workers` / `@pipe/management-vite` / `@pipe/ui` / `@pipe/db` | 0 em todos | 470/470 (13 arquivos) · 708/708 (54 arquivos) · 42/42 · 306/306 · ok · 31/31 |
| Compatibilidade de jsonb gravado (STD-06) | `pnpm --filter @pipe/api exec vitest run tests/jsonb-compat.test.ts` | 0 | 6/6 |
| Catálogo, todos os slots | `node .planning/phases/02-fechar-o-builder/ref/conferir-catalogo.mjs --all` | 1 | acusa só `FALTA motor TrackContactsJourney` e `FALTA tela TrackContactsJourney` (EXCEDE CAPACIDADE, aprovado para o plano de lacunas) |
| Catálogo, por slot | `conferir-catalogo.mjs --slot <slot>` | 0 em 7 de 8 | conteudo-midia OK 5 · conteudo-interativo OK 5 · conteudo-dinamico OK 2 · acoes-script OK 2 · acoes-contexto OK 2 · ja-suportada OK 5 · acoes-funcoes OK 2 · acoes-plataforma **1** (só TrackContactsJourney; as 5 externas passam) |
| Itens já suportados | `conferir-catalogo.mjs --slot ja-suportada` | 0 | OK 5 itens (TrackEvent, ProcessHttp, SetVariable, Redirect, DeleteVariable) |
| Cor antiga no Builder | `grep -rn "#4a5d23\|--bl-verde" apps/*/src/*/builder` | vazio | 0 linhas. Achado da verificação visual: o preenchido do zoom em `builder.css` usa `var(--moss)` (= `#4a5d23`), fora do diretório que o grep cobre; está em `VERIFICACAO-VISUAL.md` como NEEDS VALIDATION |
| HTML inseguro no Builder | `grep -rn "dangerouslySetInnerHTML" apps/*/src/*/builder apps/management-vite/src/pages/builder.tsx` | vazio | 0 linhas |
| Credenciais na verificação visual (T-2-01) | `grep -ci "cookie\|authorization\|bearer" ref/VERIFICACAO-VISUAL.md ref/medir-tela.js` | vazio | 0 e 0 |
| Lint (não é gate do plano; registrado) | `pnpm exec turbo run lint --continue` | 2 | 11/15. Restam só erros anteriores à Phase 2: `@pipe/api` `src/domain/management/sla.ts:61` e `tests/channel-of-flow.test.ts:486` (variáveis não usadas, já em `LACUNAS-APROVADAS.md`), `@pipe/realtime` `src/index.ts:113` (bloco vazio, 2026-09-07), `@pipe/desk-vite` `desk-selection.tsx:43` (regra `react-hooks` não carregada), `@pipe/crm` (padrão `semente` sem arquivos) |

**Teste instável `flow-content.test.ts` > figurinha:** passou nas quatro execuções desta regressão (suíte da API isolada duas vezes, `turbo run test` em paralelo com a API da verificação visual no mesmo Postgres, e `turbo run test --concurrency=1`). Não reproduziu. O 02-20 registrou outra falha transitória parecida (`flow.test.ts`, outbox, 11/12 e depois 12/12), que também não reproduziu aqui. As duas continuam como suspeitas de disputa pelo mesmo banco quando há executores em paralelo.

## 2. Correções feitas nesta regressão

| # | Achado | Causa | Correção | Arquivo |
|---|---|---|---|---|
| 1 | `@pipe/db` `tests/rls.test.ts` > "Evaluate `current_setting` once per query" falhou: `gravar_memoria`, `lista_distribuicao`, `lista_distribuicao_contato` | a migração 0049 (02-20) criou as políticas `tenant_isolado` com `current_setting(...)` direto, avaliado por linha, e não na forma `(SELECT current_setting(...))` que o resto do banco usa | nova migração `0050_rls_subconsulta_acoes_plataforma.sql` recria as três políticas na forma `(SELECT ...)`; a 0049 não foi editada porque já estava aplicada | `packages/db/drizzle/0050_rls_subconsulta_acoes_plataforma.sql`, `packages/db/drizzle/meta/_journal.json` |
| 2 | lint `prefer-const` em `cursorPendente` | variável da retomada do ProcessHttp nunca reatribuída (02-05) | `const` | `packages/core/src/flow/manager.ts:156` |
| 3 | lint `prefer-const` em `result` | ações nativas de plataforma (02-20) | `const` | `apps/api/src/domain/flow.ts:185` |
| 4 | lint `no-explicit-any` | teste da biblioteca de funções (02-17) | `eslint-disable-next-line`, mesmo padrão de `builder-test-run.test.ts` | `apps/api/tests/flow-functions.test.ts:21` |
| 5 | lint `no-empty` | `catch {}` do conteúdo dinâmico (02-19) | comentário explicando por que o erro é ignorado | `apps/management-vite/src/pages/builder/conteudo.ts:185` |
| 6 | painéis laterais (Filas, Configuração/Versões) com cabeçalho de tabela branco, texto escuro sobre fundo escuro, título de painel vazando da caixa e botão fechar branco | os painéis montam fora do contêiner escuro `.bl-editor` e herdavam os tokens do tema claro | tokens escuros no `.bl-panel`, título de painel lateral sem caixa, `th` e botão do cabeçalho transparentes (detalhe em `VERIFICACAO-VISUAL.md`) | `apps/management-vite/src/pages/builder/panel-block.css` |

## 3. Requisitos da fase: entregue, pendente de captura e plano de lacunas

| Requisito | Entregue (plano) | Pendente de captura (C-NN) | Vai para o plano de lacunas |
|---|---|---|---|
| **BUILDER-01** criar bloco de todos os tipos de conteúdo e ação | 16 dos 18 conteúdos com editor, motor e canal: mídia ×5 (02-10), Digitando, Pedir/Enviar localização, Web link (02-15), Quick reply, Menu, Texto, Entrada do usuário (existentes), Conteúdo HTTP e Conteúdo dinâmico (02-19), Pesquisa (bloco nativo, 02-11/02-12). 16 das 17 ações: scripts V1/V2 com sandbox `isolated-vm` e Monaco (02-16), SendMessageFromHttp e MergeContact (02-14), 5 ações de plataforma nativas e registradas em `EXTERNAL_DEPENDENCY_ACTIONS` (02-20), ExecuteTemplate/ExecuteBlipFunction (02-17/02-18), 5 já suportadas conferidas (02-14) | C-04..C-08 (layout dos editores de mídia; hoje link + legenda, sem upload), C-10 (formato real do Conteúdo HTTP), C-11, C-12, C-14, C-19, C-21 (ícones), C-22 (entrada/saída/global), C-24 (assinaturas `time`/`context`/`botTimeZone` e forma de `request.fetchAsync`), C-25 (rótulos de SendMessageFromHttp/SendCommand/SetBucket; o menu mostra "rótulo pendente de C-25"), C-26 (visibilidade de Excluir variável), C-27 (ciclo de vida da biblioteca: só a versão corrente existe), C-28 | Carrossel, Solicitar ligação, TrackContactsJourney (excedem a capacidade do slot); reconhecer o MIME da pesquisa na aba Conteúdo; sandbox em processo filho; fuso do script (hoje UTC); limites do Jint; DNS no `confirmarUrlSegura`; conexão do banco presa até 10 s por script/ProcessHttp. **AgenteDeIA** ficou `bloqueado` no portão (fora de escopo) |
| **BUILDER-02** buscar variável e função, e escolher destino por pesquisa | seletor de destino com busca sem acento/caixa nos três "Ir para" (02-09); biblioteca de funções com CRUD, busca e inserção no código (02-17/02-18); busca de variáveis no painel "Biblioteca de variáveis" (`filterVariables`, existente) | C-41 (forma exata do widget de destino), C-27 | JSON do ProcessHttp e demais campos de código no Monaco (item 7 aprovado); tooltip próprio |
| **BUILDER-03** pesquisa de satisfação nas saídas de atendimento humano, com paleta de tags | tabela `pesquisa_satisfacao_resposta` com RLS, motor que grava a resposta e endpoint de respostas (02-11); bloco nativo `survey:` escala 1-5, criação pelo "Novo bloco", filtro "Exibir apenas blocos de pesquisa de satisfação", 7 variáveis `input.content@*` (02-12); paleta de `$tags` sem azul (02-08) | C-29 (variável da resposta), C-30, C-31 (timeout do bloco de pesquisa, não implementado), C-32, C-33 (paleta exata), C-34..C-36 | criar a pesquisa com um clique a partir do seletor de uma saída de atendimento (hoje: Novo bloco → Pesquisa, depois ligar); aba Conteúdo reconhecer o MIME da pesquisa |
| **BUILDER-04** Filas, Teste (canal de teste ligado ao motor), copiar/colar, ícone `user-engaged`, exportar versão antiga | Versões: listar, exportar e restaurar versão antiga (02-13); atalho de Filas com contagem (02-13); painel de Teste rodando o motor real sobre o rascunho com contato de teste isolado, Debug embutido e reset, sem gravar em `mensagem`/`outbox_mensagem`/`conversa`/`execucao_fluxo` (02-21); copiar/colar confirmado com 4 testes (02-06); ícone `userEngaged` (02-08) | C-37/C-45 (acabamento do cabeçalho do Teste), C-18 (bolhas por tipo no Teste), C-38 (a Blip não mostra painel de filas embutido), C-39 (colunas de Versões), C-40 (ordem/ícones do menu de contexto) | **D-14 é simulação local por decisão do dono (2026-09-27)**: canal de teste real (ex.: número de WhatsApp de teste) fica como item futuro, não entregue. Salvar o rascunho antes da primeira mensagem de teste (hoje depende do autosave); remover o botão desabilitado "Conversa — em breve", agora redundante |
| **BUILDER-05** setas refletem toda ligação salva | `arestasDe()` caracterizada com 9 testes (saída normal, de atendimento, de disponibilidade, exclusão de `$isDeskDefaultOutput`, saída padrão sem seta como na referência) sem divergência (02-06); nada foi alterado sem evidência (02-09) | **C-42: validação com o fluxo real AUVP Capital continua bloqueada** (falta o export `{flow, globalActions}` + print do canvas). O requisito **não** está fechado com fluxo real | repetir `ref/validacao-setas.md` quando o dono entregar C-42; reconectar seta arrastando a ponta (lacuna #2) |

Interações do canvas aprovadas para o plano de lacunas (`LACUNAS-APROVADAS.md`): trava de edição compartilhada, reconectar seta arrastando, seleção múltipla, reordenar cards de conteúdo e saídas por arrasto, Alt+Enter, Ctrl+Y.

## 4. Itens do catálogo aprovado

| Item | Status final | Plano | Nota |
|---|---|---|---|
| Figurinha | IMPLEMENTADO | 02-10 | layout do editor C-04; link + legenda |
| Áudio | IMPLEMENTADO | 02-10 | C-05 |
| Imagem | IMPLEMENTADO | 02-10 | C-08 |
| Vídeo | IMPLEMENTADO | 02-10 | C-06 |
| Documento | IMPLEMENTADO | 02-10 | C-07 |
| Digitando | IMPLEMENTADO | 02-15 | sem mensagem de saída no canal |
| Pedir localização | IMPLEMENTADO | 02-15 | MIME `application/vnd.lime.input+json` como hipótese (C-11); o verificador não confere item sem MIME confirmado |
| Enviar localização | IMPLEMENTADO | 02-15 | C-11 |
| Web link | IMPLEMENTADO | 02-15 | C-12 |
| Quick reply | IMPLEMENTADO | existente | limites 3×20 conferidos (02-01) |
| Menu | IMPLEMENTADO | existente | limites 10×24 conferidos (02-01) |
| Carrossel | BLOQUEADO (C-09) | plano de lacunas | excede a capacidade do slot `conteudo-interativo`; formato não confirmado |
| Solicitar ligação | BLOQUEADO (C-13, C-20) | plano de lacunas | excede a capacidade; depende de infraestrutura de voz |
| Conteúdo HTTP | IMPLEMENTADO | 02-19 | envelope interno `application/vnd.pipe.*` até o envio; formato da Blip é C-10 |
| Conteúdo dinâmico | IMPLEMENTADO | 02-19 | sem MIME confirmado no catálogo (não conferido pelo script) |
| Pesquisa | IMPLEMENTADO | 02-11, 02-12 | bloco nativo; timeout C-31 não implementado; aba Conteúdo não reconhece o MIME (lacuna) |
| Texto | IMPLEMENTADO | existente | |
| Entrada do usuário | IMPLEMENTADO | existente | sem MIME no catálogo (não conferido pelo script) |
| ExecuteScript | IMPLEMENTADO | 02-16 | V8 no lugar do Jint; limites do Jint não reproduzidos |
| ExecuteScriptV2 | IMPLEMENTADO | 02-16 | `request.fetchAsync` provisório; `time`/`context`/`botTimeZone` ausentes (C-24) |
| SendMessageFromHttp | IMPLEMENTADO | 02-14 | rótulo C-25 |
| MergeContact | IMPLEMENTADO | 02-14 | cidade/gênero em `atributos` |
| SendCommand | EXTERNO (registrado) | 02-20 | também executa nativamente o subconjunto `ALLOWED_COMMAND_URIS`; rótulo C-25 |
| ProcessCommand | EXTERNO (registrado) | 02-20 | idem |
| ManageList | EXTERNO (registrado) | 02-20 | listas por tenant (tabelas da 0049/0050) |
| SetBucket | EXTERNO (registrado) | 02-20 | memória chave-valor por tenant; rótulo C-25 |
| ProcessContentAssistant | EXTERNO (registrado) | 02-20 | busca lexical na base de conhecimento |
| TrackContactsJourney | BLOQUEADO (excedente) | plano de lacunas | motor e tela ausentes; o verificador acusa os dois lados, como previsto |
| TrackEvent | IMPLEMENTADO | já suportada, 02-14 | `fireAndForget`, `extras`, valor decimal |
| ProcessHttp | IMPLEMENTADO | já suportada, 02-05 | retomada nas ações de entrada e varredura BullMQ |
| SetVariable | IMPLEMENTADO | já suportada, 02-14 | `expiration` em memória na execução |
| Redirect | IMPLEMENTADO | já suportada | |
| DeleteVariable | IMPLEMENTADO | já suportada | visibilidade no menu real da Blip é C-26 |
| ExecuteTemplate | IMPLEMENTADO | 02-17, 02-18 | |
| ExecuteBlipFunction | IMPLEMENTADO | 02-17, 02-18 | biblioteca só com versão corrente (C-27) |
| AgenteDeIA | BLOQUEADO | portão 02-07 | classificado `bloqueado` (fora de escopo desta fase) |

## 5. Verificação visual

Ver `ref/VERIFICACAO-VISUAL.md`: 11 telas/estados `VISUALLY VERIFIED`, 3 defeitos corrigidos, e as demais `NEEDS VALIDATION`, separadas em decisão do dono (fonte Nunito × IBM Plex misturadas, pílula `#282828`, botões do rodapé 40 × 48, "+ Adicionar…" 48 × 56, zoom com `--moss`, menu de adicionar conteúdo em lista com os primeiros itens cortados, "Novo bloco" e menu de ferramentas com raio/altura/cor diferentes, tabela de Versões larga demais) e captura pendente (C-18, C-37/C-45, C-38..C-42, C-44, C-46).

## 6. O que o dono confere

1. Esta página e `ref/VERIFICACAO-VISUAL.md`.
2. Subir `pnpm db:up`, a API e o `@pipe/management-vite`; abrir um fluxo no Builder.
3. Criar um bloco de cada tipo de conteúdo e uma ação de cada slot; publicar; conversar no painel de Teste e conferir o Debug.
4. Ligar blocos pelo seletor com busca; conferir as setas; criar a pesquisa de satisfação a partir do atendimento humano.
5. Exportar uma versão antiga pela aba Versões e reimportar.
6. Dizer, para as linhas NEEDS VALIDATION de "decisão do dono", se ficam como estão ou entram no plano de lacunas, e o que vai para a Phase 3 (OWNER APPROVED / VALSURF-05).

_Aprovação final: pendente. Depois da resposta, acrescentar aqui a linha do dono com a data (AAAA-MM-DD) e a resposta._

## Rodada F-1..F-6

**Rodado em:** 2026-10-05, checkout principal (branch `limpeza`, HEAD `37c65c78`), Postgres/Redis do docker já de pé (`pipe-postgres`, `pipe-redis`, equivalente a `pnpm db:up`). Comparação de assets desde `c7234632` (commit anterior ao `84d4a79e`, que abriu os planos 02-23..02-35). A árvore tinha arquivos modificados fora desta rodada (Desk/CRM/site), que não tocam o Builder.

| Gate | Comando | Saída | Resultado |
|---|---|---|---|
| Typecheck | `pnpm typecheck` | 0 | 25/25 tarefas (turbo em cache: entradas idênticas às já verificadas) |
| Testes do Builder (front) | `pnpm --filter @pipe/management-vite test` | 0 | 529 passaram, 0 falhas |
| Editor do core | `pnpm --filter @pipe/core exec vitest run src/flow/editor.test.ts` | 0 | 37/37 |
| API do Builder | `pnpm --filter @pipe/api exec vitest run tests/builder-by-flow.test.ts` | 0 | 17/17 (inclui versões e restauração) |
| HTML inseguro | `grep -rn "dangerouslySetInnerHTML" apps/management-vite/src/pages/builder apps/management-vite/src/pages/builder.tsx` | 1 (sem linhas) | vazio |
| Cor antiga | `grep -rn "#4a5d23\|--bl-verde" apps/management-vite/src/pages/builder apps/management-vite/src/pages/builder.css` | 1 (sem linhas) | vazio. O `builder.css` ainda usa `var(--moss)` (= `#4a5d23`) nas linhas 93, 294, 555 e 617, que o grep literal não pega; é o item já registrado como NEEDS VALIDATION na rodada anterior (zoom), fora do escopo F-1..F-6 |
| Assets da Blip (D-33) | `git diff --name-only --diff-filter=A c7234632 HEAD` filtrado por `.svg/.png/.woff/.woff2/.jpg/.gif/.webp/.ttf/.otf` e por `referencias-blip` | — | 0 arquivos binários novos; 0 caminhos de `referencias-blip` |

Nenhum gate vermelho; nenhuma correção nesta etapa.

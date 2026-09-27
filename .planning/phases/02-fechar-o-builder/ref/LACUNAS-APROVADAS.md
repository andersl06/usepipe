# Lacunas aprovadas para o plano de lacunas da Fase 2

**Aprovado pelo dono em:** 2026-09-27
**Origem:** comparativo de interações Blip × Pipe (levantamento somente leitura sobre `portal.js`, jsPlumb, `portal.css` e o código do Builder do Pipe) e excedentes do portão (`CLASSIFICACAO-PORTAO.md`).
**Uso:** entrada de `/gsd:plan-phase 2 --gaps`, depois que as waves em execução terminarem, para não disputar os mesmos arquivos do canvas.

## Interações do canvas (entram)

| # | Lacuna | Prioridade | Como a referência faz |
|---|---|---|---|
| 1 | Trava de edição compartilhada (uma pessoa ou aba edita por vez, pedido e transferência de vez) | alta | Strings `transferLock`, `transferLockRequest`, `sameUserRequestWriteLock`; estado `isWriteMode`, `isRequestingLock`, `userHasEditingPermission`. Hoje o autosave do Pipe sobrescreve em silêncio. |
| 2 | Reconectar uma seta existente arrastando a ponta de destino | alta | jsPlumb `beforeDrop` distingue mover ligação de criar ligação; mover a ponta de origem é bloqueado com aviso. |
| 3 | Seleção múltipla de blocos (Shift+clique) e arrasto em grupo | alta | `jsPlumb.addToDragSelection`. |
| 4 | Arrastar para reordenar cards de conteúdo e condições de saída | média | `ng-sortable` / alças `anchor-contents`, `anchor-outputs`. Hoje só Ações têm arrasto no Pipe. |
| 5 | Atalho Alt+Enter para tela cheia | média | `e.altKey && this.toggleFullscreen()`. |
| 6 | Ctrl+Y como alternativa de refazer | baixa | Atalho presente na referência. |

## Resíduos dos planos executados (entram no plano de lacunas)

- 02-12: aba Conteúdo não reconhece o MIME da pesquisa de satisfação (mostra "conteúdo não suportado"; o motor já processa). A pergunta hoje é editada na aba de saídas.
- 02-12: criar bloco de pesquisa com um clique a partir do seletor de destino de uma saída de atendimento (hoje: Novo bloco → Pesquisa, depois ligar).
- 02-09: validação das setas com o fluxo real AUVP Capital, bloqueada pela captura C-42 (export do fluxo + print do canvas).

- 02-16: sandbox de script roda dentro do processo da API (aprovado pelo dono em 2026-09-27: isolated-vm@6.2.0, @monaco-editor/react@4.7.0, monaco-editor@0.57.0, flag --no-node-snapshot). Endurecimento: mover o sandbox para um processo filho dedicado, para um script hostil não derrubar a API.

- 02-16: assinaturas de `time`, `context`, `botTimeZone` do ExecuteScriptV2 não expostas e `request.fetchAsync` com forma provisória (captura C-24); `localTimeZoneEnabled` sem efeito (script roda em UTC); limites do Jint no V1 (1000 instruções, recursão 50) não reproduzidos; script e ProcessHttp seguram conexão do banco dentro da transação por até 10 s; `confirmarUrlSegura` não resolve DNS (vale também para o ProcessHttp).
- Lint da API falha em dois arquivos antigos: `src/domain/management/sla.ts:61` e `tests/channel-of-flow.test.ts:486` (variável não usada).

## Fica de fora (decisão do dono)

- Animação de entrada do painel lateral (0,5 s na referência, instantânea no Pipe).

## Excedentes do portão (entram)

- Carrossel (7º item do slot `conteudo-interativo`).
- Solicitar ligação (8º item do slot `conteudo-interativo`; dependência de infra de voz a esclarecer).
- TrackContactsJourney (6º item do slot `acoes-plataforma`).

## Candidatas da tecnologia de renderização (aguardam aprovação do dono)

Levantamento de 2026-09-27: a Blip usa AngularJS 1.x (SPA, ui-router), jsPlumb nas setas, Vue nos cards de conteúdo, web components Stencil (`bds-*`), micro-frontends React no rodapé e navbar, Monaco no editor de script/JSON, SortableJS para reordenar. O Pipe é React 19 + React Router 7, canvas em SVG e pointer events à mão, sem lib de drag, canvas ou editor de código.

| # | Candidata | Prioridade | Observação |
|---|---|---|---|
| 7 | Editor de código com realce e autocompletar para script e JSON (Monaco na referência; hoje `<textarea>`) | alta | **APROVADO pelo dono em 2026-09-27: Monaco (`@monaco-editor/react`), carregado sob demanda.** Entra já no 02-16 para o editor de ExecuteScript/ExecuteScriptV2 (passa pelo checkpoint de legitimidade de pacote); JSON do ProcessHttp e demais campos de código vão para o plano de lacunas. |
| 8 | Tooltip próprio (hoje `title` do navegador) | média | CSS simples em `@pipe/ui`, sem lib nova. |
| 9 | Reordenação por arrasto consistente em todas as listas do painel | média | Mesmo item 4; reaproveitar o padrão `draggable` de `panel-actions.tsx`. |

Não entram: micro-frontends e web components (organização interna da referência, sem efeito visível).
- Teste instável: `apps/api/tests/flow-content.test.ts` > figurinha falhou uma vez com outro executor usando o mesmo Postgres em paralelo e passou isolado (2026-09-27). Rever na regressão final (02-22).

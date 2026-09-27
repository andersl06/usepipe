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

## Fica de fora (decisão do dono)

- Animação de entrada do painel lateral (0,5 s na referência, instantânea no Pipe).

## Excedentes do portão (entram)

- Carrossel (7º item do slot `conteudo-interativo`).
- Solicitar ligação (8º item do slot `conteudo-interativo`; dependência de infra de voz a esclarecer).
- TrackContactsJourney (6º item do slot `acoes-plataforma`).

## Pendente de levantamento

- Diferenças de comportamento causadas pela tecnologia de renderização (AngularJS, Vue `blip-cards`, web components Stencil, micro-frontends) × React do Pipe. Levantamento em andamento; entra aqui quando o dono aprovar.

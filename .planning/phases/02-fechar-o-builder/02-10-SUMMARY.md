---
phase: 02-fechar-o-builder
plan: 10
subsystem: builder
tags: [flow-engine, whatsapp, instagram, messenger, media, vitest, node-test]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder (02-05)
    provides: motor de fluxo (packages/core/src/flow) já com o padrão de whitelist dupla e ProcessHttp corrigido
  - phase: 02-fechar-o-builder (02-07)
    provides: catálogo aprovado no portão do dono (ref/catalogo-aprovado.json, ref/inventario-conteudo.md)
provides:
  - CONTEUDOS_SUPORTADOS do motor com application/vnd.lime.media-link+json
  - engineContentErrors (packages/core) validando uri/formato/limite por categoria de mídia, ligado a validarAcao (publish-time)
  - toChannelOutput (apps/api/src/domain/flow.ts) traduzindo SendMessage multi-tipo para o canal, com dados.midia
  - entrega de mídia do bot pelos workers (delivery.ts) reaproveitando o caminho de link já usado pelo atendente
  - editor de Figurinha/Áudio/Imagem/Vídeo/Documento no Builder (conteudo.ts + panel-content.tsx)
affects: [02-11, 02-12, 02-13, 02-14, 02-15, 02-16, 02-17, 02-18, 02-19, 02-20, 02-21, 02-22]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Validação de conteúdo de mídia compartilhada entre motor (engineContentErrors) e editor (contentErrors chama a mesma função de @pipe/core), evitando duas fontes de mensagem de erro (D-24)"
    - "$typeOfContent como memória do card escolhido pelo autor quando o MIME sozinho não distingue (mesmo mecanismo já usado por Menu vs Quick reply em application/vnd.lime.select+json)"

key-files:
  created:
    - apps/api/tests/flow-content.test.ts
    - apps/management-vite/tests/builder-content.test.ts
  modified:
    - packages/core/src/flow/editor.ts
    - packages/core/src/flow/editor.test.ts
    - packages/core/src/flow/modelos.ts
    - apps/api/src/domain/flow.ts
    - apps/workers/src/delivery.ts
    - apps/management-vite/src/pages/builder/conteudo.ts
    - apps/management-vite/src/pages/builder/panel-content.tsx
    - packages/ui/src/icones.tsx

key-decisions:
  - "As cinco categorias (Figurinha, Áudio, Imagem, Vídeo, Documento) compartilham o MIME application/vnd.lime.media-link+json; a distinção fica só no MIME real dentro de content.type — a referência também não as distingue de outra forma (ref/inventario-conteudo.md, seção Figurinha)"
  - "engineContentErrors mora em editor.ts e é chamada por validarAcao (modelos.ts) para SendMessage, então o publish já recusa settings de mídia inválidos sem tocar apps/api"
  - "Todos os 3 canais (WhatsApp Cloud API, Instagram, Messenger) já enviam mídia por link; a cláusula do plano sobre 'baixar quando o canal exige upload' não teve código correspondente a escrever nesta rodada — nenhum canal aqui exige upload"
  - "apps/workers/src/whatsapp/media.ts não foi tocado: seu validateMedia valida bytes reais de anexo do atendente (Desk), um caminho ortogonal ao de mídia declarada pelo fluxo (bot); manter os dois separados evitou uma dependência cruzada desnecessária entre pacotes"
  - "Sem widget de upload ainda (capturas #4-#8 pendentes), o editor aceita link + legenda e usa um MIME padrão por categoria; o campo size do LIME não é exposto na tela ainda, mas o motor já valida quando presente (fluxo importado)"

requirements-completed: [BUILDER-01]

# Metrics
duration: ~2h40min
completed: 2026-09-26
---

# Phase 2 Plan 10: Fechar o slot conteudo-midia ponta a ponta Summary

**Figurinha/Áudio/Imagem/Vídeo/Documento fecham o ciclo completo — editor no Builder, validação no motor, tradução multi-tipo em `apps/api` e entrega real via WhatsApp/Instagram/Messenger — todos os 5 sobre o mesmo envelope `application/vnd.lime.media-link+json`.**

## Performance

- **Duration:** ~2h40min
- **Tasks:** 3
- **Files modified:** 8 modificados + 2 criados

## Accomplishments

- Motor (`packages/core`) aceita `application/vnd.lime.media-link+json` e recusa a publicação com a mensagem literal do inventário quando falta `uri` ou o formato/tamanho declarado passa do limite documentado (16 MB áudio/vídeo, 100 MB documento; imagem sem teto).
- `apps/api` traduz a saída do bot para cada canal (`toChannelOutput`): mídia vira `mensagem.tipo` correto (`imagem`/`audio`/`video`/`documento`) com `dados.midia`, sempre depois de passar por `confirmarUrlSegura` (SSRF).
- Os workers entregam a mídia do bot pelo mesmo caminho por link já usado para anexos do atendente, sem exigir upload prévio a um `anexo` do Pipe.
- O Builder ganha os cinco tipos no menu "+", na posição do inventário congelado (itens 1-5 de 18), com editor de link + legenda e as mesmas mensagens de erro do motor.
- Gate `conferir-catalogo.mjs --slot conteudo-midia` sai `OK 5 itens`.

## Task Commits

1. **Task 1: Motor aceita e valida os tipos de mídia (editor.ts)** - `6b6785b` (feat)
2. **Task 2: Saída do bot multi-tipo e entrega por canal** - `c0c366c` (feat)
3. **Task 3: Editor de cada tipo de mídia no Builder** - `b615d61` (feat)

_Nenhuma task era `tdd="true"`; os testes foram escritos junto de cada mudança, não em ciclo RED/GREEN separado._

## Files Created/Modified

- `packages/core/src/flow/editor.ts` - `CONTEUDOS_SUPORTADOS` + `engineContentErrors(tipo, settings)` (uri obrigatório, formato/limite por categoria)
- `packages/core/src/flow/editor.test.ts` - `describe('media content')`: 3 testes por tipo (válido/uri ausente/formato-limite) + 3 testes de integração via `flowErrors`
- `packages/core/src/flow/modelos.ts` - `validarAcao` chama `engineContentErrors` para `SendMessage`, então `flowErrors`/publish já recusam
- `apps/api/src/domain/flow.ts` - `toChannelOutput`, `gravarRespostaDoBot` agora recebe `texto` anulável e `TipoEnvio`
- `apps/api/tests/flow-content.test.ts` - webhook → outbox → dublê do WhatsApp para os 5 tipos + caso de URL insegura
- `apps/workers/src/delivery.ts` - `montarConteudo` aceita `dados.midia.url` (mídia do bot) antes de exigir `anexo`
- `apps/management-vite/src/pages/builder/conteudo.ts` - `novaFigurinha/novoAudio/novaImagem/novoVideo/novoDocumento`, `definirMidia`, branch `midia` em `cardsOf`/`contentErrors`
- `apps/management-vite/src/pages/builder/panel-content.tsx` - 5 itens no menu "+" e card de edição (link + legenda)
- `apps/management-vite/tests/builder-content.test.ts` - ida e volta por tipo, mensagem de campo obrigatório, limite de tamanho, fallback de categoria sem `$typeOfContent`
- `packages/ui/src/icones.tsx` - 5 ícones novos (figurinha/audio/imagem/video/documento)

## Decisions Made

- MIME único para os 5 tipos: a distinção fica em `content.type` (o MIME real do arquivo) e em `$typeOfContent` (memória do editor) — nunca inventada, confirmada pela seção Figurinha do inventário ("a referência não distingue Figurinha de outros media-link além do MIME do arquivo enviado").
- `engineContentErrors` mora em `editor.ts` (Task 1) mas é chamada por `validarAcao` em `modelos.ts`: import circular seguro porque `editor.ts` só importa tipos de `modelos.ts` (`import type`, apagado em tempo de execução) — sem ciclo real em runtime.
- `apps/api/src/domain/flow.ts` ganhou `toChannelOutput` sem parâmetro de canal: nenhum dos 3 canais implementados hoje (WhatsApp Cloud API, Instagram, Messenger) precisa de comportamento diferente para estes 5 tipos — todos já suportam `imagem`/`audio`/`video`/`documento` por link. O parâmetro do texto do plano (`canal`) ficaria sem uso; adicioná-lo seria complexidade especulativa (YAGNI). Se um tipo futuro precisar de fallback por canal, o ponto de extensão é o mesmo `toChannelOutput`.
- `apps/workers/src/whatsapp/media.ts` não precisou de mudança: seu `validateMedia`/`POLICY_MEDIA_DEFAULT` valida bytes reais de um anexo já enviado ao storage do Pipe (caminho do atendente/Desk); a mídia do bot vem de uma URL externa declarada no fluxo, sem bytes conhecidos até o download real (que nenhum canal exige aqui). Os dois caminhos continuam paralelos e intencionalmente não fundidos nesta rodada.
- Sem widget de upload real (pendente, capturas #4-#8 do inventário), o editor aceita **link + legenda**; o MIME real é um padrão por categoria (`image/webp`, `audio/mp3`, `image/png`, `video/mp4`, `application/pdf`), ajustável por quem editar manualmente o `content.type` de um fluxo importado. O campo `size` do LIME (usado no limite de 16/100 MB) não tem campo próprio na tela ainda — o motor já o valida quando presente, então um fluxo importado com `size` continua sendo barrado corretamente.
- Ícones novos em `packages/ui/src/icones.tsx` são desenhos simples originais (não cópias verificadas do Tabler, ao contrário do resto do arquivo) — o glifo exato de cada um dos 5 tipos é captura pendente (#3 do inventário); o mecanismo (ícone presente, ligado ao menu certo) não depende do glifo final.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `gravarRespostaDoBot` grava `mensagem.tipo` fixo em `'texto'`**
- **Found during:** Task 2
- **Issue:** Antes desta plan, toda resposta do bot (inclusive mídia, se alguma escapasse) seria gravada como `tipo = 'texto'`, quebrando a entrega correta no worker.
- **Fix:** `gravarRespostaDoBot` recebe `tipo: TipoEnvio = 'texto'` e `texto: string | null`; `toChannelOutput` decide o tipo real.
- **Files modified:** `apps/api/src/domain/flow.ts`
- **Verification:** `flow-content.test.ts` (5 tipos) + `flow.test.ts` (regressão de texto/menu) verdes.
- **Committed in:** `c0c366c`

**2. [Rule 1 - Bug] `delivery.ts` exigia `anexo_id` para toda mensagem de mídia**
- **Found during:** Task 2
- **Issue:** `montarConteudo` recusava com `anexo_ausente` qualquer mensagem de mídia sem um `anexo` do Pipe — a mídia do bot nunca teria um, porque vem de URL externa do fluxo, não de upload.
- **Fix:** `montarConteudo` primeiro tenta `dados.midia.url` (mídia do bot); só cai para a exigência de `anexo` quando esse campo não existe (mídia do atendente).
- **Files modified:** `apps/workers/src/delivery.ts`
- **Verification:** `flow-content.test.ts` — os 5 tipos chegam a `estado_entrega = 'enviada'` via `processarOutbox()` real.
- **Committed in:** `c0c366c`

---

**Total deviations:** 2 auto-fixed (2 Rule 1/2 — correção de comportamento essencial para a mídia do bot funcionar de ponta a ponta)
**Impact on plan:** Ambos eram pré-requisitos silenciosos do próprio objetivo da plan (bot entrega mídia); sem eles a Task 2 não fecharia. Nenhum escopo novo além do que a plan já pedia.

## Issues Encountered

- `pnpm --filter <pkg> typecheck` falha isoladamente porque `typecheck` depende de `^build` no `turbo.json` — os pacotes `@pipe/db`, `@pipe/workers`, `@pipe/authentication`, `@pipe/contracts` precisam ser compilados primeiro para gerar `.d.ts`. Rodar via `pnpm exec turbo run typecheck --filter=<pkg>` (que builda as dependências antes) resolve; confirmado comparando o mesmo erro presente também no HEAD sem nenhuma mudança desta plan (pré-existente, fora de escopo, já citado em STATE.md).

## User Setup Required

None - nenhuma configuração de serviço externo.

## Next Phase Readiness

- O padrão de validação dupla (motor `engineContentErrors` + editor `contentErrors` chamando a mesma função) fica pronto para os próximos slots (`conteudo-interativo`, `conteudo-dinamico`) reaproveitarem sem reinventar mensagens.
- `toChannelOutput` é o ponto de extensão natural para os próximos tipos que precisarem de comportamento por canal (nenhum dos 5 desta plan precisou).
- Pendências explícitas para revisitar quando as capturas do dono chegarem (D-03): ícone exato de cada tipo (#3), layout completo do card (#4-#8), preview fechado no Builder (#14), comportamento de canal quando ele realmente não suporta um tipo futuro (#17) — nenhuma delas bloqueia o mecanismo fechado nesta plan.

---
*Phase: 02-fechar-o-builder*
*Completed: 2026-09-26*

## Self-Check: PASSED

Todos os 11 arquivos citados (criados/modificados) confirmados no disco com `[ -f ]`; os 3 hashes de commit de task (`6b6785b`, `c0c366c`, `b615d61`) confirmados com `git cat-file -t` (todos `commit`). Nenhum item ausente.

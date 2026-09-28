---
phase: 02-fechar-o-builder
plan: 30
subsystem: builder
tags: [react, vitest, design-fidelity, variables]

# Dependency graph
requires:
  - phase: 02-fechar-o-builder
    provides: FloatingSidebar shell (02-26); EditorState.configuracao/validConfigKey (02-29)
provides:
  - system-variables.ts com BLIP_SYSTEM_VARIABLES (118 variáveis de sistema da Blip, marcadas suportada/não suportada)
  - variables.ts com userVariables completa (HTTP/script/template/função + configuration) e busca accent-sensitive da biblioteca
  - panel-variables.tsx reescrito na casca de 02-26, com zebra, busca por aba e cópia com "Copiado!"
affects: [02-31-aba-variaveis-configuracao]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Duas famílias de busca em variables.ts: normalizar()/filterVariables() (accent-insensitive, para o seletor de destino e sugestão de tags) vs includesLibrary()/systemFilterVariables()/userLibraryFilter() (accent-sensitive, só para a Biblioteca de variáveis — comportamento do filter: do AngularJS na Blip)"
    - "actionsAdd() varre um conjunto fixo de chaves de campo (variable/outputVariable/responseStatusVariable/responseBodyVariable) em vez de checar o type da ação, cobrindo SetVariable/DeleteVariable/ProcessCommand/ProcessHttp/ExecuteScript(V2)/ExecuteTemplate/ExecuteBlipFunction/ProcessContentAssistant de uma vez"
    - "Classes CSS novas bl-library-* em vez de reaproveitar bl-variable-name/bl-variables-list, que outro painel (flow-functions-panel.tsx, fora deste plano) também usa"

key-files:
  created:
    - apps/management-vite/src/pages/builder/system-variables.ts
  modified:
    - apps/management-vite/src/pages/builder/variables.ts
    - apps/management-vite/src/pages/builder/panel-variables.tsx
    - apps/management-vite/src/pages/builder/editor.css
    - apps/management-vite/src/pages/builder.tsx
    - apps/management-vite/tests/builder-painels.test.ts

key-decisions:
  - "Catálogo das 118: xk.Ay (113, incondicionais) + xk.hL (1, contact.taxDocument) + xk.WO (4, contact.whatsApp*) de portal.js:264780, que juntos batem com a contagem medida ao vivo em CAPTURAS-F1-F6.md (118, que tem precedência sobre o texto mais antigo de FIDELIDADE-F1-F6.md, que sugeria excluir os 5 condicionados a flag — ver Deviations)"
  - "suportada: true quando a fonte (antes do primeiro ponto) está em FONTES_SUPORTADAS (context/contact/config/input/state) E, para input.*, a propriedade tem branch real em inboundProvider — input.contentAssistant.* e input.message.pp(identity) ficam suportada:false por não terem branch, mesmo a fonte sendo suportada; total 42 suportadas de 118"
  - "\"Minhas variáveis\" lista as chaves de configuration como config.<chave>, no mesmo formato {{config.Chave}} que o texto de ajuda da Configuração já usa"
  - "Nomes de classe CSS novos (bl-library-*) em vez de reaproveitar bl-variable-name/bl-variables-list: bl-variable-name também é usado por flow-functions-panel.tsx (fora deste plano) com fonte 13/700 — reaproveitar teria mudado aquele painel sem pedido"
  - "Faixa das abas transparente e corpo #141414 aplicados só a .bl-panel--flutuante.bl-panel--esquerda (a Biblioteca); Configuração e Filas, à direita, continuam com o visual padrão da casca"

# Metrics
duration: ~35min
completed: 2026-09-28
requirements-completed: [BUILDER-02]
---

# Phase 02 Plan 30: Biblioteca de variáveis (F-3) Summary

**Biblioteca de variáveis reescrita para bater com a Blip: 118 variáveis de sistema (nome + descrição pt-BR + marca de suporte do motor), "Minhas variáveis" completa com saídas de HTTP/script/função e chaves de configuration, busca por aba sensível a acento, zebra, e cópia do nome puro com tooltip "Copiado!" sem toast.**

## Performance

- **Tasks:** 2/3 automáticas concluídas; Task 3 é `checkpoint:human-verify` — ver seção abaixo
- **Files modified:** 6 (1 criado)
- **Commits:** 2 (`db9fe620`, `5ad555b2`)

## Accomplishments

### Task 1 — Catálogo das 118, "Minhas variáveis" completa e busca da Blip (`db9fe620`)

- `system-variables.ts` novo: `BLIP_SYSTEM_VARIABLES`, as 118 variáveis literais extraídas de `portal.js:264780` (`xk.Ay`+`xk.hL`+`xk.WO`) com a descrição pt-BR de `vendor-app_modules_translate_translationLoaders_sync_recursive_js_...js:2610` (`varLibrary.variables`), ordenadas por `localeCompare`, cada uma marcada `suportada` conforme o que `@pipe/core/flow/context.ts` (`FONTES_SUPORTADAS` + `inboundProvider`) realmente preenche.
- `variables.ts`: `userVariables(mapa, global, configuration)` agora cobre `responseStatusVariable`/`responseBodyVariable` (ProcessHttp), `outputVariable` (ExecuteScript/V2, ExecuteTemplate, ExecuteBlipFunction, ProcessContentAssistant), `variable` (SetVariable/DeleteVariable/ProcessCommand), `input.variable` de conteúdo e as chaves de `configuration` como `config.<chave>` — tudo ordenado, sem repetição.
- Duas famílias de busca: a existente `normalizar()`/`filterVariables()` (accent-insensitive) ficou intacta para o seletor de destino e a sugestão de tags; `systemFilterVariables()`/`userLibraryFilter()` novas usam comparação accent-sensitive (só `toLowerCase()`), reproduzindo o `filter:` do AngularJS da Blip (F-3.1: "sem diferenciar maiúsculas, mas sensível a acento").
- Testes primeiro em `builder-painels.test.ts`: contagem/ordem/descrição/suporte das 118, coleta das novas variáveis de saída + `configuration`, e a diferença accent-sensitive vs accent-insensitive entre as duas famílias de busca.

### Task 2 — Painel da Biblioteca como na Blip (`5ad555b2`)

- `panel-variables.tsx` reescrito: abas "Biblioteca de variáveis"/"Minhas variáveis"; um estado de busca por aba (`buscaSistema`/`buscaUsuario`) com ícone de lupa e o placeholder "Digite um nome ou tema para buscar variáveis"; lista com zebra `#141414`/`#1f1f1f` (sem raio, sem espaço entre linhas), nome acima da descrição, botão de copiar 40×40 logo à direita do nome, visível só no hover da linha (`.2s`); clique copia o nome puro (`navigator.clipboard`, com fallback `execCommand('copy')` para contexto sem clipboard) e troca o tooltip nativo "Copiar" por um tooltip claro "Copiado!" por 1000ms — sem toast; item não suportado ganha a nota "Não disponível no Pipe" abaixo da descrição; "Minhas variáveis" só com o nome, linhas de 60px; vazio "Nenhuma variável encontrada" nas duas abas, sobre uma faixa `#1f1f1f` (mais clara que o `#141414` do corpo).
- `editor.css`: regras novas `bl-library-*` (busca, lista, zebra, botão de copiar, tooltip, vazio) mais a faixa de abas transparente e o corpo `#141414`, escopados a `.bl-panel--flutuante.bl-panel--esquerda` — não mexem em Configuração/Filas (painel direito) nem em `flow-functions-panel.tsx`, que reaproveita `.bl-variable-name` (deixado intocado).
- `builder.tsx`: passa `state.configuracao` para `VariablesPanel`; removeu `onAviso` (a Biblioteca não usa mais toast).

## Verification

- `pnpm --filter @pipe/management-vite test`: **385/385 passando** (rodado após cada task; nenhuma falha).
- `pnpm --filter @pipe/management-vite typecheck`: **limpo** (`tsc --noEmit`, sem erros).
- `pnpm --filter @pipe/management-vite lint`: **limpo** (`eslint src tests`, sem erros).
- Greps da Task 2 (todos confirmados):
  - `grep -q "Digite um nome ou tema para buscar variáveis" panel-variables.tsx` → OK
  - `grep -q "Minhas variáveis" panel-variables.tsx` → OK
  - `! grep -q "Variável copiada" panel-variables.tsx` → OK (texto de toast removido)

Todas as verificações acima foram efetivamente executadas nesta sessão, com os comandos e saídas observados (não assumidas).

## Deviations from Plan

### Auto-fixed / resolved issues

**1. [Rule 3 — blocking, ambiguity in the source text] Contagem das 118 variáveis de sistema**

- **Found during:** Task 1, ao ler `xk.Ay` em `portal.js:264780`.
- **Issue:** `02-CONTEXT.md`/`FIDELIDADE-F1-F6.md` (texto anterior à captura ao vivo) descrevem `xk.Ay` como já tendo 118 itens e mandam excluir "as 5 que dependem de flag" (`xk.hL`/`xk.WO`, em `P:270446`). Ao ler o JSON literal, `xk.Ay` tem **113** itens; só `xk.Ay + xk.hL + xk.WO` chega a 118 — e essa é exatamente a contagem que `getDefaultVariables()` produz quando as duas flags (`showTaxDocumentVariable`, `showNewBsuidVariable`) estão ligadas, que é o que `CAPTURAS-F1-F6.md` (medida ao vivo, com precedência explícita sobre os valores [A]) reporta ter visto na conta AUVP Capital DEV: "118 variáveis de sistema da Blip".
- **Fix:** `BLIP_SYSTEM_VARIABLES` usa os 118 = `xk.Ay` + `xk.hL` + `xk.WO`, batendo com a contagem medida ao vivo e com o teste `BLIP_SYSTEM_VARIABLES.length === 118` do próprio plano (que é a fonte de maior precedência: um requisito explícito em `<behavior>`).
- **Files modified:** `apps/management-vite/src/pages/builder/system-variables.ts`
- **Commit:** `db9fe620`

Nenhuma outra divergência de código: as demais escolhas (marca de `suportada`, formato `config.<chave>`, classes CSS novas) estão documentadas em `key-decisions` acima porque eram decisões abertas ao planejador (plan text: "escolha de discrição do planejador", "esforço S/M... decisão do dono" já resolvida em D-56 item 2 para nome puro/118 itens), não desvios do que o plano pedia.

## Known Stubs

Nenhum. Os 76 itens `suportada: false` não são stubs: são o comportamento pedido pelo plano (D-56 item 2 — "marcando as que o motor do Pipe ainda não preenche"), com o rótulo "Não disponível no Pipe" explicando cada um.

## CHECKPOINT (Task 3 — não aguardado, ver `<resume-signal>` abaixo)

**Type:** human-verify
**Status:** aguardando o dono; código e testes automatizados já passam. Servidor de dev NÃO foi iniciado nesta sessão — o dono precisa rodar o Builder local para os passos abaixo.

### O que foi construído

Biblioteca de variáveis com 118 variáveis de sistema marcadas (suportada/não suportada), "Minhas variáveis" completa (SetVariable/DeleteVariable, saídas de HTTP/script/template/função, `input.variable`, chaves de `configuration`), busca por aba sensível a acento, zebra `#141414`/`#1f1f1f`, cópia do nome puro no hover com tooltip "Copiado!" (sem toast).

### Como verificar (passo a passo no navegador)

1. Suba o Builder local (`pnpm --filter @pipe/management-vite dev` ou o fluxo de dev habitual) e abra um fluxo existente no Builder.
2. Na pílula da esquerda, clique no **5º botão** (tooltip "Biblioteca de variáveis") para abrir o painel.
3. **V-F3-01 (medidas):** com `ref/medir-tela.js` (`getBoundingClientRect`/`getComputedStyle`), meça o painel, o cabeçalho (só o X, sem título), as abas ("Biblioteca de variáveis" | "Minhas variáveis", 46px, sublinhado 2px na ativa), a busca (383×42, ícone de lupa, borda `rgba(255,255,255,.2)`, raio 8) e os dois primeiros `li` (zebra `#141414`/`#1f1f1f`, padding 10px 20px) e o botão de copiar (40×40). Compare com `ref/CAPTURAS-F1-F6.md` §F-3.
   - **Esperado:** medidas batem com a captura; único desvio de cor aceitável é azul→verde (`--p-builder-marca-*`) nos elementos de marca.
4. **V-F3-02 (cópia):** passe o mouse sobre uma linha da aba Biblioteca → o botão de copiar aparece; clique → o tooltip muda para "Copiado!" por ~1s, sem nenhum toast no canto da tela; cole o valor num campo de texto qualquer.
   - **Esperado:** o texto colado é o nome puro (ex.: `contact.name`, sem `{{ }}`).
5. **V-F3-03 (busca sem resultado):** digite "zzzz" na busca de qualquer uma das abas.
   - **Esperado:** aparece "Nenhuma variável encontrada" em texto pequeno cinza sobre uma faixa um pouco mais clara que o fundo da lista.
6. **V-F3-04 ("Minhas variáveis"):** num fluxo com um bloco de Requisição HTTP (ou script) configurado com variável de saída, abra a aba "Minhas variáveis".
   - **Esperado:** a variável de saída aparece na lista, junto com qualquer `SetVariable`/entrada de usuário/chave de `configuration` já usada no fluxo; sem descrição, linhas de 60px.
7. **V-F3-05 (convivência):** com a Biblioteca aberta, clique em um bloco do canvas para abrir o painel dele.
   - **Esperado:** os dois painéis (Biblioteca à esquerda, bloco à direita) ficam abertos ao mesmo tempo, sem um fechar o outro.
8. Confira se o rótulo "Não disponível no Pipe" (abaixo da descrição, nas variáveis de sistema não suportadas — ex.: `bucket.?`, `tunnel.*`, `agent.*`) está legível e não quebra o layout.

### Resume-signal

Responder **"aprovado"**, ou listar as diferenças encontradas (elas viram correção dentro deste mesmo plano, antes de fechar BUILDER-02).

## Self-Check: PASSED

- FOUND: `apps/management-vite/src/pages/builder/system-variables.ts`
- FOUND: `apps/management-vite/src/pages/builder/panel-variables.tsx`
- FOUND commit `db9fe620` (`git log --oneline --all`)
- FOUND commit `5ad555b2` (`git log --oneline --all`)
- Nenhum item ausente.

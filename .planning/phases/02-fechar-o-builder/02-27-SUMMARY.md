---
phase: 02-fechar-o-builder
plan: 27
subsystem: builder
tags: [builder, toast, erros, publicar, d-56]
dependency-graph:
  requires: ["02-26"]
  provides: ["builder-toast-unico"]
  affects: ["apps/management-vite/src/pages/builder.tsx", "apps/management-vite/src/pages/builder/editor.tsx"]
tech-stack:
  added: []
  patterns:
    - "fila de toast pura (toast-queue.ts) + timer de 250ms no componente (toast.tsx)"
    - "publicar sem modal: erro de validação nunca chega ao servidor, só o toast"
key-files:
  created:
    - apps/management-vite/src/pages/builder/toast-queue.ts
    - apps/management-vite/src/pages/builder/toast.tsx
    - apps/management-vite/tests/builder-toast.test.ts
  modified:
    - apps/management-vite/src/pages/builder.tsx
    - apps/management-vite/src/pages/builder.css
    - apps/management-vite/src/pages/builder/editor.tsx
    - apps/management-vite/src/pages/builder/editor.css
    - packages/ui/src/icones.tsx
decisions: []
metrics:
  duration: "~1 sessão"
  completed: 2026-09-28
---

# Phase 02 Plan 27: F-6 toast único (bottom-left, D-56) Summary

Toast único do Builder, no canto inferior esquerdo, como o da Blip (F-6.1 K): fila pura testada, componente com gradiente por tom, até 6 empilhados com o mais novo no topo, pausa no hover. Publicar com erro mostra só esse toast (sem faixa, sem modal, sem lista) — a faixa permanente de erros e o modal "Publicar fluxo" foram removidos (D-56 item 1).

## Task 1 — Fila de toasts e componente

- `toast-queue.ts`: `pushToast`/`dismissToast`/`expireToasts` puros, `TOAST_LIMIT=6`, `TOAST_DURATION_MS=5000`. `expireToasts` mantém os toasts pausados e reempurra o prazo deles (`expiraEm = agora + duracaoMs`) a cada chamada; ao sair do `pausados`, o prazo já está recalculado do zero em vez de vencido.
- `toast.tsx`: `BuilderToasts({ toasts, onFechar, onPausar, onRetomar })`. Guarda uma cópia local da lista (`local`) sincronizada com a prop `toasts`, para preservar entre re-renders do pai o `expiraEm` recalculado dos itens pausados; um `setInterval` de 250ms dentro do próprio componente chama `expireToasts` e avisa o pai via `onFechar` para cada id que sumiu. `onPausar`/`onRetomar` são chamados a cada hover/saída (o componente já resolve a pausa sozinho; os callbacks ficam disponíveis para o pai observar, hoje sem uso em `builder.tsx`).
- `editor.css`: `.bl-toast` reescrito com as medidas do F-6.1 K (`left:18px; bottom:20px`, raio 10, padding 14px 20px, 14px branco, base `#4a4a4a`, gradientes `90deg` por tom — sucesso `#00e4e8→#00d3be`, aviso `#ffbd4e→#ffb04f`, perigo `#ff654b→#ff807f` —, ícone com `margin-right:25px`, entrada deslizando em .3s). `ref/CAPTURAS-F1-F6.md` §F-6 não mediu o toast ao vivo; os valores são os do código da Blip citados em `FIDELIDADE-F1-F6.md` §F-6.1 K, como o plano instruiu.
- `icones.tsx`: novo glifo `perigo` (círculo com "!", D-33) para o tom perigo; `alerta` (aviso) e `cheque` (sucesso) reaproveitados.
- `builder-toast.test.ts`: limite de 6 descartando o mais antigo, mais novo no topo, duração padrão de 5s, `titulo`/`duracaoMs` custom, `dismissToast` isolado, e o ciclo pausa→retomada de `expireToasts` (prazo recalculado ao pausar, expira só depois do novo prazo).

**Verificação:** `pnpm --filter @pipe/management-vite test` — 361/361 passando. `pnpm --filter @pipe/management-vite typecheck` — sem erros.

## Task 2 — Publicar/salvar por toast; remover faixa e modal (D-56)

- `builder.tsx`: estado único `toasts` (`Toast[]`) com um `toast(input)` que chama `pushToast`; `<BuilderToasts>` montado uma vez, ao final do componente. Removidos: `recado`/`Etiqueta` fixa do rodapé, a faixa `role="alert"` "O motor recusaria este fluxo…", o modal "Publicar fluxo" inteiro e os estados `publicarAberto`/`publicationError`.
- Botão "Publicar fluxo": nunca desabilitado por erro — só por falta de permissão, "nada para publicar" (guarda específica do Pipe, fora do escopo de F-6) e durante a publicação. Ao clicar:
  - `errors.length > 0` → toast de aviso com o texto de validação exato do F-6.1 H e **retorna sem chamar a API**;
  - senão publica direto, com o ícone da pílula trocando para o spinner (`ManagementIcon nome="atualizar" className="bl-girando"`) por no mínimo 2s (`aguardarMinimo`), mesmo que a resposta chegue antes;
  - 200 → toast de sucesso `"Fluxo publicado!"` (texto literal do F-6.1 H, sem o detalhe de versão que o Pipe mostrava antes — ver Assumption Drift);
  - 409 cujo `mensagem` contenha `"laço"` (é assim que `packages/core/src/flow/modelos.ts:203` nomeia o erro de loop) → toast de perigo com `titulo` = "Existe um loop no seu fluxo começando no bloco '{nome}' que não requer entrada de usuário." e `texto` = "Inclua uma ou mais entradas do usuário nos blocos ligados a este." (as "duas linhas" do F-6.1 H, sem `<br/>`/HTML — T-2-27-01); `engineErrors` continua guardado para o nó ficar vermelho (02-28);
  - qualquer outro erro (inclusive falha ao salvar o rascunho antes de publicar) → toast de perigo "Erro ao publicar o fluxo".
- Falha de autosave: `useEffect` observando `recording` dispara o toast de perigo "Erro ao salvar o fluxograma" uma vez por transição para `recording.state === 'erro'`; a pílula "Salvo" mantém "Tentar de novo" e ganhou a classe `bl-status--erro` (`builder.css`: texto branco, sem fundo claro, ícone em vermelho via `--p-error-on-dark`).
- `VariablesPanel.onAviso` e `ConfigurationPanel.onImport`/`restaurarVersaoAntiga` agora chamam `toast({ tom: 'sucesso', texto })` em vez de `setRecado`.
- `builder.css`: removidas `.bl-notice--error`, `.bl-errors`, `.bl-errors--modal` (só usadas pela faixa/modal removidos; o `.bl-errors` que os painéis (`panel.tsx`, `panel-actions.tsx`, `panel-outputs.tsx`) ainda usam vem de `editor.css`, intocado) e `.bl-recado` (ficou sem uso). Nova `.bl-status--erro`.
- `editor.tsx`: removido o toast local centralizado (`aviso`, `.bl-toast`, timeout de 4s). Novo prop `onAviso: (input: ToastInput) => void` recebido do Builder. Função interna `avisar(texto: string)` mapeia os avisos que `Canvas`/`BlockPanel` continuam emitindo como texto puro (assinatura `(texto: string) => void` inalterada, para não mexer em `canvas.tsx`/`panel.tsx`/`panel-actions.tsx`/`panel-outputs.tsx`/`panel-content.tsx`/`panel-variables.tsx`, fora do escopo deste plano) para o tom certo:
  - `"Copie um bloco do Builder antes de colar."` (colar sem nada válido para colar) → toast de perigo com `titulo`/`texto` = as duas linhas exatas da Blip ("O conteúdo copiado não é um bloco válido." / "Tente de novo.");
  - qualquer aviso cujo texto contenha "copiado"/"copiada"/"colado" (ex.: "Bloco copiado.", "Variável copiada.", "Bloco colado.", "Id copiado.") → sucesso;
  - qualquer outro (limite de 25/15, "Copie um bloco do Builder…" não se aplica aqui pois já tratado acima, mensagens de `ligar`/exclusão) → aviso.

**Verificação:**
- `pnpm --filter @pipe/management-vite typecheck` — sem erros.
- `pnpm --filter @pipe/management-vite test` — 361/361 passando.
- `pnpm --filter @pipe/management-vite lint` — sem erros (checagem extra, não pedida pelo `<verify>` do plano, rodada por precaução após remover `Etiqueta`/`Modal`).
- Greps do plano: `BuilderToasts` presente em `builder.tsx`; `"Um ou mais blocos estão inválidos"` presente; `"O motor recusaria este fluxo"` ausente; `"publicarAberto"` ausente. Todos confirmados.

## Task 3 — Checkpoint do dono

**Este plano não esperou o checkpoint.** Task 3 é `checkpoint:human-verify`; nenhum ambiente foi subido nesta sessão (o `<environment_notes>` da execução proíbe `docker compose`/API/banco). As instruções abaixo são para o dono rodar manualmente, comparando com a Blip.

### Como verificar

1. Suba o banco existente (sem projeto Docker novo), a API e o `@pipe/management-vite` (`pnpm banco:subir` + os dois serviços). Abra um fluxo qualquer no Builder.
2. Crie uma saída sem "Ir para" (deixa o bloco inválido) e clique em "Publicar fluxo" na pílula.
   - **Esperado:** só aparece o toast de aviso no canto inferior esquerdo, com o texto "Erro ao publicar o fluxo: Um ou mais blocos estão inválidos. Corrija os blocos marcados de vermelho e tente novamente."; **nenhum modal abre**; nada é enviado ao servidor (confirmar na aba Network que não há chamada a `/builder/publish`).
   - Compare posição (canto inferior esquerdo, `left:18px; bottom:20px`), largura máxima (500px), gradiente do fundo, glifo, botão "×", 5s de duração, pausa ao passar o mouse, fechamento ao clicar, com a captura V-F6-06 de `ref/CAPTURAS-F1-F6.md` (se existir) ou com a Blip ao vivo.
3. Corrija a saída (aponte "Ir para" um bloco) e publique de novo.
   - **Esperado:** o ícone da pílula "Publicar fluxo" gira por pelo menos 2s (mesmo que a API responda mais rápido), depois toast de sucesso "Fluxo publicado!".
4. Abra o DevTools → Network → marque "Offline" → edite o título de um bloco (força o autosave) → espere a tentativa de salvar.
   - **Esperado:** toast de perigo "Erro ao salvar o fluxograma"; a pílula "Salvo" no rodapé mostra "Tentar de novo" com o texto em branco e sem fundo claro. Volte a "Online" e confirme que "Tentar de novo" volta a salvar.
5. Copie um texto qualquer (fora do Builder) e cole no canvas com o botão direito → "Colar".
   - **Esperado:** toast de perigo com duas linhas: "O conteúdo copiado não é um bloco válido." e "Tente de novo." (é o mesmo componente do passo 2, só muda o tom/texto).
6. Se possível, meça `.bl-toast` com `ref/medir-tela.js` num dos toasts acima e confira contra `ref/CAPTURAS-F1-F6.md`/`FIDELIDADE-F1-F6.md` §F-6.1 K. Não há azul nesta tela, então a única diferença aceitável é nenhuma (os gradientes de status não trocam de cor por D-30).

**Responda:** "aprovado", ou liste as diferenças encontradas (elas viram correção neste plano antes de seguir).

## Deviations from Plan

### Auto-fixed Issues

None beyond what the plan's `<action>` already specified — no Rule 1/2/3 fixes were needed outside the planned scope.

## Assumption Drift (advisory)

**1. Publish-success toast text lost the version/archived-version detail.**
- **Found during:** Task 2 (`publicar()`).
- **Planned:** the plan's `must_haves.truths` requires the literal text "Fluxo publicado!" (F-6.1 H).
- **Actual:** the previous Pipe code showed `Versão N publicada; a M saiu do ar.` (or similar) — more informative but not what F-6.1 H specifies.
- **Why:** followed the plan's literal must-have text over preserving the extra detail, since D-56/D-30 call for reproducing the Blip toast text exactly. The archived-version info is still visible elsewhere (Versões tab, `data.publicada`), just not in the toast anymore.

**2. The "unsupported actions" notice from the old publish modal has no replacement surface.**
- **Found during:** Task 2, removing the modal.
- **Planned:** the plan's `<action>` only says to remove the modal and its `publicarAberto`/`publicationError` states; it doesn't mention `data.naoSuportado`.
- **Actual:** the removed modal used to show, right before publishing, "Ações que o motor do Pipe ainda não executa (a conversa cai na fila quando chegar nelas): {lista}." This warning is Pipe-specific (the Blip reference has no equivalent, since it has no such engine gap) and is not shown anywhere now.
- **Why:** D-56 item 1 is explicit that publishing never opens a modal, so there was no in-scope place left to put it, and inventing a new surface for it was out of this plan's scope (files_modified didn't include a natural home for it). Flagging so a future plan (or the owner, in the checkpoint) can decide whether this operator-facing signal needs a new home (e.g., a panel warning) or is acceptable to drop.

## Threat Flags

None beyond the plan's own threat register — all three (T-2-27-01, T-2-27-02, T-2-27-03) are addressed as planned: no `dangerouslySetInnerHTML` anywhere in the touched files (loop text renders as separate `titulo`/`texto` text nodes); `TOAST_LIMIT=6` caps the queue; the removed publish confirmation is the owner's accepted risk (D-56/T-2-27-02).

## Self-Check

Files:
- FOUND: apps/management-vite/src/pages/builder/toast-queue.ts
- FOUND: apps/management-vite/src/pages/builder/toast.tsx
- FOUND: apps/management-vite/src/pages/builder.tsx
- FOUND: apps/management-vite/src/pages/builder.css
- FOUND: apps/management-vite/src/pages/builder/editor.tsx
- FOUND: apps/management-vite/src/pages/builder/editor.css
- FOUND: packages/ui/src/icones.tsx
- FOUND: apps/management-vite/tests/builder-toast.test.ts

Commits (this worktree, `worktree-agent-a2af9ae4f7f81248d`, based on `0abc806d`):
- FOUND: `d51daffc` feat(02-27): add Builder toast queue and single toast component
- FOUND: `27634c7b` docs(02-27): draft summary after Task 1 (toast queue and component done)
- FOUND: `19e37ecf` feat(02-27): publish/save via toast, remove error banner and publish modal (D-56)

## Self-Check: PASSED

## Status: checkpoint

Task 3 (`checkpoint:human-verify`, gate `blocking`) is open — see "Como verificar" above. STATE.md/ROADMAP.md/REQUIREMENTS.md were intentionally left untouched per this session's instructions; whoever resumes this plan updates them once the owner responds.

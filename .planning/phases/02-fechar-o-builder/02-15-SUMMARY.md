---
phase: 02-fechar-o-builder
plan: 15
requirements-completed: [BUILDER-01]
key-files:
  - packages/core/src/flow/editor.ts
  - apps/api/src/domain/flow.ts
  - apps/workers/src/delivery.ts
  - apps/management-vite/src/pages/builder/conteudo.ts
  - apps/management-vite/src/pages/builder/panel-content.tsx
---

# Plano 02-15 — Conteúdo interativo

## Resultado

O Builder e o motor agora cobrem os seis conteúdos interativos dentro da capacidade do slot: Digitando, Pedir localização, Enviar localização, Web link, Quick reply e Menu. O WhatsApp envia localização no formato nativo; Instagram e Messenger recebem o fallback textual documentado pelo Pipe. Web links exigem HTTPS no motor e no editor, e o preview abre com `noopener noreferrer`.

## Tasks

### Task 1: Motor e entrega por canal dos tipos interativos

- **Commits:** `231c471` — `test(02-15): cover interactive content`; `1b866bd` — `feat(02-15): deliver interactive content`; `974abd1` — `fix(02-15): cover web link fallback`; `d14fdd1` — `test(02-15): assert secure web link error`.
- **Desvios:** o MIME de Pedir localização permanece pendente de captura no inventário; foi usado o mecanismo LIME `application/vnd.lime.input+json`, documentado como hipótese no próprio inventário. Digitando não gera mensagem de saída, preservando o comportamento de canal sem indicador. Respostas de botão/lista e localização já chegam ao motor pelos adaptadores existentes; localização continua sendo exposta como `input.content` com o MIME `application/vnd.lime.location+json`.
- **Verificação:** `pnpm --filter @pipe/core exec vitest run src/flow` — **6 arquivos, 135 testes passando**; `pnpm --filter @pipe/workers test` — **4 arquivos, 42 testes passando**; `pnpm --filter @pipe/api exec vitest run tests/flow-content.test.ts tests/flow.test.ts` — **2 arquivos, 15 testes passando**.

### Task 2: Editor dos tipos interativos no Builder

- **Commit:** `5d4ed3d` — `feat(02-15): expose interactive content in builder`.
- **Desvios:** os detalhes visuais exatos de ícone, layout e preview das capturas #3, #11, #12 e #14 continuam pendentes; foi entregue somente o mecanismo com controles Pipe e sem CSS, SVG ou ícones da Blip. Carrossel e Solicitar ligação não foram implementados, pois excedem a capacidade do slot e pertencem ao plano de lacunas.
- **Verificação:** `pnpm --filter @pipe/management-vite test` — **282 testes passando**; `pnpm --filter @pipe/management-vite typecheck` — **passou**; `node .planning/phases/02-fechar-o-builder/ref/conferir-catalogo.mjs --slot conteudo-interativo` — **OK 5 itens** (o script ignora os três itens sem MIME confirmado, incluindo os dois excedentes).

## Verificação adicional

- `pnpm exec turbo run build --filter=@pipe/core --filter=@pipe/contracts --filter=@pipe/workers --filter=@pipe/api` — passou.
- `pnpm exec turbo run typecheck --filter=@pipe/core --filter=@pipe/api --filter=@pipe/management-vite` — passou.
- A tag de pré-flight `std-apply-all-end` estava presente.

## Self-Check: PASSED

Os arquivos e os commits desta execução existem na branch `codex/02-15`; o catálogo do slot retorna sucesso e o worktree está limpo após o commit deste SUMMARY.

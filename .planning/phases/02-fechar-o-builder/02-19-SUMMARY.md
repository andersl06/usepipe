---
phase: 02-fechar-o-builder
plan: 19
subsystem: builder / motor-de-fluxo / canais
tags: [BUILDER-01, conteudo-dinamico, conteudo-http, SendRawMessage, SSRF]
requires: [02-10, 02-12, 02-15, 02-16]
provides:
  - "Resolução de Conteúdo HTTP e Conteúdo dinâmico antes de toChannelOutput"
  - "Editor para Conteúdo HTTP e Conteúdo dinâmico; reconhecimento da Pesquisa"
affects: [packages/core, apps/api, apps/management-vite, apps/workers]
metrics:
  completed: 2026-09-27
  tasks: 2
  commits: 2
---

# Phase 02 Plan 19: Conteúdo dinâmico — Summary

O Builder cria Conteúdo HTTP e Conteúdo dinâmico. No envio, envelopes internos são resolvidos antes de reutilizar `toChannelOutput`: HTTP usa GET, `confirmarUrlSegura`, mTLS, timeout configurável e teto de 1 MB; conteúdo dinâmico exige JSON LIME válido. Tipo não entregável, URL insegura, timeout, resposta HTTP inválida ou JSON inválido falham sem mensagem parcial.

## Tarefas e commits

| Tarefa | Commit | O quê |
|---|---|---|
| 1 — Motor resolve conteúdo HTTP/dinâmico e entrega | `21fcef6` | Whitelist, `resolveDynamicContent`, SSRF/mTLS, limite de corpo e testes para localhost, metadata IP, timeout e JSON inválido. |
| 2 — Editor e fechamento do catálogo | `ee3629e` | Fábricas e cards de Conteúdo HTTP/Dinâmico, campos de URL, MIME, cabeçalhos, timeout e variável; Pesquisa reconhecida na aba Conteúdo. |

## Desvios

Nenhum.

## Verificação

| Comando | Resultado |
|---|---|
| `pnpm exec turbo run build --filter=@pipe/core --filter=@pipe/contracts` | 2/2 tarefas com sucesso |
| `pnpm --filter @pipe/core exec vitest run src/flow` | 6 arquivos, 142/142 testes |
| `pnpm --filter @pipe/api exec vitest run tests/flow-content.test.ts tests/flow.test.ts` | 2 arquivos, 19/19 testes |
| `pnpm --filter @pipe/workers test` | 4 arquivos, 42/42 testes |
| `pnpm --filter @pipe/management-vite test` | 296/296 testes |
| `pnpm exec turbo run typecheck --filter=@pipe/core --filter=@pipe/api --filter=@pipe/workers --filter=@pipe/management-vite` | 10/10 tarefas com sucesso |
| `node ref/conferir-catalogo.mjs --slot conteudo-dinamico` | `OK 2 itens` |
| `node ref/conferir-catalogo.mjs --slot conteudo-midia` | `OK 5 itens` |
| `node ref/conferir-catalogo.mjs --slot conteudo-interativo` | `OK 5 itens` |
| `node ref/conferir-catalogo.mjs --all` | Falha fora deste plano: SendCommand, ProcessCommand, ManageList, SetBucket, ProcessContentAssistant, TrackContactsJourney, ExecuteTemplate e ExecuteBlipFunction. |

## Pendências

- C-10 permanece pendente: a captura não confirma MIME e serialização reais do Conteúdo HTTP. O Pipe usa envelopes internos `application/vnd.pipe.*` até a resolução no envio; isso não declara paridade do wire format da Blip.
- O catálogo completo depende dos planos de ações: itens de plataforma ficam para 02-20; a tela das funções é do executor paralelo 02-18.

## Self-Check: PASSED

Os arquivos modificados e os commits `21fcef6` e `ee3629e` existem; `STATE.md`, `ROADMAP.md` e `REQUIREMENTS.md` não foram alterados.

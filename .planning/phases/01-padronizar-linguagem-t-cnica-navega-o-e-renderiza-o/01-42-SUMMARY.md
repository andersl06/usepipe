---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 42
status: complete
gap_closure: true
completed: 2026-09-28
key-files:
  created:
    - tools/std/runtime-contracts.ts
    - tools/std/runtime-contracts.test.ts
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/runtime-contracts-apply-all.csv
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/reports/rename-runtime-breaks.md
---

# 01-42 — Quebras de runtime do rename

## O que foi feito

- **Task 1:** criado o verificador `tools/std/runtime-contracts.ts`, com testes. Ele lê o mapa aprovado e acha contratos por texto em que um lado ficou com o nome antigo e o outro com o novo. Cobre chave de body e query, alias SQL, `data-*`, classe CSS, rota, fila, job e evento, storage e variável de ambiente. Commit `50d651e6`.
- **Task 2:** corrigidos os itens de alta confiança do relatório `std/reports/rename-runtime-breaks.md`, em 31 commits `fix(01-42)`. Principais grupos:
  - **Tipos locais do front divergentes da resposta da API.** Afetavam Cadastros (Filas, Pausas, Horários, Atendentes), Regras de Atendimento e SLA, Contrato e membros, Analytics (Visão Geral e Mensagens Ativas), Revisão de Qualidade, Relatórios de Esforço e Satisfação, Histórico, Growth, Conteúdos, Comunicação, Links rastreados, Chaves de API, Webhook, checklist de implantação, barra do bot, Minha conta, seletor de conta e várias telas do Desk. Várias delas quebravam a página inteira.
  - **Aliases SQL sem aspas ou em português com leitura camelCase.** Afetavam troca de conta, fila e atendente, checklist de implantação, dashboard, desconexão do Messenger, SSO, guarda de versão do Builder, respostas prontas do Desk e certificados mTLS.
  - **Variável de ambiente.** O leitor usava `PIPE_API_URL_PUBLICA`, e o nome definido na infraestrutura é `PIPE_URL_API_PUBLICA` (D-06/D-36).
  - **Literal CSS.** O literal `'erro'` foi trocado por `'error'` em `Etiqueta`, `PillPriority` e `Metrica`.
  - **Rotas.** Oito links quebrados da Gestão, inclusive as abas de Analytics.
  - **Cadastro embutido do WhatsApp.** O cadastro pela página de implantação passa a enviar `code` e `state`.

## Desvios

- **Executor travado.** O executor travou por inatividade depois do 30º commit, sem escrever este resumo. O orquestrador fez o último commit pendente (cadastro embutido do WhatsApp), rodou as verificações e escreveu este SUMMARY.
- **Leitura do `import.meta.env`.** O teste de regressão novo `settings-gravar.test.ts` importa `lib/api.ts`, que lia `import.meta.env` sem `?.` e quebrava sob `node --test`. Passou a usar `import.meta.env?.[...]`.
- **Dois testes da API e o contrato.** Os testes de canal e de nota interna ainda esperavam as chaves antigas depois das correções `1a23a3e6` e `f7fe6cb9`. O contrato `ContactOfFlow` em `@pipe/contracts` ainda declarava `canalId` e `canalNome`. Os três foram alinhados com o que a tela e a API usam hoje: `channelId`, `channelName` e `conversationId`. As chaves de auditoria persistidas (`antes` e `depois` com `canalId`) não mudaram (D-08).
- **Postgres local.** O contêiner `pipe-postgres` tinha sido criado a partir do worktree antigo `pipe-wt/01-12`, cujo `init.sql` não existia mais. O orquestrador recolocou o arquivo nesse caminho. O volume de dados foi preservado.

## Verificação

- **Typecheck:** passou em todo o monorepo, com 23 de 23 tarefas.
- **Testes do Gestão, do Desk, de `@pipe/contracts` e de `@pipe/core`:** passaram.
- **Suíte da API:** 737 de 740 testes passaram antes do ajuste. As 3 falhas eram os testes desatualizados descritos acima. Depois do ajuste, os dois arquivos afetados passaram, com 37 de 37 testes.

## Pendente para os próximos planos

- **Achados restantes do verificador.** A saída `runtime-contracts-apply-all.csv` tem cerca de 400 linhas. A maior parte são identificadores que ainda estão em português dos dois lados, que é o escopo do rename por escopo (01-48 a 01-54, com o verificador rodando em cada escopo). As linhas não foram triadas uma a uma aqui.
- **Shim do cookie de sessão** em `packages/authentication/src/session.ts:14`. É um risco, não um bug ativo, e fica para o 01-48 (packages).

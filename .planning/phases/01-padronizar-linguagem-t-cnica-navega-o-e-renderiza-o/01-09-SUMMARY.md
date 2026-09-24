---
phase: 01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o
plan: 09
status: complete
key-files:
  created:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/GLOSSARY.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/CONVENTIONS-EN.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/out/glossary-codex1.json
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/out/glossary-codex2.json
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/out/glossary-token-frequency.csv
  modified:
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/GLOSSARY.md
    - .planning/phases/01-padronizar-linguagem-t-cnica-navega-o-e-renderiza-o/std/CONVENTIONS-EN.md
commits:
  - e2e398a
  - f106a44
  - ff06b2a
  - 4e4ecfd
  - bb7d535
  - f5408b3
  - 2117f4e
---

Glossário de domínio e convenção de nomenclatura em inglês (STD-01) aprovados pelo dono no portão 1 (D-03), com sete decisões pontuais do dono aplicadas; `GLOSSARY.md` e `CONVENTIONS-EN.md` estão `Status: APPROVED` e todas as 85 linhas do glossário estão `approved: yes`.

## O que foi construído

- Tabela de 85 termos com propostas em inglês, alternativas, contagens reais do inventário, referências Blip e 16 linhas `AMBIGUOUS`, todas aprovadas.
- Duas seções de evidência dedicada a termos com múltiplos sentidos: `## Ambiguous: atendimento` (já existente, três sentidos) e `## Ambiguous: painel` (nova, dois sentidos, com evidência do índice Blip `referencias-blip/portal/INDICE.md`).
- Convenção de nomenclatura em inglês de 11 seções, `Status: APPROVED`, com a seção de rotas ampliada com a orientação do dono sobre o formato de caminho do Blip para o Portal/Gestão e o adiamento de subdomínios por tenant para uma fase futura.

## Decisões do portão 1 (dono, 2026-09-24, aprovação em chat)

1. **atendimento** — três sentidos: módulo do Portal → `attendance`; sessão humana de atendimento → `ticket`; conversa no canal → `conversation` (seção "Ambiguous: atendimento").
2. **monitoria** → `qualityReview` (não `monitoring`, evita colisão com `monitoramento` → `monitoring`); alternativa registrada: `audit`.
3. **sessão** → `session` em geral; `ticket` quando o código significa a sessão humana de atendimento (segue a decisão 1).
4. **estado** → `state` em geral; `status` quando o valor é um conjunto fechado de situações (ex. open/closed).
5. **ações em massa** → `bulkActions` para identificadores; `bulk-ticket` somente para segmentos de rota (caminho Blip `supernova.desk.blip.ai/bulk-ticket.html`).
6. Demais termos ambíguos mantiveram a recomendação proposta (chave→key, conta→account, entrada→inbound, modelo→template, janela→window, mídia→media, relatório→report, cadastro→registration, espelho→mirror), exceto **análise** → `analytics` (nomenclatura Blip, aceita pelo dono sobre "analysis").
7. **painel** → `application` quando é o módulo Portal/Gestão ou a tela/rota principal do portal (Blip usa `<tenant>.blip.ai/application`); `panel` para componentes de UI (painéis laterais, linhas de dashboard como `LinhaDoPainel`, helpers `painel.ts` do crm). Evidência: `referencias-blip/portal/INDICE.md` registra `application.html` como raiz do portal e `application/tenant/panel.html` como o painel do contrato.
8. Rotas do front devem seguir o formato de caminho do Blip (`/application`, `/application/activeMessage`, `/attendance/...`); subdomínios por tenant (`<tenant>.usepipe.ai`, `<tenant>.desk.usepipe.ai`) ficam fora do escopo da fase 1 — documentado em `CONVENTIONS-EN.md` que as rotas não devem assumir um host fixo.

Todas as demais linhas foram aprovadas exatamente como propostas.

## Deviações do plano

Nenhuma. A Task 3 (portão 1) seguiu exatamente o texto do plano: aplicar as decisões do dono, marcar `approved=yes` em todas as linhas, mudar `Status:` para `APPROVED <data>` em ambos os arquivos e commitar.

## Resultados de verificação

- `grep -c "Status: APPROVED" GLOSSARY.md CONVENTIONS-EN.md`: 1 e 2 (ambos ≥ 1).
- `grep -c "^| term_pt | term_en | blip_source | ambiguity | decision | approved |$" GLOSSARY.md`: 1.
- `grep -c "## Ambiguous: atendimento" GLOSSARY.md`: 1.
- Linhas `AMBIGUOUS` com `approved=no`: 0 (16 linhas `AMBIGUOUS`, todas `approved=yes`).
- Linhas da tabela `## Terms` com `approved=no`: 0 de 85.
- Contagem de colunas da tabela `## Terms` (`awk -F'|'`): 86 linhas (cabeçalho + separador + 85 termos), todas com 8 campos (6 colunas), sem quebra de formatação.
- `grep -c "^## " CONVENTIONS-EN.md`: 11 (mesma contagem de seções do plano; nenhuma seção nova adicionada, apenas texto incorporado às seções existentes).
- `git diff --diff-filter=D --name-only HEAD~1 HEAD`: vazio, nenhuma deleção inesperada.

## Self-Check: PASSED

- `GLOSSARY.md` e `CONVENTIONS-EN.md` existem e contêm `Status: APPROVED`: confirmado por leitura direta.
- Commit `2117f4e` (`docs(01-09): gate 1 approved (glossary + convention)`) presente em `git log --oneline`: confirmado.
- Branch conferida: `cx/01-09` (worktree `C:/Users/anderson.linhares/pipe-wt/01-09`), base `cx/01-08` conforme orquestração.
- `.planning/STATE.md`, `.planning/ROADMAP.md` e `.planning/REQUIREMENTS.md` não foram alterados por este agente.
- Plano concluído: portão 1 (D-03) fechado; propostas de mapa (portão 2) ficam para plano(s) subsequente(s).
